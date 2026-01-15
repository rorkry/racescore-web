/**
 * おれAI一括生成API
 * 指定した日付・場所の全レースの分析を一括で生成してDBに保存
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db-new';

interface RequestBody {
  year: string;
  date: string;
  place?: string;  // 省略時は全場所
}

interface GenerationResult {
  place: string;
  raceNumber: string;
  horseCount: number;
  success: boolean;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    const { year, date, place } = req.body as RequestBody;

    if (!year || !date) {
      return res.status(400).json({ error: 'year and date are required' });
    }

    const db = getRawDb();

    // 対象レースを取得
    let racesQuery = `
      SELECT DISTINCT place, race_number
      FROM wakujun
      WHERE date = ? AND year = ?
    `;
    const params: any[] = [date, parseInt(year, 10)];

    if (place) {
      racesQuery += ` AND place = ?`;
      params.push(place);
    }

    racesQuery += ` ORDER BY place, CAST(race_number AS INTEGER)`;

    const races = db.prepare(racesQuery).all(...params) as { place: string; race_number: string }[];

    if (!races || races.length === 0) {
      return res.status(404).json({ 
        error: 'No races found',
        year,
        date,
        place: place || 'all'
      });
    }

    console.log(`[saga-ai-bulk] 一括生成開始: ${year}/${date} - ${races.length}レース`);

    const results: GenerationResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    // 各レースを順番に処理（並列だとDBロックの可能性があるため）
    for (const race of races) {
      try {
        // 内部でsaga-ai APIを呼び出す（サーバーサイドで直接呼び出し）
        const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/saga-ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year,
            date,
            place: race.place,
            raceNumber: race.race_number,
            useAI: false,
            trackCondition: '良',
            bias: 'none',
            forceRecalculate: true,  // キャッシュを無視して再計算
            saveToDB: true,          // DBに保存
          }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          results.push({
            place: race.place,
            raceNumber: race.race_number,
            horseCount: data.analyses?.length || 0,
            success: true,
          });
          successCount++;
          console.log(`[saga-ai-bulk] ✓ ${race.place} ${race.race_number}R (${data.analyses?.length || 0}頭)`);
        } else {
          results.push({
            place: race.place,
            raceNumber: race.race_number,
            horseCount: 0,
            success: false,
            error: data.error || 'Unknown error',
          });
          errorCount++;
          console.log(`[saga-ai-bulk] ✗ ${race.place} ${race.race_number}R - ${data.error}`);
        }
      } catch (error) {
        results.push({
          place: race.place,
          raceNumber: race.race_number,
          horseCount: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        errorCount++;
        console.error(`[saga-ai-bulk] ✗ ${race.place} ${race.race_number}R - ${error}`);
      }
    }

    const elapsedTime = Date.now() - startTime;

    console.log(`[saga-ai-bulk] 一括生成完了: ${successCount}/${races.length}レース成功 (${elapsedTime}ms)`);

    return res.status(200).json({
      success: true,
      year,
      date,
      place: place || 'all',
      totalRaces: races.length,
      successCount,
      errorCount,
      elapsedTimeMs: elapsedTime,
      results,
    });

  } catch (error) {
    console.error('[saga-ai-bulk] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}








