/**
 * 今走メモ API（馬×レース単位）
 *
 * GET  ?raceKey=xxx               → 指定レースに登録された全馬のメモを返す
 * GET  ?horseName=xxx             → 指定馬の全レースメモを返す
 * POST  { horseName, raceKey, memo } → 作成/更新（upsert）
 * DELETE ?horseName=xxx&raceKey=xxx  → 削除
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const raceKey = searchParams.get('raceKey');
  const horseName = searchParams.get('horseName');

  if (!raceKey && !horseName) {
    return NextResponse.json({ error: 'raceKey or horseName is required' }, { status: 400 });
  }

  try {
    const db = getDb();
    let rows: Array<{ horse_name: string; race_key: string; memo: string }>;

    if (raceKey) {
      rows = await db.query<{ horse_name: string; race_key: string; memo: string }>(
        `SELECT horse_name, race_key, memo FROM horse_race_memos
         WHERE user_id = $1 AND race_key = $2
         ORDER BY horse_name`,
        [userId, raceKey]
      );
    } else {
      rows = await db.query<{ horse_name: string; race_key: string; memo: string }>(
        `SELECT horse_name, race_key, memo FROM horse_race_memos
         WHERE user_id = $1 AND horse_name = $2
         ORDER BY race_key DESC`,
        [userId, horseName!.trim()]
      );
    }

    return NextResponse.json({ memos: rows });
  } catch (error) {
    console.error('[horse-race-memos] GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await request.json();
    const { horseName, raceKey, memo } = body as {
      horseName: string;
      raceKey: string;
      memo: string;
    };

    if (!horseName || !raceKey) {
      return NextResponse.json({ error: 'horseName and raceKey are required' }, { status: 400 });
    }

    const db = getDb();

    if (!memo || memo.trim() === '') {
      // メモが空なら削除
      await db.query(
        `DELETE FROM horse_race_memos WHERE user_id = $1 AND horse_name = $2 AND race_key = $3`,
        [userId, horseName.trim(), raceKey]
      );
      return NextResponse.json({ deleted: true });
    }

    const id = `hrm_${userId}_${horseName.trim()}_${raceKey}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_');
    await db.query(
      `INSERT INTO horse_race_memos (id, user_id, horse_name, race_key, memo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (user_id, horse_name, race_key)
       DO UPDATE SET memo = EXCLUDED.memo, updated_at = NOW()`,
      [id, userId, horseName.trim(), raceKey, memo.trim()]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[horse-race-memos] POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const horseName = searchParams.get('horseName');
  const raceKey = searchParams.get('raceKey');

  if (!horseName || !raceKey) {
    return NextResponse.json({ error: 'horseName and raceKey are required' }, { status: 400 });
  }

  try {
    const db = getDb();
    await db.query(
      `DELETE FROM horse_race_memos WHERE user_id = $1 AND horse_name = $2 AND race_key = $3`,
      [userId, horseName.trim(), raceKey]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[horse-race-memos] DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
