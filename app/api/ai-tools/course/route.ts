/**
 * AI研究ツール: コース分析
 * コース特性を分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const TOOL_VERSION = '1.0';

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
    
    let horseCompatibility = null;
    let summary = `${place}${surface}${distance}mは直線${courseChar.straight_length}m、高低差${courseChar.elevation_change}m。`;
    
    if (horse_name) {
      const db = getDb();
      
      // 馬のコース成績を取得
      const courseRecord = await db.prepare(`
        SELECT 
          COUNT(*) as runs,
          SUM(CASE WHEN finish_position IN ('1') THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN finish_position IN ('1','2','3') THEN 1 ELSE 0 END) as top3
        FROM umadata
        WHERE horse_name = $1
          AND place LIKE $2
          AND distance LIKE $3
      `).get<any>(horse_name, `%${place}%`, `${surface}${distance}%`);
      
      if (courseRecord && courseRecord.runs > 0) {
        const winRate = courseRecord.wins / courseRecord.runs;
        horseCompatibility = winRate;
        summary += ` ${horse_name}は当コースで${courseRecord.runs}戦${courseRecord.wins}勝。`;
      } else {
        summary += ` ${horse_name}は当コース初。`;
      }
    }
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      course_characteristics: courseChar,
      horse_compatibility: horseCompatibility,
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
