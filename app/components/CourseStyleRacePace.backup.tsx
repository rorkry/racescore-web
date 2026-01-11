'use client';

import React, { useEffect, useState } from 'react';
import type { RacePacePrediction, HorsePositionPrediction, RunningStyle } from '@/types/race-pace-types';

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

/**
 * ゴール前の位置調整を計算（大幅強化版）
 * スタート後の位置から、スコア・ペース・コース特性・脚質・枠順を総合的に考慮して大きく動かす
 */
function calculateGoalPositionAdjustment(
  startPosition: number,
  runningStyle: RunningStyle,
  kisoScore: number,
  pace: 'slow' | 'middle' | 'high',
  courseInfo: RacePacePrediction['courseInfo'],
  waku: string,
  totalHorses: number,
  isConsistentLoser?: boolean // 大敗続きフラグ
): number {
  // 大敗続きの馬は大きく後退
  if (isConsistentLoser) {
    return totalHorses * 1.8; // 最後尾よりさらに後ろに配置（1.5 → 1.8）
  }
  
  let adjustment = 0;
  const wakuNum = parseInt(waku, 10);
  let favorableFactors = 0; // 有利要素カウント
  let unfavorableFactors = 0; // 不利要素カウント
  
  // 1. 競うスコアによる調整（強化）
  // スコアが極端に低い馬は他の要素に関係なく大きく後退
  if (kisoScore > 0 && kisoScore <= 15) {
    adjustment += 6.0; // 超極端に低いスコア（4.0 → 6.0）
    unfavorableFactors += 3; // 不利要素を3つ追加
  } else if (kisoScore > 15 && kisoScore <= 25) {
    adjustment += 4.5; // 極端に低いスコアは大きく後退（4.0 → 4.5）
    unfavorableFactors += 2; // 不利要素を2つ追加
  } else if (kisoScore > 25 && kisoScore <= 35) {
    adjustment += 3.0; // 低スコアは後退（2.5 → 3.0）
    unfavorableFactors++;
  } else if (kisoScore === 0) {
    adjustment += 3.5; // データなしも大きく後退（2.0 → 3.5）
    unfavorableFactors += 2;
  } else if (kisoScore >= 70) {
    adjustment -= 5.0; // 本命は大きく前に
    favorableFactors++;
  } else if (kisoScore >= 60) {
    adjustment -= 3.5;
    favorableFactors++;
  } else if (kisoScore >= 50) {
    adjustment -= 2.0;
  } else if (kisoScore >= 40) {
    adjustment -= 1.0;
  }
  
  // 2. ペースによる調整（展開恵まれ度を厳格化 + 位置条件追加）
  if (pace === 'high') {
    // ハイペースは後方有利だが、スコアと位置の両方が必要
    if (runningStyle === 'sashi' || runningStyle === 'oikomi') {
      // スタート後位置が後方50%以上であることが条件
      const isInRearHalf = startPosition / totalHorses >= 0.5;
      
      if (kisoScore >= 60 && isInRearHalf) {
        adjustment -= 3.5; // スコア60以上＋後方位置
        favorableFactors++;
      } else if (kisoScore >= 50 && isInRearHalf) {
        adjustment -= 2.0;
      } else if (kisoScore >= 45) {
        adjustment -= 0.8; // 位置が悪くても最小限の恩恵
      }
      // スコア45未満または前方位置なら恩恵なし
    }
    // スタート後に後方にいた馬も、スコアが必要
    if (startPosition > totalHorses * 0.6) {
      if (kisoScore >= 50) {
        adjustment -= 2.5;
        favorableFactors++;
      } else if (kisoScore >= 40) {
        adjustment -= 1.2;
      }
    } else if (startPosition > totalHorses * 0.4) {
      if (kisoScore >= 45) {
        adjustment -= 1.0;
      }
    }
    // 先行馬は少しバテる
    if (runningStyle === 'escape' || runningStyle === 'lead') {
      if (startPosition < totalHorses * 0.3) {
        adjustment += 2.5;
        unfavorableFactors++;
      }
    }
  } else if (pace === 'slow') {
    // スローペースは前残りだが、スコアが低い馬は持ちこたえられない
    if (runningStyle === 'escape' || runningStyle === 'lead') {
      if (kisoScore >= 50) {
        adjustment -= 1.8;
        favorableFactors++;
      } else if (kisoScore >= 40) {
        adjustment -= 0.8;
      }
      // スコア40未満は前残り恩恵なし
    }
    // スタート後に前にいた馬も、スコアが必要
    if (startPosition < totalHorses * 0.3) {
      if (kisoScore >= 45) {
        adjustment -= 1.8;
        favorableFactors++;
      } else if (kisoScore >= 35) {
        adjustment -= 0.7;
      }
    }
    // 後方の馬は届きにくい
    if (runningStyle === 'sashi' || runningStyle === 'oikomi') {
      adjustment += 1.8;
      unfavorableFactors++;
    }
  } else {
    // ミドルペース：バランス型、スコアがより重要
    if (runningStyle === 'sashi') {
      if (kisoScore >= 50) {
        adjustment -= 1.2;
      } else if (kisoScore >= 40) {
        adjustment -= 0.5;
      }
    }
  }
  
  // 3. コース特性による調整（強化）
  if (courseInfo) {
    // 直線が長い（500m以上）= 差し有利
    if (courseInfo.straightLength >= 500) {
      if (runningStyle === 'sashi' || runningStyle === 'oikomi') {
        adjustment -= 2.5; // 1.5 → 2.5
        favorableFactors++;
      }
      // 前に行き過ぎた馬は届かれやすい
      if (runningStyle === 'escape' && startPosition < totalHorses * 0.2) {
        adjustment += 1.8; // 1.0 → 1.8
        unfavorableFactors++;
      }
    }
    
    // 直線が短い（350m未満）= 先行有利
    if (courseInfo.straightLength < 350) {
      if (runningStyle === 'escape' || runningStyle === 'lead') {
        adjustment -= 1.8; // 1.0 → 1.8
        favorableFactors++;
      }
      if (runningStyle === 'oikomi' && startPosition > totalHorses * 0.7) {
        adjustment += 2.5; // 1.5 → 2.5（追込は届きにくい）
        unfavorableFactors++;
      }
    }
    
    // 外枠有利なコースで外枠の差し・追込馬（強化）
    if (courseInfo.outerFrameAdvantage < -0.3 && wakuNum >= 6) {
      if (runningStyle === 'sashi' || runningStyle === 'oikomi') {
        adjustment -= 2.0; // 1.2 → 2.0
        favorableFactors++; // 枠有利
      }
    }
    
    // 内枠有利なコースで内枠の先行馬（強化）
    if (courseInfo.innerFrameAdvantage < -0.5 && wakuNum <= 3) {
      if (runningStyle === 'escape' || runningStyle === 'lead') {
        adjustment -= 1.5; // 0.8 → 1.5
        favorableFactors++; // 枠有利
      }
    }
    
    // 外枠不利なコースで外枠（ペナルティ強化）
    if (courseInfo.outerFrameAdvantage > 0.5 && wakuNum >= 7) {
      adjustment += 2.0;
      unfavorableFactors++; // 枠不利
    }
    
    // 内枠不利なコースで内枠（ペナルティ強化）
    if (courseInfo.innerFrameAdvantage > 0.5 && wakuNum <= 2) {
      adjustment += 1.5;
      unfavorableFactors++; // 枠不利
    }
    
    // ゴール前に坂があるコースは先行有利（強化）
    if (courseInfo.hasSlope && courseInfo.slopePosition === 'finish') {
      if (runningStyle === 'escape' || runningStyle === 'lead') {
        adjustment -= 1.5; // 0.8 → 1.5
        favorableFactors++;
      }
      if (runningStyle === 'oikomi') {
        adjustment += 1.0; // 0.5 → 1.0（追込は苦しい）
        unfavorableFactors++;
      }
    }
  }
  
  // 4. 総合判定ボーナス：すべての要素が向いている馬はさらに大きく前へ
  if (favorableFactors >= 3) {
    // 3つ以上の有利要素 → 先頭争い
    adjustment -= 3.0;
  } else if (favorableFactors >= 2) {
    // 2つの有利要素 → 上位争い
    adjustment -= 1.5;
  }
  
  // 不利要素が多い馬はさらに後退（強化）
  if (unfavorableFactors >= 4) {
    adjustment += 6.0; // 4つ以上は完全に見込みなし
  } else if (unfavorableFactors >= 3) {
    adjustment += 4.5; // 4.0 → 4.5
  } else if (unfavorableFactors >= 2) {
    adjustment += 2.5; // 2.0 → 2.5
  }
  
  // スコアが極端に低い馬は、有利要素があっても後退させる（強化）
  if (kisoScore > 0 && kisoScore <= 20) {
    // 超低スコア馬：有利要素を完全に無効化
    if (favorableFactors >= 2) {
      adjustment += 4.0; // 有利要素による前進を完全に相殺＋さらに後退
    } else if (favorableFactors >= 1) {
      adjustment += 2.0;
    }
  } else if (kisoScore > 20 && kisoScore <= 30) {
    // 低スコア馬：有利要素を大幅に減衰
    if (favorableFactors >= 2) {
      adjustment += 3.0;
    } else if (favorableFactors >= 1) {
      adjustment += 1.5;
    }
  }
  
  return adjustment;
}

export default function CourseStyleRacePace({
  year,
  date,
  place,
  raceNumber,
  kisouScores = {},
}: Props) {
  const raceKey = `${year}${date}_${place}_${raceNumber}`;
  
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
  
  const [prediction, setPrediction] = useState<RacePacePrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // バイアス変更時にlocalStorageに保存
  const handleBiasChange = (newBias: typeof bias) => {
    setBias(newBias);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`bias_${raceKey}`, newBias);
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

  // 馬名を短縮
  const shortenHorseName = (name: string) => {
    if (name.length <= 4) return name;
    return name.substring(0, 4);
  };

  // スタート後（2C付近）の隊列 = expectedPosition2Cでソート済み
  const startPosition = [...prediction.predictions].sort((a, b) => a.expectedPosition2C - b.expectedPosition2C);
  
  // ゴール前（4C〜ゴール）の隊列 = スコア・ペース・コース特性を考慮
  // 全頭の斤量平均を計算（相対評価用）
  const avgKinryo = prediction.predictions.reduce((sum, h) => sum + h.kinryo, 0) / prediction.predictions.length;
  
  const goalPosition = prediction.predictions.map(horse => {
    const kisoScore = kisouScores?.[horse.horseNumber] || 0;
    
    // 斤量の相対評価（平均より軽い→有利、重い→不利）
    let kinryoAdjustment = 0;
    const kinryoDiff = horse.kinryo - avgKinryo;
    if (kinryoDiff <= -2.0) {
      // 平均より2kg以上軽い → 大きく有利
      kinryoAdjustment = -2.5;
    } else if (kinryoDiff <= -1.0) {
      // 平均より1kg以上軽い → 有利
      kinryoAdjustment = -1.5;
    } else if (kinryoDiff <= -0.5) {
      // 平均よりやや軽い → やや有利
      kinryoAdjustment = -0.8;
    } else if (kinryoDiff >= 2.0) {
      // 平均より2kg以上重い → 大きく不利
      kinryoAdjustment = +2.5;
    } else if (kinryoDiff >= 1.0) {
      // 平均より1kg以上重い → 不利
      kinryoAdjustment = +1.5;
    } else if (kinryoDiff >= 0.5) {
      // 平均よりやや重い → やや不利
      kinryoAdjustment = +0.8;
    }
    
    const goalAdjustment = calculateGoalPositionAdjustment(
      horse.expectedPosition2C,
      horse.runningStyle,
      kisoScore,
      prediction.expectedPace,
      prediction.courseInfo,
      horse.waku,
      prediction.predictions.length,
      horse.isConsistentLoser // 大敗続きフラグを渡す
    ) + kinryoAdjustment; // 斤量補正を加算
    // 当日の馬場バイアス補正
    let biasAdjust = 0;
    const wakuNum = parseInt(horse.waku, 10);
    switch (bias) {
      case 'uchi-mae':
        biasAdjust += wakuNum <= 2 ? -1.2 : +0.6;
        if (horse.runningStyle === 'escape' || horse.runningStyle === 'lead') biasAdjust -= 0.6;
        break;
      case 'soto-mae':
        biasAdjust += wakuNum >= 7 ? -1.2 : +0.6;
        if (horse.runningStyle === 'escape' || horse.runningStyle === 'lead') biasAdjust -= 0.6;
        break;
      case 'mae':
        if (horse.runningStyle === 'escape' || horse.runningStyle === 'lead') biasAdjust -= 1.0;
        else biasAdjust += 0.6;
        break;
      case 'ushiro':
        if (horse.runningStyle === 'sashi' || horse.runningStyle === 'oikomi') biasAdjust -= 1.0;
        else biasAdjust += 0.6;
        break;
      case 'uchi':
        biasAdjust += wakuNum <= 2 ? -1.0 : 0;
        biasAdjust += wakuNum >= 7 ? +0.8 : 0;
        break;
      case 'soto':
        biasAdjust += wakuNum >= 7 ? -1.0 : 0;
        biasAdjust += wakuNum <= 2 ? +0.8 : 0;
        break;
      case 'soto-ushiro':
        biasAdjust += wakuNum >= 7 ? -0.8 : 0;
        if (horse.expectedPosition2C > prediction.predictions.length * 0.5) biasAdjust -= 0.6;
        break;
      case 'none':
      default:
        break;
    }

    let calculatedGoalPosition = horse.expectedPosition2C + goalAdjustment + biasAdjust;
    
    // スコア別の最大前進制限を適用
    const positionGain = horse.expectedPosition2C - calculatedGoalPosition;
    let maxAdvance = 10.0; // デフォルト
    
    if (kisoScore === 0) {
      maxAdvance = 0; // データなしは前進不可
    } else if (kisoScore <= 20) {
      maxAdvance = 1.5;
    } else if (kisoScore <= 30) {
      maxAdvance = 2.5;
    } else if (kisoScore <= 40) {
      maxAdvance = 3.5;
    } else if (kisoScore <= 50) {
      maxAdvance = 4.5;
    } else if (kisoScore <= 60) {
      maxAdvance = 6.0;
    } else if (kisoScore <= 70) {
      maxAdvance = 8.0;
    } else {
      maxAdvance = 10.0;
    }
    
    // 最大前進を超える場合は制限
    if (positionGain > maxAdvance) {
      calculatedGoalPosition = horse.expectedPosition2C - maxAdvance;
    }

    return {
      ...horse,
      expectedPositionGoal: calculatedGoalPosition,
    };
  }).sort((a, b) => (a.expectedPositionGoal || 0) - (b.expectedPositionGoal || 0));

  // 来る可能性が高い馬を特定（総合評価＋強度判定）【厳格化】
  const surgeHorses = new Map<number, 'strong' | 'medium' | 'weak'>();
  goalPosition.forEach((g, index) => {
    const startPos = startPosition.find(s => s.horseNumber === g.horseNumber);
    if (startPos && g.expectedPositionGoal) {
      const positionGain = startPos.expectedPosition2C - g.expectedPositionGoal;
      const kisoScore = kisouScores?.[g.horseNumber] || 0;
      
      // スコアが低い馬は絶対に浮上させない
      if (kisoScore < 40) {
        return; // マーキング対象外
      }
      
      // 強度判定：噴射の量に反映（厳格化）
      // 【強】スコア70以上 かつ 大きく前進（6.0以上）または ゴール1-2位
      if (kisoScore >= 70 && (positionGain >= 6.0 || index < 2)) {
        surgeHorses.set(g.horseNumber, 'strong');
      }
      // 【中】スコア60以上 かつ 中程度前進（4.5以上）または ゴール3位以内
      else if (kisoScore >= 60 && (positionGain >= 4.5 || index < 3)) {
        surgeHorses.set(g.horseNumber, 'medium');
      }
      // 【弱】スコア50以上 かつ やや前進（3.5以上）または ゴール5位以内
      else if (kisoScore >= 50 && (positionGain >= 3.5 || index < 5)) {
        surgeHorses.set(g.horseNumber, 'weak');
      }
    }
  });

  // 横方向の配置用に、位置に応じてX座標を計算
  const calculateHorseLayout = (
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

      // 縦位置：レーン段差＋少し揺らす（上段優先、内側を上に詰める）
      const jitterOffset = (Math.random() * jitter * 2 - jitter);
      const yOffset = chosenLane * laneHeight + jitterOffset;

      return {
        horse,
        xPercent,
        yOffset,
      };
    });
  };

  const startLayout = calculateHorseLayout(startPosition, false);
  const goalLayout = calculateHorseLayout(goalPosition, true);

  return (
    <div id={`race-pace-${raceKey}`} className="bg-white rounded-lg shadow p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <h3 className="text-lg font-bold">🏇 AI展開予想</h3>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
          <span className="text-gray-600">
            ペース: 
            <span className={`ml-1 sm:ml-2 px-2 sm:px-3 py-1 rounded text-white font-bold ${PACE_COLORS[prediction.expectedPace]}`}>
              {PACE_LABELS[prediction.expectedPace]}
            </span>
          </span>
          <span className="text-gray-600">
            先行: <span className="font-bold">{prediction.frontRunners}頭</span>
          </span>
          {prediction.avgFront2FLap && (
            <span className="text-gray-600">
              前半2F: <span className="font-bold">{prediction.avgFront2FLap.toFixed(1)}秒</span>
            </span>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-gray-600">馬場バイアス:</span>
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
                className={`px-2 py-1 rounded text-xs border ${
                  bias === opt.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 芝生背景のコース図 */}
      <div className="relative bg-gradient-to-b from-green-600 to-green-700 rounded-lg p-2 sm:p-3 mb-4">
        {/* 2列構成：スタート後 | ゴール前（スマホは縦並び） */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {/* 左側：スタート後（2C付近） */}
          <div className="relative">
            <div className="relative bg-green-800 bg-opacity-30 rounded-lg p-2 min-h-[160px]">
              {/* タイトル：左下に配置 */}
              <div className="absolute bottom-1 left-1 text-white font-bold text-[10px] bg-black bg-opacity-50 px-2 py-0.5 rounded z-10">
                スタート後
              </div>
              {/* 進行方向（邪魔しない程度に） */}
              <div className="absolute bottom-1 right-1 text-white text-[10px] opacity-40 flex items-center gap-0.5">
                <span>←</span>
                <span className="text-[8px]">進行方向</span>
              </div>
              
              {/* 馬の配置（横方向に展開） */}
              <div className="relative h-full pt-6">
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
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 右側：ゴール前（4C〜ゴール） */}
          <div className="relative">
            <div className="relative bg-green-800 bg-opacity-30 rounded-lg p-2 min-h-[160px]">
              {/* タイトル：左下に配置 */}
              <div className="absolute bottom-1 left-1 text-white font-bold text-[10px] bg-black bg-opacity-50 px-2 py-0.5 rounded z-10">
                ゴール前
              </div>
              {/* 進行方向（邪魔しない程度に） */}
              <div className="absolute bottom-1 right-1 text-white text-[10px] opacity-40 flex items-center gap-0.5">
                <span>←</span>
                <span className="text-[8px]">ゴール</span>
              </div>
              
              {/* 馬の配置（横方向に展開） */}
              <div className="relative h-full pt-6">
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
                    />
                  </div>
                ))}
              </div>
              
              {/* ゴールライン */}
              <div className="absolute right-0 top-0 bottom-0 w-1 bg-white opacity-50"></div>
            </div>
          </div>
        </div>
      </div>

      {/* 凡例 */}
      <div className="border-t pt-2 sm:pt-3 space-y-1 sm:space-y-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-6 text-xs sm:text-sm text-gray-600">
          <span>⭐ = 本命（スコア上位3頭）</span>
          <span>→ = 展開狙い（差し・追込＋スコア30以上）</span>
        </div>
        <div className="text-[10px] sm:text-xs text-gray-500">
          ※ 横方向が前後関係、ほぼ同じ位置の馬のみ縦に並ぶ（最大2頭）
        </div>
        <div className="text-[10px] sm:text-xs text-gray-500">
          ※ 過去の通過順位、前半2Fラップ（最優先）、コース特性、距離変更を考慮
        </div>
      </div>
    </div>
  );
}

// 馬アイコンコンポーネント
function HorseIcon({
  horse,
  surgeLevel,
  shortenName,
  size = 'normal',
}: {
  horse: HorsePositionPrediction;
  surgeLevel: 'strong' | 'medium' | 'weak' | null;
  shortenName: (name: string) => string;
  size?: 'tiny' | 'small' | 'normal';
}) {
  const wakuColor = WAKU_COLORS[horse.waku] || { bg: 'bg-gray-200', text: 'text-black' };
  
  // サイズに応じたクラス
  const sizeClasses = size === 'tiny'
    ? 'w-8 h-8 text-xs'
    : size === 'small' 
    ? 'w-10 h-10 text-base' 
    : 'w-14 h-14 text-xl';
  
  const markSize = size === 'tiny' ? 'text-sm' : size === 'small' ? 'text-lg' : 'text-2xl';

  return (
    <div
      className="relative group cursor-pointer flex-shrink-0"
      title={`${horse.horseName} (${RUNNING_STYLE_LABELS[horse.runningStyle]}) - 予想位置: ${horse.expectedPosition2C.toFixed(1)}番手`}
    >
      {/* 馬のアイコン（円形） */}
      <div
        className={`
          ${sizeClasses} rounded-full flex items-center justify-center
          ${wakuColor.bg} ${wakuColor.text} ${wakuColor.border || 'border-2 border-white'}
          font-bold shadow-lg
          transform transition-transform group-hover:scale-110
        `}
      >
        {horse.horseNumber}
      </div>
      
      {/* 来る可能性が高い馬のエフェクト（右側に噴射） */}
      {surgeLevel && (
        <>
          {/* 噴射ライン（右側＝後方から）強度に応じて本数・長さを変更 */}
          {surgeLevel === 'strong' && (
            <div className="absolute top-0 -right-7 flex flex-col gap-px">
              <div className="h-1 w-7 bg-gradient-to-l from-transparent via-orange-500 to-red-600 opacity-95 rounded-r"></div>
              <div className="h-0.5 w-6 bg-gradient-to-l from-transparent via-orange-400 to-orange-500 opacity-85 rounded-r"></div>
              <div className="h-0.5 w-5 bg-gradient-to-l from-transparent via-yellow-400 to-orange-400 opacity-80 rounded-r"></div>
              <div className="h-px w-4 bg-gradient-to-l from-transparent via-yellow-300 to-yellow-400 opacity-70 rounded-r"></div>
            </div>
          )}
          {surgeLevel === 'medium' && (
            <div className="absolute top-1 -right-6 flex flex-col gap-px">
              <div className="h-0.5 w-6 bg-gradient-to-l from-transparent via-orange-400 to-orange-500 opacity-85 rounded-r"></div>
              <div className="h-0.5 w-5 bg-gradient-to-l from-transparent via-yellow-400 to-orange-400 opacity-75 rounded-r"></div>
              <div className="h-px w-4 bg-gradient-to-l from-transparent via-yellow-300 to-yellow-400 opacity-65 rounded-r"></div>
            </div>
          )}
          {surgeLevel === 'weak' && (
            <div className="absolute top-1 -right-5 flex flex-col gap-px">
              <div className="h-0.5 w-5 bg-gradient-to-l from-transparent via-yellow-400 to-orange-400 opacity-70 rounded-r"></div>
              <div className="h-px w-4 bg-gradient-to-l from-transparent via-yellow-300 to-yellow-400 opacity-60 rounded-r"></div>
            </div>
          )}
          {/* 光る円（アニメーション・強度で調整） */}
          {surgeLevel === 'strong' && (
            <div className="absolute inset-0 rounded-full border-2 border-orange-500 animate-ping opacity-60"></div>
          )}
        </>
      )}
      
      {/* 馬名（ホバー時に表示） */}
      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-90 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap z-20">
        {horse.horseName}
      </div>
    </div>
  );
}






