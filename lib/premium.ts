import { getDb } from './db';

interface DbSubscription {
  plan: string;
  status: string;
}

/**
 * ユーザーがプレミアム会員かどうかを判定
 * - 管理者は自動的にプレミアム扱い
 * - subscriptionsテーブルでplan='premium'かつstatus='active'ならプレミアム
 */
export async function isPremiumUser(userId: string): Promise<boolean> {
  const db = getDb();
  
  // 管理者は自動的にプレミアム扱い
  const user = await db.prepare(
    'SELECT role FROM users WHERE id = $1'
  ).get<{ role: string }>(userId);
  
  if (user?.role === 'admin') {
    return true;
  }

  // サブスクリプション確認
  const subscription = await db.prepare(
    'SELECT plan, status FROM subscriptions WHERE user_id = $1'
  ).get<DbSubscription>(userId);
  
  return subscription?.plan === 'premium' && subscription?.status === 'active';
}

/**
 * メールアドレスからユーザーIDを取得してプレミアム判定
 */
export async function isPremiumUserByEmail(email: string): Promise<boolean> {
  const db = getDb();
  
  const user = await db.prepare(
    'SELECT id, role FROM users WHERE email = $1'
  ).get<{ id: string; role: string }>(email);
  
  if (!user) {
    return false;
  }
  
  // 管理者は自動的にプレミアム扱い
  if (user.role === 'admin') {
    return true;
  }
  
  // サブスクリプション確認（isPremiumUserを呼ばず直接確認）
  const subscription = await db.prepare(
    'SELECT plan, status FROM subscriptions WHERE user_id = $1'
  ).get<DbSubscription>(user.id);
  
  return subscription?.plan === 'premium' && subscription?.status === 'active';
}

// プラン別の制限
export const PLAN_LIMITS = {
  free: {
    favorites: 20,      // お気に入り上限
    notifications: 10,  // 通知ON上限
  },
  premium: {
    favorites: 500,
    notifications: 100,
  }
};

/**
 * ユーザーの制限を取得
 */
export async function getUserLimits(userId: string) {
  const isPremium = await isPremiumUser(userId);
  return isPremium ? PLAN_LIMITS.premium : PLAN_LIMITS.free;
}
