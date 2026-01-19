import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { checkRateLimit, getRateLimitIdentifier, strictRateLimit } from '@/lib/rate-limit';

// 入力サニタイズ
function sanitizeInput(input: string): string {
  return input.trim().slice(0, 255); // 最大255文字
}

export async function POST(request: NextRequest) {
  try {
    // Rate Limiting（厳格：1分に10回まで）
    const identifier = getRateLimitIdentifier(request);
    const rateLimit = checkRateLimit(`register:${identifier}`, strictRateLimit);
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' },
        { 
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
          }
        }
      );
    }

    const body = await request.json();
    const email = sanitizeInput(body.email || '').toLowerCase();
    const password = body.password || '';
    const name = sanitizeInput(body.name || '');

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

    if (password.length > 128) {
      return NextResponse.json(
        { error: 'パスワードは128文字以内で入力してください' },
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
