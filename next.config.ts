import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本番ビルドの最適化
  compress: true,  // gzip圧縮を有効化
  
  // ビルドエラーを無視（開発時）
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
