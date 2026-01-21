/**
 * 管理者認証チェック用ユーティリティ
 * Next-AuthのCookieセッションベース認証を使用
 */

import { auth } from './auth';

/**
 * リクエストが管理者からのものかチェック
 * Next-AuthのCookieセッションを使用
 */
export async function isAdminRequest(request?: Request): Promise<boolean> {
  // 開発環境では常に許可（オプション）
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    return true;
  }

  try {
    // Next-Authのセッションを取得
    const session = await auth();
    
    if (!session?.user) {
      return false;
    }

    // ユーザーのroleがadminかチェック
    return (session.user as any).role === 'admin';
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
