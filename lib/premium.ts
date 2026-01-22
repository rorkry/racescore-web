import { getDb } from './db';

interface DbSubscription {
  plan: string;
  status: string;
}

// グローバル設定のキャッシュ（1分間有効）
let globalPremiumCache: { value: boolean; timestamp: number } | null = null;
const CACHE_TTL = 60 * 1000; // 1分

/**
 * 全ユーザーにプレミアム機能が有効化されているかを確認
 */
async function isPremiumForAll(): Promise<boolean> {
  // キャッシュが有効ならそれを返す
  if (globalPremiumCache && Date.now() - globalPremiumCache.timestamp < CACHE_TTL) {
    return globalPremiumCache.value;
  }
  
  try {
    const db = getDb();
    const setting = await db.prepare(
      "SELECT value FROM app_settings WHERE key = 'premium_for_all'"
    ).get<{ value: string }>();
    
    const value = setting?.value === 'true';
    globalPremiumCache = { value, timestamp: Date.now() };
    return value;
  } catch {
    // テーブルがない場合やエラー時は false
    return false;
  }
}

/**
 * グローバル設定キャッシュをクリア（設定変更時に呼び出す）
 */
export function clearPremiumCache() {
  globalPremiumCache = null;
}

/**
 * ユーザーがプレミアム会員かどうかを判定
 * - 全員プレミアム設定がONなら true
 * - 管理者は自動的にプレミアム扱い
 * - subscriptionsテーブルでplan='premium'かつstatus='active'ならプレミアム
 */
export async function isPremiumUser(userId: string): Promise<boolean> {
  // 1. グローバル設定で全員プレミアムがONなら true
  if (await isPremiumForAll()) {
    return true;
  }
  
  const db = getDb();
  
  // 2. 管理者は自動的にプレミアム扱い
  const user = await db.prepare(
    'SELECT role FROM users WHERE id = $1'
  ).get<{ role: string }>(userId);
  
  if (user?.role === 'admin') {
    return true;
  }

  // 3. サブスクリプション確認
  const subscription = await db.prepare(
    'SELECT plan, status FROM subscriptions WHERE user_id = $1'
  ).get<DbSubscription>(userId);
  
  return subscription?.plan === 'premium' && subscription?.status === 'active';
}

/**
 * メールアドレスからユーザーIDを取得してプレミアム判定
 */
export async function isPremiumUserByEmail(email: string): Promise<boolean> {
  // 1. グローバル設定で全員プレミアムがONなら true
  if (await isPremiumForAll()) {
    return true;
  }
  
  const db = getDb();
  
  const user = await db.prepare(
    'SELECT id, role FROM users WHERE email = $1'
  ).get<{ id: string; role: string }>(email);
  
  if (!user) {
    return false;
  }
  
  // 2. 管理者は自動的にプレミアム扱い
  if (user.role === 'admin') {
    return true;
  }
  
  // 3. サブスクリプション確認
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
