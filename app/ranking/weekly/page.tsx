'use client';

import Link from 'next/link';

export default function WeeklyRankingPage() {
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* ヘッダー */}
        <div className="mb-8">
          <Link 
            href="/"
            className="inline-flex items-center text-cyan-400 hover:text-cyan-300 transition mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            トップに戻る
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-cyan-400">
            週間ランキング
          </h1>
          <p className="text-slate-400 mt-2">
            今週の好成績予想者ランキング
          </p>
        </div>

        {/* 準備中メッセージ */}
        <div className="bg-slate-900/50 rounded-lg p-8 border border-slate-800 text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-xl font-bold text-amber-400 mb-2">
            Coming Soon
          </h2>
          <p className="text-slate-400">
            週間ランキング機能は現在準備中です。<br />
            もうしばらくお待ちください。
          </p>
        </div>

        {/* 予定機能 */}
        <div className="mt-8 bg-slate-900/50 rounded-lg p-6 border border-slate-800">
          <h3 className="text-lg font-bold text-cyan-400 mb-4">📋 予定している機能</h3>
          <ul className="space-y-2 text-slate-400 text-sm">
            <li className="flex items-center">
              <span className="text-amber-400 mr-2">○</span>
              週間的中率ランキング
            </li>
            <li className="flex items-center">
              <span className="text-amber-400 mr-2">○</span>
              回収率ランキング
            </li>
            <li className="flex items-center">
              <span className="text-amber-400 mr-2">○</span>
              高配当的中ランキング
            </li>
            <li className="flex items-center">
              <span className="text-amber-400 mr-2">○</span>
              連勝記録
            </li>
          </ul>
        </div>

        {/* フッター */}
        <div className="mt-12 pt-6 border-t border-slate-800 text-center text-slate-500 text-sm">
          <p>© 2026 RaceScore. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
