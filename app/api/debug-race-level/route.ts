/**
 * レースレベルのデバッグAPI
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const raceId = searchParams.get('raceId');

    // race_levels テーブルの件数を確認
    const countResult = await db.prepare(`
      SELECT COUNT(*) as count FROM race_levels
    `).get<{ count: number }>();

    // サンプルデータを取得
    const sampleData = await db.prepare(`
      SELECT race_id, level, level_label, total_horses_run, good_run_count, win_count, has_plus
      FROM race_levels
      ORDER BY calculated_at DESC
      LIMIT 10
    `).all();

    // 特定のraceIdが指定されている場合
    let specificResult = null;
    if (raceId) {
      specificResult = await db.prepare(`
        SELECT * FROM race_levels WHERE race_id = ?
      `).get(raceId);
    }

    return NextResponse.json({
      success: true,
      totalCount: countResult?.count || 0,
      sampleData,
      specificResult,
      note: 'race_levelsテーブルの状態を確認。0件の場合はレースレベルが計算・保存されていません。'
    });

  } catch (error) {
    console.error('Debug race level error:', error);
    return NextResponse.json({
      error: 'エラー',
      details: String(error),
      note: 'race_levelsテーブルが存在しない可能性があります'
    }, { status: 500 });
  }
}
