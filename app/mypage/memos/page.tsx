'use client';

import { useEffect, useState } from 'react';
import { useSession } from '../../components/Providers';
import Link from 'next/link';

interface RaceMemo {
  id: string;
  race_key: string;
  horse_number: string | null;
  memo: string;
  created_at: string;
}

interface BabaMemo {
  id: string;
  date: string;
  place: string;
  track_type: string;
  course_type: string | null;
  course_condition: string | null;
  advantage_position: string | null;
  advantage_style: string | null;
  weather_note: string | null;
  free_memo: string | null;
}

interface HorseRaceMemo {
  horse_name: string;
  race_key: string;
  memo: string;
  updated_at: string;
}

export default function MyMemosPage() {
  const { status } = useSession();
  const [tab, setTab] = useState<'race' | 'baba' | 'horse'>('race');
  const [raceMemos, setRaceMemos] = useState<RaceMemo[]>([]);
  const [babaMemos, setBabaMemos] = useState<BabaMemo[]>([]);
  const [horseMemos, setHorseMemos] = useState<HorseRaceMemo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchMemos();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status]);

  const fetchMemos = async () => {
    try {
      const [raceRes, babaRes, horseRes] = await Promise.all([
        fetch('/api/user/race-memos'),
        fetch('/api/user/baba-memos'),
        fetch('/api/user/horse-race-memos?all=true'),
      ]);

      if (raceRes.ok) {
        const data = await raceRes.json();
        setRaceMemos(data.memos || []);
      }
      if (babaRes.ok) {
        const data = await babaRes.json();
        setBabaMemos(data.memos || []);
      }
      if (horseRes.ok) {
        const data = await horseRes.json();
        setHorseMemos(data.memos || []);
      }
    } catch (err) {
      console.error('Failed to fetch memos:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteRaceMemo = async (id: string) => {
    try {
      await fetch('/api/user/race-memos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      setRaceMemos(prev => prev.filter(m => m.id !== id));
    } catch {
      console.error('Failed to delete memo');
    }
  };

  const deleteHorseRaceMemo = async (horseName: string, raceKey: string) => {
    try {
      await fetch(`/api/user/horse-race-memos?horseName=${encodeURIComponent(horseName)}&raceKey=${encodeURIComponent(raceKey)}`, {
        method: 'DELETE',
      });
      setHorseMemos(prev => prev.filter(m => !(m.horse_name === horseName && m.race_key === raceKey)));
    } catch {
      console.error('Failed to delete horse race memo');
    }
  };

  const formatRaceKey = (key: string) => {
    // 例: 2026011206 -> 2026/01/12 6R
    if (key.length >= 10) {
      return `${key.slice(0, 4)}/${key.slice(4, 6)}/${key.slice(6, 8)} ${parseInt(key.slice(8))}R`;
    }
    return key;
  };

  // 今走メモのrace_keyをフォーマット: "20260405-中山-1" → "2026/04/05 中山 1R"
  const formatHorseRaceKey = (key: string) => {
    const parts = key.split('-');
    if (parts.length >= 3) {
      const yyyymmdd = parts[0];
      const place = parts[1];
      const raceNum = parts.slice(2).join('-');
      if (yyyymmdd.length === 8) {
        return `${yyyymmdd.slice(0, 4)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)} ${place} ${raceNum}R`;
      }
    }
    return key;
  };

  const generateBabaSummary = (memo: BabaMemo) => {
    const parts = [memo.place];
    if (memo.course_type) parts.push(`${memo.course_type}コース`);
    if (memo.course_condition) parts.push(memo.course_condition);
    if (memo.advantage_position && memo.advantage_position !== 'フラット') parts.push(memo.advantage_position);
    if (memo.advantage_style && memo.advantage_style !== 'フラット') parts.push(memo.advantage_style);
    return parts.join('・');
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">マイメモ</h1>
        <Link href="/mypage" className="text-green-600 hover:text-green-700 text-sm font-medium">
          ← マイページに戻る
        </Link>
      </div>

      {/* タブ */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setTab('race')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${tab === 'race'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          レースメモ ({raceMemos.length})
        </button>
        <button
          onClick={() => setTab('baba')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${tab === 'baba'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          馬場メモ ({babaMemos.length})
        </button>
        <button
          onClick={() => setTab('horse')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${tab === 'horse'
              ? 'bg-amber-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          ✏️ レース別馬メモ ({horseMemos.length})
        </button>
      </div>

      {/* レースメモ一覧 */}
      {tab === 'race' && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {raceMemos.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <span className="text-4xl">📝</span>
              <p className="mt-4">まだレースメモがありません</p>
              <p className="text-sm mt-1">レースカードからメモを追加できます</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {raceMemos.map((memo) => (
                <div key={memo.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-gray-800 tabular-nums">
                          {formatRaceKey(memo.race_key)}
                        </span>
                        {memo.horse_number && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                            {memo.horse_number}番
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 text-sm whitespace-pre-wrap">{memo.memo}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(memo.created_at).toLocaleString('ja-JP')}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteRaceMemo(memo.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 馬場メモ一覧 */}
      {tab === 'baba' && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {babaMemos.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <span className="text-4xl">🏟️</span>
              <p className="mt-4">まだ馬場メモがありません</p>
              <p className="text-sm mt-1">レースカードから馬場メモを追加できます</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {babaMemos.map((memo) => (
                <div key={memo.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-bold text-gray-800 tabular-nums">{memo.date}</span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                          {memo.place}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded font-medium ${memo.track_type === '芝'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                          }`}>
                          {memo.track_type}
                        </span>
                      </div>
                      <p className="text-gray-700 font-medium">{generateBabaSummary(memo)}</p>
                      {memo.weather_note && (
                        <p className="text-amber-600 text-sm mt-1">📌 {memo.weather_note.split(',').join('・')}</p>
                      )}
                      {memo.free_memo && (
                        <p className="text-gray-500 text-sm mt-1">{memo.free_memo}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* レース別馬メモ一覧 */}
      {tab === 'horse' && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {horseMemos.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <span className="text-4xl">✏️</span>
              <p className="mt-4">まだレース別馬メモがありません</p>
              <p className="text-sm mt-1">レースカードの馬名横の ✏️ ボタンからメモを追加できます</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {horseMemos.map((memo) => (
                <div key={`${memo.horse_name}-${memo.race_key}`} className="p-4 hover:bg-amber-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-amber-700">
                          {memo.horse_name}
                        </span>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded tabular-nums">
                          {formatHorseRaceKey(memo.race_key)}
                        </span>
                      </div>
                      <p className="text-gray-700 text-sm whitespace-pre-wrap">{memo.memo}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(memo.updated_at).toLocaleString('ja-JP')}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteHorseRaceMemo(memo.horse_name, memo.race_key)}
                      className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
