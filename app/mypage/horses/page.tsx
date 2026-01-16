'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from '../../components/Providers';
import Link from 'next/link';

interface FavoriteHorse {
  id: string;
  horse_name: string;
  horse_id: string | null;
  note: string | null;
  notify_on_race: number;
  created_at: string;
}

export default function MyHorsesPage() {
  const { status } = useSession();
  const [favorites, setFavorites] = useState<FavoriteHorse[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);
  const [newHorseName, setNewHorseName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchFavorites();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status]);

  // 馬名検索
  useEffect(() => {
    const searchHorses = async () => {
      if (newHorseName.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setSearching(true);
      try {
        const res = await fetch(`/api/horses/search?q=${encodeURIComponent(newHorseName)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.horses || []);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    };

    const debounce = setTimeout(searchHorses, 300);
    return () => clearTimeout(debounce);
  }, [newHorseName]);

  // サジェスト外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const selectSuggestion = (name: string) => {
    setNewHorseName(name);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const fetchFavorites = async () => {
    try {
      const res = await fetch('/api/user/favorites');
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || []);
        setLimit(data.limit || 10);
      }
    } catch (err) {
      console.error('Failed to fetch favorites:', err);
    } finally {
      setLoading(false);
    }
  };

  const addFavorite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHorseName.trim()) return;

    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/user/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horseName: newHorseName.trim(), notifyOnRace: true })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '追加に失敗しました');
      } else {
        setNewHorseName('');
        fetchFavorites();
      }
    } catch {
      setError('エラーが発生しました');
    } finally {
      setAdding(false);
    }
  };

  const removeFavorite = async (horseName: string) => {
    try {
      await fetch('/api/user/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horseName })
      });
      fetchFavorites();
    } catch {
      console.error('Failed to remove favorite');
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">マイ馬</h1>
        <Link href="/mypage" className="text-green-600 hover:text-green-700 text-sm font-medium">
          ← マイページに戻る
        </Link>
      </div>

      {/* 追加フォーム */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="font-bold text-gray-800 mb-4">お気に入り馬を追加</h2>
        <form onSubmit={addFavorite} className="flex gap-3">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={newHorseName}
              onChange={(e) => setNewHorseName(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="馬名を入力（2文字以上で検索）..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
              disabled={adding}
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="size-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            {/* サジェストリスト */}
            {showSuggestions && suggestions.length > 0 && (
              <div 
                ref={suggestionRef}
                className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-50"
              >
                {suggestions.map((name, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectSuggestion(name)}
                    className="w-full px-4 py-2.5 text-left hover:bg-green-50 text-gray-800 border-b border-gray-100 last:border-b-0 flex items-center gap-2"
                  >
                    <span className="text-green-600">🐴</span>
                    <span className="font-medium">{name}</span>
                  </button>
                ))}
              </div>
            )}
            {showSuggestions && suggestions.length === 0 && newHorseName.length >= 2 && !searching && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500 z-50">
                該当する馬が見つかりません
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={adding || !newHorseName.trim()}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {adding ? '追加中...' : '追加'}
          </button>
        </form>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <p className="text-gray-400 text-xs mt-2">
          {favorites.length}/{limit}頭登録中
          {favorites.length >= limit && ' (上限に達しています - プレミアムで解除)'}
        </p>
      </div>

      {/* お気に入りリスト */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {favorites.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <span className="text-4xl">🐴</span>
            <p className="mt-4">まだお気に入り馬が登録されていません</p>
            <p className="text-sm mt-1">上のフォームから馬名を追加してください</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {favorites.map((horse) => (
              <div key={horse.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">🏇</span>
                  <div>
                    <h3 className="font-bold text-gray-800">{horse.horse_name}</h3>
                    <p className="text-xs text-gray-400">
                      登録日: {new Date(horse.created_at).toLocaleDateString('ja-JP')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {horse.notify_on_race ? (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                      🔔 出走通知ON
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">
                      🔕 通知OFF
                    </span>
                  )}
                  <button
                    onClick={() => removeFavorite(horse.horse_name)}
                    className="text-red-400 hover:text-red-600 transition-colors"
                    title="削除"
                  >
                    <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
