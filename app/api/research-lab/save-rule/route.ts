import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbAsync } from '@/lib/db';

/**
 * POST /api/research-lab/save-rule
 * 研究結果をルール候補として保存
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      conditions,
      hypothesis,
      expected_outcome,
      reasoning,
      statistics,
      expected_value_diff,
      confidence_level,
      promising_score
    } = body;

    // 必須フィールドのチェック
    if (!name || !conditions || !statistics) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const db = await getDbAsync();

    // rule_candidatesテーブルの存在確認
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'rule_candidates'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      return NextResponse.json(
        { error: 'rule_candidates table does not exist. Please run migration first.' },
        { status: 500 }
      );
    }

    // ルール候補を保存
    const result = await db.query(
      `INSERT INTO rule_candidates (
        name,
        conditions,
        hypothesis,
        expected_outcome,
        reasoning,
        statistics,
        expected_value_diff,
        confidence_level,
        promising_score,
        status,
        created_by,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, NOW())
      RETURNING id`,
      [
        name,
        JSON.stringify(conditions),
        hypothesis,
        expected_outcome,
        reasoning,
        JSON.stringify(statistics),
        expected_value_diff,
        confidence_level,
        promising_score,
        session.user.email
      ]
    );

    return NextResponse.json({
      success: true,
      id: result.rows[0].id,
      message: 'ルールを保存しました'
    });
  } catch (error) {
    console.error('Error saving rule:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
