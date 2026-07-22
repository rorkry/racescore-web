import { NextRequest, NextResponse } from 'next/server';
import { getDbAsync } from '@/lib/db';
import { auth } from '@/lib/auth';

/**
 * GET /api/debug/indices-columns
 * indicesテーブルのカラム一覧とサンプルデータを返す
 */
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDbAsync();
    
    // サンプルデータを1件取得
    const query = 'SELECT * FROM indices LIMIT 1';
    const result = await db.prepare(query).get();
    
    if (!result) {
      return NextResponse.json({ 
        success: true,
        columns: [],
        sample: null,
        message: 'indicesテーブルにデータがありません'
      });
    }
    
    const columns = Object.keys(result);
    
    return NextResponse.json({
      success: true,
      columns,
      sample: result,
      columnCount: columns.length
    });
  } catch (error) {
    console.error('Error fetching indices columns:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
