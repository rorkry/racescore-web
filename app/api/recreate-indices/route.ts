import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function GET(request: NextRequest) {
  // シークレットキーチェック
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  if (secret !== 'recreate-indices-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    const client = await pool.connect();

    try {
      // indicesテーブルを削除
      await client.query('DROP TABLE IF EXISTS indices');
      console.log('[recreate-indices] Dropped indices table');

      // 正しいスキーマで再作成（L4F, T2F は引用符付きで大文字）
      await client.query(`
        CREATE TABLE indices (
          race_id TEXT PRIMARY KEY,
          "L4F" REAL,
          "T2F" REAL,
          potential REAL,
          revouma REAL,
          makikaeshi REAL,
          cushion REAL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('[recreate-indices] Created indices table with quoted column names');

      // インデックス作成
      await client.query('CREATE INDEX IF NOT EXISTS idx_indices_race_id ON indices(race_id)');

      client.release();
      await pool.end();

      return NextResponse.json({
        success: true,
        message: 'indices table recreated successfully with L4F, T2F columns (case-sensitive)',
      });
    } catch (error) {
      client.release();
      throw error;
    }
  } catch (error) {
    console.error('[recreate-indices] Error:', error);
    return NextResponse.json({
      error: 'Failed to recreate indices table',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
