import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

interface DbUser { id: string; }
interface DbFavorite {
  id: string;
  horse_name: string;
  horse_id: string | null;
  note: string | null;
  notify_on_race: number;
  created_at: string;
}

const FREE_LIMIT = 10; // 無料ユーザーのお気に入り上限

// お気に入り馬一覧取得
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    const favorites = db.prepare(
      'SELECT id, horse_name, horse_id, note, notify_on_race, created_at FROM favorite_horses WHERE user_id = ? ORDER BY created_at DESC'
    ).all(user.id) as DbFavorite[];

    return NextResponse.json({ favorites, limit: FREE_LIMIT, count: favorites.length });
  } catch (error) {
    console.error('Favorites fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// お気に入り馬追加
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { horseName, horseId, note, notifyOnRace } = await request.json();
    if (!horseName) {
      return NextResponse.json({ error: '馬名は必須です' }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    // 上限チェック（無料ユーザー）
    const count = db.prepare('SELECT COUNT(*) as cnt FROM favorite_horses WHERE user_id = ?').get(user.id) as { cnt: number };
    if (count.cnt >= FREE_LIMIT) {
      return NextResponse.json({ 
        error: `お気に入りは${FREE_LIMIT}頭までです（プレミアムで解除）`,
        needsUpgrade: true 
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    try {
      db.prepare(`
        INSERT INTO favorite_horses (id, user_id, horse_name, horse_id, note, notify_on_race, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, user.id, horseName, horseId || null, note || null, notifyOnRace ? 1 : 0, now);
    } catch {
      return NextResponse.json({ error: 'この馬は既にお気に入りに登録されています' }, { status: 409 });
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Favorite add error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// お気に入り馬削除
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { horseName } = await request.json();
    if (!horseName) return NextResponse.json({ error: '馬名は必須です' }, { status: 400 });

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as DbUser | undefined;
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    db.prepare('DELETE FROM favorite_horses WHERE user_id = ? AND horse_name = ?').run(user.id, horseName);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Favorite delete error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
