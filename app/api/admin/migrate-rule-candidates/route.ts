/**
 * rule_candidates テーブル作成マイグレーションAPI
 * 
 * 使用方法:
 * POST /api/admin/migrate-rule-candidates
 */

import { NextResponse } from 'next/server';
import { getDbAsync } from '@/lib/db';

export async function POST() {
  try {
    const db = await getDbAsync();
    console.log('Creating rule_candidates table...');

    // テーブル作成
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS rule_candidates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        conditions JSONB NOT NULL,
        statistics JSONB NOT NULL,
        confidence JSONB NOT NULL,
        validation_results JSONB NOT NULL DEFAULT '[]'::jsonb,
        
        -- AIの推論（トレーサビリティ）
        ai_reasoning JSONB NOT NULL,
        
        status TEXT DEFAULT 'pending',
        reviewed_at TIMESTAMP,
        research_session_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `).run();

    console.log('✅ Table created successfully');

    // インデックス作成
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_rule_candidates_user_id ON rule_candidates(user_id)
    `).run();
    
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_rule_candidates_status ON rule_candidates(status)
    `).run();
    
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_rule_candidates_session ON rule_candidates(research_session_id)
    `).run();

    console.log('✅ Indexes created successfully');

    // テーブル情報を確認
    const columns = await db.prepare(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'rule_candidates'
      ORDER BY ordinal_position
    `).all<any>();

    return NextResponse.json({
      success: true,
      message: 'rule_candidates table created successfully',
      columns: columns
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const db = await getDbAsync();
    // テーブルの存在確認
    const result = await db.prepare(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'rule_candidates'
      )
    `).get<{ exists: boolean }>();

    if (result?.exists) {
      const columns = await db.prepare(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'rule_candidates'
        ORDER BY ordinal_position
      `).all<any>();

      return NextResponse.json({
        exists: true,
        columns: columns
      });
    }

    return NextResponse.json({
      exists: false,
      message: 'Table does not exist'
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
