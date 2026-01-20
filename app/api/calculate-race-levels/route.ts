/**
 * レースレベル一括計算API
 * 
 * 既存の過去レースのレベルを一括で計算してキャッシュに保存
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { analyzeRaceLevel, type NextRaceResult, type RaceLevelResult } from '@/lib/saga-ai/level-analyzer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 最大60秒

interface RaceRow {
  race_id: string;
  date: string;
  place: string;
  class_name: string;
  distance: string;
}

/**
 * レース日付からキャッシュ有効期間を決定
 */
function getCacheExpiryDays(raceDate: string): number {
  const now = new Date();
  // "2024.01.15" 形式をパース
  const cleaned = raceDate.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return 1;
  
  const raceDateObj = new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10)
  );
  
  const daysDiff = Math.floor((now.getTime() - raceDateObj.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff >= 60) return 30; // 60日以上前 → 30日キャッシュ
  if (daysDiff >= 30) return 7;  // 30-60日前 → 7日キャッシュ
  return 1;                       // 30日以内 → 1日キャッシュ
}

/**
 * レースレベルをキャッシュに保存
 */
async function saveRaceLevel(db: ReturnType<typeof getDb>, raceId: string, result: RaceLevelResult, raceDate?: string): Promise<void> {
  const cacheDays = raceDate ? getCacheExpiryDays(raceDate) : 7;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + cacheDays);

  await db.query(`
    INSERT INTO race_levels (
      race_id, level, level_label, total_horses_run, good_run_count,
      first_run_good_count, win_count, good_run_rate, first_run_good_rate,
      has_plus, ai_comment, display_comment, calculated_at, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
    ON CONFLICT (race_id) DO UPDATE SET
      level = EXCLUDED.level,
      level_label = EXCLUDED.level_label,
      total_horses_run = EXCLUDED.total_horses_run,
      good_run_count = EXCLUDED.good_run_count,
      first_run_good_count = EXCLUDED.first_run_good_count,
      win_count = EXCLUDED.win_count,
      good_run_rate = EXCLUDED.good_run_rate,
      first_run_good_rate = EXCLUDED.first_run_good_rate,
      has_plus = EXCLUDED.has_plus,
      ai_comment = EXCLUDED.ai_comment,
      display_comment = EXCLUDED.display_comment,
      calculated_at = NOW(),
      expires_at = EXCLUDED.expires_at
  `, [
    raceId,
    result.level,
    result.levelLabel,
    result.totalHorsesRun,
    result.goodRunCount,
    result.firstRunGoodCount,
    result.winCount,
    result.goodRunRate,
    result.firstRunGoodRate,
    result.plusCount || 0,
    result.aiComment,
    result.displayComment,
    expiresAt.toISOString()
  ]);
}

/**
 * 単一レースのレベルを計算
 * 重要: 上位3頭だけでなく全出走馬の次走成績を取得する
 */
async function calculateSingleRaceLevel(db: ReturnType<typeof getDb>, race: RaceRow): Promise<RaceLevelResult | null> {
  try {
    // 対象レースの全出走馬を取得（全角数字を半角に変換してフィルタ）
    const allHorses = await db.query<{ horse_name: string; finish_position: string }>(`
      SELECT horse_name, finish_position
      FROM umadata 
      WHERE race_id = $1
        AND finish_position IS NOT NULL
        AND finish_position != ''
        AND TRANSLATE(finish_position, '０１２３４５６７８９', '0123456789') ~ '^[0-9]+$'
      GROUP BY horse_name, finish_position
      ORDER BY MIN(TRANSLATE(finish_position, '０１２３４５６７８９', '0123456789')::INTEGER)
    `, [race.race_id]);

    if (allHorses.length === 0) {
      return null; // 対象馬がいない場合はスキップ
    }

    const horseNames = allHorses.map(h => h.horse_name);
    const placeholders = horseNames.map((_, i) => `$${i + 1}`).join(',');

    // race_idの最初の8桁が日付（YYYYMMDD）
    const raceDateNum = parseInt(race.race_id.substring(0, 8), 10);

    // 各馬の次走以降の成績を取得（race_idの日付部分で比較）
    const nextRaces = await db.query<{
      horse_name: string;
      finish_position: string;
      date: string;
      class_name: string;
    }>(`
      SELECT horse_name, finish_position, date, class_name
      FROM umadata
      WHERE horse_name IN (${placeholders})
        AND SUBSTRING(race_id, 1, 8)::INTEGER > $${horseNames.length + 1}
      ORDER BY horse_name, SUBSTRING(race_id, 1, 8)::INTEGER ASC
    `, [...horseNames, raceDateNum]);

    // NextRaceResult形式に変換
    const horseFirstRunMap = new Map<string, boolean>();
    const nextRaceResults: NextRaceResult[] = nextRaces.map(r => {
      const isFirstRun = !horseFirstRunMap.has(r.horse_name);
      if (isFirstRun) {
        horseFirstRunMap.set(r.horse_name, true);
      }
      return {
        horseName: r.horse_name,
        finishPosition: parseInt(r.finish_position, 10) || 99,
        isFirstRun,
        raceDate: r.date,
        className: r.class_name,
      };
    });

    // レースレベルを判定
    return analyzeRaceLevel(nextRaceResults);
  } catch (err) {
    console.log(`[calculate-race-levels] Error for race ${race.race_id}:`, err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const minDate = searchParams.get('minDate') || '2024.01.01'; // デフォルトは2024年から
    
    const db = getDb();

    // まだ計算されていないレースを取得
    const races = await db.query<RaceRow>(`
      SELECT DISTINCT u.race_id, u.date, u.place, u.class_name, u.distance
      FROM umadata u
      LEFT JOIN race_levels rl ON u.race_id = rl.race_id
      WHERE rl.race_id IS NULL
        AND u.date >= $1
        AND u.finish_position IS NOT NULL
      ORDER BY u.date DESC
      LIMIT $2
    `, [minDate, limit]);

    console.log(`[calculate-race-levels] Found ${races.length} races to calculate`);

    let calculated = 0;
    let skipped = 0;
    const results: { raceId: string; level: string; levelLabel: string }[] = [];

    for (const race of races) {
      const levelResult = await calculateSingleRaceLevel(db, race);
      
      if (levelResult && levelResult.level !== 'UNKNOWN') {
        await saveRaceLevel(db, race.race_id, levelResult, race.date);
        calculated++;
        results.push({
          raceId: race.race_id,
          level: levelResult.level,
          levelLabel: levelResult.levelLabel,
        });
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Calculated ${calculated} race levels, skipped ${skipped}`,
      totalFound: races.length,
      calculated,
      skipped,
      sampleResults: results.slice(0, 10),
    });

  } catch (error) {
    console.error('Calculate race levels error:', error);
    return NextResponse.json({
      error: 'エラー',
      details: String(error),
    }, { status: 500 });
  }
}

/**
 * POST: 特定のレースIDのレベルを計算
 */
export async function POST(request: NextRequest) {
  try {
    const { raceIds } = await request.json();
    
    if (!Array.isArray(raceIds) || raceIds.length === 0) {
      return NextResponse.json({ error: 'raceIds配列は必須です' }, { status: 400 });
    }

    const db = getDb();
    let calculated = 0;
    const results: { raceId: string; level: string; levelLabel: string }[] = [];

    for (const raceId of raceIds.slice(0, 50)) { // 最大50件
      // レース情報を取得
      const raceInfo = await db.prepare(`
        SELECT race_id, date, place, class_name, distance
        FROM umadata
        WHERE race_id = ?
        LIMIT 1
      `).get<RaceRow>(raceId);

      if (!raceInfo) continue;

      const levelResult = await calculateSingleRaceLevel(db, raceInfo);
      
      if (levelResult) {
        await saveRaceLevel(db, raceId, levelResult, raceInfo.date);
        calculated++;
        results.push({
          raceId,
          level: levelResult.level,
          levelLabel: levelResult.levelLabel,
        });
      }
    }

    return NextResponse.json({
      success: true,
      calculated,
      results,
    });

  } catch (error) {
    console.error('Calculate race levels POST error:', error);
    return NextResponse.json({
      error: 'エラー',
      details: String(error),
    }, { status: 500 });
  }
}
