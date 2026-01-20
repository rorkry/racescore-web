/**
 * race_levelsテーブルをクリアするAPI
 * 古いキャッシュをクリアして再計算を強制
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();

    try {
      // race_levelsテーブルの全データを削除
      const result = await client.query('DELETE FROM race_levels');
      const deletedCount = result.rowCount || 0;

      client.release();
      await pool.end();

      return NextResponse.json({
        success: true,
        message: `Cleared ${deletedCount} race level records`,
        deletedCount,
        note: 'Next access will recalculate race levels with new logic',
      });

    } catch (error) {
      client.release();
      throw error;
    }

  } catch (error) {
    console.error('Clear race levels error:', error);
    await pool.end();
    return NextResponse.json({
      error: 'Failed to clear race levels',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// GETでも呼び出せるようにする（簡易確認用）
export async function GET() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    
    // 現在のレコード数を確認
    const countResult = await client.query('SELECT COUNT(*) FROM race_levels');
    const count = parseInt(countResult.rows[0].count, 10);
    
    // サンプルデータを取得
    const sampleResult = await client.query(`
      SELECT race_id, level, level_label, total_horses_run, good_run_count, first_run_good_count, win_count
      FROM race_levels
      ORDER BY calculated_at DESC
      LIMIT 5
    `);

    client.release();
    await pool.end();

    return NextResponse.json({
      success: true,
      currentCount: count,
      sample: sampleResult.rows,
      note: 'POST to this endpoint to clear all records',
    });

  } catch (error) {
    await pool.end();
    return NextResponse.json({
      error: 'Failed to check race levels',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
