/**
 * レースレベル判定API
 * 
 * 出走馬の次走成績を取得し、レースレベルを判定
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { analyzeRaceLevel, type NextRaceResult, type RaceLevelResult } from '@/lib/saga-ai/level-analyzer';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const raceId = searchParams.get('raceId');
    
    if (!raceId) {
      return NextResponse.json({ error: 'raceIdは必須です' }, { status: 400 });
    }
    
    const db = getDb();
    
    // 1. 対象レースの情報を取得
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
    
    // 2. 対象レースの出走馬（3着以内）を取得
    const topHorses = db.prepare(`
      SELECT DISTINCT horse_name, finish_position
      FROM umadata 
      WHERE race_id_new_no_horse_num = ?
        AND CAST(finish_position AS INTEGER) <= 3
      ORDER BY CAST(finish_position AS INTEGER)
    `).all(raceId) as { horse_name: string; finish_position: string }[];
    
    if (topHorses.length === 0) {
      return NextResponse.json({
        raceId,
        raceInfo,
        level: {
          level: 'PENDING',
          levelLabel: '判定保留',
          displayComment: 'データなし',
          aiComment: '対象馬のデータがありません',
        } as Partial<RaceLevelResult>,
      });
    }
    
    const horseNames = topHorses.map(h => h.horse_name);
    
    // 3. 各馬の次走以降の成績を取得
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
    
    // 4. NextRaceResult形式に変換
    const horseFirstRunMap = new Map<string, boolean>();  // 各馬の最初の出走かどうか
    
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
    
    // 5. レースレベルを判定
    const levelResult = analyzeRaceLevel(nextRaceResults, {
      raceId,
      raceDate: raceInfo.date,
      place: raceInfo.place,
      className: raceInfo.class_name,
      distance: raceInfo.distance,
      trackCondition: raceInfo.track_condition || '',
      lapString: raceInfo.work_1s || undefined,
    });
    
    // 6. 詳細データも返す（デバッグ/表示用）
    return NextResponse.json({
      raceId,
      raceInfo: {
        date: raceInfo.date,
        place: raceInfo.place,
        distance: raceInfo.distance,
        className: raceInfo.class_name,
      },
      targetHorses: topHorses,
      nextRaceResults: nextRaceResults.slice(0, 20),  // 上限20件
      level: levelResult,
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
 * POST: 複数レースのレベルを一括取得
 */
export async function POST(request: NextRequest) {
  try {
    const { raceIds } = await request.json();
    
    if (!Array.isArray(raceIds) || raceIds.length === 0) {
      return NextResponse.json({ error: 'raceIds配列は必須です' }, { status: 400 });
    }
    
    // 最大20件に制限
    const limitedIds = raceIds.slice(0, 20);
    const results: Record<string, RaceLevelResult> = {};
    
    const db = getDb();
    
    for (const raceId of limitedIds) {
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
        results[raceId] = analyzeRaceLevel(nextRaceResults, {
          raceId,
          raceDate: raceInfo.date,
          place: raceInfo.place,
          className: raceInfo.class_name,
          distance: raceInfo.distance,
          trackCondition: raceInfo.track_condition || '',
          lapString: raceInfo.work_1s || undefined,
        });
        
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
    
    return NextResponse.json({ results });
    
  } catch (error) {
    console.error('Race level batch API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラー', details: String(error) },
      { status: 500 }
    );
  }
}
