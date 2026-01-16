'use client';

import { useEffect, useState } from 'react';
import { useSession } from '../../components/Providers';
import Link from 'next/link';

interface Badge {
  badge_type: string;
  badge_level: string;
  earned_at: string;
}

interface BadgeDefinition {
  name: string;
  levels: {
    level: string;
    label: string;
    requirement: number;
    description: string;
  }[];
}

export default function BadgesPage() {
  const { status } = useSession();
  const [earnedBadges, setEarnedBadges] = useState<Badge[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [definitions, setDefinitions] = useState<Record<string, BadgeDefinition>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchBadges();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status]);

  const fetchBadges = async () => {
    try {
      const res = await fetch('/api/user/badges');
      if (res.ok) {
        const data = await res.json();
        setEarnedBadges(data.earnedBadges || []);
        setProgress(data.progress || {});
        setDefinitions(data.definitions || {});
      }
    } catch (err) {
      console.error('Failed to fetch badges:', err);
    } finally {
      setLoading(false);
    }
  };

  const hasBadge = (type: string, level: string) => {
    return earnedBadges.some(b => b.badge_type === type && b.badge_level === level);
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
        <h1 className="text-2xl font-bold text-gray-800">バッジコレクション</h1>
        <Link href="/mypage" className="text-green-600 hover:text-green-700 text-sm font-medium">
          ← マイページに戻る
        </Link>
      </div>

      <div className="grid gap-6">
        {Object.entries(definitions).map(([type, def]) => (
          <div key={type} className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">{def.name}</h2>
            
            {/* プログレスバー */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>現在の進捗</span>
                <span className="tabular-nums">{progress[type] || 0}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
                  style={{ 
                    width: `${Math.min(100, ((progress[type] || 0) / (def.levels[def.levels.length - 1]?.requirement || 100)) * 100)}%` 
                  }}
                />
              </div>
            </div>

            {/* バッジ一覧 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {def.levels.map((level) => {
                const earned = hasBadge(type, level.level);
                const currentProgress = progress[type] || 0;
                const progressPercent = Math.min(100, (currentProgress / level.requirement) * 100);

                return (
                  <div 
                    key={level.level}
                    className={`relative p-4 rounded-xl text-center transition-all ${
                      earned 
                        ? 'bg-gradient-to-br from-amber-50 to-yellow-100 border-2 border-amber-400' 
                        : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className={`text-4xl mb-2 ${earned ? '' : 'grayscale opacity-40'}`}>
                      {level.label.split(' ')[0]}
                    </div>
                    <div className={`font-bold text-sm ${earned ? 'text-amber-700' : 'text-gray-400'}`}>
                      {level.label.split(' ')[1]}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{level.description}</div>
                    
                    {!earned && (
                      <div className="mt-2">
                        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-400"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 tabular-nums">
                          {currentProgress}/{level.requirement}
                        </div>
                      </div>
                    )}
                    
                    {earned && (
                      <div className="absolute -top-1 -right-1 size-6 bg-green-500 rounded-full flex items-center justify-center">
                        <svg className="size-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
