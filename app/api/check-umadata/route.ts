/**
 * umadataテーブルの状態確認API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();

    // テーブル件数
    const countResult = await db.prepare('SELECT COUNT(*) as count FROM umadata').get() as { count: number };
    
    // サンプルデータ（最新10件）- race_idの形式を確認
    const sampleData = await db.prepare(`
      SELECT race_id, umaban, horse_name, date, place
      FROM umadata
      ORDER BY race_id DESC
      LIMIT 10
    `).all() as any[];

    // race_idのパターン分析
    const patterns = await db.prepare(`
      SELECT 
        SUBSTRING(race_id, 1, 4) as year,
        LENGTH(race_id) as id_length,
        COUNT(*) as count
      FROM umadata
      WHERE race_id IS NOT NULL
      GROUP BY SUBSTRING(race_id, 1, 4), LENGTH(race_id)
      ORDER BY year DESC
      LIMIT 10
    `).all() as any[];

    // 2026年1月のデータを確認
    const recentData = await db.prepare(`
      SELECT DISTINCT race_id, umaban, horse_name
      FROM umadata
      WHERE race_id LIKE '2026%'
      ORDER BY race_id DESC
      LIMIT 10
    `).all() as any[];

    return NextResponse.json({
      success: true,
      totalCount: countResult?.count || 0,
      raceIdPatterns: patterns,
      sampleData: sampleData,
      recentData: recentData,
      note: 'race_id + umaban (2桁) でindicesテーブルをクエリ'
    });
  } catch (error) {
    console.error('[check-umadata] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
