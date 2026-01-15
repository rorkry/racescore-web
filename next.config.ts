import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone出力（軽量デプロイ用）
  output: 'standalone',
  
  // 本番ビルドの最適化
  compress: true,
  
  // ビルドエラーを無視（開発時）
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
