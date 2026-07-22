/**
 * 直線フェーズエンジン
 * 
 * 直線〜ゴール
 * 
 * 処理内容:
 * 1. 前が詰まっている場合、acceleration -30%
 * 2. ペース別調整（ハイ=前が止まる、スロー=前残り）
 * 3. 能力偏差値で追い上げ
 * 4. 馬場バイアス（前残り/差し）を適用
 * 5. スタミナ切れチェック
 */

import type { HorseState, PhaseResult, SimulationEvent, TrackBias, CourseInfo } from '@/types/race-simulator';

export interface StraightPhaseInput {
  horses: HorseState[];
  paceType: 'slow' | 'middle' | 'high';
  trackBias?: TrackBias;
  courseInfo: CourseInfo | null;
  totalHorses: number;
}

/**
 * 直線フェーズを実行
 */
export function executeStraightPhase(
  input: StraightPhaseInput,
  prevPhase: PhaseResult
): PhaseResult {
  const { horses, paceType, trackBias, courseInfo, totalHorses } = input;
  
  console.log('[StraightPhase] === 直線フェーズ開始 ===');
  console.log(`  ペース: ${paceType}`);
  console.log(`  馬場バイアス: 前残り${trackBias?.frontBias || 0}, 差し${trackBias?.rearBias || 0}`);
  
  const events: SimulationEvent[] = [];
  
  // ========================================
  // 1. 各馬の追い込み力を計算
  // ========================================
  for (const horse of horses) {
    // ----------------------------------------
    // 基本追い込み力
    // ----------------------------------------
    let chaseScore = horse.capabilities.acceleration;
    
    // ----------------------------------------
    // スタミナチェック
    // ----------------------------------------
    if (horse.staminaRemaining < 20) {
      // スタミナ切れ: 大幅失速
      chaseScore *= 0.3;
      
      events.push({
        horseNumber: horse.horseNumber,
        horseName: horse.horseName,
        event: 'stamina-loss',
        description: 'スタミナ切れで失速'
      });
      
      console.log(`[StraightPhase] ${horse.horseName}: スタミナ切れ（残${horse.staminaRemaining.toFixed(0)}%）`);
    } else if (horse.staminaRemaining < 40) {
      // スタミナ不足: やや失速
      chaseScore *= 0.7;
    }
    
    // ----------------------------------------
    // 前が詰まっているか判定
    // ----------------------------------------
    const horsesInFront = horses.filter(h => h.position < horse.position).length;
    
    if (horse.position <= 5 && horsesInFront >= 3) {
      // 前に3頭以上 → 追い込みにくい
      chaseScore *= 0.7;
      horse.blocked = true;
      
      events.push({
        horseNumber: horse.horseNumber,
        horseName: horse.horseName,
        event: 'blocked',
        description: '前が詰まり、追い込み苦戦'
      });
      
      console.log(`[StraightPhase] ${horse.horseName}: 前が詰まっている（前${horsesInFront}頭）`);
    }
    
    // ----------------------------------------
    // 外を回っている場合、距離ロス
    // ----------------------------------------
    if (horse.outerPath) {
      chaseScore *= 0.9;
      console.log(`[StraightPhase] ${horse.horseName}: 外回りで距離ロス`);
    }
    
    // ----------------------------------------
    // ペース別調整
    // ----------------------------------------
    if (paceType === 'high') {
      // ハイペース: 前が止まる → 後方有利
      if (horse.position <= 3) {
        // 先行馬はペナルティ
        chaseScore *= 0.8;
        console.log(`[StraightPhase] ${horse.horseName}: ハイペースで先行、失速気味`);
      } else if (horse.position >= totalHorses * 0.6) {
        // 後方馬は有利
        chaseScore *= 1.3;
        console.log(`[StraightPhase] ${horse.horseName}: ハイペース後方、追い込み有利`);
      }
    } else if (paceType === 'slow') {
      // スローペース: 前残り → 先行有利
      if (horse.position <= 3) {
        // 先行馬は有利
        chaseScore *= 1.2;
        console.log(`[StraightPhase] ${horse.horseName}: スローペースで先行、前残り`);
      } else if (horse.position >= totalHorses * 0.6) {
        // 後方馬はペナルティ
        chaseScore *= 0.7;
        console.log(`[StraightPhase] ${horse.horseName}: スローペース後方、届かず`);
      }
    }
    
    // ----------------------------------------
    // 馬場バイアスを適用
    // ----------------------------------------
    if (trackBias) {
      const { frontBias, rearBias, innerBias, outerBias } = trackBias;
      
      // 前残りバイアス
      if (frontBias > 0 && horse.position <= 3) {
        chaseScore *= (1 + frontBias / 20); // frontBias=10 → 1.5倍
        console.log(`[StraightPhase] ${horse.horseName}: 馬場前残りで有利`);
      } else if (frontBias < 0 && horse.position <= 3) {
        chaseScore *= (1 + frontBias / 20); // frontBias=-10 → 0.5倍
      }
      
      // 差しバイアス
      if (rearBias > 0 && horse.position >= totalHorses * 0.5) {
        chaseScore *= (1 + rearBias / 20);
        console.log(`[StraightPhase] ${horse.horseName}: 馬場差し有利`);
      }
      
      // 内外バイアス
      if (innerBias > 0 && horse.internalLane <= 3) {
        chaseScore *= (1 + innerBias / 30);
      } else if (outerBias > 0 && horse.internalLane >= 6) {
        chaseScore *= (1 + outerBias / 30);
      }
    }
    
    // ----------------------------------------
    // 坂の影響
    // ----------------------------------------
    if (courseInfo?.slopes) {
      for (const slope of courseInfo.slopes) {
        // 直線に坂がある場合
        if (slope.type === 'up') {
          // 上り坂: staminaが重要
          const staminaFactor = horse.capabilities.stamina / 100;
          chaseScore *= (0.8 + staminaFactor * 0.4); // stamina100 → 1.2倍, stamina50 → 1.0倍
        }
      }
    }
    
    // ----------------------------------------
    // 追い込みスコアを保存（後で順位計算に使用）
    // ----------------------------------------
    (horse as any).finalChaseScore = chaseScore;
    
    console.log(`[StraightPhase] ${horse.horseName}: 追い込み力=${chaseScore.toFixed(0)} (base=${horse.capabilities.acceleration})`);
  }
  
  // ========================================
  // 2. 最終順位を計算
  // ========================================
  // 現在の position と finalChaseScore を組み合わせて最終順位を決定
  
  const finalScores = horses.map(horse => {
    const positionAdvantage = (totalHorses - horse.position + 1) * 5; // 前にいるほど有利
    const finalScore = positionAdvantage + (horse as any).finalChaseScore;
    
    return {
      horse,
      finalScore,
    };
  });
  
  // スコアでソート（高い方が上位）
  finalScores.sort((a, b) => b.finalScore - a.finalScore);
  
  // 最終順位を割り当て
  finalScores.forEach((item, idx) => {
    const prevPosition = item.horse.position;
    item.horse.position = idx + 1;
    
    // 順位変動をイベントに記録
    if (item.horse.position < prevPosition) {
      const gain = prevPosition - item.horse.position;
      events.push({
        horseNumber: item.horse.horseNumber,
        horseName: item.horse.horseName,
        event: 'overtake',
        description: `追い込んで${gain}頭抜き（${prevPosition}番手→${item.horse.position}番手）`
      });
    }
  });
  
  const sortedHorses = finalScores.map(item => item.horse);
  
  console.log('[StraightPhase] === 直線フェーズ完了 ===');
  sortedHorses.slice(0, 5).forEach(h => {
    console.log(`  ${h.position}着: ${h.horseName} (追込力=${((h as any).finalChaseScore || 0).toFixed(0)})`);
  });
  
  // 先頭グループを特定
  const leadingHorses = sortedHorses
    .filter(h => h.position <= 3)
    .map(h => h.horseNumber);
  
  return {
    phaseName: '直線〜ゴール',
    distanceRange: { start: courseInfo?.distance ? courseInfo.distance - courseInfo.straightLength : 1400, end: courseInfo?.distance || 1600 },
    horses: sortedHorses,
    paceInfo: {
      averageSpeed: 0,
      leadingHorses,
      paceType,
    },
    events,
  };
}
