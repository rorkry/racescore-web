import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

interface DbUser { id: string; }
interface DbMemo {
  id: string;
  race_key: string;
  memo: string;
  created_at: string;
  updated_at: string;
}

// レースメモ取得
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const raceKey = searchParams.get('raceKey');
    const raceKeys = searchParams.get('raceKeys');

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    let memos: DbMemo[];
    
    if (raceKey) {
      const memo = await db.prepare(
        'SELECT id, race_key, memo, created_at, updated_at FROM race_memos WHERE user_id = ? AND race_key = ?'
      ).get<DbMemo>(user.id, raceKey);
      memos = memo ? [memo] : [];
    } else if (raceKeys) {
      const keys = raceKeys.split(',');
      // PostgreSQLでは動的なIN句を使う
      const placeholders = keys.map((_, i) => `$${i + 2}`).join(',');
      memos = await db.query<DbMemo>(
        `SELECT id, race_key, memo, created_at, updated_at FROM race_memos 
         WHERE user_id = $1 AND race_key IN (${placeholders})
         ORDER BY created_at DESC`,
        [user.id, ...keys]
      );
    } else {
      memos = await db.prepare(
        'SELECT id, race_key, memo, created_at, updated_at FROM race_memos WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
      ).all<DbMemo>(user.id);
    }

    return NextResponse.json({ memos });
  } catch (error) {
    console.error('Race memos fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// レースメモ保存/更新
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { raceKey, memo } = await request.json();
    if (!raceKey) {
      return NextResponse.json({ error: 'レースキーは必須です' }, { status: 400 });
    }

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    // メモが空の場合は削除
    if (!memo || memo.trim() === '') {
      await db.prepare('DELETE FROM race_memos WHERE user_id = ? AND race_key = ?').run(user.id, raceKey);
      return NextResponse.json({ success: true, deleted: true });
    }

    // 無料ユーザーは500文字制限
    if (memo.length > 500) {
      return NextResponse.json({ error: 'メモは500文字以内です（プレミアムで解除）' }, { status: 400 });
    }

    const now = new Date().toISOString();

    const existing = await db.prepare(
      'SELECT id FROM race_memos WHERE user_id = ? AND race_key = ?'
    ).get<{ id: string }>(user.id, raceKey);

    if (existing) {
      await db.prepare(
        'UPDATE race_memos SET memo = ?, updated_at = ? WHERE id = ?'
      ).run(memo, now, existing.id);
      return NextResponse.json({ success: true, id: existing.id, updated: true });
    } else {
      const id = randomUUID();
      await db.prepare(`
        INSERT INTO race_memos (id, user_id, race_key, memo, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, user.id, raceKey, memo, now, now);
      return NextResponse.json({ success: true, id, created: true });
    }
  } catch (error) {
    console.error('Race memo save error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// レースメモ削除
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { raceKey } = await request.json();
    if (!raceKey) return NextResponse.json({ error: 'レースキーは必須です' }, { status: 400 });

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    await db.prepare('DELETE FROM race_memos WHERE race_key = ? AND user_id = ?').run(raceKey, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Race memo delete error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
