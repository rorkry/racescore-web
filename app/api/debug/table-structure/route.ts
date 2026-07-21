/**
 * デバッグ用: テーブル構造とサンプルデータを確認
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    
    // テーブルのカラム情報を取得
    const columnsResult = await db.prepare(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'umadata'
      ORDER BY ordinal_position
      LIMIT 50
    `).all();
    
    // 新潟芝1600mのサンプルデータを取得
    const sampleDataResult = await db.prepare(`
      SELECT 
        place,
        distance,
        sire,
        finish_position,
        popularity,
        win_odds,
        place_odds_low,
        waku,
        weight_carried
      FROM umadata
      WHERE place = '新潟' AND distance LIKE '芝1600%'
      LIMIT 10
    `).all();
    
    // finish_positionの値の分布を確認
    const finishDistResult = await db.prepare(`
      SELECT 
        finish_position,
        COUNT(*) as count
      FROM umadata
      WHERE place = '新潟' AND distance LIKE '芝1600%'
      GROUP BY finish_position
      ORDER BY count DESC
      LIMIT 20
    `).all();
    
    return NextResponse.json({
      columns: columnsResult,
      sampleData: sampleDataResult,
      finishPositionDistribution: finishDistResult,
      totalCount: sampleDataResult.length
    });
    
  } catch (error) {
    console.error('[Debug] Table structure error:', error);
    return NextResponse.json(
      { 
        error: 'サーバーエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
