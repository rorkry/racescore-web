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
    const raceKeys = searchParams.get('raceKeys'); // 複数取得用

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    let memos: DbMemo[];
    
    if (raceKey) {
      // 単一レースのメモ取得
      const memo = db.prepare(
        'SELECT id, race_key, memo, created_at, updated_at FROM race_memos WHERE user_id = ? AND race_key = ?'
      ).get(user.id, raceKey) as DbMemo | undefined;
      memos = memo ? [memo] : [];
    } else if (raceKeys) {
      // 複数レースのメモ存在確認
      const keys = raceKeys.split(',');
      memos = db.prepare(
        `SELECT id, race_key, memo, created_at, updated_at FROM race_memos 
         WHERE user_id = ? AND race_key IN (${keys.map(() => '?').join(',')})
         ORDER BY created_at DESC`
      ).all(user.id, ...keys) as DbMemo[];
    } else {
      // 全メモ取得
      memos = db.prepare(
        'SELECT id, race_key, memo, created_at, updated_at FROM race_memos WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
      ).all(user.id) as DbMemo[];
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

    // メモが空の場合は削除
    if (!memo || memo.trim() === '') {
      const db = getDb();
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
      if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
      
      db.prepare('DELETE FROM race_memos WHERE user_id = ? AND race_key = ?').run(user.id, raceKey);
      return NextResponse.json({ success: true, deleted: true });
    }

    // 無料ユーザーは500文字制限
    if (memo.length > 500) {
      return NextResponse.json({ error: 'メモは500文字以内です（プレミアムで解除）' }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    const now = new Date().toISOString();

    // UPSERT: 存在すれば更新、なければ挿入
    const existing = db.prepare(
      'SELECT id FROM race_memos WHERE user_id = ? AND race_key = ?'
    ).get(user.id, raceKey) as { id: string } | undefined;

    if (existing) {
      db.prepare(
        'UPDATE race_memos SET memo = ?, updated_at = ? WHERE id = ?'
      ).run(memo, now, existing.id);
      return NextResponse.json({ success: true, id: existing.id, updated: true });
    } else {
      const id = randomUUID();
      db.prepare(`
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
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    db.prepare('DELETE FROM race_memos WHERE race_key = ? AND user_id = ?').run(raceKey, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Race memo delete error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
