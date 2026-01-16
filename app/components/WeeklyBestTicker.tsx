'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface BestPrediction {
  id: string;
  userName: string;
  raceName: string;
  horseName: string;
  mark: string;
  result: number; // 着順
  votes: number;
}

// デモデータ（後でAPIから取得に変更）
const DEMO_PREDICTIONS: BestPrediction[] = [
  { id: '1', userName: '予想師A', raceName: '中山11R', horseName: 'サンプルホース', mark: '◎', result: 1, votes: 42 },
  { id: '2', userName: '予想師B', raceName: '京都10R', horseName: 'テストホース', mark: '◎', result: 1, votes: 38 },
  { id: '3', userName: '予想師C', raceName: '中山9R', horseName: 'デモホース', mark: '○', result: 2, votes: 25 },
];

export default function WeeklyBestTicker() {
  const [predictions, setPredictions] = useState<BestPrediction[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // TODO: APIから取得
    setPredictions(DEMO_PREDICTIONS);
  }, []);

  // 自動スライド
  useEffect(() => {
    if (predictions.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % predictions.length);
    }, 5000); // 5秒ごとに切り替え

    return () => clearInterval(interval);
  }, [predictions.length]);

  if (!isVisible || predictions.length === 0) return null;

  const current = predictions[currentIndex];

  return (
    <div className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 text-green-900 relative overflow-hidden notranslate" translate="no">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        {/* 左側: タイトル */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-lg">🏆</span>
          <span className="font-bold text-sm hidden sm:inline">今週のベスト予想</span>
          <span className="font-bold text-xs sm:hidden">BEST</span>
        </div>

        {/* 中央: スライドコンテンツ */}
        <div className="flex-1 mx-4 overflow-hidden">
          <div 
            className="flex items-center justify-center gap-1.5 text-sm animate-slide-in"
            key={current.id}
            translate="no"
          >
            <span className="font-bold">{current.userName}</span>
            <span className="text-green-800 hidden sm:inline">の予想</span>
            <span className="font-bold truncate max-w-[120px] sm:max-w-none">{current.horseName}</span>
            <span className="text-green-800 font-bold">→</span>
            <span className={`font-bold ${current.result === 1 ? 'text-red-700' : 'text-green-800'}`}>
              {current.result}着
            </span>
            <span className="text-xs text-green-700 hidden sm:inline">
              ({current.votes}票)
            </span>
          </div>
        </div>

        {/* 右側: もっと見る + 閉じる */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/ranking/weekly"
            className="text-xs font-bold hover:underline hidden sm:inline"
          >
            もっと見る →
          </Link>
          <button
            onClick={() => setIsVisible(false)}
            className="text-green-800 hover:text-green-900 p-1"
            aria-label="閉じる"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* インジケーター（3件以上の場合のみ表示） */}
      {predictions.length > 3 && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1.5 pb-1">
          {predictions.map((_, idx) => (
            <span
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              role="button"
              tabIndex={0}
              className={`inline-block w-2 h-2 rounded-full cursor-pointer transition-colors ${
                idx === currentIndex ? 'bg-green-900' : 'bg-green-900/40'
              }`}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slideIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
