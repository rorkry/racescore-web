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

// 枠色
const WAKU_COLORS: Record<string, { bg: string; text: string; border?: string }> = {
  '1': { bg: 'bg-white', text: 'text-black', border: 'border-2 border-black' },
  '2': { bg: 'bg-black', text: 'text-white' },
  '3': { bg: 'bg-red-500', text: 'text-white' },
  '4': { bg: 'bg-blue-500', text: 'text-white' },
  '5': { bg: 'bg-yellow-400', text: 'text-black' },
  '6': { bg: 'bg-green-500', text: 'text-white' },
  '7': { bg: 'bg-orange-500', text: 'text-white' },
  '8': { bg: 'bg-pink-400', text: 'text-white' },
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
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold mb-4">🏇 AI展開予想</h3>
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold mb-4">🏇 AI展開予想</h3>
        <p className="text-red-500">展開予想の取得に失敗しました</p>
      </div>
    );
  }

  return (
    <div id={`race-pace-${raceKey}`} className="modern-race-pace-container">
      <style jsx>{`
        .modern-race-pace-container {
          background: 
            radial-gradient(circle at 20% 30%, rgba(120, 160, 255, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(180, 140, 255, 0.1) 0%, transparent 50%),
            linear-gradient(135deg, #f0f2f5 0%, #e8eef4 100%);
          padding: 12px;
          border-radius: 12px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          position: relative;
          overflow: hidden;
        }
        
        @media (min-width: 640px) {
          .modern-race-pace-container {
            padding: 24px;
            border-radius: 20px;
          }
        }
        
        /* グレインテクスチャ */
        .modern-race-pace-container::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E");
          opacity: 0.4;
          mix-blend-mode: overlay;
          pointer-events: none;
          border-radius: 20px;
        }
        
        /* 微妙なビネット効果 */
        .modern-race-pace-container::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(
            circle at 50% 50%,
            transparent 0%,
            rgba(0, 0, 0, 0.3) 100%
          );
          pointer-events: none;
          border-radius: 20px;
        }
        
        .glass-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(30px) saturate(180%);
          -webkit-backdrop-filter: blur(30px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 18px;
          box-shadow: 0 8px 32px rgba(31, 38, 135, 0.15),
                      inset 0 1px 0 rgba(255, 255, 255, 0.15);
          position: relative;
          z-index: 1;
        }
        
        .header-card {
          padding: 10px 12px;
          margin-bottom: 12px;
          animation: fadeIn 0.6s ease-out;
        }
        
        @media (min-width: 640px) {
          .header-card {
            padding: 20px 24px;
            margin-bottom: 20px;
          }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .main-title {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.02em;
        }
        
        @media (min-width: 640px) {
          .main-title {
            font-size: 24px;
            margin: 0 0 16px 0;
          }
        }
        
        .meta-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
        }
        
        .pace-badge {
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 700;
          font-size: 13px;
          color: #ffffff;
          animation: fadeIn 0.8s ease-out;
        }
        
        .pace-high { background: linear-gradient(135deg, #ff6b6b, #fa5252); }
        .pace-middle { background: linear-gradient(135deg, #ffd43b, #ffa94d); }
        .pace-slow { background: linear-gradient(135deg, #74c0fc, #4dabf7); }
        
        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.8);
        }
        
        .meta-value {
          font-weight: 700;
          color: #ffffff;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
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
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid rgba(255, 255, 255, 0.15);
          cursor: pointer;
          transition: all 0.2s;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: rgba(255, 255, 255, 0.8);
        }
        
        .bias-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.25);
        }
        
        .bias-btn-active {
          background: rgba(74, 222, 128, 0.15);
          backdrop-filter: blur(15px) saturate(180%);
          -webkit-backdrop-filter: blur(15px) saturate(180%);
          border-color: rgba(74, 222, 128, 0.4);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(74, 222, 128, 0.2);
        }
        
        .course-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }
        
        @media (max-width: 768px) {
          .course-grid {
            grid-template-columns: 1fr;
          }
        }
        
        .course-panel {
          padding: 16px;
          animation: slideIn 0.6s ease-out;
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 2px solid rgba(255, 255, 255, 0.15);
        }
        
        .panel-title {
          font-size: 16px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }
        
        .panel-meta {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.6);
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding: 4px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        
        .course-display {
          position: relative;
          min-height: 180px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          padding: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        
        .direction-indicator {
          position: absolute;
          bottom: 8px;
          right: 12px;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
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
          overflow: hidden;
          animation: fadeInUp 0.8s ease-out;
        }
        
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .detail-header:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        
        .detail-title {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }
        
        .toggle-icon {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          transition: transform 0.3s;
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
          padding: 10px 6px;
          text-align: left;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 600;
          font-size: 11px;
          border-bottom: 2px solid rgba(255, 255, 255, 0.15);
        }
        
        .detail-table td {
          padding: 10px 6px;
          color: #ffffff;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .detail-table tbody tr {
          transition: background 0.2s;
        }
        
        .detail-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        
        .horse-number-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          height: 28px;
          padding: 0 8px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 13px;
          background: linear-gradient(135deg, #ffa94d, #ffd89b);
          color: #ffffff;
        }
        
        .score-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 12px;
          color: #ffffff;
        }
        
        .score-high { background: linear-gradient(135deg, #ff6b6b, #fa5252); }
        .score-medium { background: linear-gradient(135deg, #ffd43b, #ffa94d); }
        .score-low { background: linear-gradient(135deg, #74c0fc, #4dabf7); }
        .score-minimal { background: rgba(255, 255, 255, 0.2); }
        
        .style-badge-table {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 700;
          color: #ffffff;
        }
        
        .style-badge-escape { background: linear-gradient(135deg, #ff6b6b, #fa5252); }
        .style-badge-lead { background: linear-gradient(135deg, #ffd43b, #ffa94d); }
        .style-badge-sashi { background: linear-gradient(135deg, #74c0fc, #4dabf7); }
        .style-badge-oikomi { background: linear-gradient(135deg, #b197fc, #9775fa); }
        
        .rating-stars {
          font-size: 14px;
          color: #ffd43b;
        }
      `}</style>
      
      {/* ヘッダーカード */}
      <div className="glass-card header-card">
        <div 
          className="flex justify-between items-center cursor-pointer"
          onClick={() => isMobile && setCardExpanded(!cardExpanded)}
        >
          <h2 className="main-title">🏇 展開予想カード</h2>
          {isMobile && (
            <span className={`text-white text-base transition-transform duration-300 ${cardExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          )}
        </div>
        {isMobile && !cardExpanded && (
          <p className="text-xs text-white/60 mt-1">タップして展開</p>
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
              <span className="meta-item" style={{ fontSize: '12px' }}>馬場状態:</span>
              {[
                { key: '良', label: '良', color: 'rgba(74, 222, 128, 0.15)' },
                { key: '稍', label: '稍重', color: 'rgba(251, 191, 36, 0.15)' },
                { key: '重', label: '重', color: 'rgba(251, 146, 60, 0.15)' },
                { key: '不', label: '不良', color: 'rgba(239, 68, 68, 0.15)' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => handleConditionChange(opt.key as '良' | '稍' | '重' | '不')}
                  className={`bias-btn ${trackCondition === opt.key ? 'bias-btn-active' : ''}`}
                  style={trackCondition === opt.key ? { background: opt.color } : {}}
                >
                  {opt.label}
                </button>
              ))}
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
        <div className="glass-card course-panel">
          <div className="panel-header">
            <h3 className="panel-title">スタート後（2C）</h3>
            <span className="panel-meta">{prediction.predictions.length}頭立て</span>
          </div>
          <div className="course-display">
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
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ゴール前 */}
        <div className="glass-card course-panel">
          <div className="panel-header">
            <h3 className="panel-title">ゴール前</h3>
            <span className="panel-meta">{groupedHorses.length}馬群</span>
          </div>
          <div className="course-display">
            <div className="direction-indicator">← ゴール</div>
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
                  />
                </div>
              ))}
            </div>
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '2px', background: 'rgba(255,255,255,0.5)' }}></div>
          </div>
        </div>
      </div>

      {/* 詳細テーブル */}
      <div className="glass-card detail-section" style={{ marginTop: '20px' }}>
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
                        <td style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>
                          {t2fDisplay}
                        </td>
                        <td style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>
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

// 馬アイコンコンポーネント（グラスモーフィズム版）
function HorseIcon({
  horse,
  surgeLevel,
  shortenName,
  size = 'normal',
  kisoScore,
}: {
  horse: HorsePositionPrediction;
  surgeLevel: 'strong' | 'medium' | 'weak' | null;
  shortenName: (name: string) => string;
  size?: 'tiny' | 'small' | 'normal';
  kisoScore: number;
}) {
  const wakuColor = WAKU_COLORS[horse.waku] || { bg: 'bg-gray-200', text: 'text-black' };
  
  // スコアに応じた発光強度
  const glowIntensity = Math.max(0, Math.min(1, kisoScore / 100));
  const glowColor = kisoScore >= 70 ? '255, 107, 107' : kisoScore >= 60 ? '255, 212, 59' : kisoScore >= 50 ? '116, 192, 252' : '200, 200, 200';

  return (
    <>
      <style jsx>{`
        .horse-icon-modern {
          position: relative;
          cursor: pointer;
          flex-shrink: 0;
        }
        
        .horse-circle {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 13px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 0 ${10 + glowIntensity * 15}px rgba(${glowColor}, ${glowIntensity * 0.6}),
                      0 4px 8px rgba(0, 0, 0, 0.2);
        }
        
        .horse-circle:hover {
          transform: scale(1.15) translateY(-4px);
          border-color: rgba(255, 255, 255, 0.6);
          box-shadow: 0 0 ${15 + glowIntensity * 20}px rgba(${glowColor}, ${glowIntensity * 0.8}),
                      0 6px 12px rgba(0, 0, 0, 0.3);
        }
        
        .surge-effect-strong {
          animation: pulse 1.5s ease-in-out infinite;
        }
        
        @keyframes pulse {
          0%, 100% { 
            box-shadow: 0 0 20px rgba(255, 107, 107, 0.6),
                        0 4px 8px rgba(0, 0, 0, 0.2);
          }
          50% { 
            box-shadow: 0 0 30px rgba(255, 107, 107, 1),
                        0 6px 12px rgba(0, 0, 0, 0.3);
          }
        }
        
        .horse-tooltip {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.95);
          color: #ffffff;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 11px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s;
          z-index: 30;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .horse-icon-modern:hover .horse-tooltip {
          opacity: 1;
        }
        
        .surge-lines-strong {
          position: absolute;
          top: -2px;
          right: -36px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          animation: surgePulse 1.5s ease-in-out infinite;
        }
        
        @keyframes surgePulse {
          0%, 100% { opacity: 0.95; transform: scaleX(1); }
          50% { opacity: 1; transform: scaleX(1.1); }
        }
        
        .surge-line {
          border-radius: 0 3px 3px 0;
          background: linear-gradient(to left, transparent, rgba(255, 149, 43, 0.95), rgba(253, 82, 82, 0.95));
          box-shadow: 0 0 8px rgba(255, 149, 43, 0.6);
        }
        
        .surge-line-1 { height: 5px; width: 36px; }
        .surge-line-2 { height: 4px; width: 32px; background: linear-gradient(to left, transparent, rgba(255, 184, 77, 0.9), rgba(255, 149, 43, 0.9)); }
        .surge-line-3 { height: 3px; width: 28px; background: linear-gradient(to left, transparent, rgba(255, 212, 100, 0.85), rgba(255, 184, 77, 0.85)); }
        .surge-line-4 { height: 3px; width: 24px; background: linear-gradient(to left, transparent, rgba(255, 235, 153, 0.75), rgba(255, 212, 100, 0.75)); }
        .surge-line-5 { height: 2px; width: 20px; background: linear-gradient(to left, transparent, rgba(255, 245, 200, 0.65), rgba(255, 235, 153, 0.65)); }
        
        .surge-lines-medium {
          position: absolute;
          top: 2px;
          right: -30px;
          display: flex;
          flex-direction: column;
          gap: 1.5px;
          animation: surgePulse 2s ease-in-out infinite;
        }
        
        .surge-line-med-1 { height: 4px; width: 30px; box-shadow: 0 0 6px rgba(255, 149, 43, 0.5); }
        .surge-line-med-2 { height: 3px; width: 26px; background: linear-gradient(to left, transparent, rgba(255, 184, 77, 0.8), rgba(255, 149, 43, 0.8)); }
        .surge-line-med-3 { height: 3px; width: 22px; background: linear-gradient(to left, transparent, rgba(255, 212, 100, 0.7), rgba(255, 184, 77, 0.7)); }
        .surge-line-med-4 { height: 2px; width: 18px; background: linear-gradient(to left, transparent, rgba(255, 235, 153, 0.6), rgba(255, 212, 100, 0.6)); }
        
        .surge-lines-weak {
          position: absolute;
          top: 4px;
          right: -24px;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        
        .surge-line-weak-1 { height: 3px; width: 24px; background: linear-gradient(to left, transparent, rgba(255, 184, 77, 0.75), rgba(255, 149, 43, 0.75)); box-shadow: 0 0 4px rgba(255, 149, 43, 0.4); }
        .surge-line-weak-2 { height: 2px; width: 20px; background: linear-gradient(to left, transparent, rgba(255, 212, 100, 0.65), rgba(255, 184, 77, 0.65)); }
        .surge-line-weak-3 { height: 2px; width: 16px; background: linear-gradient(to left, transparent, rgba(255, 235, 153, 0.55), rgba(255, 212, 100, 0.55)); }
      `}</style>
      
      <div className="horse-icon-modern">
        <div
          className={`horse-circle ${wakuColor.bg} ${wakuColor.text} ${wakuColor.border || ''} ${surgeLevel === 'strong' ? 'surge-effect-strong' : ''}`}
        >
          {horse.horseNumber}
        </div>
        
        {/* 噴射エフェクト */}
        {surgeLevel === 'strong' && (
          <div className="surge-lines-strong">
            <div className="surge-line surge-line-1"></div>
            <div className="surge-line surge-line-2"></div>
            <div className="surge-line surge-line-3"></div>
            <div className="surge-line surge-line-4"></div>
            <div className="surge-line surge-line-5"></div>
          </div>
        )}
        {surgeLevel === 'medium' && (
          <div className="surge-lines-medium">
            <div className="surge-line surge-line-med-1"></div>
            <div className="surge-line surge-line-med-2"></div>
            <div className="surge-line surge-line-med-3"></div>
            <div className="surge-line surge-line-med-4"></div>
          </div>
        )}
        {surgeLevel === 'weak' && (
          <div className="surge-lines-weak">
            <div className="surge-line surge-line-weak-1"></div>
            <div className="surge-line surge-line-weak-2"></div>
            <div className="surge-line surge-line-weak-3"></div>
          </div>
        )}
        
        {/* ツールチップ */}
        <div className="horse-tooltip">
          <strong>{horse.horseName}</strong>
          <br />
          スコア: {kisoScore.toFixed(1)}点
          <br />
          脚質: {RUNNING_STYLE_LABELS[horse.runningStyle]}
        </div>
      </div>
    </>
  );
}

