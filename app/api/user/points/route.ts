import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

interface DbUser {
  id: string;
}

interface DbPointHistory {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

interface DbPoints {
  balance: number;
  total_earned: number;
  total_spent: number;
}

// ポイント情報と履歴を取得
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const db = getDb();
    
    // ユーザーIDを取得
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    // ポイント情報を取得
    const points = await db.prepare(
      'SELECT balance, total_earned, total_spent FROM user_points WHERE user_id = ?'
    ).get<DbPoints>(user.id);

    // ポイント履歴を取得（最新50件）
    const history = await db.prepare(
      'SELECT id, amount, type, description, created_at FROM point_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all<DbPointHistory>(user.id);

    return NextResponse.json({
      points: points || { balance: 0, total_earned: 0, total_spent: 0 },
      history: history || [],
    });
  } catch (error) {
    console.error('Points fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
