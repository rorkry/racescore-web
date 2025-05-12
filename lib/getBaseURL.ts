// lib/getBaseURL.ts
/**
 * クライアント側では ''（相対パス）
 * サーバー側（API / SSG / SSR）のときは環境変数を使ってホスト名を返す
 */
export function getBaseURL(): string {
    // ブラウザなら window が定義されている
    if (typeof window !== 'undefined') {
      return '';
    }
  
    // サーバー側 ─ 環境変数があれば優先、なければローカル
    return (
      process.env.NEXT_PUBLIC_BASE_URL ||       // デプロイ環境
      process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` || // Vercel など
      'http://localhost:3000'                  // 開発用デフォルト
    );
  }