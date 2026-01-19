/**
 * race_levelsテーブルの初期化API
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    const client = await pool.connect();

    try {
      // テーブルの存在確認
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'race_levels'
        );
      `);

      const tableExists = tableCheck.rows[0].exists;

      if (!tableExists) {
        // テーブル作成
        await client.query(`
          CREATE TABLE IF NOT EXISTS race_levels (
            race_id TEXT PRIMARY KEY,
            level TEXT NOT NULL,
            level_label TEXT NOT NULL,
            total_horses_run INTEGER DEFAULT 0,
            good_run_count INTEGER DEFAULT 0,
            first_run_good_count INTEGER DEFAULT 0,
            win_count INTEGER DEFAULT 0,
            good_run_rate REAL DEFAULT 0,
            first_run_good_rate REAL DEFAULT 0,
            has_plus INTEGER DEFAULT 0,
            ai_comment TEXT,
            display_comment TEXT,
            calculated_at TIMESTAMP DEFAULT NOW(),
            expires_at TIMESTAMP
          )
        `);

        // インデックス作成
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_race_levels_expires ON race_levels(expires_at)
        `);

        client.release();
        await pool.end();

        return NextResponse.json({
          success: true,
          message: 'race_levels table created',
          tableExisted: false,
        });
      }

      // テーブルが存在する場合、レコード数を確認
      const countResult = await client.query('SELECT COUNT(*) FROM race_levels');
      const count = parseInt(countResult.rows[0].count, 10);

      client.release();
      await pool.end();

      return NextResponse.json({
        success: true,
        message: 'race_levels table already exists',
        tableExisted: true,
        recordCount: count,
      });

    } catch (error) {
      client.release();
      throw error;
    }

  } catch (error) {
    console.error('Init race levels error:', error);
    return NextResponse.json({
      error: 'Failed to init race_levels table',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
