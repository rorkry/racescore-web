'use client';

import React, { useEffect, useState, useRef } from 'react';
import type { RacePacePrediction, HorsePositionPrediction, RunningStyle } from '@/types/race-pace-types';
import {
  determineSurgeIntensity
} from '@/lib/race-pace-surge';

interface Props {
  year: string;
  date: string;
  place: string;
  raceNumber: string;
  kisouScores?: Record<number, number>;
}

const RUNNING_STYLE_LABELS: Record<RunningStyle, string> = {
  escape: '逃げ',
  lead: '先行',
  sashi: '差し',
  oikomi: '追込',
};

const PACE_LABELS = {
  slow: 'スロー',
  middle: 'ミドル',
  high: 'ハイ',
};

const PACE_COLORS = {
  slow: 'bg-blue-500',
  middle: 'bg-yellow-500',
  high: 'bg-red-500',
};

// 枠色（サイバーパンク対応: ネオンカラー追加）
const WAKU_COLORS: Record<string, { bg: string; text: string; border?: string; neon: string; hex: string }> = {
  '1': { bg: 'bg-white', text: 'text-black', border: 'border-2 border-black', neon: 'rgba(255, 255, 255, 0.9)', hex: '#ffffff' },
  '2': { bg: 'bg-black', text: 'text-white', neon: 'rgba(30, 30, 30, 0.9)', hex: '#1e1e1e' },
  '3': { bg: 'bg-red-500', text: 'text-white', neon: 'rgba(239, 68, 68, 0.9)', hex: '#ef4444' },
  '4': { bg: 'bg-blue-500', text: 'text-white', neon: 'rgba(59, 130, 246, 0.9)', hex: '#3b82f6' },
  '5': { bg: 'bg-yellow-400', text: 'text-black', neon: 'rgba(250, 204, 21, 0.9)', hex: '#facc15' },
  '6': { bg: 'bg-green-500', text: 'text-white', neon: 'rgba(34, 197, 94, 0.9)', hex: '#22c55e' },
  '7': { bg: 'bg-orange-500', text: 'text-white', neon: 'rgba(249, 115, 22, 0.9)', hex: '#f97316' },
  '8': { bg: 'bg-pink-400', text: 'text-white', neon: 'rgba(244, 114, 182, 0.9)', hex: '#f472b6' },
};

// calculateGoalPositionAdjustment は lib/race-pace-adjustment.ts に移動しました

export default function CourseStyleRacePace({
  year,
  date,
  place,
  raceNumber,
  kisouScores = {},
}: Props) {
  const raceKey = `${year}${date}_${place}_${raceNumber}`;
  
  // ✅ デバッグログ: 競うスコアの受け取り確認
  console.log('[CourseStyleRacePace] 受け取った競うスコア:', kisouScores);
  console.log('[CourseStyleRacePace] スコアの数:', Object.keys(kisouScores).length);
  
  // バイアスをレースごとにlocalStorageから復元
  const [bias, setBias] = useState<
    'none' | 'uchi-mae' | 'soto-mae' | 'mae' | 'ushiro' | 'uchi' | 'soto' | 'soto-ushiro'
  >(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`bias_${raceKey}`);
      return (saved as typeof bias) || 'none';
    }
    return 'none';
  });
  
  // 馬場状態をレースごとにlocalStorageから復元
  const [trackCondition, setTrackCondition] = useState<'良' | '稍' | '重' | '不'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`condition_${raceKey}`);
      return (saved as '良' | '稍' | '重' | '不') || '良';
    }
    return '良';
  });
  
  const [prediction, setPrediction] = useState<RacePacePrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTable, setExpandedTable] = React.useState(false);
  
  // スマホ判定とカード開閉状態
  const [isMobile, setIsMobile] = useState(false);
  const [cardExpanded, setCardExpanded] = useState(true); // デフォルトは開く
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
  
  // バイアス変更時にlocalStorageに保存
  const handleBiasChange = (newBias: typeof bias) => {
    setBias(newBias);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`bias_${raceKey}`, newBias);
    }
  };
  
  // 馬場状態変更時にlocalStorageに保存
  const handleConditionChange = (newCondition: '良' | '稍' | '重' | '不') => {
    setTrackCondition(newCondition);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`condition_${raceKey}`, newCondition);
    }
  };

  useEffect(() => {
    async function fetchPrediction() {
      try {
        setLoading(true);
        setError(null);
        
        // パラメータの検証
        if (!year || !date || !place || !raceNumber) {
          throw new Error(`必須パラメータが不足しています: year=${year}, date=${date}, place=${place}, raceNumber=${raceNumber}`);
        }
        
        const url = `/api/race-pace?year=${year}&date=${date}&place=${encodeURIComponent(place)}&raceNumber=${raceNumber}`;
        console.log('[CourseStyleRacePace] Fetching:', url);
        
        const res = await fetch(url);
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error('[CourseStyleRacePace] Error response:', errorData);
          throw new Error(`APIエラー: ${res.status} - ${errorData.error || errorData.details || 'Unknown error'}`);
        }
        
        const data = await res.json();
        console.log('[CourseStyleRacePace] Success:', data.raceKey);
        setPrediction(data);
      } catch (err: any) {
        console.error('[CourseStyleRacePace] 展開予想の取得に失敗:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchPrediction();
  }, [year, date, place, raceNumber]);

  // 馬名を短縮（Hooks呼び出しの後に配置）
  const shortenHorseName = React.useCallback((name: string) => {
    if (name.length <= 4) return name;
    return name.substring(0, 4);
  }, []);

  // スタート後（2C付近）の隊列
  const startPosition = React.useMemo(() => {
    if (!prediction) return [];
    return [...prediction.predictions].sort((a, b) => a.expectedPosition2C - b.expectedPosition2C);
  }, [prediction]);
  
  // =====================================================
  // 【新シンプルロジック】ゴール前位置を計算
  // 
  // 主要ファクター:
  // 1. 競うスコアパーセンタイル（メンバー内での相対能力）
  // 2. L4Fパーセンタイル（末脚能力）
  // 3. スタート位置からの調整
  // =====================================================
  const goalPosition = React.useMemo(() => {
    if (!prediction) return [];
    
    // 競うスコアでソートしてパーセンタイルを計算
    const horsesWithScores = prediction.predictions.map(h => ({
      ...h,
      kisoScore: kisouScores?.[h.horseNumber] || 0,
    }));
    
    // 競うスコア順にソート（高い順）
    const sortedByScore = [...horsesWithScores].sort((a, b) => b.kisoScore - a.kisoScore);
    
    // 各馬のスコアパーセンタイルを計算（1位=上位、最下位=下位）
    const scorePercentileMap = new Map<number, number>();
    sortedByScore.forEach((horse, idx) => {
      // パーセンタイル: 1位=0%, 最下位=100%
      const percentile = (idx / Math.max(1, sortedByScore.length - 1)) * 100;
      scorePercentileMap.set(horse.horseNumber, percentile);
    });
    
    // L4Fでソートしてパーセンタイルを計算（高い=速い）
    const horsesWithL4F = prediction.predictions.filter(h => h.avgL4F && h.avgL4F > 0);
    const sortedByL4F = [...horsesWithL4F].sort((a, b) => (b.avgL4F || 0) - (a.avgL4F || 0));
    
    const l4fPercentileMap = new Map<number, number>();
    sortedByL4F.forEach((horse, idx) => {
      const percentile = (idx / Math.max(1, sortedByL4F.length - 1)) * 100;
      l4fPercentileMap.set(horse.horseNumber, percentile);
    });
    
    console.log('[CourseStyleRacePace] ===== 新シンプルロジック =====');
    console.log('[CourseStyleRacePace] 競うスコア順位:', 
      sortedByScore.map((h, i) => `${i+1}位:馬${h.horseNumber}(${h.kisoScore.toFixed(1)})`).join(', ')
    );
    console.log('[CourseStyleRacePace] L4F順位:', 
      sortedByL4F.map((h, i) => `${i+1}位:馬${h.horseNumber}(${h.avgL4F?.toFixed(1)})`).join(', ')
    );
  
    return prediction.predictions.map(horse => {
    const kisoScore = kisouScores?.[horse.horseNumber] || 0;
    const scorePercentile = scorePercentileMap.get(horse.horseNumber) ?? 50;
    const l4fPct = l4fPercentileMap.get(horse.horseNumber) ?? 50;
    const totalHorses = prediction.predictions.length;
    
    // =====================================================
    // 【新シンプルロジック】ゴール位置を計算
    // 
    // 基本式:
    // ゴール位置 = スタート位置 × 0.3 + スコア順位 × 頭数 × 0.5 + L4F調整 × 0.2
    // 
    // 競うスコア上位 → 前へ
    // L4F上位 → 前へ
    // スタート位置の影響は控えめ
    // =====================================================
    
    // 1. スタート位置の影響（30%）
    const startInfluence = horse.expectedPosition2C * 0.3;
    
    // 2. 競うスコアパーセンタイルの影響（50%）
    // scorePercentile: 1位=0%, 最下位=100%
    const scoreInfluence = (scorePercentile / 100) * totalHorses * 0.5;
    
    // 3. L4Fパーセンタイルの影響（20%）
    // l4fPct: 1位=0%, 最下位=100%
    const l4fInfluence = (l4fPct / 100) * totalHorses * 0.2;
    
    // 基本ゴール位置
    let goalPosition = startInfluence + scoreInfluence + l4fInfluence;
    
    // 4. 馬場バイアス補正（シンプルに）
    const wakuNum = parseInt(horse.waku, 10);
    let biasAdjust = 0;
    switch (bias) {
      case 'uchi-mae':
        if (wakuNum <= 3) biasAdjust -= 1.0;
        if (horse.runningStyle === 'escape' || horse.runningStyle === 'lead') biasAdjust -= 0.5;
        break;
      case 'soto-mae':
        if (wakuNum >= 6) biasAdjust -= 1.0;
        if (horse.runningStyle === 'escape' || horse.runningStyle === 'lead') biasAdjust -= 0.5;
        break;
      case 'mae':
        if (horse.runningStyle === 'escape' || horse.runningStyle === 'lead') biasAdjust -= 1.5;
        break;
      case 'ushiro':
        if (horse.runningStyle === 'sashi' || horse.runningStyle === 'oikomi') biasAdjust -= 1.5;
        break;
      case 'uchi':
        if (wakuNum <= 3) biasAdjust -= 1.0;
        break;
      case 'soto':
        if (wakuNum >= 6) biasAdjust -= 1.0;
        break;
      case 'soto-ushiro':
        if (wakuNum >= 6) biasAdjust -= 0.5;
        if (horse.runningStyle === 'sashi' || horse.runningStyle === 'oikomi') biasAdjust -= 0.5;
        break;
    }
    goalPosition += biasAdjust;
    
    // 最小1、最大=頭数+1に制限
    goalPosition = Math.max(1, Math.min(totalHorses + 1, goalPosition));
    
    // デバッグログ
    console.log(`[新ゴール] 馬${horse.horseNumber} ${horse.horseName}: ` +
      `スコア=${kisoScore.toFixed(1)}(${scorePercentile.toFixed(0)}%), ` +
      `L4F%=${l4fPct.toFixed(0)}, ` +
      `スタート=${horse.expectedPosition2C.toFixed(1)} → ゴール=${goalPosition.toFixed(1)}`
    );

    return {
      ...horse,
      expectedPositionGoal: goalPosition,
      scoreDeviation: 100 - scorePercentile, // パーセンタイル→偏差値的な値に変換（表示用）
    };
  }).sort((a, b) => (a.expectedPositionGoal || 0) - (b.expectedPositionGoal || 0));
  }, [prediction, kisouScores, bias]);
  
  // ✅ デバッグログ: ゴール位置計算結果
  React.useEffect(() => {
    if (goalPosition.length > 0 && startPosition.length > 0) {
      console.log('[CourseStyleRacePace] ゴール位置計算結果:');
      goalPosition.forEach((g, index) => {
        const startPos = startPosition.find(s => s.horseNumber === g.horseNumber);
        if (startPos) {
          const positionGain = startPos.expectedPosition2C - (g.expectedPositionGoal || 0);
          console.log(`  馬番${g.horseNumber} ${g.horseName}:`,
            `スコア=${kisouScores?.[g.horseNumber] || 0}`,
            `偏差値=${(g as any).scoreDeviation?.toFixed(1) || 'N/A'}`,
            `T2F%=${g.t2fPercentile || 'N/A'}`,
            `L4F%=${g.l4fPercentile || 'N/A'}`,
            `potential=${g.avgPotential?.toFixed(1) || 'N/A'}`,
            `makikaeshi=${g.avgMakikaeshi?.toFixed(1) || 'N/A'}`,
            `スタート=${startPos.expectedPosition2C.toFixed(1)}番手`,
            `→ ゴール=${(g.expectedPositionGoal || 0).toFixed(1)}番手`,
            `(前進: ${positionGain.toFixed(1)}馬身)`
          );
        }
      });
    }
  }, [goalPosition, startPosition, kisouScores]);

  // 来る可能性が高い馬を特定（総合評価＋強度判定）【噴射＝浮上ボーナス】
  const surgeHorses = React.useMemo(() => {
    const map = new Map<number, 'strong' | 'medium' | 'weak'>();
    
    goalPosition.forEach((g: any) => {
      if (g.expectedPositionGoal !== undefined && g.scoreDeviation !== undefined) {
        const intensity = determineSurgeIntensity(
          g.scoreDeviation,
          g.expectedPosition2C,
          g.expectedPositionGoal,
          prediction?.predictions.length || 1
        );
        
        if (intensity) {
          map.set(g.horseNumber, intensity);
        }
      }
    });
    
    return map;
  }, [goalPosition, prediction]);

  // 横方向の配置用に、位置に応じてX座標を計算
  const calculateHorseLayout = React.useCallback((
    horses: Array<HorsePositionPrediction & { expectedPositionGoal?: number }>, 
    useGoalPosition: boolean = false
  ) => {
    // 位置でソート
    const sorted = [...horses].sort((a, b) => {
      const pa = useGoalPosition ? (a.expectedPositionGoal || a.expectedPosition2C) : a.expectedPosition2C;
      const pb = useGoalPosition ? (b.expectedPositionGoal || b.expectedPosition2C) : b.expectedPosition2C;
      return pa - pb;
    });

    const positions = sorted.map(h => useGoalPosition ? (h.expectedPositionGoal || h.expectedPosition2C) : h.expectedPosition2C);
    const maxPosition = Math.max(...positions);
    const minPosition = Math.min(...positions);
    const positionRange = maxPosition - minPosition || 1;

    // 馬群グルーピング：位置が近い馬を自然にまとめる
    // 位置差が1.5以下なら同じグループ、それ以上離れたら次のグループ
    const groupThreshold = 1.5; // 馬身差の閾値
    const groups: number[][] = [];
    let currentGroup: number[] = [0];
    
    for (let i = 1; i < sorted.length; i++) {
      const prevPos = positions[i - 1];
      const currPos = positions[i];
      
      if (currPos - prevPos <= groupThreshold) {
        currentGroup.push(i);
      } else {
        groups.push(currentGroup);
        currentGroup = [i];
      }
    }
    groups.push(currentGroup);

    // 段（レーン）配置の設定（密集緩和）
    const minGap = 6.5;           // 行内での最低ギャップ（%）【4.2 → 6.5に拡大】
    const groupGap = 12;          // グループ間の追加ギャップ（%）【新設】
    const maxX = 94;
    const minX = 1;
    const lanes = 3;              // 最大段数
    const laneHeight = 26;        // 段差
    const jitter = 10;            // 縦の微揺らぎ（±10px）【8 → 10に拡大】

    // 位置→% を内枠優先でソート（同じ位置なら枠が小さい馬を先に配置）
    const sortedByPos = [...sorted].sort((a, b) => {
      const pa = useGoalPosition ? (a.expectedPositionGoal || a.expectedPosition2C) : a.expectedPosition2C;
      const pb = useGoalPosition ? (b.expectedPositionGoal || b.expectedPosition2C) : b.expectedPosition2C;
      if (pa === pb) return parseInt(a.waku, 10) - parseInt(b.waku, 10);
      return pa - pb;
    });

    // 各レーンで最後に配置したXを保持
    const lastXByLane: number[] = new Array(lanes).fill(minX - minGap);
    let lastGroupIndex = -1;

    return sortedByPos.map((horse, sortedIndex) => {
      const position = useGoalPosition ? (horse.expectedPositionGoal || horse.expectedPosition2C) : horse.expectedPosition2C;

      // 現在の馬がどのグループに属しているか
      const originalIndex = sorted.findIndex(h => h.horseNumber === horse.horseNumber);
      const currentGroupIndex = groups.findIndex(g => g.includes(originalIndex));
      
      // グループが変わったら追加の間隔を空ける
      if (currentGroupIndex !== lastGroupIndex && lastGroupIndex !== -1) {
        for (let lane = 0; lane < lanes; lane++) {
          lastXByLane[lane] += groupGap;
        }
      }
      lastGroupIndex = currentGroupIndex;

      // 基本のX（位置→%）
      let xPercent = ((position - minPosition) / positionRange) * (maxX - minX) + minX;

      // 枠番で微調整（外枠は外側へ、幅を拡大）
      const wakuNum = parseInt(horse.waku, 10);
      xPercent += (wakuNum - 4.5) * 0.8; // 0.5 → 0.8に拡大

      // 上段優先で詰める。重なりそうなら次の段へ。全段埋まっても下段に逃がして右へ少し詰める。
      let chosenLane = 0;
      for (let lane = 0; lane < lanes; lane++) {
        if (xPercent - lastXByLane[lane] >= minGap) {
          chosenLane = lane;
          break;
        }
        if (lane === lanes - 1) {
          chosenLane = lane;
          xPercent = lastXByLane[lane] + minGap;
        }
      }

      lastXByLane[chosenLane] = xPercent;

      // 画面端で溢れないようクリップ
      xPercent = Math.max(minX, Math.min(maxX, xPercent));

      // 縦位置の改善：前後に馬がいない場合は上段を使わない
      // 前後の馬との距離をチェック
      const currentGroup = groups[currentGroupIndex];
      const isInLargeGroup = currentGroup.length >= 3; // 3頭以上のグループ
      const isIsolated = currentGroup.length === 1; // 孤立馬
      
      // 前後の馬との距離
      let distanceToNext = Infinity;
      let distanceToPrev = Infinity;
      
      if (originalIndex < sorted.length - 1) {
        distanceToNext = positions[originalIndex + 1] - position;
      }
      if (originalIndex > 0) {
        distanceToPrev = position - positions[originalIndex - 1];
      }
      
      // 孤立馬（前後に3馬身以上離れている）は段を下げる
      let laneAdjustment = 0;
      if (isIsolated && distanceToNext >= 3.0 && distanceToPrev >= 3.0) {
        // 完全に孤立 → 中段に配置（上段の無駄なスペースを削減）
        laneAdjustment = 1;
        chosenLane = Math.min(chosenLane + laneAdjustment, lanes - 1);
      } else if (isInLargeGroup) {
        // 大きなグループは上段優先（そのまま）
        laneAdjustment = 0;
      }
      
      // 縦位置：レーン段差＋揺らぎ
      const jitterOffset = (Math.random() * jitter * 2 - jitter);
      const yOffset = chosenLane * laneHeight + jitterOffset;

      return {
        horse,
        xPercent,
        yOffset,
      };
    });
  }, []);

  const startLayout = React.useMemo(() => calculateHorseLayout(startPosition, false), [startPosition, calculateHorseLayout]);
  const goalLayout = React.useMemo(() => calculateHorseLayout(goalPosition, true), [goalPosition, calculateHorseLayout]);

  // 馬群グループ数を計算
  const groupedHorses = React.useMemo(() => {
    if (!prediction) return [];
    const sorted = [...goalPosition].sort((a, b) => (a.expectedPositionGoal || 0) - (b.expectedPositionGoal || 0));
    const groups: typeof sorted[] = [];
    let currentGroup: typeof sorted = [];
    
    sorted.forEach((horse, idx) => {
      if (idx === 0) {
        currentGroup = [horse];
      } else {
        const prevPos = sorted[idx - 1].expectedPositionGoal || 0;
        const currPos = horse.expectedPositionGoal || 0;
        if (currPos - prevPos <= 1.5) {
          currentGroup.push(horse);
        } else {
          groups.push(currentGroup);
          currentGroup = [horse];
        }
      }
    });
    if (currentGroup.length > 0) groups.push(currentGroup);
    return groups;
  }, [goalPosition, prediction]);


  // 早期リターンはすべてのHooksの後に配置
  if (loading) {
    return (
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 shadow-lg">
        <h3 className="text-base font-bold mb-4 text-slate-200 flex items-center gap-2">
          <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
          展開予想
        </h3>
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm">読み込み中...</span>
        </div>
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 shadow-lg">
        <h3 className="text-base font-bold mb-4 text-slate-200 flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full"></span>
          展開予想
        </h3>
        <p className="text-red-400 text-sm">データ取得に失敗しました</p>
      </div>
    );
  }

  return (
    <div id={`race-pace-${raceKey}`} className="sports-tech-container">
      <style jsx>{`
        /* =====================================================
           🏁 SPORTS TECH - プロ仕様アナリティクスUI
           ===================================================== */
        
        .sports-tech-container {
          background: #0f172a;
          padding: 12px;
          border-radius: 8px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
          position: relative;
          overflow: visible;
          border: 1px solid #334155;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.2);
        }
        
        @media (min-width: 640px) {
          .sports-tech-container {
            padding: 20px;
            border-radius: 10px;
          }
        }
        
        /* ドットグリッド（戦術ボード風） */
        .sports-tech-container::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
          background-size: 16px 16px;
          pointer-events: none;
        }
        
        .card-section {
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid #334155;
          border-radius: 6px;
          position: relative;
          z-index: 1;
        }
        
        .header-card {
          padding: 12px 16px;
          margin-bottom: 12px;
          animation: fadeIn 0.4s ease-out;
        }
        
        @media (min-width: 640px) {
          .header-card {
            padding: 16px 20px;
            margin-bottom: 16px;
          }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .main-title {
          font-size: 15px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
          letter-spacing: 0.02em;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .title-indicator {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 2px;
          animation: indicatorPulse 2s ease-in-out infinite;
        }
        
        @keyframes indicatorPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        
        @media (min-width: 640px) {
          .main-title {
            font-size: 18px;
            margin: 0 0 12px 0;
          }
        }
        
        .meta-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        
        .pace-badge {
          padding: 5px 12px;
          border-radius: 3px;
          font-weight: 700;
          font-size: 11px;
          color: #ffffff;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          animation: fadeIn 0.4s ease-out;
        }
        
        .pace-high { 
          background: #dc2626;
        }
        .pace-middle { 
          background: #d97706;
        }
        .pace-slow { 
          background: #0891b2;
        }
        
        .meta-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          color: #94a3b8;
        }
        
        .meta-value {
          font-weight: 600;
          color: #e2e8f0;
          background: rgba(51, 65, 85, 0.5);
          padding: 4px 10px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .bias-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        
        .bias-btn {
          padding: 4px 10px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 500;
          border: 1px solid #475569;
          cursor: pointer;
          transition: all 0.15s ease;
          background: #1e293b;
          color: #94a3b8;
        }
        
        .bias-btn:hover {
          background: #334155;
          border-color: #64748b;
          color: #e2e8f0;
        }
        
        .bias-btn-active {
          background: #334155;
          border-color: #22c55e;
          color: #22c55e;
        }
        
        .course-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        
        @media (max-width: 768px) {
          .course-grid {
            grid-template-columns: 1fr;
          }
        }
        
        .course-panel {
          padding: 14px;
          animation: slideIn 0.4s ease-out;
          position: relative;
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #334155;
        }
        
        .panel-title {
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .panel-title::before {
          content: '';
          width: 3px;
          height: 14px;
          background: #3b82f6;
          border-radius: 1px;
        }
        
        .panel-meta {
          font-size: 10px;
          color: #64748b;
          background: #1e293b;
          padding: 3px 8px;
          border-radius: 3px;
          border: 1px solid #334155;
        }
        
        .course-display {
          position: relative;
          min-height: 180px;
          background: #1e293b;
          border-radius: 6px;
          padding: 16px;
          border: 1px solid #334155;
          overflow: visible;
        }
        
        /* コースライン（破線） */
        .course-display::before {
          content: '';
          position: absolute;
          top: 25%;
          left: 0;
          right: 0;
          height: 1px;
          background: repeating-linear-gradient(
            90deg,
            transparent,
            transparent 8px,
            #475569 8px,
            #475569 16px
          );
        }
        
        .course-display::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
          background: repeating-linear-gradient(
            90deg,
            transparent,
            transparent 8px,
            #475569 8px,
            #475569 16px
          );
        }
        
        /* 追加のコースライン */
        .course-line-extra {
          position: absolute;
          top: 75%;
          left: 0;
          right: 0;
          height: 1px;
          background: repeating-linear-gradient(
            90deg,
            transparent,
            transparent 8px,
            #475569 8px,
            #475569 16px
          );
        }
        
        .direction-indicator {
          position: absolute;
          bottom: 6px;
          right: 10px;
          font-size: 10px;
          color: #64748b;
        }
        
        .analysis-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }
        
        @media (max-width: 768px) {
          .analysis-grid { grid-template-columns: 1fr; }
        }
        
        .analysis-panel {
          padding: 16px;
          animation: fadeInUp 0.6s ease-out;
        }
        
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .panel-header-small {
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .panel-title-small {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }
        
        .detail-section {
          padding: 0;
          overflow: visible;
          animation: fadeInUp 0.5s ease-out;
          position: relative;
        }
        
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.15s;
        }
        
        .detail-header:hover {
          background: rgba(51, 65, 85, 0.5);
        }
        
        .detail-title {
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
          margin: 0;
        }
        
        .toggle-icon {
          font-size: 10px;
          color: #64748b;
          transition: transform 0.2s;
        }
        
        .toggle-icon-expanded {
          transform: rotate(180deg);
        }
        
        .detail-table-container {
          overflow-x: auto;
          padding: 0 16px 16px;
        }
        
        .detail-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        
        .detail-table th {
          padding: 8px 6px;
          text-align: left;
          color: #64748b;
          font-weight: 600;
          font-size: 10px;
          border-bottom: 1px solid #334155;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        
        .detail-table td {
          padding: 8px 6px;
          color: #e2e8f0;
          border-bottom: 1px solid rgba(51, 65, 85, 0.5);
        }
        
        .detail-table tbody tr {
          transition: background 0.15s;
        }
        
        .detail-table tbody tr:hover {
          background: rgba(51, 65, 85, 0.4);
        }
        
        .horse-number-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 24px;
          padding: 0 5px;
          border-radius: 3px;
          font-weight: 700;
          font-size: 11px;
          background: #334155;
          color: #e2e8f0;
          border: 1px solid #475569;
        }
        
        .score-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 3px;
          font-weight: 600;
          font-size: 11px;
        }
        
        .score-high { 
          background: #dc2626; 
          color: #ffffff;
        }
        .score-medium { 
          background: #d97706; 
          color: #ffffff;
        }
        .score-low { 
          background: #0891b2; 
          color: #ffffff;
        }
        .score-minimal { 
          background: #475569;
          color: #94a3b8;
        }
        
        .style-badge-table {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 600;
          color: #ffffff;
        }
        
        .style-badge-escape { 
          background: #dc2626;
        }
        .style-badge-lead { 
          background: #ea580c;
        }
        .style-badge-sashi { 
          background: #0891b2;
        }
        .style-badge-oikomi { 
          background: #7c3aed;
        }
        
        .rating-stars {
          font-size: 11px;
          color: #fbbf24;
        }
      `}</style>
      
      {/* ヘッダーカード */}
      <div className="card-section header-card">
        <div 
          className="flex justify-between items-center cursor-pointer"
          onClick={() => isMobile && setCardExpanded(!cardExpanded)}
        >
          <h2 className="main-title">
            <span className="title-indicator"></span>
            展開予想
          </h2>
          {isMobile && (
            <span className={`text-slate-500 text-sm transition-transform duration-200 ${cardExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          )}
        </div>
        {isMobile && !cardExpanded && (
          <p className="text-xs text-slate-500 mt-1">タップして展開</p>
        )}
        {(cardExpanded || !isMobile) && (
          <>
            <div className="meta-grid">
              <span className={`pace-badge pace-${prediction.expectedPace}`}>
                {PACE_LABELS[prediction.expectedPace]}
              </span>
              <span className="meta-item">
                <span>馬群:</span>
                <span className="meta-value">{groupedHorses.length}</span>
              </span>
              <span className="meta-item">
                <span>頭数:</span>
                <span className="meta-value">{prediction.predictions.length}</span>
              </span>
              <span className="meta-item">
                <span>先行:</span>
                <span className="meta-value">{prediction.frontRunners}頭</span>
              </span>
              {prediction.avgFront2FLap && (
                <span className="meta-item">
                  <span>前半2F:</span>
                  <span className="meta-value">{prediction.avgFront2FLap.toFixed(1)}秒</span>
                </span>
              )}
            </div>
            <div className="bias-controls" style={{ marginTop: '12px' }}>
              <span className="meta-item" style={{ fontSize: '11px', color: '#64748b' }}>馬場:</span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {[
                  { key: '良', label: '良', activeColor: '#22c55e' },
                  { key: '稍', label: '稍', activeColor: '#eab308' },
                  { key: '重', label: '重', activeColor: '#f97316' },
                  { key: '不', label: '不', activeColor: '#ef4444' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => handleConditionChange(opt.key as '良' | '稍' | '重' | '不')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '3px',
                      fontSize: '10px',
                      fontWeight: 500,
                      border: trackCondition === opt.key ? `1px solid ${opt.activeColor}` : '1px solid #475569',
                      background: trackCondition === opt.key ? `${opt.activeColor}20` : '#1e293b',
                      color: trackCondition === opt.key ? opt.activeColor : '#94a3b8',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: trackCondition === opt.key ? opt.activeColor : '#475569',
                      boxShadow: trackCondition === opt.key ? `0 0 6px ${opt.activeColor}` : 'none',
                    }}></span>
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="meta-item" style={{ fontSize: '12px', marginLeft: '16px' }}>バイアス:</span>
              {[
                { key: 'none', label: '無し' },
                { key: 'uchi-mae', label: '内前' },
                { key: 'soto-mae', label: '外前' },
                { key: 'mae', label: '前' },
                { key: 'ushiro', label: '後' },
                { key: 'uchi', label: '内' },
                { key: 'soto', label: '外' },
                { key: 'soto-ushiro', label: '外後' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => handleBiasChange(opt.key as any)}
                  className={`bias-btn ${bias === opt.key ? 'bias-btn-active' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* コース表示 */}
      {(cardExpanded || !isMobile) && (
        <>
          <div className="course-grid">
        {/* スタート後 */}
        <div className="card-section course-panel">
          <div className="panel-header">
            <h3 className="panel-title">スタート後</h3>
            <span className="panel-meta">{prediction.predictions.length}頭</span>
          </div>
          <div className="course-display">
            <div className="course-line-extra"></div>
            <div className="direction-indicator">← 進行方向</div>
            <div className="relative h-full pt-4">
              {startLayout.map(({ horse, xPercent, yOffset }) => (
                <div
                  key={horse.horseNumber}
                  className="absolute"
                  style={{
                    left: `${xPercent}%`,
                    top: `${yOffset}px`,
                  }}
                >
                  <HorseIcon
                    horse={horse}
                    surgeLevel={surgeHorses.get(horse.horseNumber) || null}
                    shortenName={shortenHorseName}
                    size="tiny"
                    kisoScore={kisouScores?.[horse.horseNumber] || 0}
                    isGoalView={false}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ゴール前 */}
        <div className="card-section course-panel">
          <div className="panel-header">
            <h3 className="panel-title">ゴール前</h3>
            <span className="panel-meta">{groupedHorses.length}馬群</span>
          </div>
          <div className="course-display">
            <div className="course-line-extra"></div>
            <div className="direction-indicator">← ゴール</div>
            {/* ゴールライン（左端） */}
            <div style={{ 
              position: 'absolute', 
              left: 0, 
              top: 0, 
              bottom: 0, 
              width: '2px', 
              background: '#475569',
            }}></div>
            <div className="relative h-full pt-4">
              {goalLayout.map(({ horse, xPercent, yOffset }) => (
                <div
                  key={horse.horseNumber}
                  className="absolute"
                  style={{
                    left: `${xPercent}%`,
                    top: `${yOffset}px`,
                  }}
                >
                  <HorseIcon
                    horse={horse}
                    surgeLevel={surgeHorses.get(horse.horseNumber) || null}
                    shortenName={shortenHorseName}
                    size="tiny"
                    kisoScore={kisouScores?.[horse.horseNumber] || 0}
                    isGoalView={true}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 詳細テーブル */}
      <div className="card-section detail-section" style={{ marginTop: '12px' }}>
        <div className="detail-header" onClick={() => setExpandedTable(!expandedTable)}>
          <h4 className="detail-title">詳細分析</h4>
          <span className={`toggle-icon ${expandedTable ? 'toggle-icon-expanded' : ''}`}>▼</span>
        </div>
        {expandedTable && (
          <div className="detail-table-container">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>馬番</th>
                  <th>馬名</th>
                  <th>スコア</th>
                  <th>脚質</th>
                  <th>スタート</th>
                  <th>T2F</th>
                  <th>L4F</th>
                  <th>評価</th>
                </tr>
              </thead>
              <tbody>
                {prediction.predictions
                  .sort((a, b) => (kisouScores[b.horseNumber] || 0) - (kisouScores[a.horseNumber] || 0))
                  .map((horse) => {
                    const score = kisouScores[horse.horseNumber] || 0;
                    const scoreClass = score >= 70 ? 'score-high' : score >= 60 ? 'score-medium' : score >= 50 ? 'score-low' : 'score-minimal';
                    const styleBadgeClass = `style-badge-${horse.runningStyle}`;
                    
                    // T2F/L4Fのデバッグ表示
                    const t2fDisplay = horse.avgFront2FLap 
                      ? `${horse.avgFront2FLap.toFixed(1)}秒 (${horse.t2fPercentile || '-'}%・${horse.t2fRaceCount || 0}走)`
                      : '-';
                    const l4fDisplay = horse.avgL4F
                      ? `${horse.avgL4F.toFixed(1)} (${horse.l4fPercentile || '-'}%・${horse.l4fRaceCount || 0}走)`
                      : '-';
                    
                    return (
                      <tr key={horse.horseNumber}>
                        <td>
                          <span className="horse-number-badge">{horse.horseNumber}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{horse.horseName}</td>
                        <td>
                          <span className={`score-badge ${scoreClass}`}>
                            {score.toFixed(1)}
                          </span>
                        </td>
                        <td>
                          <span className={`style-badge-table ${styleBadgeClass}`}>
                            {RUNNING_STYLE_LABELS[horse.runningStyle]}
                          </span>
                        </td>
                        <td>{horse.expectedPosition2C.toFixed(1)}</td>
                        <td style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {t2fDisplay}
                        </td>
                        <td style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {l4fDisplay}
                        </td>
                        <td>
                          <span className="rating-stars">
                            {score >= 70 ? '★★★' : score >= 60 ? '★★' : score >= 50 ? '★' : '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

// 馬アイコンコンポーネント（Sports Tech版 - しずく型ユニット）
function HorseIcon({
  horse,
  surgeLevel,
  shortenName,
  size = 'normal',
  kisoScore,
  isGoalView = false,
}: {
  horse: HorsePositionPrediction;
  surgeLevel: 'strong' | 'medium' | 'weak' | null;
  shortenName: (name: string) => string;
  size?: 'tiny' | 'small' | 'normal';
  kisoScore: number;
  isGoalView?: boolean;
}) {
  const wakuColor = WAKU_COLORS[horse.waku] || { bg: 'bg-gray-200', text: 'text-black', neon: 'rgba(200,200,200,0.9)', hex: '#c8c8c8' };
  
  // L4F（後半特化）判定
  const isBackHalfSpecialist = (horse.avgL4F || 0) >= 5.0 || (horse.l4fPercentile || 100) <= 25;
  
  // 前半特化判定
  const isFrontHalfSpecialist = surgeLevel !== null || (horse.t2fPercentile || 100) <= 25;

  return (
    <>
      <style jsx>{`
        /* =====================================================
           🏁 Sports Tech - しずく型ユニット
           ===================================================== */
        
        .sports-horse-unit {
          position: relative;
          cursor: pointer;
          flex-shrink: 0;
        }
        
        /* しずく型の基本形状（左向き = 進行方向を指す） */
        .droplet-icon {
          width: 32px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 11px;
          border-radius: 50% 4px 4px 50%;
          transition: all 0.2s ease;
          position: relative;
          z-index: 10;
          border: 2px solid rgba(0, 0, 0, 0.3);
          /* テキスト可読性 */
          text-shadow: 
            0 0 2px rgba(0,0,0,0.5);
        }
        
        .droplet-icon:hover {
          transform: scale(1.1) translateX(-2px);
        }
        
        /* 前半特化馬: 赤/オレンジのアクセント */
        .front-half-specialist .droplet-icon {
          box-shadow: 
            0 0 0 2px rgba(234, 88, 12, 0.6),
            0 2px 8px rgba(234, 88, 12, 0.4);
        }
        
        /* 後半特化馬: 青のアクセント */
        .back-half-specialist .droplet-icon {
          box-shadow: 
            0 0 0 2px rgba(14, 165, 233, 0.6),
            0 2px 8px rgba(14, 165, 233, 0.4);
        }
        
        /* =====================================================
           🔥 前半特化 - オレンジの噴射（右側に配置）
           ===================================================== */
        
        .front-trail {
          position: absolute;
          top: 50%;
          left: 100%;
          transform: translateY(-50%);
          margin-left: 1px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }
        
        .front-trail-line {
          border-radius: 1px;
          background: linear-gradient(to right, #ea580c, #f97316, transparent);
        }
        
        .front-trail-1 { height: 4px; width: 24px; opacity: 0.9; }
        .front-trail-2 { height: 3px; width: 18px; opacity: 0.7; }
        .front-trail-3 { height: 2px; width: 12px; opacity: 0.5; }
        
        /* 強い前半特化 */
        .front-trail-strong .front-trail-1 { width: 32px; height: 5px; }
        .front-trail-strong .front-trail-2 { width: 24px; height: 4px; }
        .front-trail-strong .front-trail-3 { width: 16px; height: 3px; }
        
        /* =====================================================
           ⚡ 後半特化 - 青のインジケータ
           ===================================================== */
        
        /* スタート後: 蓄積マーク（右側に配置） */
        .energy-indicator {
          position: absolute;
          top: 50%;
          left: 100%;
          transform: translateY(-50%);
          margin-left: 4px;
          width: 6px;
          height: 6px;
          background: #0ea5e9;
          border-radius: 50%;
          animation: energyPulse 1.2s ease-in-out infinite;
        }
        
        @keyframes energyPulse {
          0%, 100% { opacity: 0.5; transform: translateY(-50%) scale(0.8); }
          50% { opacity: 1; transform: translateY(-50%) scale(1.1); }
        }
        
        /* ゴール前: 青い噴射（右側に配置） */
        .back-trail {
          position: absolute;
          top: 50%;
          left: 100%;
          transform: translateY(-50%);
          margin-left: 1px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }
        
        .back-trail-line {
          border-radius: 1px;
          background: linear-gradient(to right, #0ea5e9, #38bdf8, transparent);
        }
        
        .back-trail-1 { height: 4px; width: 28px; opacity: 0.9; }
        .back-trail-2 { height: 3px; width: 20px; opacity: 0.7; }
        .back-trail-3 { height: 2px; width: 14px; opacity: 0.5; }
        
        /* ツールチップ */
        .sports-tooltip {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          background: #0f172a;
          color: #e2e8f0;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 10px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
          z-index: 9999;
          border: 1px solid #475569;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        }
        
        .sports-horse-unit:hover .sports-tooltip {
          opacity: 1;
        }
        
        /* ツールチップの位置調整（コース表示エリア用） */
        .course-display .sports-horse-unit {
          position: relative;
          z-index: 1;
        }
        
        .course-display .sports-horse-unit:hover {
          z-index: 100;
        }
        
        .tooltip-name {
          font-weight: 600;
          color: #f1f5f9;
          font-size: 11px;
        }
        
        .tooltip-stats {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 9px;
        }
        
        .tooltip-badge {
          display: inline-block;
          padding: 1px 4px;
          border-radius: 2px;
          font-size: 8px;
          font-weight: 600;
          margin-left: 4px;
        }
        
        .tooltip-badge-front {
          background: #ea580c;
          color: #ffffff;
        }
        
        .tooltip-badge-back {
          background: #0ea5e9;
          color: #ffffff;
        }
      `}</style>
      
      <div className={`sports-horse-unit ${isFrontHalfSpecialist ? 'front-half-specialist' : ''} ${isBackHalfSpecialist ? 'back-half-specialist' : ''}`}>
        {/* しずく型アイコン */}
        <div
          className={`droplet-icon ${wakuColor.bg} ${wakuColor.text}`}
        >
          {horse.horseNumber}
        </div>
        
        {/* 特化馬のみ噴射マーク（右側に配置） */}
        {isFrontHalfSpecialist && (
          // 前半特化: オレンジ噴射
          <div className={`front-trail ${surgeLevel === 'strong' ? 'front-trail-strong' : ''}`}>
            <div className="front-trail-line front-trail-1"></div>
            <div className="front-trail-line front-trail-2"></div>
            <div className="front-trail-line front-trail-3"></div>
          </div>
        )}
        
        {isBackHalfSpecialist && !isGoalView && (
          // 後半特化（スタート後）: 蓄積インジケータ
          <div className="energy-indicator"></div>
        )}
        
        {isBackHalfSpecialist && isGoalView && (
          // 後半特化（ゴール前）: 青噴射
          <div className="back-trail">
            <div className="back-trail-line back-trail-1"></div>
            <div className="back-trail-line back-trail-2"></div>
            <div className="back-trail-line back-trail-3"></div>
          </div>
        )}
        
        {/* ツールチップ */}
        <div className="sports-tooltip">
          <div className="tooltip-name">{horse.horseName}</div>
          <div className="tooltip-stats">
            {kisoScore.toFixed(1)}点 | {RUNNING_STYLE_LABELS[horse.runningStyle]}
            {isFrontHalfSpecialist && <span className="tooltip-badge tooltip-badge-front">前半◎</span>}
            {isBackHalfSpecialist && <span className="tooltip-badge tooltip-badge-back">後半◎</span>}
          </div>
        </div>
      </div>
    </>
  );
}

