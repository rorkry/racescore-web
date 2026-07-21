'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSession, signOut } from './Providers';
import LoginModal from './LoginModal';
import NotificationBell from './NotificationBell';

export default function Header() {
  const { data: session, status } = useSession();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAdmin = (session?.user as any)?.role === 'admin';

  // メニュー外クリックで閉じる
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    // 少し遅延させてイベントリスナーを追加（開くクリックと競合しないように）
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isMenuOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 glass-card border-b border-green-900/50">
        {/* PWAセーフエリアスペーサー */}
        <div className="pwa-safe-spacer"></div>
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            {/* ロゴ */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="size-10 rounded-lg overflow-hidden shadow-lg group-hover:scale-105 transition-transform">
                <img 
                  src="/KRMロゴ2.jpg" 
                  alt="ストライド" 
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold gold-text">
                  STRIDE
                </h1>
                <p className="text-[10px] text-green-300 hidden sm:block">
                  DATA TO INTUITION
                </p>
              </div>
            </Link>
            
            {/* ナビゲーション */}
            <nav className="flex items-center gap-2 md:gap-4">
              <Link 
                href="/card" 
                className="inline-flex items-center justify-center px-3 py-2 md:px-4 text-sm md:text-base text-green-100 hover:text-gold-400 transition font-medium rounded-lg hover:bg-green-900/30"
              >
                レース
              </Link>
              <Link 
                href="/about" 
                className="inline-flex items-center justify-center px-3 py-2 md:px-4 text-sm md:text-base text-green-100 hover:text-gold-400 transition font-medium rounded-lg hover:bg-green-900/30 hidden sm:inline-flex"
              >
                使い方
              </Link>

              {status === 'loading' ? (
                <div className="size-8 rounded-full bg-green-700/50 animate-pulse"></div>
              ) : session ? (
                // ログイン済み
                <div className="flex items-center gap-1">
                  <NotificationBell />
                  <div className="relative">
                    <button
                      onClick={() => setIsMenuOpen(!isMenuOpen)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-green-900/30 transition"
                    >
                    {/* アバター */}
                    <div className="size-8 rounded-full bg-gold-500 flex items-center justify-center text-green-900 font-bold text-sm">
                      {session.user?.name?.[0]?.toUpperCase() || session.user?.email?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="hidden md:block text-sm text-green-100 max-w-[120px] truncate">
                      {session.user?.name || session.user?.email?.split('@')[0]}
                    </span>
                    <svg className="size-4 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* ドロップダウンメニュー */}
                  {isMenuOpen && (
                      <div 
                        ref={menuRef}
                        className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50">
                        <div className="px-4 py-2 border-b border-gray-100">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {session.user?.name || session.user?.email?.split('@')[0]}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {session.user?.email}
                          </p>
                          {isAdmin && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-gold-100 text-gold-700 text-xs font-bold rounded">
                              管理者
                            </span>
                          )}
                        </div>

                        <Link 
                          href="/mypage"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <svg className="size-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          マイページ
                        </Link>

                        <Link 
                          href="/mypage/horses"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span className="size-5 flex items-center justify-center text-gray-400">🐴</span>
                          馬分析
                        </Link>

                        <Link 
                          href="/mypage/memos"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span className="size-5 flex items-center justify-center text-gray-400">📝</span>
                          マイメモ
                        </Link>

                        <Link 
                          href="/research-lab"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span className="size-5 flex items-center justify-center text-gray-400">🔬</span>
                          研究ラボ
                        </Link>

                        <Link 
                          href="/mypage/stats"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span className="size-5 flex items-center justify-center text-gray-400">📊</span>
                          予想成績
                        </Link>

                        <Link 
                          href="/mypage/badges"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span className="size-5 flex items-center justify-center text-gray-400">🏆</span>
                          バッジ
                        </Link>

                        {isAdmin && (
                          <Link 
                            href="/admin"
                            onClick={() => setIsMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <svg className="size-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            管理画面
                          </Link>
                        )}

                        <div className="border-t border-gray-100 mt-1">
                          <button
                            onClick={() => {
                              setIsMenuOpen(false);
                              // プレミアム機能のトグル状態をクリア
                              localStorage.removeItem('stride_active_features');
                              signOut({ callbackUrl: '/' });
                            }}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 w-full"
                          >
                            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            ログアウト
                          </button>
                        </div>
                      </div>
                  )}
                  </div>
                </div>
              ) : (
                // 未ログイン
                <button
                  onClick={() => setIsLoginOpen(true)}
                  className="inline-flex items-center justify-center px-3 py-2 md:px-4 text-sm md:text-base btn-gold rounded-lg"
                >
                  ログイン
                </button>
              )}
            </nav>
          </div>
        </div>
      </header>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </>
  );
}
