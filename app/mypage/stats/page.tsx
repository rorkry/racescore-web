'use client';

import { useEffect, useState } from 'react';
import { useSession } from '../../components/Providers';
import Link from 'next/link';

interface Stats {
  total: number;
  honmei_hit: number;
  honmei_total: number;
  total_hit: number;
}

interface Prediction {
  id: string;
  race_key: string;
  horse_number: string;
  mark: string;
  result_position: number | null;
  is_hit: number;
  created_at: string;
}

export default function StatsPage() {
  const { status } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchStats();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/user/predictions');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats || null);
        setPredictions(data.predictions || []);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatRaceKey = (key: string) => {
    if (key.length >= 10) {
      return `${key.slice(0, 4)}/${key.slice(4, 6)}/${key.slice(6, 8)} ${parseInt(key.slice(8))}R`;
    }
    return key;
  };

  const getMarkColor = (mark: string) => {
    switch (mark) {
      case '◎': return 'text-red-500';
      case '○': return 'text-blue-500';
      case '▲': return 'text-green-500';
      case '△': return 'text-yellow-600';
      case '☆': return 'text-purple-500';
      default: return 'text-gray-500';
    }
  };

  if (status === 'unauthenticated') {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-xl font-bold text-gray-800 mb-4">ログインが必要です</h1>
          <Link href="/" className="inline-block px-6 py-3 btn-gold rounded-lg font-bold">
            トップページへ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="inline-block size-12 border-4 border-green-700 border-t-gold-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const honmeiRate = stats && stats.honmei_total > 0 
    ? ((stats.honmei_hit / stats.honmei_total) * 100).toFixed(1) 
    : '0.0';

  const totalRate = stats && stats.total > 0 
    ? ((stats.total_hit / stats.total) * 100).toFixed(1) 
    : '0.0';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">予想成績</h1>
        <Link href="/mypage" className="text-green-600 hover:text-green-700 text-sm font-medium">
          ← マイページに戻る
        </Link>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-lg p-4 text-center">
          <div className="text-3xl font-bold text-gray-800 tabular-nums">{stats?.total || 0}</div>
          <div className="text-sm text-gray-500">総予想数</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4 text-center">
          <div className="text-3xl font-bold text-red-500 tabular-nums">{stats?.honmei_hit || 0}</div>
          <div className="text-sm text-gray-500">◎1着的中</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4 text-center">
          <div className="text-3xl font-bold text-green-600 tabular-nums">{honmeiRate}%</div>
          <div className="text-sm text-gray-500">◎的中率</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4 text-center">
          <div className="text-3xl font-bold text-blue-600 tabular-nums">{totalRate}%</div>
          <div className="text-sm text-gray-500">総的中率</div>
        </div>
      </div>

      {/* 印別成績 */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
        <h2 className="font-bold text-gray-800 mb-4">印別成績</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {['◎', '○', '▲', '△', '☆', '紐', '消'].map((mark) => {
            const markPredictions = predictions.filter(p => p.mark === mark);
            const hits = markPredictions.filter(p => p.result_position === 1).length;
            const total = markPredictions.filter(p => p.result_position !== null).length;
            const rate = total > 0 ? ((hits / total) * 100).toFixed(0) : '-';

            return (
              <div key={mark} className="text-center p-3 bg-gray-50 rounded-lg">
                <div className={`text-2xl font-bold ${getMarkColor(mark)}`}>{mark}</div>
                <div className="text-sm text-gray-800 tabular-nums mt-1">{hits}/{total}</div>
                <div className="text-xs text-gray-500 tabular-nums">{rate}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 直近の予想 */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">直近の予想</h2>
        </div>
        {predictions.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <span className="text-4xl">📊</span>
            <p className="mt-4">まだ予想データがありません</p>
            <p className="text-sm mt-1">レースカードで印をつけると記録されます</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {predictions.slice(0, 20).map((pred) => (
              <div key={pred.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <span className={`text-2xl font-bold ${getMarkColor(pred.mark)}`}>{pred.mark}</span>
                  <div>
                    <div className="text-sm font-medium text-gray-800 tabular-nums">
                      {formatRaceKey(pred.race_key)} - {pred.horse_number}番
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(pred.created_at).toLocaleDateString('ja-JP')}
                    </div>
                  </div>
                </div>
                <div>
                  {pred.result_position !== null ? (
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      pred.result_position === 1 
                        ? 'bg-yellow-100 text-yellow-700' 
                        : pred.result_position <= 3 
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-gray-50 text-gray-400'
                    }`}>
                      {pred.result_position}着
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-sm bg-blue-50 text-blue-600">
                      未確定
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
