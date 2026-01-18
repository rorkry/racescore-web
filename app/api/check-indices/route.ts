/**
 * indicesテーブルの状態確認API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const raceId = searchParams.get('raceId');

    // テーブル件数
    const countResult = await db.prepare('SELECT COUNT(*) as count FROM indices').get() as { count: number };
    
    // サンプルデータ（最新10件）
    const sampleData = await db.prepare(`
      SELECT race_id, "L4F", "T2F", potential, makikaeshi, revouma, cushion
      FROM indices
      ORDER BY race_id DESC
      LIMIT 10
    `).all() as any[];

    // 特定のrace_idがある場合は検索
    let specificData = null;
    if (raceId) {
      specificData = await db.prepare(`
        SELECT race_id, "L4F", "T2F", potential, makikaeshi, revouma, cushion
        FROM indices
        WHERE race_id = $1
      `).get(raceId);
    }

    // race_idのパターン分析
    const patterns = await db.prepare(`
      SELECT 
        SUBSTRING(race_id, 1, 4) as year,
        COUNT(*) as count
      FROM indices
      GROUP BY SUBSTRING(race_id, 1, 4)
      ORDER BY year DESC
      LIMIT 10
    `).all() as any[];

    return NextResponse.json({
      success: true,
      totalCount: countResult?.count || 0,
      yearBreakdown: patterns,
      sampleData: sampleData,
      specificData: specificData,
      raceIdFormat: 'Expected: YYYYMMDDRRCCHH (year + date + venue + race + horse)',
    });
  } catch (error) {
    console.error('[check-indices] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
