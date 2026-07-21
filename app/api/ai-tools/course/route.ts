/**
 * AI研究ツール: コース分析
 * コース特性を分析
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

// コース特性データ（簡易版）
const COURSE_DATA: Record<string, any> = {
  '中山_芝_1800': { straight_length: 310, elevation_change: 2.0, requires_stamina: true },
  '東京_芝_1600': { straight_length: 525, elevation_change: 2.1, requires_stamina: false },
  '阪神_芝_2000': { straight_length: 473, elevation_change: 2.8, requires_stamina: true },
  '京都_芝_2400': { straight_length: 404, elevation_change: 1.5, requires_stamina: true },
};

export async function POST(req: NextRequest) {
  try {
    const { place, distance, surface, horse_name } = await req.json();
    
    if (!place || !distance || !surface) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'place, distance, and surface are required'
      }, { status: 400 });
    }
    
    const courseKey = `${place}_${surface}_${distance}`;
    const courseChar = COURSE_DATA[courseKey] || {
      straight_length: 400,
      elevation_change: 2.0,
      requires_stamina: distance >= 2000
    };
    
    let competition = null;
    let investment = null;
    let score = null;
    let summary = `${place}${surface}${distance}mは直線${courseChar.straight_length}m、高低差${courseChar.elevation_change}m。`;
    
    if (horse_name) {
      const db = getDb();
      
      // 馬のコース成績を取得（オッズ含む）
      const races = await db.prepare(`
        SELECT 
          finish_position,
          field_size,
          popularity,
          win_odds,
          place_odds_low,
          place_odds_high
        FROM umadata
        WHERE horse_name = $1
          AND place LIKE $2
          AND distance LIKE $3
        LIMIT 50
      `).all<any>(horse_name, `%${place}%`, `${surface}${distance}%`);
      
      if (races && races.length > 0) {
        competition = calculateCompetitionPerformance(races);
        investment = calculateInvestmentPerformance(races);
        score = evaluatePerformance(competition, investment);
        
        summary += ` ${horse_name}の当コース成績: ` + 
          generatePerformanceSummary(competition, investment, score);
      } else {
        summary += ` ${horse_name}は当コース未経験。`;
      }
    }
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      course_characteristics: courseChar,
      competition_performance: competition,
      investment_performance: investment,
      performance_score: score,
      summary
    });
    
  } catch (error) {
    console.error('[AI Tool: Course] Error:', error);
    return NextResponse.json({ 
      schema_version: TOOL_VERSION,
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
