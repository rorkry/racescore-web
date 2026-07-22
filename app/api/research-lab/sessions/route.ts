import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbAsync } from '@/lib/db';

/**
 * GET /api/research-lab/sessions
 * 自分の研究セッション一覧を取得
 */
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDbAsync();

    // テーブルの存在確認
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'research_lab_sessions'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      return NextResponse.json({
        sessions: [],
        message: 'research_lab_sessions table does not exist yet'
      });
    }

    // 自分の研究セッション一覧を取得（新しい順）
    const result = await db.query(`
      SELECT 
        id,
        theme,
        mode,
        status,
        progress,
        phase,
        phase1_tested,
        phase1_promising,
        phase2_tested,
        phase3_tested,
        promising_count,
        started_at,
        completed_at,
        created_at
      FROM research_lab_sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [session.user.id]);

    return NextResponse.json({
      sessions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/research-lab/sessions/:id
 * 特定の研究セッションの詳細を取得
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const db = await getDbAsync();

    // セッション詳細を取得（結果含む）
    const result = await db.query(`
      SELECT *
      FROM research_lab_sessions
      WHERE id = $1 AND user_id = $2
    `, [sessionId, session.user.id]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const sessionData = result.rows[0];

    return NextResponse.json({
      session: {
        id: sessionData.id,
        theme: sessionData.theme,
        mode: sessionData.mode,
        status: sessionData.status,
        progress: sessionData.progress,
        phase: sessionData.phase
      },
      phase1_tested: sessionData.phase1_tested,
      phase1_promising: sessionData.phase1_promising,
      phase2_tested: sessionData.phase2_tested,
      phase3_tested: sessionData.phase3_tested,
      promising_count: sessionData.promising_count,
      
      // 詳細結果
      phase1_results: sessionData.phase1_results,
      phase2_results: sessionData.phase2_results,
      phase3_results: sessionData.phase3_results,
      rule_candidates: sessionData.rule_candidates,
      
      started_at: sessionData.started_at,
      completed_at: sessionData.completed_at
    });
  } catch (error) {
    console.error('Error fetching session details:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
