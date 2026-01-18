import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

interface DbUser { id: string; }
interface DbLoginHistory {
  id: string;
  login_date: string;
  streak_count: number;
  bonus_claimed: number;
}

// ログインボーナス報酬テーブル
const STREAK_REWARDS: Record<number, { points: number; description: string }> = {
  1: { points: 1, description: '1日目ログインボーナス' },
  3: { points: 5, description: '3日連続ログインボーナス' },
  7: { points: 10, description: '7日連続ログインボーナス' },
  14: { points: 20, description: '14日連続ログインボーナス' },
  30: { points: 50, description: '30日連続ログインボーナス' },
};

// ログイン記録＆ボーナス付与
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // 今日のログイン記録があるかチェック
    const todayRecord = await db.prepare(
      'SELECT * FROM login_history WHERE user_id = ? AND login_date = ?'
    ).get<DbLoginHistory>(user.id, today);

    if (todayRecord) {
      return NextResponse.json({ 
        alreadyClaimed: true, 
        streakCount: todayRecord.streak_count,
        message: '今日のログインボーナスは受け取り済みです'
      });
    }

    // 昨日のログイン記録を確認して連続日数を計算
    const yesterdayRecord = await db.prepare(
      'SELECT * FROM login_history WHERE user_id = ? AND login_date = ?'
    ).get<DbLoginHistory>(user.id, yesterday);

    const streakCount = yesterdayRecord ? yesterdayRecord.streak_count + 1 : 1;
    const now = new Date().toISOString();

    // ログイン記録を保存
    const loginId = randomUUID();
    await db.prepare(`
      INSERT INTO login_history (id, user_id, login_date, streak_count, bonus_claimed, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(loginId, user.id, today, streakCount, now);

    // ボーナスポイントを付与
    let bonusPoints = 1;
    let bonusDescription = 'デイリーログインボーナス';

    if (STREAK_REWARDS[streakCount]) {
      bonusPoints = STREAK_REWARDS[streakCount].points;
      bonusDescription = STREAK_REWARDS[streakCount].description;
    }

    // ポイント付与
    const existingPoints = await db.prepare('SELECT id, balance, total_earned FROM user_points WHERE user_id = ?').get<{ id: string; balance: number; total_earned: number }>(user.id);
    
    if (existingPoints) {
      await db.prepare(`
        UPDATE user_points SET balance = balance + ?, total_earned = total_earned + ?, updated_at = ?
        WHERE user_id = ?
      `).run(bonusPoints, bonusPoints, now, user.id);
    } else {
      const pointsId = randomUUID();
      await db.prepare(`
        INSERT INTO user_points (id, user_id, balance, total_earned, total_spent, updated_at)
        VALUES (?, ?, ?, ?, 0, ?)
      `).run(pointsId, user.id, bonusPoints, bonusPoints, now);
    }

    // ポイント履歴を記録
    const historyId = randomUUID();
    await db.prepare(`
      INSERT INTO point_history (id, user_id, amount, type, description, created_at)
      VALUES (?, ?, ?, 'login_bonus', ?, ?)
    `).run(historyId, user.id, bonusPoints, bonusDescription, now);

    // 通知を作成
    const notifId = randomUUID();
    await db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, created_at)
      VALUES (?, ?, 'bonus', ?, ?, ?)
    `).run(notifId, user.id, `+${bonusPoints}pt獲得！`, bonusDescription, now);

    return NextResponse.json({
      success: true,
      streakCount,
      bonusPoints,
      bonusDescription,
      message: `${bonusPoints}ポイント獲得！ (${streakCount}日連続ログイン)`
    });
  } catch (error) {
    console.error('Login bonus error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// ログイン状況取得
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
      const today = new Date().toISOString().split('T')[0];
      
      const todayRecord = await db.prepare(
        'SELECT * FROM login_history WHERE user_id = ? AND login_date = ?'
      ).get<DbLoginHistory>(user.id, today);

      const latestRecord = await db.prepare(
        'SELECT * FROM login_history WHERE user_id = ? ORDER BY login_date DESC LIMIT 1'
      ).get<DbLoginHistory>(user.id);

      return NextResponse.json({
        todayClaimed: !!todayRecord,
        currentStreak: latestRecord?.streak_count || 0,
        nextReward: Object.entries(STREAK_REWARDS).find(([day]) => parseInt(day) > (latestRecord?.streak_count || 0))?.[1]
      });
    } catch {
      return NextResponse.json({
        todayClaimed: false,
        currentStreak: 0,
        nextReward: STREAK_REWARDS[1]
      });
    }
  } catch (error) {
    console.error('Login status error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
