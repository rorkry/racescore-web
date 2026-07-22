import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST() {
  try {
    const db = await getDb();

    // research_memory テーブル作成
    await db.query(`
      CREATE TABLE IF NOT EXISTS research_memory (
        id SERIAL PRIMARY KEY,
        condition_hash VARCHAR(64) UNIQUE NOT NULL,
        condition_name TEXT NOT NULL,
        condition_json JSONB NOT NULL,
        theme_type VARCHAR(50) NOT NULL,
        first_tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        test_count INTEGER DEFAULT 1,
        best_score INTEGER DEFAULT 0,
        best_statistics JSONB,
        is_promising BOOLEAN DEFAULT FALSE,
        parent_condition_hash VARCHAR(64),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // インデックス作成
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_memory_hash 
      ON research_memory(condition_hash);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_memory_theme 
      ON research_memory(theme_type);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_memory_promising 
      ON research_memory(is_promising);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_memory_parent 
      ON research_memory(parent_condition_hash);
    `);

    return NextResponse.json({
      success: true,
      message: 'research_memory テーブルとインデックスを作成しました',
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        error: 'Migration failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
