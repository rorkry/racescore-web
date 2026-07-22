'use client';

import { useState, useEffect } from 'react';

interface MemoryEntry {
  id: string;
  condition_name: string;
  theme_type: string;
  is_promising: boolean;
  promising_score: number;
  expected_value_diff: number;
  test_count: number;
  exploration_status: string;
  first_tested_at: string;
  last_tested_at: string;
  derived_condition_ids: string[];
  parent_condition_id: string | null;
}

export default function ResearchMemoryView() {
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'promising' | 'avoid'>('all');

  useEffect(() => {
    loadMemory();
  }, [filter]);

  const loadMemory = async () => {
    try {
      setLoading(true);
      let url = '/api/research-lab/memory?limit=50';
      
      if (filter === 'promising') {
        url += '&is_promising=true';
      } else if (filter === 'avoid') {
        url += '&exploration_status=avoid';
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setMemory(data.history || []);
      }
    } catch (error) {
      console.error('Failed to load memory:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (entry: MemoryEntry) => {
    if (entry.is_promising) {
      return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">◎ 有望</span>;
    } else if (entry.exploration_status === 'avoid') {
      return <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">× 回避</span>;
    } else {
      return <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">△ 検証済</span>;
    }
  };

  const getThemeIcon = (theme: string) => {
    const icons: Record<string, string> = {
      makikaeshi: '🔄',
      potential: '⚡',
      l4f: '🏃',
      t2f: '⏱️',
      pedigree: '🧬',
      jockey: '🏇',
      course: '🏟️',
      waku: '📍',
      weight: '⚖️',
      popularity: '⭐',
      other: '📊'
    };
    return icons[theme] || '📊';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* フィルタ */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          全て ({memory.length})
        </button>
        <button
          onClick={() => setFilter('promising')}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            filter === 'promising'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          有望のみ
        </button>
        <button
          onClick={() => setFilter('avoid')}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            filter === 'avoid'
              ? 'bg-red-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          回避すべき
        </button>
      </div>

      {/* メモリ一覧 */}
      {memory.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">まだ研究履歴がありません</p>
          <p className="text-sm text-gray-400 mt-2">研究を実行すると、結果がここに蓄積されます</p>
        </div>
      ) : (
        <div className="space-y-3">
          {memory.map((entry) => (
            <div
              key={entry.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* ヘッダー */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{getThemeIcon(entry.theme_type)}</span>
                    <span className="font-medium text-gray-900">{entry.condition_name}</span>
                    {getStatusBadge(entry)}
                    {entry.parent_condition_id && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        派生条件
                      </span>
                    )}
                  </div>
                  
                  {/* 統計情報 */}
                  <div className="flex gap-4 text-sm text-gray-600">
                    <span>
                      期待値: <span className={entry.expected_value_diff >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {entry.expected_value_diff >= 0 ? '+' : ''}{entry.expected_value_diff.toFixed(0)}円
                      </span>
                    </span>
                    <span>スコア: {entry.promising_score}/100</span>
                    <span>検証回数: {entry.test_count}回</span>
                    {entry.derived_condition_ids && entry.derived_condition_ids.length > 0 && (
                      <span className="text-blue-600">
                        派生: {entry.derived_condition_ids.length}件
                      </span>
                    )}
                  </div>
                  
                  {/* タイムスタンプ */}
                  <div className="text-xs text-gray-400 mt-2">
                    初回: {new Date(entry.first_tested_at).toLocaleDateString('ja-JP')} / 
                    最終: {new Date(entry.last_tested_at).toLocaleDateString('ja-JP')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
