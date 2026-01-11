'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';

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

// 印の定義（インデックス順に降格）
const MEDAL_ICONS: { icon: string; color: string }[] = [
  { icon: '◎', color: 'text-amber-400' },   // 0: 本命
  { icon: '○', color: 'text-slate-300' },   // 1: 対抗
  { icon: '▲', color: 'text-orange-400' },  // 2: 単穴
  { icon: '△', color: 'text-blue-400' },    // 3: 連下
  { icon: '×', color: 'text-slate-500' },   // 4: 消し（無印）
];

// レーティングの順序（調整用）
const RATING_ORDER: ('S' | 'A' | 'B' | 'C' | 'D')[] = ['S', 'A', 'B', 'C', 'D'];

// バイアスに基づく評価調整を計算
function calculateBiasAdjustment(
  horseNumber: number,
  totalHorses: number,
  runningStyle: string | undefined,
  bias: 'none' | 'uchi' | 'soto' | 'mae' | 'ushiro'
): { adjustment: -1 | 0 | 1; comment: string | null } {
  if (bias === 'none') {
    return { adjustment: 0, comment: null };
  }

  // 枠順の判定（馬番から推測：1-4番が内枠、最後の4頭が外枠）
  const isInnerPost = horseNumber <= Math.ceil(totalHorses / 3);
  const isOuterPost = horseNumber > totalHorses - Math.ceil(totalHorses / 3);
  
  // 脚質の判定
  const isFrontRunner = runningStyle === 'escape' || runningStyle === 'lead' || 
                        runningStyle?.includes('逃') || runningStyle?.includes('先');
  const isCloser = runningStyle === 'sashi' || runningStyle === 'oikomi' ||
                   runningStyle?.includes('差') || runningStyle?.includes('追');

  let adjustment: -1 | 0 | 1 = 0;
  let comment: string | null = null;

  switch (bias) {
    case 'uchi':
      if (isInnerPost) {
        adjustment = 1;
        comment = '🎯 内枠有利で評価↑';
      } else if (isOuterPost) {
        adjustment = -1;
        comment = '⚠️ 内有利レースで外枠不利';
      }
      break;
    case 'soto':
      if (isOuterPost) {
        adjustment = 1;
        comment = '🎯 外枠有利で評価↑';
      } else if (isInnerPost) {
        adjustment = -1;
        comment = '⚠️ 外有利レースで内枠不利';
      }
      break;
    case 'mae':
      if (isFrontRunner) {
        adjustment = 1;
        comment = '🎯 前有利で逃げ先行馬評価↑';
      } else if (isCloser) {
        adjustment = -1;
        comment = '⚠️ 前有利レースで差し追込不利';
      }
      break;
    case 'ushiro':
      if (isCloser) {
        adjustment = 1;
        comment = '🎯 後有利で差し追込馬評価↑';
      } else if (isFrontRunner) {
        adjustment = -1;
        comment = '⚠️ 後有利レースで逃げ先行不利';
      }
      break;
  }

  return { adjustment, comment };
}

// レーティングを調整
function adjustRating(
  originalRating: 'S' | 'A' | 'B' | 'C' | 'D',
  adjustment: -1 | 0 | 1
): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (adjustment === 0) return originalRating;
  
  const currentIndex = RATING_ORDER.indexOf(originalRating);
  const newIndex = Math.max(0, Math.min(RATING_ORDER.length - 1, currentIndex - adjustment));
  return RATING_ORDER[newIndex];
}

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
  const initialCheckDone = useRef(false);
  
  // スマホ判定（初回のみカード状態を変更、以降はisMobileのみ更新）
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // 初回のみカードを閉じる（スクロールやリサイズでは閉じない）
      if (!initialCheckDone.current && mobile) {
        setCardExpanded(false);
        initialCheckDone.current = true;
      } else if (!initialCheckDone.current) {
        initialCheckDone.current = true;
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // 馬場状態（propsから初期値を受け取り、内部で管理）
  const [trackCondition, setTrackCondition] = useState<'良' | '稍' | '重' | '不'>(propTrackCondition);
  
  // レースバイアス（内/外/前/後）
  const [bias, setBias] = useState<'none' | 'uchi' | 'soto' | 'mae' | 'ushiro'>('none');
  
  // バイアス変更時にAPIを再呼び出しするためのフラグ
  const [isRefetching, setIsRefetching] = useState(false);
  
  // 印の降格管理（馬番 → 降格回数）
  const [demotedHorses, setDemotedHorses] = useState<Map<number, number>>(new Map());
  
  // 印の降格ハンドラー
  const handleDemote = useCallback((horseNumber: number) => {
    setDemotedHorses(prev => {
      const newMap = new Map(prev);
      const currentDemotion = newMap.get(horseNumber) || 0;
      // 最大4段階降格（◎→○→▲→△→無印）
      if (currentDemotion < 4) {
        newMap.set(horseNumber, currentDemotion + 1);
      }
      return newMap;
    });
  }, []);
  
  // 降格リセットハンドラー
  const handleResetDemotions = useCallback(() => {
    setDemotedHorses(new Map());
  }, []);

  // ルールベース分析を取得
  const fetchRuleBasedAnalysis = useCallback(async (currentBias: 'none' | 'uchi' | 'soto' | 'mae' | 'ushiro' = 'none', isRefetch = false) => {
    if (!year || !date || !place || !raceNumber) return;
    
    try {
      if (isRefetch) {
        setIsRefetching(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const res = await fetch('/api/saga-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, date, place, raceNumber, useAI: false, trackCondition, bias: currentBias }),
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
      setIsRefetching(false);
    }
  }, [year, date, place, raceNumber, trackCondition]);
  
  // バイアス変更ハンドラー（即座に再評価）
  const handleBiasChange = useCallback((newBias: 'none' | 'uchi' | 'soto' | 'mae' | 'ushiro') => {
    setBias(newBias);
    // 即座にAPIを再呼び出し
    fetchRuleBasedAnalysis(newBias, true);
  }, [fetchRuleBasedAnalysis]);

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
    fetchRuleBasedAnalysis(bias);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // AIモード切替時
  useEffect(() => {
    if (useAI && !aiAnalyses && aiEnabled) {
      fetchAIAnalysis();
    }
  }, [useAI, aiAnalyses, aiEnabled, fetchAIAnalysis]);

  // 表示するデータを決定（降格を考慮してソート）- Hooksは早期リターンの前に配置
  const sortedData = React.useMemo(() => {
    const baseData = useAI && aiAnalyses ? [...aiAnalyses] : [...analyses];
    
    // 降格状態に基づいてソート
    if (demotedHorses.size > 0) {
      baseData.sort((a, b) => {
        const aNumber = 'horseNumber' in a ? a.horseNumber : (a as SagaAnalysis).horseNumber;
        const bNumber = 'horseNumber' in b ? b.horseNumber : (b as SagaAnalysis).horseNumber;
        const aScore = 'score' in a ? a.score : (a as OpenAISagaResult).ruleBasedAnalysis.score;
        const bScore = 'score' in b ? b.score : (b as OpenAISagaResult).ruleBasedAnalysis.score;
        const aDemotion = demotedHorses.get(aNumber) || 0;
        const bDemotion = demotedHorses.get(bNumber) || 0;
        
        // 降格回数が多いほど下に（降格回数 * 100点減点として扱う）
        const aEffectiveScore = aScore - aDemotion * 100;
        const bEffectiveScore = bScore - bDemotion * 100;
        
        return bEffectiveScore - aEffectiveScore;
      });
    }
    
    return baseData;
  }, [useAI, aiAnalyses, analyses, demotedHorses]);
  
  const displayData = sortedData.slice(0, expanded ? 10 : 3);

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
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3 flex-wrap">
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
      </div>
      
      {/* レースバイアスセレクタ */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 flex-wrap">
        <span className="text-[10px] sm:text-xs text-slate-400">バイアス:</span>
        {[
          { key: 'none' as const, label: '無し', color: 'bg-slate-500/20 border-slate-500/50' },
          { key: 'uchi' as const, label: '内有利', color: 'bg-cyan-500/20 border-cyan-500/50' },
          { key: 'soto' as const, label: '外有利', color: 'bg-purple-500/20 border-purple-500/50' },
          { key: 'mae' as const, label: '前有利', color: 'bg-pink-500/20 border-pink-500/50' },
          { key: 'ushiro' as const, label: '後有利', color: 'bg-blue-500/20 border-blue-500/50' },
        ].map(opt => (
          <button
            key={opt.key}
            onClick={() => handleBiasChange(opt.key)}
            disabled={isRefetching}
            className={`px-2 sm:px-3 py-1.5 sm:py-1 text-[10px] sm:text-xs rounded-md border transition-all min-h-[36px] sm:min-h-0 ${
              bias === opt.key
                ? `${opt.color} text-white`
                : 'bg-slate-700/50 border-slate-600/50 text-slate-400 hover:bg-slate-600/50'
            } ${isRefetching ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {opt.label}
          </button>
        ))}
        {isRefetching && (
          <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin ml-2"></div>
        )}
        <span className="hidden sm:inline text-xs text-slate-500 ml-2">
          ※レースバイアスで評価が調整されます
        </span>
      </div>
      
      {/* 印の手動調整案内 & リセットボタン */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 px-1">
        <span className="text-[10px] sm:text-xs text-slate-500">
          💡 印をクリックで評価を下げられます
        </span>
        {demotedHorses.size > 0 && (
          <button
            onClick={handleResetDemotions}
            className="px-2 sm:px-3 py-1 text-[10px] sm:text-xs rounded-md border border-red-500/50 bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all"
          >
            🔄 印リセット ({demotedHorses.size}頭)
          </button>
        )}
      </div>

      {/* サマリー */}
      {summary && (
        <div className="bg-slate-700/30 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4 border border-slate-600/50 backdrop-blur-sm">
          <pre className="text-xs sm:text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
            {summary}
          </pre>
        </div>
      )}
      
      {/* バイアス調整サマリー */}
      {bias !== 'none' && analyses.length > 0 && (
        <div className="bg-gradient-to-r from-cyan-900/30 to-purple-900/30 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4 border border-cyan-500/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-cyan-400 font-bold text-sm">🎯 バイアス分析</span>
            <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
              {bias === 'uchi' ? '内有利' : bias === 'soto' ? '外有利' : bias === 'mae' ? '前有利' : '後有利'}
            </span>
          </div>
          <div className="text-xs sm:text-sm text-slate-200 space-y-1">
            {(() => {
              const totalHorses = analyses.length;
              const adjustments: { up: string[]; down: string[] } = { up: [], down: [] };
              
              analyses.slice(0, 5).forEach((a) => {
                const result = calculateBiasAdjustment(a.horseNumber, totalHorses, undefined, bias);
                if (result.adjustment > 0) {
                  adjustments.up.push(`${a.horseNumber}番${a.horseName}`);
                } else if (result.adjustment < 0) {
                  adjustments.down.push(`${a.horseNumber}番${a.horseName}`);
                }
              });
              
              return (
                <>
                  {adjustments.up.length > 0 && (
                    <p className="text-green-300">
                      <span className="font-medium">↑ 評価UP:</span> {adjustments.up.join('、')}
                    </p>
                  )}
                  {adjustments.down.length > 0 && (
                    <p className="text-orange-300">
                      <span className="font-medium">↓ 評価DOWN:</span> {adjustments.down.join('、')}
                    </p>
                  )}
                  <p className="text-slate-400 text-xs mt-2">
                    ※ {bias === 'uchi' || bias === 'soto' 
                      ? '枠順（馬番）に基づいて評価を調整しています' 
                      : '脚質（逃げ・先行 vs 差し・追込）に基づいて評価を調整しています'}
                  </p>
                </>
              );
            })()}
          </div>
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
          const originalRating = isAI ? aiResult!.overallRating : analysis.courseMatch.rating;
          const kisoScore = analysis.kisoScore || 0;  // 競うスコア
          const tags = isAI ? aiResult!.tags : analysis.tags;
          
          // バイアス調整を計算
          const totalHorses = displayData.length > 3 ? (expanded ? 10 : analyses.length) : analyses.length;
          const runningStyle = analysis.debugInfo?.lastRaceCondition?.gateAdvantage; // 脚質情報があれば使用
          const biasResult = calculateBiasAdjustment(horseNumber, totalHorses, runningStyle, bias);
          const rating = adjustRating(originalRating, biasResult.adjustment);
          
          // 降格状態を考慮した印を決定
          const demotion = demotedHorses.get(horseNumber) || 0;
          const effectiveIdx = Math.min(idx + demotion, MEDAL_ICONS.length - 1);
          const medal = MEDAL_ICONS[effectiveIdx];
          const isDemoted = demotion > 0;
          
          return (
            <div 
              key={horseNumber}
              className={`rounded-lg p-3 sm:p-4 border backdrop-blur-sm transition-all duration-200 hover:scale-[1.01] ${
                effectiveIdx === 0 ? 'bg-amber-900/20 border-amber-500/40 shadow-lg shadow-amber-500/10' :
                effectiveIdx === 1 ? 'bg-slate-700/20 border-slate-400/40' :
                effectiveIdx === 2 ? 'bg-orange-900/20 border-orange-500/40' :
                'bg-slate-800/30 border-slate-600/40'
              }`}
            >
              {/* ヘッダー */}
              <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
                <div className="flex items-center gap-1.5 sm:gap-3 flex-1 min-w-0">
                  {/* クリック可能な印 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDemote(horseNumber);
                    }}
                    className={`text-xl sm:text-2xl flex-shrink-0 ${medal.color} hover:scale-125 active:scale-90 transition-transform cursor-pointer`}
                    title={effectiveIdx < MEDAL_ICONS.length - 1 ? 'クリックで評価を下げる' : '最低評価です'}
                    disabled={effectiveIdx >= MEDAL_ICONS.length - 1}
                  >
                    {medal.icon}
                  </button>
                  {isDemoted && (
                    <span className="text-[10px] text-red-400 flex-shrink-0">↓{demotion}</span>
                  )}
                  <span className="text-white font-bold text-sm sm:text-lg truncate">
                    {horseNumber}番 {horseName}
                  </span>
                  {/* 総合レーティングバッジ */}
                  <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold flex-shrink-0 ${RATING_COLORS[rating]}`}>
                    {rating}
                    {biasResult.adjustment !== 0 && (
                      <span className="ml-1 text-[8px]">
                        ({biasResult.adjustment > 0 ? '↑' : '↓'})
                      </span>
                    )}
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
              
              {/* バイアスコメント */}
              {biasResult.comment && (
                <div className={`mb-2 px-2 py-1 rounded text-[10px] sm:text-xs ${
                  biasResult.adjustment > 0 
                    ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                    : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                }`}>
                  {biasResult.comment}
                </div>
              )}

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
