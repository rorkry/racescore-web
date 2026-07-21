/**
 * AI研究ツール: 血統分析
 * 種牡馬の成績・適性を分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const TOOL_VERSION = '1.0';

export async function POST(req: NextRequest) {
  try {
    const { horse_name, race_surface, race_distance } = await req.json();
    
    if (!horse_name || !race_surface || !race_distance) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'horse_name, race_surface, and race_distance are required'
      }, { status: 400 });
    }
    
    const db = getDb();
    
    // 馬の種牡馬を取得
    const horse = await db.prepare(`
      SELECT sire FROM umadata 
      WHERE horse_name = $1 
      ORDER BY date DESC LIMIT 1
    `).get<{ sire: string }>(horse_name);
    
    if (!horse?.sire) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'Horse not found',
        summary: `${horse_name}のデータが見つかりません` 
      });
    }
    
    const sire = horse.sire;
    
    // 種牡馬の成績を集計（簡易版）
    const stats = await db.prepare(`
      SELECT 
        COUNT(*) as total_runs,
        SUM(CASE WHEN finish_position = '1' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN finish_position IN ('1','2','3') THEN 1 ELSE 0 END) as top3,
        AVG(CASE WHEN distance LIKE $1 AND distance ~ '^[芝ダ]?[0-9]+$' 
            THEN CAST(SUBSTRING(distance FROM '[0-9]+') AS INTEGER) END) as avg_distance
      FROM umadata
      WHERE sire = $2 AND distance LIKE $3
    `).get<any>(
      `${race_surface}%`,
      sire,
      `${race_surface}%`
    );
    
    const winRate = stats.total_runs > 0 ? (stats.wins / stats.total_runs) : 0;
    const top3Rate = stats.total_runs > 0 ? (stats.top3 / stats.total_runs) : 0;
    
    // AI用の簡潔なサマリー
    const summary = `${sire}産駒は${race_surface}で勝率${(winRate * 100).toFixed(1)}%、連対率${(top3Rate * 100).toFixed(1)}%。` +
      `今回の距離${race_distance}mは${stats.avg_distance ? 
        (Math.abs(race_distance - stats.avg_distance) < 400 ? '適性範囲内' : 'やや外れる') : 
        '不明'}。`;
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      sire,
      stats: {
        total_runs: stats.total_runs,
        win_rate: winRate,
        top3_rate: top3Rate,
        avg_distance: stats.avg_distance
      },
      summary
    });
    
  } catch (error) {
    console.error('[AI Tool: Sire] Error:', error);
    return NextResponse.json({ 
      schema_version: TOOL_VERSION,
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
