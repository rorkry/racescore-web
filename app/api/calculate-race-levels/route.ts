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
 * レースレベルをキャッシュに保存
 */
async function saveRaceLevel(db: ReturnType<typeof getDb>, raceId: string, result: RaceLevelResult): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30日間有効

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
 */
async function calculateSingleRaceLevel(db: ReturnType<typeof getDb>, race: RaceRow): Promise<RaceLevelResult | null> {
  try {
    // 対象レースの上位3頭を取得
    const topHorses = await db.query<{ horse_name: string; finish_position: string }>(`
      SELECT DISTINCT horse_name, finish_position
      FROM umadata 
      WHERE race_id = $1
        AND finish_position IS NOT NULL
        AND finish_position != ''
        AND finish_position::INTEGER <= 3
      ORDER BY finish_position::INTEGER
    `, [race.race_id]);

    if (topHorses.length === 0) {
      return null; // 対象馬がいない場合はスキップ
    }

    const horseNames = topHorses.map(h => h.horse_name);
    const placeholders = horseNames.map((_, i) => `$${i + 1}`).join(',');

    // 各馬の次走以降の成績を取得
    const nextRaces = await db.query<{
      horse_name: string;
      finish_position: string;
      date: string;
      class_name: string;
    }>(`
      SELECT horse_name, finish_position, date, class_name
      FROM umadata
      WHERE horse_name IN (${placeholders})
        AND date > $${horseNames.length + 1}
      ORDER BY horse_name, date ASC
    `, [...horseNames, race.date]);

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
        await saveRaceLevel(db, race.race_id, levelResult);
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
        await saveRaceLevel(db, raceId, levelResult);
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
