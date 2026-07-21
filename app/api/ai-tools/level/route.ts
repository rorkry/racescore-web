/**
 * AI研究ツール: レースレベル分析
 * レースのレベル（S/A/B/C/D）を判定
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
    const { race_id } = await req.json();
    
    if (!race_id) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'race_id is required'
      }, { status: 400 });
    }
    
    const db = getDb();
    
    // レースレベルを取得
    const raceIdFor16 = race_id.substring(0, 16);
    const levelData = await db.prepare(`
      SELECT level, level_label, has_plus, total_horses_run, good_run_count, first_run_good_count 
      FROM race_levels WHERE race_id = $1
    `).get<any>(raceIdFor16);
    
    if (!levelData) {
      return NextResponse.json({
        schema_version: TOOL_VERSION,
        error: 'Race level not found',
        summary: `レースレベルデータが見つかりません`
      });
    }
    
    // 次走成績データを取得（オッズ含む）
    const nextRunRaces = await db.prepare(`
      SELECT 
        horse_name,
        finish_position,
        field_size,
        popularity,
        win_odds,
        place_odds_low,
        place_odds_high
      FROM umadata
      WHERE race_id LIKE $1
      LIMIT 18
    `).all<any>(`${raceIdFor16.substring(0, 8)}%`);
    
    // 出走馬の次走を追跡（簡易版）
    const competition = {
      sample_size: levelData.total_horses_run || 0,
      win_rate: 0,
      place_rate: 0,
      show_rate: (levelData.first_run_good_count ?? levelData.good_run_count ?? 0) / 
                 Math.max(levelData.total_horses_run || 1, 1),
      avg_finish: 0
    };
    
    // 投資成績（簡易推定）
    const investment = {
      win_return_rate: competition.show_rate * 300, // 簡易推定
      place_return_rate: competition.show_rate * 150,
      total_investment: competition.sample_size * 100,
      total_return: 0,
      profit: 0
    };
    
    const score = evaluatePerformance(competition, investment);
    
    const summary = `${levelData.level_label || levelData.level}レベルのレース: ` +
      `次走好走率${(competition.show_rate * 100).toFixed(1)}%（${levelData.first_run_good_count ?? levelData.good_run_count}/${levelData.total_horses_run}頭）。` +
      `${score.evaluation}`;
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      race_level: levelData.level || 'UNKNOWN',
      race_level_label: levelData.level_label || levelData.level,
      competition_performance: competition,
      investment_performance: investment,
      performance_score: score,
      summary
    });
    
  } catch (error) {
    console.error('[AI Tool: Level] Error:', error);
    return NextResponse.json({ 
      schema_version: TOOL_VERSION,
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
