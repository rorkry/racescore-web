import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import FloatingActionButton from "./components/FloatingActionButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ストライド - データを、直感に。",
  description: "競馬データを視覚的に分析。AI分析と独自スコアで、あなたの予想をサポート。",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ストライド",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192x192.png",
  },
  other: {
    "theme-color": "#0a1f13",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head suppressHydrationWarning />
      <body className={`${geistSans.variable} ${geistMono.variable} turf-bg turf-pattern min-h-screen`} suppressHydrationWarning>
        {/* ヘッダー */}
        <header className="sticky top-0 z-40 glass-card border-b border-green-900/50">
          <div className="container mx-auto px-4 py-3 md:py-4">
            <div className="flex items-center justify-between">
              {/* ロゴ */}
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-lg overflow-hidden shadow-lg group-hover:scale-105 transition-transform">
                  <img 
                    src="/KRMロゴ2.jpg" 
                    alt="ストライド" 
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold gold-text tracking-wide">
                    STRIDE
                  </h1>
                  <p className="text-[10px] text-green-300 tracking-widest hidden sm:block">
                    DATA TO INTUITION
                  </p>
                </div>
              </Link>
              
              {/* ナビゲーション */}
              <nav className="flex items-center gap-2 md:gap-4">
                <Link 
                  href="/card" 
                  className="px-3 py-2 md:px-4 text-sm md:text-base text-green-100 hover:text-gold-400 transition font-medium rounded-lg hover:bg-green-900/30"
                >
                  レース
                </Link>
                <Link 
                  href="/about" 
                  className="px-3 py-2 md:px-4 text-sm md:text-base text-green-100 hover:text-gold-400 transition font-medium rounded-lg hover:bg-green-900/30"
                >
                  使い方
                </Link>
                <Link 
                  href="/admin"
                  className="px-3 py-2 md:px-4 text-sm md:text-base btn-gold rounded-lg"
                >
                  管理
                </Link>
              </nav>
            </div>
          </div>
        </header>
        
        {/* メインコンテンツ */}
        <main>{children}</main>
        
        {/* フッター */}
        <footer className="glass-card border-t border-green-900/50 mt-16">
          <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded overflow-hidden">
                  <img 
                    src="/KRMロゴ2.jpg" 
                    alt="ストライド" 
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                </div>
                <span className="gold-text font-bold">STRIDE</span>
              </div>
              <p className="text-green-400/60 text-sm">
                © 2026 ストライド（Stride）. All rights reserved.
              </p>
              <div className="flex gap-4 text-sm">
                <Link href="/about" className="text-green-400/60 hover:text-gold-400 transition">
                  使い方
                </Link>
                <Link href="/admin" className="text-green-400/60 hover:text-gold-400 transition">
                  管理
                </Link>
              </div>
            </div>
          </div>
        </footer>
        
        <FloatingActionButton />
        
        {/* Service Worker登録 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('[App] SW registered:', registration.scope);
                    })
                    .catch(function(error) {
                      console.log('[App] SW registration failed:', error);
                    });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
