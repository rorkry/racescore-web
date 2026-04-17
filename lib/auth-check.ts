/**
 * 管理者認証チェック用ユーティリティ
 * Next-AuthのCookieセッションベース認証を使用
 */

import { auth } from './auth';

/**
 * リクエストが管理者からのものかチェック
 * Next-AuthのCookieセッションを使用
 */
export async function isAdminRequest(_request?: Request): Promise<boolean> {
  // 開発環境のみ SKIP_AUTH を許可。本番では絶対に素通りさせない
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NODE_ENV === 'development' &&
    process.env.SKIP_AUTH === 'true'
  ) {
    return true;
  }

  try {
    const session = await auth();

    if (!session?.user) {
      return false;
    }

    const role = (session.user as { role?: string }).role;
    return role === 'admin';
  } catch (error) {
    console.error('Admin check error:', error);
    return false;
  }
}

/**
 * 管理者専用APIのラッパー
 * 認証エラー時は401を返す
 */
export function requireAdmin(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const isAdmin = await isAdminRequest(request);
    
    if (!isAdmin) {
      return new Response(JSON.stringify({ 
        error: 'Unauthorized', 
        message: '管理者権限が必要です' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return handler(request);
  };
}
