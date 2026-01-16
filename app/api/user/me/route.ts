import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

interface DbUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
}

interface DbSubscription {
  plan: string;
  status: string;
  current_period_end: string | null;
}

interface DbPoints {
  balance: number;
  total_earned: number;
  total_spent: number;
}

interface DbHorseMark {
  horse_name: string;
  mark: string;
  memo: string | null;
  created_at: string;
}

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const db = getDb();
    const email = session.user.email;

    // ユーザー情報を取得
    const user = db.prepare(
      'SELECT id, email, name, role, created_at FROM users WHERE email = ?'
    ).get(email) as DbUser | undefined;

    if (!user) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    // サブスクリプション情報を取得（テーブルが存在しない場合は空）
    let subscription: DbSubscription | null = null;
    try {
      subscription = db.prepare(
        'SELECT plan, status, current_period_end FROM subscriptions WHERE user_id = ?'
      ).get(user.id) as DbSubscription | undefined || null;
    } catch {
      // テーブルが存在しない場合は無視
    }

    // ポイント情報を取得（テーブルが存在しない場合は空）
    let points: DbPoints | null = null;
    try {
      points = db.prepare(
        'SELECT balance, total_earned, total_spent FROM user_points WHERE user_id = ?'
      ).get(user.id) as DbPoints | undefined || null;
    } catch {
      // テーブルが存在しない場合は無視
    }

    // 馬印を取得（テーブルが存在しない場合は空）
    let horseMarks: DbHorseMark[] = [];
    try {
      horseMarks = db.prepare(
        'SELECT horse_name, mark, memo, created_at FROM horse_marks WHERE user_id = ? ORDER BY created_at DESC'
      ).all(user.id) as DbHorseMark[];
    } catch {
      // テーブルが存在しない場合は無視
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        created_at: user.created_at,
      },
      subscription: subscription,
      points: points || { balance: 0, total_earned: 0, total_spent: 0 },
      horseMarks: horseMarks,
    });
  } catch (error) {
    console.error('User data fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// ユーザー情報更新（ユーザー名など）
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { name } = await request.json();

    if (name !== undefined && (typeof name !== 'string' || name.length > 50)) {
      return NextResponse.json({ error: 'ユーザー名は50文字以内で入力してください' }, { status: 400 });
    }

    const db = getDb();
    const email = session.user.email;

    db.prepare(
      'UPDATE users SET name = ?, updated_at = datetime("now") WHERE email = ?'
    ).run(name || null, email);

    return NextResponse.json({ success: true, name: name || null });
  } catch (error) {
    console.error('User update error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
