'use client';

import React, { useEffect, useState, useCallback } from 'react';

interface SagaAnalysis {
  horseName: string;
  horseNumber: number;
  score: number;
  kisoScore?: number;  // 競うスコア
  tags: string[];
  comments: string[];
  warnings: string[];
  abilitySummary?: string;   // 能力・指数サマリー
  contextSummary?: string;   // コース・前走条件サマリー
  timeEvaluation?: string;   // タイム評価
  lapEvaluation?: string;    // ラップ評価
  courseMatch: {
    rating: 'S' | 'A' | 'B' | 'C' | 'D';
    reason: string;
  };
  rotationNote: string | null;
  timeComparisonNote: string | null;  // 時計比較分析
  debugInfo?: {
    t2f?: { value: number; rank: number; total: number; percentile: number };
    l4f?: { value: number; rank: number; total: number; percentile: number };
    relevantRaceCount?: number;
    lastRaceCondition?: {
      place: string;
      surface: string;
      distance: number;
      gateAdvantage: string;
      wasUnfavorable: boolean;
      trackCondition: string;
    };
  };
}

interface OpenAISagaResult {
  horseName: string;
  horseNumber: number;
  ruleBasedAnalysis: SagaAnalysis;
  aiComment: string;
  overallRating: 'S' | 'A' | 'B' | 'C' | 'D';
  recommendationScore: number;
  tags: string[];
}

interface Props {
  year: string;
  date: string;
  place: string;
  raceNumber: string;
  trackCondition?: '良' | '稍' | '重' | '不';
}

const RATING_COLORS: Record<string, string> = {
  'S': 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30',
  'A': 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30',
  'B': 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black',
  'C': 'bg-gradient-to-r from-gray-400 to-gray-500 text-white',
  'D': 'bg-gradient-to-r from-gray-600 to-gray-700 text-white',
};

const MEDAL_ICONS: Record<number, { icon: string; color: string }> = {
  0: { icon: '◎', color: 'text-amber-400' },
  1: { icon: '○', color: 'text-slate-300' },
  2: { icon: '▲', color: 'text-orange-400' },
};

export default function SagaAICard({ year, date, place, raceNumber, trackCondition: propTrackCondition = '良' }: Props) {
  const [analyses, setAnalyses] = useState<SagaAnalysis[]>([]);
  const [aiAnalyses, setAiAnalyses] = useState<OpenAISagaResult[] | null>(null);
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  
  // スマホ判定とカード開閉状態
  const [isMobile, setIsMobile] = useState(false);
  const [cardExpanded, setCardExpanded] = useState(true);
  
  // スマホ判定（初回のみ）
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setCardExpanded(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // 馬場状態（propsから初期値を受け取り、内部で管理）
  const [trackCondition, setTrackCondition] = useState<'良' | '稍' | '重' | '不'>(propTrackCondition);

  // ルールベース分析を取得
  const fetchRuleBasedAnalysis = useCallback(async () => {
    if (!year || !date || !place || !raceNumber) return;
    
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/saga-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, date, place, raceNumber, useAI: false, trackCondition }),
      });

      if (!res.ok) {
        throw new Error('分析の取得に失敗しました');
      }

      const data = await res.json();
      setAnalyses(data.analyses || []);
      setSummary(data.summary || '');
      setAiEnabled(data.aiEnabled || false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [year, date, place, raceNumber, trackCondition]);

  // AI分析を取得
  const fetchAIAnalysis = useCallback(async () => {
    if (!year || !date || !place || !raceNumber) return;
    
    try {
      setAiLoading(true);

      const res = await fetch('/api/saga-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, date, place, raceNumber, useAI: true, trackCondition }),
      });

      if (!res.ok) {
        throw new Error('AI分析の取得に失敗しました');
      }

      const data = await res.json();
      setAiAnalyses(data.aiAnalyses || null);
      if (data.aiAnalyses) {
        setSummary(data.summary || '');
      }
    } catch (err: any) {
      console.error('AI分析エラー:', err);
      // エラーでもルールベース分析は表示し続ける
    } finally {
      setAiLoading(false);
    }
  }, [year, date, place, raceNumber, trackCondition]);

  // 初回読み込み
  useEffect(() => {
    fetchRuleBasedAnalysis();
  }, [fetchRuleBasedAnalysis]);

  // AIモード切替時
  useEffect(() => {
    if (useAI && !aiAnalyses && aiEnabled) {
      fetchAIAnalysis();
    }
  }, [useAI, aiAnalyses, aiEnabled, fetchAIAnalysis]);

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-slate-800 via-slate-850 to-slate-900 rounded-xl p-6 shadow-xl border border-slate-700/50">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-2xl animate-pulse">🧠</span>
          俺AI分析
        </h3>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400">分析中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 shadow-xl border border-red-500/30">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          俺AI分析
        </h3>
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  // 表示するデータを決定
  const displayData = useAI && aiAnalyses 
    ? aiAnalyses.slice(0, expanded ? 10 : 3)
    : analyses.slice(0, expanded ? 10 : 3);

  return (
    <div className="bg-gradient-to-br from-slate-800 via-slate-850 to-slate-900 rounded-xl p-3 sm:p-6 shadow-xl border border-slate-700/50">
      {/* ヘッダー */}
      <div 
        className={`flex items-center justify-between mb-3 sm:mb-4 ${isMobile ? 'cursor-pointer' : ''}`}
        onClick={() => isMobile && setCardExpanded(!cardExpanded)}
      >
        <h3 className="text-base sm:text-xl font-bold text-white flex items-center gap-1 sm:gap-2">
          <span className="text-xl sm:text-2xl">🧠</span>
          <span>俺AI分析</span>
          {!isMobile && (
            <span className="text-xs font-normal text-slate-400 ml-2">
              コース適性・ローテーション・距離適性
            </span>
          )}
          {isMobile && (
            <span className={`text-white text-base transition-transform duration-300 ml-1 ${cardExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          )}
        </h3>
        
        {/* AI切替スイッチ */}
        {aiEnabled && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">GPT強化</span>
            <button
              onClick={() => setUseAI(!useAI)}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                useAI ? 'bg-green-500' : 'bg-slate-600'
              }`}
              disabled={aiLoading}
            >
              <span 
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                  useAI ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
            {aiLoading && (
              <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
            )}
          </div>
        )}
      </div>
      
      {isMobile && !cardExpanded && (
        <p className="text-sm text-slate-400">タップして展開</p>
      )}
      
      {(cardExpanded || !isMobile) && (
      <>
      {/* 馬場状態セレクタ */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 flex-wrap">
        <span className="text-[10px] sm:text-xs text-slate-400">馬場状態:</span>
        {[
          { key: '良' as const, label: '良', color: 'bg-green-500/20 border-green-500/50' },
          { key: '稍' as const, label: '稍重', color: 'bg-yellow-500/20 border-yellow-500/50' },
          { key: '重' as const, label: '重', color: 'bg-orange-500/20 border-orange-500/50' },
          { key: '不' as const, label: '不良', color: 'bg-red-500/20 border-red-500/50' },
        ].map(opt => (
          <button
            key={opt.key}
            onClick={() => setTrackCondition(opt.key)}
            className={`px-2 sm:px-3 py-1.5 sm:py-1 text-[10px] sm:text-xs rounded-md border transition-all min-h-[36px] sm:min-h-0 ${
              trackCondition === opt.key
                ? `${opt.color} text-white`
                : 'bg-slate-700/50 border-slate-600/50 text-slate-400 hover:bg-slate-600/50'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="hidden sm:inline text-xs text-slate-500 ml-2">
          ※馬場状態で枠順有利不利が変化します
        </span>
      </div>

      {/* サマリー */}
      {summary && (
        <div className="bg-slate-700/30 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4 border border-slate-600/50 backdrop-blur-sm">
          <pre className="text-xs sm:text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
            {summary}
          </pre>
        </div>
      )}

      {/* 詳細分析 */}
      <div className="space-y-3">
        {displayData.map((item, idx) => {
          // 共通データを抽出
          const isAI = useAI && aiAnalyses;
          const analysis = isAI 
            ? (item as OpenAISagaResult).ruleBasedAnalysis 
            : (item as SagaAnalysis);
          const aiResult = isAI ? (item as OpenAISagaResult) : null;
          const horseNumber = isAI ? aiResult!.horseNumber : analysis.horseNumber;
          const horseName = isAI ? aiResult!.horseName : analysis.horseName;
          const rating = isAI ? aiResult!.overallRating : analysis.courseMatch.rating;
          const kisoScore = analysis.kisoScore || 0;  // 競うスコア
          const tags = isAI ? aiResult!.tags : analysis.tags;
          
          const medal = MEDAL_ICONS[idx] || { icon: '△', color: 'text-slate-500' };
          
          return (
            <div 
              key={horseNumber}
              className={`rounded-lg p-3 sm:p-4 border backdrop-blur-sm transition-all duration-200 hover:scale-[1.01] ${
                idx === 0 ? 'bg-amber-900/20 border-amber-500/40 shadow-lg shadow-amber-500/10' :
                idx === 1 ? 'bg-slate-700/20 border-slate-400/40' :
                idx === 2 ? 'bg-orange-900/20 border-orange-500/40' :
                'bg-slate-800/30 border-slate-600/40'
              }`}
            >
              {/* ヘッダー */}
              <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
                <div className="flex items-center gap-1.5 sm:gap-3 flex-1 min-w-0">
                  <span className={`text-xl sm:text-2xl flex-shrink-0 ${medal.color}`}>
                    {medal.icon}
                  </span>
                  <span className="text-white font-bold text-sm sm:text-lg truncate">
                    {horseNumber}番 {horseName}
                  </span>
                  {/* 総合レーティングバッジ */}
                  <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold flex-shrink-0 ${RATING_COLORS[rating]}`}>
                    {rating}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-slate-400 text-[10px] sm:text-xs block">競うスコア</span>
                  <span className={`font-bold text-lg sm:text-xl ${
                    kisoScore >= 70 ? 'text-green-400' :
                    kisoScore >= 60 ? 'text-yellow-400' :
                    kisoScore >= 50 ? 'text-slate-400' :
                    'text-red-400'
                  }`}>
                    {kisoScore.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* タグ */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 sm:gap-1.5 mb-2 sm:mb-3">
                  {tags.map((tag, i) => (
                    <span 
                      key={i}
                      className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs ${
                        tag.includes('◎') ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                        tag.includes('巧者') ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                        'bg-slate-600/50 text-slate-300 border border-slate-500/30'
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 分析サマリー（本番環境でも表示） */}
              {(analysis.abilitySummary || analysis.timeEvaluation || analysis.lapEvaluation) && (
                <div className="mb-3 p-2 sm:p-3 bg-slate-900/50 rounded border border-slate-700/50 text-xs sm:text-sm space-y-1.5 sm:space-y-2">
                  {/* 能力・指数サマリー */}
                  {analysis.abilitySummary && (
                    <div className="text-slate-300 leading-relaxed">
                      <span className="text-cyan-400 font-medium">【能力】</span>
                      <span className="break-words">{analysis.abilitySummary}</span>
                    </div>
                  )}
                  
                  {/* タイム評価 */}
                  {analysis.timeEvaluation && (
                    <div className="text-slate-300 leading-relaxed">
                      <span className="text-amber-400 font-medium">【タイム】</span>
                      <span className="break-words">{analysis.timeEvaluation}</span>
                    </div>
                  )}
                  
                  {/* ラップ評価 */}
                  {analysis.lapEvaluation && (
                    <div className="text-slate-300 leading-relaxed">
                      <span className="text-orange-400 font-medium">【ラップ】</span>
                      <span className="break-words">{analysis.lapEvaluation}</span>
                    </div>
                  )}
                  
                  {/* コース・指数詳細 */}
                  {(analysis.contextSummary || analysis.debugInfo) && (
                    <div className="flex flex-wrap gap-2 sm:gap-4 text-slate-500 border-t border-slate-700/50 pt-2 mt-2 text-[10px] sm:text-xs">
                      {analysis.contextSummary && (
                        <span className="text-slate-400">{analysis.contextSummary}</span>
                      )}
                      {analysis.debugInfo?.t2f && analysis.debugInfo.t2f.value > 0 && (
                        <span>
                          T2F: {analysis.debugInfo.t2f.value.toFixed(1)}秒 
                          <span className="text-blue-400 ml-1">({analysis.debugInfo.t2f.rank}/{analysis.debugInfo.t2f.total}位)</span>
                        </span>
                      )}
                      {analysis.debugInfo?.l4f && analysis.debugInfo.l4f.value > 0 && (
                        <span>
                          L4F: {analysis.debugInfo.l4f.value.toFixed(1)} 
                          <span className="text-green-400 ml-1">({analysis.debugInfo.l4f.rank}/{analysis.debugInfo.l4f.total}位)</span>
                        </span>
                      )}
                      {analysis.debugInfo && (
                        <span>距離データ: {analysis.debugInfo.relevantRaceCount || 0}走</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* AIコメント（AI有効時） */}
              {aiResult?.aiComment && (
                <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-lg p-3 mb-3 border border-blue-500/30">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded">🤖 AI分析</span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {aiResult.aiComment}
                  </p>
                </div>
              )}

              {/* ルールベースコメント（サマリーがない場合のみ表示） */}
              {analysis.comments.length > 0 && !analysis.abilitySummary && (
                <div className="space-y-1.5 text-sm text-slate-300">
                  {analysis.comments.slice(0, aiResult ? 2 : 5).map((comment, i) => (
                    <p key={i} className="flex items-start gap-2">
                      <span className="text-slate-500 mt-0.5">•</span>
                      <span>{comment}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* 警告（重要なもののみ表示） */}
              {analysis.warnings.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {analysis.warnings
                    .filter(w => !w.includes('【逃げ評価】') && !w.includes('【枠順】'))  // サマリーと重複するものを除外
                    .slice(0, 3)
                    .map((warning, i) => (
                      <p key={i} className="text-sm text-amber-400 flex items-center gap-2 bg-amber-500/10 rounded px-2 py-1">
                        <span>⚠️</span> {warning}
                      </p>
                    ))}
                </div>
              )}

              {/* コース適性・ローテーション（サマリーがない場合のみ） */}
              {!analysis.abilitySummary && (
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                  {analysis.courseMatch.reason && (
                    <span className="flex items-center gap-1">
                      <span className="text-slate-500">📍</span>
                      {analysis.courseMatch.reason}
                    </span>
                  )}
                  {analysis.rotationNote && (
                    <span className="flex items-center gap-1">
                      <span className="text-slate-500">📅</span>
                      {analysis.rotationNote}
                    </span>
                  )}
                  {analysis.timeComparisonNote && (
                    <span className="flex items-center gap-1">
                      <span className="text-slate-500">⏱️</span>
                      {analysis.timeComparisonNote}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 展開ボタン */}
      {analyses.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 w-full py-2 text-center text-slate-400 hover:text-white text-sm transition-colors rounded-lg hover:bg-slate-700/30"
        >
          {expanded ? '▲ 閉じる' : `▼ 残り${analyses.length - 3}頭を表示`}
        </button>
      )}

      {/* フッター：AI未設定時の案内 */}
      {!aiEnabled && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <p className="text-xs text-slate-500">
            💡 <code className="bg-slate-700 px-1 rounded">.env.local</code> に <code className="bg-slate-700 px-1 rounded">OPENAI_API_KEY</code> を設定するとGPT強化モードが使えます
          </p>
        </div>
      )}
      </>
      )}
    </div>
  );
}
