/**
 * レースレベル計算の詳細デバッグAPI
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { analyzeRaceLevel, type NextRaceResult } from '@/lib/saga-ai/level-analyzer';

export const dynamic = 'force-dynamic';

/**
 * 日付文字列をYYYYMMDD形式の数値に変換
 * "2026. 1. 5" → 20260105
 * "2026.01.05" → 20260105
 */
function convertDateToNumber(dateStr: string): number {
  if (!dateStr) return 0;
  const cleaned = dateStr.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return 0;
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;
  return year * 10000 + month * 100 + day;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const raceId = searchParams.get('raceId');
    
    const db = getDb();
    
    // raceIdが指定されていない場合、最新のレースを1件取得
    let targetRaceId = raceId;
    let targetRaceDate = '';
    
    if (!targetRaceId) {
      const latestRace = await db.prepare(`
        SELECT race_id, date
        FROM umadata
        WHERE date IS NOT NULL
        GROUP BY race_id, date
        ORDER BY date DESC
        LIMIT 1
      `).get<{ race_id: string; date: string }>();
      
      if (latestRace) {
        targetRaceId = latestRace.race_id;
        targetRaceDate = latestRace.date;
      }
    }
    
    if (!targetRaceId) {
      return NextResponse.json({ error: 'No race found' }, { status: 404 });
    }

    // Step 1: 対象レースの情報を取得
    const raceInfo = await db.prepare(`
      SELECT race_id, date, place, class_name, distance
      FROM umadata
      WHERE race_id = ?
      LIMIT 1
    `).get<{ race_id: string; date: string; place: string; class_name: string; distance: string }>(targetRaceId);

    // Step 2: 対象レースの全出走馬を取得
    const allHorses = await db.query<{ horse_name: string; finish_position: string; umaban: string }>(`
      SELECT horse_name, finish_position, umaban
      FROM umadata 
      WHERE race_id = $1
      ORDER BY CASE WHEN umaban ~ '^[0-9]+$' THEN umaban::INTEGER ELSE 999 END
    `, [targetRaceId]);

    // Step 3: 上位3頭を取得（全角数字を半角に変換してフィルタ）
    // PostgreSQLで全角数字を半角に変換: TRANSLATE関数を使用
    const topHorses = await db.query<{ horse_name: string; finish_position: string }>(`
      SELECT horse_name, finish_position
      FROM umadata 
      WHERE race_id = $1
        AND finish_position IS NOT NULL
        AND finish_position != ''
        AND TRANSLATE(finish_position, '０１２３４５６７８９', '0123456789') ~ '^[0-9]+$'
        AND TRANSLATE(finish_position, '０１２３４５６７８９', '0123456789')::INTEGER <= 3
      GROUP BY horse_name, finish_position
      ORDER BY MIN(TRANSLATE(finish_position, '０１２３４５６７８９', '0123456789')::INTEGER)
    `, [targetRaceId]);

    // Step 4: 上位馬の次走データを取得
    let nextRacesData: any[] = [];
    let nextRaceResults: NextRaceResult[] = [];
    
    if (topHorses.length > 0) {
      const horseNames = topHorses.map(h => h.horse_name);
      const placeholders = horseNames.map((_, i) => `$${i + 1}`).join(',');
      const raceDate = raceInfo?.date || targetRaceDate;
      
      // 日付をYYYYMMDD形式の数値に変換して比較
      const raceDateNum = convertDateToNumber(raceDate);
      
      // race_idの最初の8桁が日付（YYYYMMDD）なので、それを使って比較
      nextRacesData = await db.query<{
        horse_name: string;
        finish_position: string;
        date: string;
        class_name: string;
        race_id: string;
      }>(`
        SELECT horse_name, finish_position, date, class_name, race_id
        FROM umadata
        WHERE horse_name IN (${placeholders})
          AND SUBSTRING(race_id, 1, 8)::INTEGER > $${horseNames.length + 1}
          AND finish_position IS NOT NULL
          AND finish_position != ''
        ORDER BY horse_name, SUBSTRING(race_id, 1, 8)::INTEGER ASC
        LIMIT 50
      `, [...horseNames, raceDateNum]);

      // NextRaceResult形式に変換
      const horseFirstRunMap = new Map<string, boolean>();
      nextRaceResults = nextRacesData
        .filter(race => {
          const pos = parseInt(race.finish_position, 10);
          return !isNaN(pos) && pos > 0;
        })
        .map(race => {
          const isFirstRun = !horseFirstRunMap.has(race.horse_name);
          if (isFirstRun) {
            horseFirstRunMap.set(race.horse_name, true);
          }
          return {
            horseName: race.horse_name,
            finishPosition: parseInt(race.finish_position, 10),
            isFirstRun,
            raceDate: race.date,
            className: race.class_name,
          };
        });
    }

    // Step 5: レースレベルを判定
    const levelResult = analyzeRaceLevel(nextRaceResults);

    return NextResponse.json({
      success: true,
      targetRaceId,
      raceInfo,
      step1_allHorses: {
        count: allHorses.length,
        sample: allHorses.slice(0, 5),
      },
      step2_topHorses: {
        count: topHorses.length,
        horses: topHorses,
        note: '上位3着の馬（数値着順のみ）',
      },
      step3_nextRacesRaw: {
        count: nextRacesData.length,
        sample: nextRacesData.slice(0, 10),
        note: '上位馬の次走以降のレース',
      },
      step4_nextRaceResults: {
        count: nextRaceResults.length,
        sample: nextRaceResults.slice(0, 10),
        note: 'NextRaceResult形式に変換後',
      },
      step5_levelResult: levelResult,
      diagnosis: {
        hasRaceInfo: !!raceInfo,
        hasTopHorses: topHorses.length > 0,
        hasNextRaces: nextRacesData.length > 0,
        levelCalculated: levelResult.level !== 'UNKNOWN' || nextRaceResults.length > 0,
        problemArea: !raceInfo ? 'レース情報なし' :
                     topHorses.length === 0 ? '上位3着の馬が取得できない（着順が数値でない可能性）' :
                     nextRacesData.length === 0 ? '次走データがない（日付比較の問題か、次走がまだない）' :
                     nextRaceResults.length === 0 ? '次走の着順が数値でない' :
                     levelResult.level === 'UNKNOWN' ? 'データ不足でUNKNOWN判定' :
                     '正常',
      },
    });

  } catch (error) {
    console.error('Debug race level detail error:', error);
    return NextResponse.json({
      error: 'エラー',
      details: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
