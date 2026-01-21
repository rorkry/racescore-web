'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from '../../components/Providers';
import Link from 'next/link';
import { normalizeHorseName } from '@/utils/normalize-horse-name';
import HorseDetailModal from '../../components/HorseDetailModal';

interface FavoriteHorse {
  id: string;
  horse_name: string;
  horse_id: string | null;
  note: string | null;
  notify_on_race: number;
  created_at: string;
}

interface PastRace {
  date: string;
  distance: string;
  class_name: string;
  finish_position: string;
  finish_time: string;
  margin: string;
  track_condition: string;
  place: string;
  indices?: {
    makikaeshi?: number;
    potential?: number;
  } | null;
  raceLevel?: {
    level: string;
    levelLabel: string;
    totalHorsesRun: number;
    goodRunCount: number;
    winCount: number;
  };
}

interface HorseDetail {
  horseName: string;
  umaban: string;
  kinryo: string;
  kishu: string;
  pastRaces: PastRace[];
  score: number | null;
  hasData: boolean;
}

// HorseDetailModal用の型変換
interface ModalHorse {
  umaban: string;
  umamei: string;
  kinryo: string;
  kishu: string;
  score: number | null;
  hasData: boolean;
  past: PastRace[];
}

export default function HorseAnalysisPage() {
  const { status } = useSession();
  const [favorites, setFavorites] = useState<FavoriteHorse[]>([]);
  const [favoriteNames, setFavoriteNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);
  
  // 検索関連
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // 馬詳細モーダル
  const [selectedHorse, setSelectedHorse] = useState<ModalHorse | null>(null);
  const [loadingHorseDetail, setLoadingHorseDetail] = useState(false);
  
  // お気に入りリスト表示
  const [showFavorites, setShowFavorites] = useState(false);
  
  // 操作中フラグ
  const [togglingFavorite, setTogglingFavorite] = useState<string | null>(null);

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
      if (searchQuery.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setSearching(true);
      try {
        const res = await fetch(`/api/horses/search?q=${encodeURIComponent(searchQuery)}`);
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
  }, [searchQuery]);

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

  const fetchFavorites = async () => {
    try {
      const res = await fetch('/api/user/favorites');
      if (res.ok) {
        const data = await res.json();
        const favs = data.favorites || [];
        setFavorites(favs);
        setFavoriteNames(new Set(favs.map((f: FavoriteHorse) => normalizeHorseName(f.horse_name))));
        setLimit(data.limit || 10);
      }
    } catch (err) {
      console.error('Failed to fetch favorites:', err);
    } finally {
      setLoading(false);
    }
  };

  // 馬詳細を取得してモーダルを開く
  const openHorseDetail = async (horseName: string) => {
    setLoadingHorseDetail(true);
    setShowSuggestions(false);
    
    try {
      const res = await fetch(`/api/horses/detail?name=${encodeURIComponent(horseName)}`);
      if (res.ok) {
        const data: HorseDetail = await res.json();
        
        // HorseDetailModal用の形式に変換
        const modalHorse: ModalHorse = {
          umaban: data.umaban || '0',
          umamei: data.horseName,
          kinryo: data.kinryo || '',
          kishu: data.kishu || '',
          score: data.score,
          hasData: data.hasData,
          past: data.pastRaces
        };
        
        setSelectedHorse(modalHorse);
      }
    } catch (err) {
      console.error('Failed to fetch horse detail:', err);
    } finally {
      setLoadingHorseDetail(false);
    }
  };

  // お気に入り追加/削除
  const toggleFavorite = async (horseName: string) => {
    if (togglingFavorite) return;
    
    const normalized = normalizeHorseName(horseName);
    const isFav = favoriteNames.has(normalized);
    
    setTogglingFavorite(horseName);
    
    try {
      if (isFav) {
        // 削除
        await fetch('/api/user/favorites', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ horseName: normalized })
        });
      } else {
        // 追加
        const res = await fetch('/api/user/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ horseName: normalized, notifyOnRace: true })
        });
        
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || '追加に失敗しました');
          return;
        }
      }
      
      // リスト更新
      await fetchFavorites();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    } finally {
      setTogglingFavorite(null);
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
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          🐴 馬分析
        </h1>
        <Link href="/mypage" className="text-green-600 hover:text-green-700 text-sm font-medium">
          ← マイページに戻る
        </Link>
      </div>

      {/* 検索フォーム */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          🔍 馬名検索
        </h2>
        <p className="text-gray-500 text-sm mb-4">
          馬名を入力して検索すると、過去走データや分析が確認できます
        </p>
        
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="馬名を入力（2文字以上で検索）..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900 text-lg"
          />
          {searching && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="size-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
          
          {/* 検索結果 */}
          {showSuggestions && suggestions.length > 0 && (
            <div 
              ref={suggestionRef}
              className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto z-50"
            >
              {suggestions.map((name, idx) => {
                const normalized = normalizeHorseName(name);
                const isFav = favoriteNames.has(normalized);
                const isToggling = togglingFavorite === name;
                
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-4 py-3 hover:bg-green-50 border-b border-gray-100 last:border-b-0"
                  >
                    {/* 馬名（クリックで詳細表示） */}
                    <button
                      onClick={() => openHorseDetail(normalized)}
                      className="flex-1 text-left flex items-center gap-2 text-gray-800 hover:text-green-700 font-medium"
                      disabled={loadingHorseDetail}
                    >
                      <span className="text-green-600">🐴</span>
                      <span>{normalized}</span>
                      {loadingHorseDetail && (
                        <span className="ml-2 size-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></span>
                      )}
                    </button>
                    
                    {/* お気に入りボタン */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(name);
                      }}
                      disabled={isToggling}
                      className={`ml-3 p-2 rounded-full transition-colors ${
                        isFav 
                          ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50' 
                          : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100'
                      } ${isToggling ? 'opacity-50' : ''}`}
                      title={isFav ? 'お気に入りから削除' : 'お気に入りに追加'}
                    >
                      {isToggling ? (
                        <div className="size-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="size-5" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          
          {showSuggestions && suggestions.length === 0 && searchQuery.length >= 2 && !searching && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500 z-50">
              該当する馬が見つかりません
            </div>
          )}
        </div>
      </div>

      {/* お気に入りリスト（折りたたみ） */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <button
          onClick={() => setShowFavorites(!showFavorites)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">⭐</span>
            <span className="font-bold text-gray-800">お気に入り馬</span>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-sm rounded-full">
              {favorites.length}/{limit}
            </span>
          </div>
          <svg 
            className={`size-5 text-gray-500 transition-transform ${showFavorites ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {showFavorites && (
          <div className="border-t border-gray-100">
            {favorites.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <span className="text-3xl">🐴</span>
                <p className="mt-2">まだお気に入り馬がありません</p>
                <p className="text-sm mt-1">検索結果の☆マークから追加できます</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {favorites.map((horse) => {
                  const normalized = normalizeHorseName(horse.horse_name);
                  return (
                    <div key={horse.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                      <button
                        onClick={() => openHorseDetail(normalized)}
                        className="flex items-center gap-3 text-left hover:text-green-700"
                        disabled={loadingHorseDetail}
                      >
                        <span className="text-lg">🏇</span>
                        <div>
                          <span className="font-bold text-amber-600">{normalized}</span>
                          <p className="text-xs text-gray-400">
                            登録日: {new Date(horse.created_at).toLocaleDateString('ja-JP')}
                          </p>
                        </div>
                      </button>
                      
                      <div className="flex items-center gap-2">
                        {horse.notify_on_race ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                            🔔 通知ON
                          </span>
                        ) : null}
                        
                        <button
                          onClick={() => toggleFavorite(horse.horse_name)}
                          disabled={togglingFavorite === horse.horse_name}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                          title="お気に入りから削除"
                        >
                          {togglingFavorite === horse.horse_name ? (
                            <div className="size-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 馬詳細モーダル */}
      {selectedHorse && (
        <HorseDetailModal
          horse={selectedHorse}
          onClose={() => setSelectedHorse(null)}
        />
      )}
    </div>
  );
}
