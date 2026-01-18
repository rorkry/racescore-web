/**
 * レースレベル判定API
 * 
 * 出走馬の次走成績を取得し、レースレベルを判定
 * キャッシュ機能付き（7日間有効）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { analyzeRaceLevel, type NextRaceResult, type RaceLevelResult } from '@/lib/saga-ai/level-analyzer';

// キャッシュ有効期限（7日間）
const CACHE_EXPIRY_DAYS = 7;

interface UmadataRow {
  horse_name: string;
  finish_position: string;
  date: string;
  class_name: string;
  race_id_new_no_horse_num: string;
  place: string;
  distance: string;
  work_1s: string | null;
  finish_time: string | null;
  track_condition: string | null;
}

interface RaceInfoRow {
  date: string;
  place: string;
  distance: string;
  class_name: string;
  track_condition: string | null;
  work_1s: string | null;
}

interface CachedRaceLevel {
  race_id: string;
  level: string;
  level_label: string;
  total_horses_run: number;
  good_run_count: number;
  first_run_good_count: number;
  win_count: number;
  good_run_rate: number;
  first_run_good_rate: number;
  has_plus: number;
  ai_comment: string | null;
  display_comment: string | null;
  expires_at: string | null;
}

/**
 * キャッシュからレースレベルを取得
 */
function getCachedLevel(db: ReturnType<typeof getDb>, raceId: string): RaceLevelResult | null {
  const cached = db.prepare(`
    SELECT * FROM race_levels 
    WHERE race_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(raceId) as CachedRaceLevel | undefined;
  
  if (!cached) return null;
  
  return {
    level: cached.level as RaceLevelResult['level'],
    levelLabel: cached.level_label,
    totalHorsesRun: cached.total_horses_run,
    totalRuns: cached.total_horses_run, // 近似値
    goodRunCount: cached.good_run_count,
    firstRunGoodCount: cached.first_run_good_count,
    winCount: cached.win_count,
    goodRunRate: cached.good_run_rate,
    firstRunGoodRate: cached.first_run_good_rate,
    commentData: {
      totalHorses: cached.total_horses_run,
      goodRuns: cached.good_run_count,
      winners: cached.win_count,
      details: [],
    },
    displayComment: cached.display_comment || '',
    aiComment: cached.ai_comment || '',
    hasPlus: cached.has_plus === 1,
    isDataInsufficient: false,
    lapLevelBoost: false,
  };
}

/**
 * レースレベルをキャッシュに保存
 */
function cacheLevel(db: ReturnType<typeof getDb>, raceId: string, result: RaceLevelResult): void {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CACHE_EXPIRY_DAYS);
  
  db.prepare(`
    INSERT OR REPLACE INTO race_levels (
      race_id, level, level_label, total_horses_run, good_run_count,
      first_run_good_count, win_count, good_run_rate, first_run_good_rate,
      has_plus, ai_comment, display_comment, calculated_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).run(
    raceId,
    result.level,
    result.levelLabel,
    result.totalHorsesRun,
    result.goodRunCount,
    result.firstRunGoodCount,
    result.winCount,
    result.goodRunRate,
    result.firstRunGoodRate,
    result.hasPlus ? 1 : 0,
    result.aiComment,
    result.displayComment,
    expiresAt.toISOString()
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const raceId = searchParams.get('raceId');
    const skipCache = searchParams.get('skipCache') === 'true';
    
    if (!raceId) {
      return NextResponse.json({ error: 'raceIdは必須です' }, { status: 400 });
    }
    
    const db = getDb();
    
    // 1. キャッシュチェック
    if (!skipCache) {
      const cached = getCachedLevel(db, raceId);
      if (cached) {
        return NextResponse.json({
          raceId,
          level: cached,
          fromCache: true,
        });
      }
    }
    
    // 2. 対象レースの情報を取得
    const raceInfo = db.prepare(`
      SELECT 
        date, place, distance, class_name, track_condition, work_1s
      FROM umadata 
      WHERE race_id_new_no_horse_num = ?
      LIMIT 1
    `).get(raceId) as RaceInfoRow | undefined;
    
    if (!raceInfo) {
      return NextResponse.json({ error: 'レースが見つかりません' }, { status: 404 });
    }
    
    // 3. 対象レースの出走馬（3着以内）を取得
    const topHorses = db.prepare(`
      SELECT DISTINCT horse_name, finish_position
      FROM umadata 
      WHERE race_id_new_no_horse_num = ?
        AND CAST(finish_position AS INTEGER) <= 3
      ORDER BY CAST(finish_position AS INTEGER)
    `).all(raceId) as { horse_name: string; finish_position: string }[];
    
    if (topHorses.length === 0) {
      const pendingResult: RaceLevelResult = {
        level: 'PENDING',
        levelLabel: '判定保留',
        totalHorsesRun: 0,
        totalRuns: 0,
        goodRunCount: 0,
        firstRunGoodCount: 0,
        winCount: 0,
        goodRunRate: 0,
        firstRunGoodRate: 0,
        commentData: { totalHorses: 0, goodRuns: 0, winners: 0, details: [] },
        displayComment: 'データなし',
        aiComment: '対象馬のデータがありません',
        hasPlus: false,
        isDataInsufficient: true,
        lapLevelBoost: false,
      };
      return NextResponse.json({
        raceId,
        raceInfo,
        level: pendingResult,
      });
    }
    
    const horseNames = topHorses.map(h => h.horse_name);
    
    // 4. 各馬の次走以降の成績を取得
    const placeholders = horseNames.map(() => '?').join(',');
    const nextRaces = db.prepare(`
      SELECT 
        horse_name,
        finish_position,
        date,
        class_name,
        race_id_new_no_horse_num as race_id
      FROM umadata
      WHERE horse_name IN (${placeholders})
        AND date > ?
      ORDER BY horse_name, date ASC
    `).all([...horseNames, raceInfo.date]) as UmadataRow[];
    
    // 5. NextRaceResult形式に変換
    const horseFirstRunMap = new Map<string, boolean>();
    
    const nextRaceResults: NextRaceResult[] = nextRaces.map(race => {
      const isFirstRun = !horseFirstRunMap.has(race.horse_name);
      if (isFirstRun) {
        horseFirstRunMap.set(race.horse_name, true);
      }
      
      return {
        horseName: race.horse_name,
        finishPosition: parseInt(race.finish_position, 10) || 99,
        isFirstRun,
        raceDate: race.date,
        className: race.class_name,
      };
    });
    
    // 6. レースレベルを判定
    const levelResult = analyzeRaceLevel(nextRaceResults, {
      raceId,
      raceDate: raceInfo.date,
      place: raceInfo.place,
      className: raceInfo.class_name,
      distance: raceInfo.distance,
      trackCondition: raceInfo.track_condition || '',
      lapString: raceInfo.work_1s || undefined,
    });
    
    // 7. キャッシュに保存（PENDINGでない場合）
    if (levelResult.level !== 'PENDING') {
      cacheLevel(db, raceId, levelResult);
    }
    
    // 8. 詳細データも返す（デバッグ/表示用）
    return NextResponse.json({
      raceId,
      raceInfo: {
        date: raceInfo.date,
        place: raceInfo.place,
        distance: raceInfo.distance,
        className: raceInfo.class_name,
      },
      targetHorses: topHorses,
      nextRaceResults: nextRaceResults.slice(0, 20),
      level: levelResult,
      fromCache: false,
    });
    
  } catch (error) {
    console.error('Race level API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラー', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST: 複数レースのレベルを一括取得（キャッシュ優先）
 */
export async function POST(request: NextRequest) {
  try {
    const { raceIds, skipCache } = await request.json();
    
    if (!Array.isArray(raceIds) || raceIds.length === 0) {
      return NextResponse.json({ error: 'raceIds配列は必須です' }, { status: 400 });
    }
    
    // 最大50件に制限
    const limitedIds = raceIds.slice(0, 50);
    const results: Record<string, RaceLevelResult> = {};
    const cacheHits: string[] = [];
    const cacheMisses: string[] = [];
    
    const db = getDb();
    
    // 1. まずキャッシュから一括取得
    if (!skipCache) {
      for (const raceId of limitedIds) {
        const cached = getCachedLevel(db, raceId);
        if (cached) {
          results[raceId] = cached;
          cacheHits.push(raceId);
        } else {
          cacheMisses.push(raceId);
        }
      }
    } else {
      cacheMisses.push(...limitedIds);
    }
    
    // 2. キャッシュミスしたものだけ計算
    for (const raceId of cacheMisses) {
      try {
        // 対象レースの情報を取得
        const raceInfo = db.prepare(`
          SELECT date, place, distance, class_name, track_condition, work_1s
          FROM umadata 
          WHERE race_id_new_no_horse_num = ?
          LIMIT 1
        `).get(raceId) as RaceInfoRow | undefined;
        
        if (!raceInfo) {
          results[raceId] = {
            level: 'PENDING',
            levelLabel: '判定保留',
            totalHorsesRun: 0,
            totalRuns: 0,
            goodRunCount: 0,
            firstRunGoodCount: 0,
            winCount: 0,
            goodRunRate: 0,
            firstRunGoodRate: 0,
            commentData: { totalHorses: 0, goodRuns: 0, winners: 0, details: [] },
            displayComment: 'データなし',
            aiComment: 'レースが見つかりません',
            hasPlus: false,
            isDataInsufficient: true,
            lapLevelBoost: false,
          };
          continue;
        }
        
        // 3着以内の馬を取得
        const topHorses = db.prepare(`
          SELECT DISTINCT horse_name
          FROM umadata 
          WHERE race_id_new_no_horse_num = ?
            AND CAST(finish_position AS INTEGER) <= 3
        `).all(raceId) as { horse_name: string }[];
        
        if (topHorses.length === 0) {
          results[raceId] = {
            level: 'PENDING',
            levelLabel: '判定保留',
            totalHorsesRun: 0,
            totalRuns: 0,
            goodRunCount: 0,
            firstRunGoodCount: 0,
            winCount: 0,
            goodRunRate: 0,
            firstRunGoodRate: 0,
            commentData: { totalHorses: 0, goodRuns: 0, winners: 0, details: [] },
            displayComment: 'データなし',
            aiComment: '対象馬のデータがありません',
            hasPlus: false,
            isDataInsufficient: true,
            lapLevelBoost: false,
          };
          continue;
        }
        
        const horseNames = topHorses.map(h => h.horse_name);
        const placeholders = horseNames.map(() => '?').join(',');
        
        // 次走成績を取得
        const nextRaces = db.prepare(`
          SELECT horse_name, finish_position, date, class_name
          FROM umadata
          WHERE horse_name IN (${placeholders})
            AND date > ?
          ORDER BY horse_name, date ASC
        `).all([...horseNames, raceInfo.date]) as UmadataRow[];
        
        // NextRaceResult形式に変換
        const horseFirstRunMap = new Map<string, boolean>();
        const nextRaceResults: NextRaceResult[] = nextRaces.map(race => {
          const isFirstRun = !horseFirstRunMap.has(race.horse_name);
          if (isFirstRun) {
            horseFirstRunMap.set(race.horse_name, true);
          }
          return {
            horseName: race.horse_name,
            finishPosition: parseInt(race.finish_position, 10) || 99,
            isFirstRun,
            raceDate: race.date,
            className: race.class_name,
          };
        });
        
        // レベル判定
        const levelResult = analyzeRaceLevel(nextRaceResults, {
          raceId,
          raceDate: raceInfo.date,
          place: raceInfo.place,
          className: raceInfo.class_name,
          distance: raceInfo.distance,
          trackCondition: raceInfo.track_condition || '',
          lapString: raceInfo.work_1s || undefined,
        });
        
        results[raceId] = levelResult;
        
        // キャッシュに保存（PENDINGでない場合）
        if (levelResult.level !== 'PENDING') {
          cacheLevel(db, raceId, levelResult);
        }
        
      } catch (err) {
        console.error(`Error processing raceId ${raceId}:`, err);
        results[raceId] = {
          level: 'PENDING',
          levelLabel: '判定保留',
          totalHorsesRun: 0,
          totalRuns: 0,
          goodRunCount: 0,
          firstRunGoodCount: 0,
          winCount: 0,
          goodRunRate: 0,
          firstRunGoodRate: 0,
          commentData: { totalHorses: 0, goodRuns: 0, winners: 0, details: [] },
          displayComment: 'エラー',
          aiComment: 'データ取得エラー',
          hasPlus: false,
          isDataInsufficient: true,
          lapLevelBoost: false,
        };
      }
    }
    
    return NextResponse.json({ 
      results,
      stats: {
        total: limitedIds.length,
        cacheHits: cacheHits.length,
        cacheMisses: cacheMisses.length,
      }
    });
    
  } catch (error) {
    console.error('Race level batch API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラー', details: String(error) },
      { status: 500 }
    );
  }
}
