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
import { normalizeHorseName } from '@/utils/normalize-horse-name';

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
  const all = searchParams.get('all');

  if (!raceKey && !horseName && !all) {
    return NextResponse.json({ error: 'raceKey, horseName, or all=true is required' }, { status: 400 });
  }

  try {
    const db = getDb();
    let rows: Array<{ horse_name: string; race_key: string; memo: string; updated_at?: string }>;

    if (all) {
      rows = await db.query<{ horse_name: string; race_key: string; memo: string; updated_at: string }>(
        `SELECT horse_name, race_key, memo, updated_at FROM horse_race_memos
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [userId]
      );
    } else if (raceKey) {
      rows = await db.query<{ horse_name: string; race_key: string; memo: string }>(
        `SELECT horse_name, race_key, memo FROM horse_race_memos
         WHERE user_id = $1 AND race_key = $2
         ORDER BY horse_name`,
        [userId, raceKey]
      );
    } else {
      // 正規化前・正規化後の両方でマッチ（既存データの後方互換性確保）
      const rawName = horseName!.trim();
      const normalizedName = normalizeHorseName(rawName);
      rows = await db.query<{ horse_name: string; race_key: string; memo: string }>(
        `SELECT horse_name, race_key, memo FROM horse_race_memos
         WHERE user_id = $1 AND (horse_name = $2 OR horse_name = $3)
         ORDER BY race_key DESC`,
        [userId, normalizedName, rawName]
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

    // 馬名を正規化（$・* などの先頭記号を除去）してDBに保存
    // race-highlights API の wakujun 照合と一致させるため
    const normalizedHorseName = normalizeHorseName(horseName);
    if (!normalizedHorseName) {
      return NextResponse.json({ error: 'horseName is invalid' }, { status: 400 });
    }

    const db = getDb();

    if (!memo || memo.trim() === '') {
      // メモが空なら削除（正規化前・正規化後の両方を削除して整合性を確保）
      await db.query(
        `DELETE FROM horse_race_memos WHERE user_id = $1 AND (horse_name = $2 OR horse_name = $3) AND race_key = $4`,
        [userId, normalizedHorseName, horseName.trim(), raceKey]
      );
      return NextResponse.json({ deleted: true });
    }

    const id = `hrm_${userId}_${normalizedHorseName}_${raceKey}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_');
    await db.query(
      `INSERT INTO horse_race_memos (id, user_id, horse_name, race_key, memo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (user_id, horse_name, race_key)
       DO UPDATE SET memo = EXCLUDED.memo, updated_at = NOW()`,
      [id, userId, normalizedHorseName, raceKey, memo.trim()]
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
    const normalizedName = normalizeHorseName(horseName);
    await db.query(
      `DELETE FROM horse_race_memos WHERE user_id = $1 AND (horse_name = $2 OR horse_name = $3) AND race_key = $4`,
      [userId, normalizedName, horseName.trim(), raceKey]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[horse-race-memos] DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
