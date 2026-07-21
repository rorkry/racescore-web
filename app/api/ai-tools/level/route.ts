/**
 * AI研究ツール: レースレベル分析
 * レースのレベル（S/A/B/C/D）を判定
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const TOOL_VERSION = '1.0';

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
    
    const actualGoodCount = levelData.first_run_good_count ?? levelData.good_run_count ?? 0;
    const nextRunSuccessRate = levelData.total_horses_run > 0 
      ? actualGoodCount / levelData.total_horses_run 
      : 0;
    
    const summary = `このレースは${levelData.level_label || levelData.level}レベル。` +
      `出走馬の次走好走率${(nextRunSuccessRate * 100).toFixed(1)}%（${actualGoodCount}/${levelData.total_horses_run}頭）。`;
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      race_level: levelData.level || 'UNKNOWN',
      race_level_label: levelData.level_label || levelData.level,
      next_run_success_rate: nextRunSuccessRate,
      good_run_count: actualGoodCount,
      total_horses_run: levelData.total_horses_run,
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
