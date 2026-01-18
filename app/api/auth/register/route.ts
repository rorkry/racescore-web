import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    // バリデーション
    if (!email || !password) {
      return NextResponse.json(
        { error: 'メールアドレスとパスワードは必須です' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'パスワードは8文字以上で入力してください' },
        { status: 400 }
      );
    }

    // メール形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: '有効なメールアドレスを入力してください' },
        { status: 400 }
      );
    }

    const db = getDb();

    // 既存ユーザーチェック
    const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return NextResponse.json(
        { error: 'このメールアドレスは既に登録されています' },
        { status: 409 }
      );
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(password, 12);

    // ユーザー作成
    const userId = randomUUID();
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'user', ?, ?)
    `).run(userId, email, passwordHash, name || null, now, now);

    // 初期ポイント付与
    const pointsId = randomUUID();
    await db.prepare(`
      INSERT INTO user_points (id, user_id, balance, total_earned, total_spent, updated_at)
      VALUES (?, ?, 100, 100, 0, ?)
    `).run(pointsId, userId, now);

    // ポイント履歴に記録
    const historyId = randomUUID();
    await db.prepare(`
      INSERT INTO point_history (id, user_id, amount, type, description, created_at)
      VALUES (?, ?, 100, 'welcome', '新規登録ボーナス', ?)
    `).run(historyId, userId, now);

    // 無料プランのサブスクリプション作成
    const subId = randomUUID();
    await db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan, status, created_at, updated_at)
      VALUES (?, ?, 'free', 'active', ?, ?)
    `).run(subId, userId, now, now);

    return NextResponse.json({
      success: true,
      message: 'ユーザー登録が完了しました',
      user: {
        id: userId,
        email,
        name: name || null,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: '登録処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
