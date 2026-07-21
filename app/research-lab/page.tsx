'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SavedCondition {
  id: string;
  title: string;
  description?: string;
  expected_value_diff: number;
  confidence_level: number;
  tags: string[];
  statistics: {
    sample_size: number;
    place_return_rate: number;
  };
}

export default function ResearchLabPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedConditions] = useState<SavedCondition[]>([
    // TODO: APIから取得
  ]);

  const startResearch = async () => {
    if (!query) {
      setError('研究テーマを入力してください');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // TODO: 研究ラボAPI実装後に実装
      alert('研究ラボAPI実装中...');
    } catch (err) {
      setError('エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔬 研究ラボ
          </h1>
          <p className="text-gray-600">
            レースに紐づかない自由な研究。条件を発見し、保存して、レースで活用しましょう。
          </p>
        </div>

        {/* 新規研究セクション */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">📝 新規研究</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                研究テーマを入力
              </label>
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="例: 東京ダート1600mで期待値がある条件を探して&#10;例: 母父ディープインパクトと枠順の関係を調べて&#10;例: 斤量55kg以下で前走3着以内の馬の成績は？"
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            
            <button
              onClick={startResearch}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? '研究中...' : '🔍 研究開始'}
            </button>
          </div>
        </div>

        {/* 保存済み条件セクション */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">💾 保存済み条件</h2>
          
          {savedConditions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-5xl mb-4">📁</div>
              <p className="text-lg mb-2">まだ保存された条件がありません</p>
              <p className="text-sm">研究で見つけた条件を保存すると、ここに表示されます</p>
            </div>
          ) : (
            <div className="space-y-4">
              {savedConditions.map(condition => (
                <div
                  key={condition.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">
                        {condition.title}
                      </h3>
                      {condition.description && (
                        <p className="text-sm text-gray-600 mt-1">
                          {condition.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {condition.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div className="bg-green-50 p-3 rounded">
                      <div className="text-xs text-gray-600">期待値</div>
                      <div className="font-bold text-green-700">
                        +{condition.expected_value_diff.toFixed(1)}円
                      </div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded">
                      <div className="text-xs text-gray-600">信頼度</div>
                      <div className="font-bold text-blue-700">
                        {condition.confidence_level}%
                      </div>
                    </div>
                    <div className="bg-purple-50 p-3 rounded">
                      <div className="text-xs text-gray-600">サンプル</div>
                      <div className="font-bold text-purple-700">
                        {condition.statistics.sample_size}走
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm">
                      詳細
                    </button>
                    <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-sm">
                      レースに適用
                    </button>
                    <button className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors text-sm ml-auto">
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 研究履歴セクション */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">📚 研究履歴</h2>
          
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-3">🕐</div>
            <p>研究履歴機能は実装予定です</p>
          </div>
        </div>

        {/* 使い方ガイド */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-bold text-blue-900 mb-2">💡 研究ラボの使い方</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• 自由な形式で研究テーマを入力してください</li>
            <li>• 条件を発見したら保存し、レースで活用できます</li>
            <li>• 複数の条件を組み合わせて検証することも可能です</li>
            <li>• 統計的に信頼できる条件のみを保存しましょう</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
