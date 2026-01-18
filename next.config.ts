import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone出力（軽量デプロイ用）
  output: 'standalone',
  
  // 本番ビルドの最適化
  compress: true,
  
  // TypeScriptエラーを無視（開発時）
  typescript: {
    ignoreBuildErrors: true,
  },

  // セキュリティヘッダー
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // XSS攻撃防止
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // クリックジャッキング防止
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // MIMEタイプスニッフィング防止
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // リファラーポリシー
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // 権限ポリシー（不要なブラウザ機能を無効化）
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
