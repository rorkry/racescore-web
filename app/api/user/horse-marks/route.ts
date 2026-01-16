import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

interface DbUser {
  id: string;
}

interface DbHorseMark {
  id: string;
  horse_id: string;
  mark: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// 馬印一覧を取得
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const db = getDb();
    
    // ユーザーIDを取得
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const marks = db.prepare(
      'SELECT id, horse_id, mark, note, created_at, updated_at FROM user_horse_marks WHERE user_id = ? ORDER BY updated_at DESC'
    ).all(user.id) as DbHorseMark[];

    return NextResponse.json({ marks });
  } catch (error) {
    console.error('Horse marks fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// 馬印を追加/更新
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { horseId, mark, note } = await request.json();

    if (!horseId || !mark) {
      return NextResponse.json({ error: '馬IDと印は必須です' }, { status: 400 });
    }

    // 印のバリデーション
    const validMarks = ['◎', '○', '▲', '△', '☆', '×', '注'];
    if (!validMarks.includes(mark)) {
      return NextResponse.json({ error: '無効な印です' }, { status: 400 });
    }

    const db = getDb();
    
    // ユーザーIDを取得
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const now = new Date().toISOString();

    // 既存の馬印をチェック
    const existing = db.prepare(
      'SELECT id FROM user_horse_marks WHERE user_id = ? AND horse_id = ?'
    ).get(user.id, horseId) as { id: string } | undefined;

    if (existing) {
      // 更新
      db.prepare(
        'UPDATE user_horse_marks SET mark = ?, note = ?, updated_at = ? WHERE id = ?'
      ).run(mark, note || null, now, existing.id);
    } else {
      // 新規作成
      const id = randomUUID();
      db.prepare(
        'INSERT INTO user_horse_marks (id, user_id, horse_id, mark, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, user.id, horseId, mark, note || null, now, now);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Horse mark save error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// 馬印を削除
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { horseId } = await request.json();

    if (!horseId) {
      return NextResponse.json({ error: '馬IDは必須です' }, { status: 400 });
    }

    const db = getDb();
    
    // ユーザーIDを取得
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    db.prepare('DELETE FROM user_horse_marks WHERE user_id = ? AND horse_id = ?').run(user.id, horseId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Horse mark delete error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
