/**
 * AI研究ツール: 枠順分析
 * 枠順の有利不利を分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const TOOL_VERSION = '1.0';

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
    
    // 枠別成績を集計（簡易版）
    const stats = await db.prepare(`
      SELECT 
        COUNT(*) as total_runs,
        SUM(CASE WHEN finish_position IN ('1') THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN finish_position IN ('1','2','3') THEN 1 ELSE 0 END) as top3
      FROM umadata
      WHERE place LIKE $1
        AND distance LIKE $2
        AND waku = $3
      LIMIT 1000
    `).get<any>(`%${race_place}%`, `${track_type}${race_distance}%`, waku_number.toString());
    
    const winRate = stats.total_runs > 0 ? (stats.wins / stats.total_runs) : 0;
    const top3Rate = stats.total_runs > 0 ? (stats.top3 / stats.total_runs) : 0;
    
    // サマリー
    const summary = `${race_place}${track_type}${race_distance}mの${waku_number}枠は、勝率${(winRate * 100).toFixed(1)}%、連対率${(top3Rate * 100).toFixed(1)}%。` +
      `${top3Rate > 0.35 ? '有利な枠' : top3Rate < 0.25 ? '不利な枠' : '平均的な枠'}。`;
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      waku_stats: {
        win_rate: winRate,
        top3_rate: top3Rate,
        total_runs: stats.total_runs
      },
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
