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
  // 2. 速度・距離を更新（追い込み力に基づく）
  // ========================================
  const straightDistance = courseInfo?.straightLength || 400;
  
  for (const horse of horses) {
    // finalChaseScoreを速度に変換
    const chaseScore = (horse as any).finalChaseScore || horse.capabilities.acceleration;
    
    // 直線での速度（m/s）
    // chaseScore 0-100 → velocity 14-20 m/s
    const straightVelocity = 14 + (chaseScore / 100) * 6;
    horse.currentVelocity = straightVelocity;
    
    // 直線での走行距離を加算
    const straightTime = straightDistance / straightVelocity;
    horse.currentDistance += straightDistance;
  }
  
  // ========================================
  // 3. 最終順位を計算（currentDistanceで）
  // ========================================
  const sortedHorses = [...horses].sort((a, b) => b.currentDistance - a.currentDistance);
  
  // 順位を更新
  sortedHorses.forEach((h, idx) => {
    const prevPosition = h.position;
    h.position = idx + 1;
    
    // 順位変動をイベントに記録
    if (h.position < prevPosition) {
      const gain = prevPosition - h.position;
      events.push({
        horseNumber: h.horseNumber,
        horseName: h.horseName,
        event: 'overtake',
        description: `追い込んで${gain}頭抜き（${prevPosition}番手→${h.position}番手）`
      });
    }
  });
  
  // distanceFromLeaderを計算
  const leadHorse = sortedHorses[0];
  for (const horse of sortedHorses) {
    horse.distanceFromLeader = leadHorse.currentDistance - horse.currentDistance;
  }
  
  const avgVelocity = sortedHorses.reduce((sum, h) => sum + h.currentVelocity, 0) / sortedHorses.length;
  const straightTime = straightDistance / avgVelocity;
  const prevPhaseTime = prevPhase.timeRange.end;
  
  console.log('[StraightPhase] === 直線フェーズ完了 ===');
  console.log(`  直線距離: ${straightDistance}m, 平均速度: ${avgVelocity.toFixed(1)}m/s, 所要時間: ${straightTime.toFixed(1)}秒`);
  sortedHorses.slice(0, 5).forEach(h => {
    console.log(`  ${h.position}着: ${h.horseName} (距離=${h.currentDistance.toFixed(1)}m, 速度=${h.currentVelocity.toFixed(1)}m/s)`);
  });
  
  // 先頭グループを特定
  const leadingHorses = sortedHorses
    .filter(h => h.position <= 3)
    .map(h => h.horseNumber);
  
  const straightStart = courseInfo?.distance ? courseInfo.distance - courseInfo.straightLength : 1400;
  const goalDistance = courseInfo?.distance || 1600;
  
  return {
    phaseName: '直線〜ゴール',
    distanceRange: { start: straightStart, end: goalDistance },
    timeRange: { start: prevPhaseTime, end: prevPhaseTime + straightTime },
    horses: sortedHorses,
    paceInfo: {
      averageSpeed: avgVelocity,
      leadingHorses,
      paceType,
    },
    events,
  };
}
