import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

interface DbUser { id: string; }
interface DbNotification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  is_read: number;
  created_at: string;
}

// 通知一覧取得
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    try {
      const notifications = await db.prepare(
        'SELECT id, type, title, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
      ).all<DbNotification>(user.id);

      const unreadCount = await db.prepare(
        'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0'
      ).get<{ cnt: number }>(user.id);

      return NextResponse.json({ notifications, unreadCount: unreadCount?.cnt || 0 });
    } catch {
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }
  } catch (error) {
    console.error('Notifications fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// 通知を既読にする
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { id, markAllRead } = await request.json();

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    if (markAllRead) {
      await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(user.id);
    } else if (id) {
      await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, user.id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Notification update error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
