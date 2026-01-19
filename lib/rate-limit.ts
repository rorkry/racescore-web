/**
 * シンプルなRate Limiter
 * メモリベースなので、単一インスタンス環境用
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// 定期的に古いエントリを削除（メモリリーク防止）
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.resetTime < now) {
      rateLimitMap.delete(key);
    }
  }
}, 60000); // 1分ごとにクリーンアップ

interface RateLimitConfig {
  maxRequests: number;  // 最大リクエスト数
  windowMs: number;     // 時間窓（ミリ秒）
}

// デフォルト設定
const defaultConfig: RateLimitConfig = {
  maxRequests: 100,  // 1分間に100リクエストまで
  windowMs: 60000,   // 1分
};

/**
 * Rate Limitチェック
 * @param identifier - ユーザー識別子（IPアドレスやユーザーID）
 * @param config - 設定（オプション）
 * @returns { allowed: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): { allowed: boolean; remaining: number; resetTime: number } {
  const { maxRequests, windowMs } = { ...defaultConfig, ...config };
  const now = Date.now();

  const entry = rateLimitMap.get(identifier);

  if (!entry || entry.resetTime < now) {
    // 新しいエントリを作成
    rateLimitMap.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    // レート制限に達した
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }

  // カウントを増やす
  entry.count++;
  rateLimitMap.set(identifier, entry);

  return { allowed: true, remaining: maxRequests - entry.count, resetTime: entry.resetTime };
}

/**
 * APIルート用のRate Limit ヘルパー
 * @param req - NextRequest
 * @param config - 設定
 */
export function getRateLimitIdentifier(req: Request): string {
  // X-Forwarded-For ヘッダーからIPを取得（プロキシ経由の場合）
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return ip;
}

// 厳しい制限（認証APIなど）
export const strictRateLimit: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60000,  // 1分に10回まで
};

// 中程度の制限（一般API）
export const normalRateLimit: RateLimitConfig = {
  maxRequests: 60,
  windowMs: 60000,  // 1分に60回まで
};

// 緩い制限（読み取り専用API）
export const looseRateLimit: RateLimitConfig = {
  maxRequests: 200,
  windowMs: 60000,  // 1分に200回まで
};
