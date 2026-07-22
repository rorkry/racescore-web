import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbAsync } from '@/lib/db';

/**
 * POST /api/research-lab/migrate-sessions
 * 研究セッション保存用テーブルを作成
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック（管理者のみ）
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDbAsync();

    // research_lab_sessions テーブルを作成
    await db.query(`
      CREATE TABLE IF NOT EXISTS research_lab_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        theme TEXT NOT NULL,
        mode TEXT DEFAULT 'manual',
        status TEXT DEFAULT 'running',
        progress INTEGER DEFAULT 0,
        phase INTEGER DEFAULT 1,
        
        -- 結果データ（JSON）
        phase1_results JSONB,
        phase2_results JSONB,
        phase3_results JSONB,
        rule_candidates JSONB,
        
        -- 統計情報
        phase1_tested INTEGER DEFAULT 0,
        phase1_promising INTEGER DEFAULT 0,
        phase2_tested INTEGER DEFAULT 0,
        phase3_tested INTEGER DEFAULT 0,
        promising_count INTEGER DEFAULT 0,
        
        -- タイムスタンプ
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // インデックスを作成
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_lab_sessions_user_id 
      ON research_lab_sessions(user_id);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_lab_sessions_status 
      ON research_lab_sessions(status);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_research_lab_sessions_created_at 
      ON research_lab_sessions(created_at DESC);
    `);

    return NextResponse.json({
      success: true,
      message: 'research_lab_sessions table created successfully'
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
