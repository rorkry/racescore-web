/**
 * AI研究ツール: 脚質分析
 * レース展開を予測
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { toHalfWidth } from '@/utils/parse-helpers';

const TOOL_VERSION = '1.0';

export async function POST(req: NextRequest) {
  try {
    const { race_key } = await req.json();
    
    if (!race_key) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'race_key is required'
      }, { status: 400 });
    }
    
    // race_key: "2026/0118/中山/11"
    const [year, date, place, raceNumber] = race_key.split('/');
    
    const db = getDb();
    
    // 出走馬を取得
    const horses = await db.prepare(`
      SELECT umamei, umaban FROM wakujun
      WHERE year = $1 AND date = $2 AND place LIKE $3 AND race_number = $4
      ORDER BY umaban::INTEGER
    `).all<any>(year, date, `%${place}%`, raceNumber);
    
    if (!horses || horses.length === 0) {
      return NextResponse.json({
        schema_version: TOOL_VERSION,
        error: 'Race not found',
        summary: `レースデータが見つかりません`
      });
    }
    
    // 各馬のT2F指数を取得（前走）
    const targetDateInt = parseInt(`${year}${date}`, 10);
    let frontRunnerCount = 0;
    
    for (const horse of horses) {
      const horseName = (horse.umamei || '').trim().replace(/^[\$\*]+/, '');
      const horseNumber = parseInt(toHalfWidth(horse.umaban || '0'), 10);
      
      // 前走を取得
      const pastRace = await db.prepare(`
        SELECT race_id, umaban FROM umadata
        WHERE (TRIM(horse_name) = $1 OR REPLACE(REPLACE(horse_name, '*', ''), '$', '') = $1)
          AND SUBSTRING(race_id, 1, 8)::INTEGER < $2
        ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
        LIMIT 1
      `).get<any>(horseName, targetDateInt);
      
      if (pastRace) {
        const umabanPadded = (pastRace.umaban || horseNumber).toString().padStart(2, '0');
        const fullRaceId = pastRace.race_id + umabanPadded;
        
        const indices = await db.prepare(`
          SELECT "T2F" FROM indices WHERE race_id = $1
        `).get<any>(fullRaceId);
        
        if (indices && indices.T2F && indices.T2F <= 22.5) {
          frontRunnerCount++;
        }
      }
    }
    
    const totalHorses = horses.length;
    const frontRunnerRatio = frontRunnerCount / totalHorses;
    
    let paceExpectation = 'ミドルペース';
    if (frontRunnerRatio >= 0.4) paceExpectation = 'ハイペース';
    else if (frontRunnerRatio <= 0.15) paceExpectation = 'スローペース';
    
    const summary = `${place}${raceNumber}Rは先行力のある馬が${frontRunnerCount}頭/${totalHorses}頭。` +
      `${paceExpectation}が予想される。`;
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      pace_forecast: paceExpectation,
      front_runners: frontRunnerCount,
      total_horses: totalHorses,
      summary
    });
    
  } catch (error) {
    console.error('[AI Tool: Style] Error:', error);
    return NextResponse.json({ 
      schema_version: TOOL_VERSION,
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
