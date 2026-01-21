/**
 * 管理者認証チェック用ユーティリティ
 */

import { getDb } from './db';

/**
 * リクエストが管理者からのものかチェック
 * Authorization: Bearer <session_token> 形式
 */
export async function isAdminRequest(request: Request): Promise<boolean> {
  // 開発環境では常に許可（オプション）
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    return true;
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  if (!token) return false;

  try {
    const db = getDb();
    
    // セッショントークンからユーザーを取得
    const session = await db.prepare(`
      SELECT s.user_id, u.role 
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = $1 
        AND (s.expires IS NULL OR s.expires > NOW())
    `).get<{ user_id: string; role: string }>(token);

    return session?.role === 'admin';
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
