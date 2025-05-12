import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy Express‑bridge API running on port 3001
  async rewrites() {
    return [
      {
        source: '/api/trio/:path*',          // e.g. /api/trio?key=...
        destination: 'http://localhost:3001/api/trio/:path*',
      },
    ];
  },
};

export default nextConfig;
