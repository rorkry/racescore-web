import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbAsync } from '@/lib/db';

/**
 * POST /api/research-lab/migrate-memory
 * 研究メモリテーブルを作成
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDbAsync();

    // research_memory テーブルを作成
    await db.query(`
      CREATE TABLE IF NOT EXISTS research_memory (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        
        -- 条件の識別
        condition_hash TEXT NOT NULL,  -- 条件の一意識別子（重複チェック用）
        condition_name TEXT NOT NULL,
        conditions JSONB NOT NULL,
        
        -- 結果データ
        statistics JSONB NOT NULL,
        is_promising BOOLEAN NOT NULL,
        promising_score INTEGER NOT NULL,
        expected_value_diff DECIMAL NOT NULL,
        
        -- テーマ情報
        theme_type TEXT,  -- 'makikaeshi', 'potential', 'l4f', 'pedigree', 'course', etc.
        base_field TEXT,  -- メインのフィールド名
        
        -- メタデータ
        first_tested_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_tested_at TIMESTAMP NOT NULL DEFAULT NOW(),
        test_count INTEGER DEFAULT 1,
        
        -- 派生関係
        parent_condition_id TEXT,  -- どの条件から派生したか
        derived_condition_ids TEXT[],  -- この条件から派生した条件のID配列
        
        -- 探索ステータス
        exploration_status TEXT DEFAULT 'new',  -- 'new', 'promising', 'exhausted', 'avoid'
        
        -- AIの判断メモ
        ai_notes TEXT,
        next_actions JSONB,  -- 次に試すべきアクション
        
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        
        UNIQUE(user_id, condition_hash)
      );
    `);

    // インデックスを作成
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_memory_user_id 
      ON research_memory(user_id);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_memory_condition_hash 
      ON research_memory(condition_hash);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_memory_theme_type 
      ON research_memory(theme_type);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_memory_exploration_status 
      ON research_memory(exploration_status);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_memory_is_promising 
      ON research_memory(is_promising);
    `);

    return NextResponse.json({
      success: true,
      message: 'research_memory table created successfully'
    });
  } catch (error) {
    console.error('Error creating table:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create table',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
