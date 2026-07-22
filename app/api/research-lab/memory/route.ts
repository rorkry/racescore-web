import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getResearchHistory, getPromisingThemes } from '@/lib/research-agent/research-memory';

/**
 * GET /api/research-lab/memory
 * 研究メモリ（履歴）を取得
 */
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const theme_type = searchParams.get('theme_type');
    const is_promising = searchParams.get('is_promising');
    const exploration_status = searchParams.get('exploration_status');
    const limit = searchParams.get('limit');

    // フィルタを構築
    const filters: any = {};
    if (theme_type) filters.theme_type = theme_type;
    if (is_promising !== null) filters.is_promising = is_promising === 'true';
    if (exploration_status) filters.exploration_status = exploration_status;
    if (limit) filters.limit = parseInt(limit, 10);

    try {
      const history = await getResearchHistory(session.user.id, filters);
      
      return NextResponse.json({
        success: true,
        history,
        total: history.length
      });
    } catch (error) {
      // テーブルが存在しない場合
      return NextResponse.json({
        success: true,
        history: [],
        total: 0,
        message: 'Research memory table does not exist yet. Please run migration.'
      });
    }
  } catch (error) {
    console.error('Error fetching research memory:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
