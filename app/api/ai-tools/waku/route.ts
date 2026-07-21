/**
 * AI研究ツール: 枠順分析
 * 枠順の有利不利を分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  calculateCompetitionPerformance,
  calculateInvestmentPerformance,
  evaluatePerformance,
  generatePerformanceSummary
} from '@/lib/research/performance-calculator';

const TOOL_VERSION = '1.1';

export async function POST(req: NextRequest) {
  try {
    const { race_place, race_distance, track_type, waku_number } = await req.json();
    
    if (!race_place || !race_distance || !track_type || waku_number === undefined) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'All parameters are required'
      }, { status: 400 });
    }
    
    const db = getDb();
    
    // 枠別成績データを取得
    const races = await db.prepare(`
      SELECT 
        finish_position,
        field_size,
        popularity
      FROM umadata
      WHERE place LIKE $1
        AND distance LIKE $2
        AND waku = $3
      LIMIT 300
    `).all<any>(`%${race_place}%`, `${track_type}${race_distance}%`, waku_number.toString());
    
    if (!races || races.length === 0) {
      return NextResponse.json({
        schema_version: TOOL_VERSION,
        error: 'No data',
        summary: `${race_place}${track_type}${race_distance}mの${waku_number}枠のデータが不足`
      });
    }
    
    // 競争成績・投資成績を計算
    const competition = calculateCompetitionPerformance(races);
    const racesWithOdds = races.map(r => ({
      ...r,
      odds: parseFloat(r.popularity || '5') * 2
    }));
    const investment = calculateInvestmentPerformance(racesWithOdds);
    const score = evaluatePerformance(competition, investment);
    
    // サマリー
    const summary = `${race_place}${track_type}${race_distance}m ${waku_number}枠: ` +
      generatePerformanceSummary(competition, investment, score);
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      waku_number,
      competition_performance: competition,
      investment_performance: investment,
      performance_score: score,
      summary
    });
    
  } catch (error) {
    console.error('[AI Tool: Waku] Error:', error);
    return NextResponse.json({ 
      schema_version: TOOL_VERSION,
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
