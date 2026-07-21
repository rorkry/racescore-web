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

interface ResearchResult {
  session: {
    id: string;
    theme: string;
    phase: number;
    status: string;
    progress: number;
  };
  promising_count: number;
  rule_candidates: any[];
  phase1_results?: any[];
}

export default function ResearchLabPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
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
      const response = await fetch('/api/research-lab/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          theme: query,
          mode: 'manual'  // 手動モード
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'エラーが発生しました');
        return;
      }
      
      const data = await response.json();
      setResearchResult(data);
      
      // 成功メッセージ
      console.log('研究完了:', data);
    } catch (err) {
      setError('通信エラーが発生しました');
      console.error('Research error:', err);
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

        {/* 研究結果セクション */}
        {researchResult && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">✅ 研究結果</h2>
            
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <div className="font-medium text-blue-900 mb-2">
                テーマ: {researchResult.session.theme}
              </div>
              <div className="text-sm text-blue-700 space-y-1">
                <div>進捗: {researchResult.session.progress}%</div>
                <div>ステータス: {researchResult.session.status === 'completed' ? '完了' : '実行中'}</div>
                <div>フェーズ: Phase {researchResult.session.phase}</div>
              </div>
            </div>

            {/* サマリー */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">有望条件数</div>
                <div className="text-3xl font-bold text-green-700">
                  {researchResult.promising_count}
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">ルール候補数</div>
                <div className="text-3xl font-bold text-purple-700">
                  {researchResult.rule_candidates?.length || 0}
                </div>
              </div>
            </div>

            {/* Phase 1結果 */}
            {researchResult.phase1_results && researchResult.phase1_results.length > 0 && (
              <div className="mb-6">
                <h3 className="font-bold text-lg mb-3">🔍 Phase 1: 単独条件の探索結果</h3>
                <div className="space-y-3">
                  {researchResult.phase1_results.slice(0, 5).map((result: any, idx: number) => (
                    <div key={idx} className={`border rounded-lg p-4 ${result.is_promising ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-bold text-gray-900">{result.candidate.name}</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            仮説: {result.candidate.hypothesis}
                          </p>
                        </div>
                        <div className="ml-4 flex flex-col items-end gap-1">
                          {result.is_promising && (
                            <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-medium">
                              有望
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            スコア: {result.promising_score || 0}/100
                          </span>
                        </div>
                      </div>
                      
                      {/* 強みと注意点 */}
                      {(result.promising_reasons?.length > 0 || result.promising_warnings?.length > 0) && (
                        <div className="mb-3 space-y-1">
                          {result.promising_reasons?.slice(0, 2).map((reason: string, i: number) => (
                            <div key={i} className="text-xs text-green-700 flex items-start gap-1">
                              <span>✓</span>
                              <span>{reason}</span>
                            </div>
                          ))}
                          {result.promising_warnings?.slice(0, 2).map((warning: string, i: number) => (
                            <div key={i} className="text-xs text-orange-600 flex items-start gap-1">
                              <span>⚠️</span>
                              <span>{warning}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-4 gap-3 mt-3">
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-xs text-gray-600">サンプル</div>
                          <div className="font-bold text-gray-900">
                            {result.statistics.sample_size}走
                          </div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-xs text-gray-600">三着内率</div>
                          <div className="font-bold text-gray-900">
                            {(result.statistics.show_rate * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-xs text-gray-600">回収率</div>
                          <div className="font-bold text-gray-900">
                            {result.statistics.place_return_rate.toFixed(1)}%
                          </div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-xs text-gray-600">期待値</div>
                          <div className="font-bold text-green-700">
                            +{result.statistics.expected_value_diff.toFixed(0)}円
                          </div>
                        </div>
                      </div>
                      
                      {result.ai_interpretation && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="text-xs text-gray-600 mb-1">AIの解釈:</div>
                          <p className="text-sm text-gray-700">
                            {result.ai_interpretation.summary}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                  {researchResult.phase1_results.length > 5 && (
                    <div className="text-center text-sm text-gray-500">
                      他 {researchResult.phase1_results.length - 5} 件の条件
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ルール候補 */}
            {researchResult.rule_candidates && researchResult.rule_candidates.length > 0 && (
              <div>
                <h3 className="font-bold text-lg mb-3">⭐ ルール候補</h3>
                <div className="space-y-3">
                  {researchResult.rule_candidates.map((rule: any, idx: number) => (
                    <div key={idx} className="border-2 border-purple-200 bg-purple-50 rounded-lg p-4">
                      <h4 className="font-bold text-purple-900 mb-2">{rule.name}</h4>
                      
                      {rule.ai_reasoning && (
                        <div className="mb-3 text-sm">
                          <div className="text-gray-700 mb-1">
                            仮説: {rule.ai_reasoning.hypothesis}
                          </div>
                          <div className="text-gray-600 text-xs">
                            根拠: {rule.ai_reasoning.reasoning}
                          </div>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white p-2 rounded">
                          <div className="text-xs text-gray-600">期待値</div>
                          <div className="font-bold text-green-700">
                            +{rule.statistics.expected_value_diff.toFixed(0)}円
                          </div>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <div className="text-xs text-gray-600">信頼度</div>
                          <div className="font-bold text-blue-700">
                            {rule.confidence.confidence_level.toFixed(0)}%
                          </div>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <div className="text-xs text-gray-600">サンプル</div>
                          <div className="font-bold text-purple-700">
                            {rule.statistics.sample_size}走
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-3 flex gap-2">
                        <button className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 transition-colors">
                          保存
                        </button>
                        <button className="px-3 py-1 bg-white text-purple-600 border border-purple-600 rounded text-sm hover:bg-purple-50 transition-colors">
                          詳細
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
