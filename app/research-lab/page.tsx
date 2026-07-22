'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ConditionDebugView from '@/app/components/ConditionDebugView';

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
  phase2_results?: any[];
  phase3_results?: any[];
}

export default function ResearchLabPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [ruleCandidates, setRuleCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string>('');
  const [researchHistory, setResearchHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // ルール候補と研究履歴を読み込み
  useEffect(() => {
    loadRuleCandidates();
    loadResearchHistory();
  }, []);

  const loadRuleCandidates = async () => {
    try {
      setLoadingCandidates(true);
      const response = await fetch('/api/research-lab/candidates?status=pending');
      if (response.ok) {
        const data = await response.json();
        setRuleCandidates(data.candidates || []);
      }
    } catch (err) {
      console.error('Failed to load rule candidates:', err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const loadResearchHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch('/api/research-lab/sessions');
      if (response.ok) {
        const data = await response.json();
        setResearchHistory(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load research history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadSessionDetail = async (sessionId: string) => {
    try {
      const response = await fetch('/api/research-lab/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      
      if (response.ok) {
        const data = await response.json();
        setResearchResult(data);
      }
    } catch (err) {
      console.error('Failed to load session detail:', err);
      alert('研究結果の読み込みに失敗しました');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const response = await fetch('/api/research-lab/candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve' })
      });
      
      if (response.ok) {
        alert('ルールを承認しました');
        loadRuleCandidates();
      }
    } catch (err) {
      console.error('Failed to approve:', err);
      alert('エラーが発生しました');
    }
  };

  const handleReject = async (id: string) => {
    try {
      const response = await fetch('/api/research-lab/candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject' })
      });
      
      if (response.ok) {
        alert('ルールを却下しました');
        loadRuleCandidates();
      }
    } catch (err) {
      console.error('Failed to reject:', err);
      alert('エラーが発生しました');
    }
  };

  const handleSaveRule = async (result: any) => {
    try {
      const response = await fetch('/api/research-lab/save-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: result.candidate.name,
          conditions: result.candidate.conditions,
          hypothesis: result.candidate.hypothesis,
          expected_outcome: result.candidate.expected_outcome,
          reasoning: result.candidate.reasoning,
          statistics: result.statistics,
          expected_value_diff: result.statistics.expected_value_diff,
          confidence_level: result.confidence?.confidence_level || 0,
          promising_score: result.promising_score
        })
      });
      
      if (response.ok) {
        alert(`✅ ルール「${result.candidate.name}」を保存しました`);
        loadRuleCandidates();
      } else {
        const error = await response.text();
        alert(`保存に失敗しました: ${error}`);
      }
    } catch (err) {
      console.error('Failed to save rule:', err);
      alert('エラーが発生しました');
    }
  };

  const startResearch = async (isAuto: boolean = false) => {
    // 自動研究モードの場合、固定のテーマを使用
    const researchTheme = isAuto 
      ? 'AIが利用可能なカラムを自動で組み合わせて条件を試し、有望なものが見つかったらさらに深掘りしてください。サンプル数や再現性も考慮し、回収率だけでなく信頼できる条件を優先してください。'
      : query;

    if (!researchTheme) {
      setError('研究テーマを入力するか、「自動研究」をクリックしてください');
      return;
    }
    
    setLoading(true);
    setError('');
    setProgress(0);
    setCurrentPhase('初期化中...');
    
    // 進捗シミュレーション
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev < 10) {
          setCurrentPhase('🔍 Phase 1: 単独条件の探索中...');
          return prev + 2;
        } else if (prev < 50) {
          setCurrentPhase('🔍 Phase 1: 単独条件の検証中...');
          return prev + 1;
        } else if (prev < 70) {
          setCurrentPhase('🔗 Phase 2: 掛け合わせ検証中...');
          return prev + 1;
        } else if (prev < 90) {
          setCurrentPhase('🔄 Phase 3: 派生条件の検証中...');
          return prev + 1;
        } else if (prev < 95) {
          setCurrentPhase('📊 結果の集計中...');
          return prev + 0.5;
        }
        return prev;
      });
    }, 200);
    
    try {
      const response = await fetch('/api/research-lab/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          theme: researchTheme,
          mode: isAuto ? 'auto' : 'manual'
        })
      });
      
      clearInterval(progressInterval);
      
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'エラーが発生しました');
        return;
      }
      
      const data = await response.json();
      
      // 完了アニメーション
      setProgress(100);
      setCurrentPhase('✅ 研究完了！');
      
      // 少し待ってから結果を表示
      setTimeout(() => {
        setResearchResult(data);
        console.log('研究完了:', data);
        loadRuleCandidates();
        loadResearchHistory(); // 研究履歴を更新
      }, 500);
      
    } catch (err) {
      clearInterval(progressInterval);
      setError('通信エラーが発生しました');
      console.error('Research error:', err);
    } finally {
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
        setCurrentPhase('');
      }, 1000);
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

        {/* 研究履歴セクション */}
        {!loadingHistory && researchHistory.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">📚 最近の研究</h2>
            
            <div className="space-y-2">
              {researchHistory.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => loadSessionDetail(session.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          session.status === 'completed' 
                            ? 'bg-green-100 text-green-800'
                            : session.status === 'running'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {session.status === 'completed' ? '✓ 完了' : session.status === 'running' ? '⏳ 実行中' : session.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(session.created_at).toLocaleString('ja-JP')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 font-medium line-clamp-1">
                        {session.theme}
                      </p>
                      {session.status === 'completed' && (
                        <div className="flex gap-4 mt-2 text-xs text-gray-600">
                          <span>有望条件: {session.promising_count}件</span>
                          <span>Phase 1: {session.phase1_tested}件</span>
                          {session.phase2_tested > 0 && <span>Phase 2: {session.phase2_tested}件</span>}
                          {session.phase3_tested > 0 && <span>Phase 3: {session.phase3_tested}件</span>}
                        </div>
                      )}
                    </div>
                    <button
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium ml-4"
                      onClick={(e) => {
                        e.stopPropagation();
                        loadSessionDetail(session.id);
                      }}
                    >
                      詳細 →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 新規研究セクション */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">📝 新規研究</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                研究テーマ（オプション）
              </label>
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="特定のテーマがある場合は入力してください&#10;空白の場合、AIが自動的に有望な条件を探索します&#10;&#10;例: 東京ダート1600mで期待値がある条件&#10;例: ディープ産駒の得意条件&#10;例: 内枠と指数の組み合わせ"
                rows={5}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-900 placeholder:text-gray-500"
              />
              <p className="mt-2 text-xs text-gray-500">
                💡 ヒント: 空白のままにすると、AIが利用可能なカラム（競馬場、距離、種牡馬、枠、巻き返し指数など）を自動で組み合わせて最適な条件を探します
              </p>
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            
            {/* 進捗ゲージ */}
            {loading && (
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-blue-900">
                    {currentPhase}
                  </span>
                  <span className="text-sm font-bold text-blue-900">
                    {progress.toFixed(0)}%
                  </span>
                </div>
                <div className="relative w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  >
                    <div className="absolute inset-0 bg-white opacity-20 animate-pulse"></div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-600 text-center">
                  AIが自律的に条件を生成・検証しています...
                </div>
              </div>
            )}
            
            {/* 研究開始ボタン */}
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => startResearch(true)}
                disabled={loading}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-4 px-6 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all font-medium shadow-md hover:shadow-lg"
              >
                {loading ? '研究中...' : '🤖 自動研究開始'}
              </button>
              {query.trim() && (
                <button
                  onClick={() => startResearch(false)}
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {loading ? '研究中...' : '🔍 テーマを指定して研究'}
                </button>
              )}
            </div>
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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg">🔍 Phase 1: 単独条件の探索結果</h3>
                  <div className="text-sm text-gray-600">
                    全{researchResult.phase1_results.length}件
                    （有望: {researchResult.phase1_results.filter((r: any) => r.is_promising).length}件、
                    棄却: {researchResult.phase1_results.filter((r: any) => !r.is_promising).length}件）
                  </div>
                </div>
                <div className="space-y-3">
                  {researchResult.phase1_results.map((result: any, idx: number) => (
                    <ConditionDebugView key={idx} result={result} index={idx} onSave={handleSaveRule} />
                  ))}
                </div>
              </div>
            )}

            {/* Phase 2結果 */}
            {researchResult.phase2_results && researchResult.phase2_results.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg">🔗 Phase 2: 掛け合わせ検証結果</h3>
                  <div className="text-sm text-gray-600">
                    全{researchResult.phase2_results.length}件
                    （相乗効果あり: {researchResult.phase2_results.filter((r: any) => r.is_promising).length}件）
                  </div>
                </div>
                <div className="space-y-3">
                  {researchResult.phase2_results.map((result: any, idx: number) => (
                    <ConditionDebugView key={idx} result={result} index={idx} onSave={handleSaveRule} />
                  ))}
                </div>
              </div>
            )}

            {/* Phase 3結果 */}
            {researchResult.phase3_results && researchResult.phase3_results.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg">🔄 Phase 3: 派生検証結果</h3>
                  <div className="text-sm text-gray-600">
                    全{researchResult.phase3_results.length}件
                    （堅牢: {researchResult.phase3_results.filter((r: any) => r.is_promising).length}件）
                  </div>
                </div>
                <div className="space-y-3">
                  {researchResult.phase3_results.map((result: any, idx: number) => (
                    <ConditionDebugView key={idx} result={result} index={idx} onSave={handleSaveRule} />
                  ))}
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

        {/* ルール候補セクション */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">📋 ルール候補（承認待ち）</h2>
          
          {loadingCandidates ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-3">⏳</div>
              <p>読み込み中...</p>
            </div>
          ) : ruleCandidates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-5xl mb-4">📁</div>
              <p className="text-lg mb-2">まだルール候補がありません</p>
              <p className="text-sm">研究を実行すると、有望な条件がルール候補として保存されます</p>
            </div>
          ) : (
            <div className="space-y-4">
              {ruleCandidates.map(condition => (
                <div
                  key={condition.id}
                  className="border-2 border-yellow-200 bg-yellow-50 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900">
                        {condition.name}
                      </h3>
                      
                      {/* AIの仮説 */}
                      {condition.ai_reasoning?.hypothesis && (
                        <div className="mt-2 p-3 bg-white rounded border border-blue-200">
                          <div className="text-xs text-blue-600 font-medium mb-1">💡 AIの仮説</div>
                          <p className="text-sm text-gray-700">
                            {condition.ai_reasoning.hypothesis}
                          </p>
                        </div>
                      )}
                      
                      {/* 期待される結果 */}
                      {condition.ai_reasoning?.expected_outcome && (
                        <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                          <div className="text-xs text-gray-600 mb-1">期待される結果:</div>
                          <p className="text-xs text-gray-700">
                            {condition.ai_reasoning.expected_outcome}
                          </p>
                        </div>
                      )}
                    </div>
                    <span className="ml-4 px-3 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                      承認待ち
                    </span>
                  </div>
                  
                  {/* 統計データ */}
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="bg-white p-3 rounded">
                      <div className="text-xs text-gray-600">期待値</div>
                      <div className="font-bold text-green-700">
                        +{condition.statistics.expected_value_diff.toFixed(1)}円
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded">
                      <div className="text-xs text-gray-600">信頼度</div>
                      <div className="font-bold text-blue-700">
                        {condition.confidence.confidence_level.toFixed(0)}%
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded">
                      <div className="text-xs text-gray-600">サンプル</div>
                      <div className="font-bold text-purple-700">
                        {condition.statistics.sample_size}走
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded">
                      <div className="text-xs text-gray-600">三着内率</div>
                      <div className="font-bold text-orange-700">
                        {(condition.statistics.show_rate * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  
                  {/* AIの根拠 */}
                  {condition.ai_reasoning?.reasoning && (
                    <details className="mb-3">
                      <summary className="text-sm text-gray-700 cursor-pointer hover:text-gray-900 font-medium">
                        📝 AIの根拠を表示
                      </summary>
                      <div className="mt-2 p-3 bg-white rounded border border-gray-200">
                        <p className="text-sm text-gray-700">
                          {condition.ai_reasoning.reasoning}
                        </p>
                        {condition.ai_reasoning.generated_at && (
                          <div className="mt-2 text-xs text-gray-500">
                            生成日時: {new Date(condition.ai_reasoning.generated_at).toLocaleString('ja-JP')}
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                  
                  {/* 承認・却下ボタン */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(condition.id)}
                      className="flex-1 bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      ✅ 承認してルール化
                    </button>
                    <button
                      onClick={() => handleReject(condition.id)}
                      className="flex-1 bg-red-100 text-red-700 py-2 px-4 rounded hover:bg-red-200 transition-colors text-sm font-medium"
                    >
                      ❌ 却下
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
