import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本番ビルドの最適化
  compress: true,  // gzip圧縮を有効化
  
  // 画像最適化
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  
  // バンドル最適化
  experimental: {
    optimizeCss: true,  // CSS最適化
  },
  
  // ビルドエラーを無視（開発時）
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // ヘッダー設定（キャッシュ制御）
  async headers() {
    return [
      {
        // 静的アセットに長期キャッシュ
        source: '/:path*.(js|css|png|ico|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // APIレスポンスに短期キャッシュ
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=60, stale-while-revalidate=300',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
