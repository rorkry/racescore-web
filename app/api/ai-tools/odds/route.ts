/**
 * AI研究ツール: オッズ分析
 * オッズから人気・期待値を分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const TOOL_VERSION = '1.0';

export async function POST(req: NextRequest) {
  try {
    const { race_key, horse_number } = await req.json();
    
    if (!race_key || horse_number === undefined) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'race_key and horse_number are required'
      }, { status: 400 });
    }
    
    const db = getDb();
    
    // 簡易的なオッズ分析（実際のオッズデータがない場合は想定人気から推定）
    const [year, date, place, raceNumber] = race_key.split('/');
    
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
    
    // 簡易的なオッズ推定（人気に基づく）
    const totalHorses = horses.length;
    const estimatedOdds = horse_number <= 3 ? 3.5 : 
                         horse_number <= 6 ? 7.0 : 
                         horse_number <= 10 ? 15.0 : 30.0;
    
    const expectedWinProbability = 1 / estimatedOdds;
    
    const summary = `${horse_number}番の想定オッズは${estimatedOdds.toFixed(1)}倍程度。` +
      `期待勝率${(expectedWinProbability * 100).toFixed(1)}%。`;
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      estimated_odds: estimatedOdds,
      expected_win_probability: expectedWinProbability,
      summary
    });
    
  } catch (error) {
    console.error('[AI Tool: Odds] Error:', error);
    return NextResponse.json({ 
      schema_version: TOOL_VERSION,
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
