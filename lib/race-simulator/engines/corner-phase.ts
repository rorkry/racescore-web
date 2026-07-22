/**
 * 3-4コーナーフェーズエンジン
 * 
 * 3-4コーナー通過
 * 
 * 処理内容:
 * 1. コーナーで外を回ることによる追加走行距離
 * 2. 内外レーンによる距離差
 * 3. 馬群による進路制限
 * 4. レーン変更
 * 5. 加速開始のタイミング
 * 6. スタミナ消費
 * 7. 坂がある場合の速度補正
 */

import type { HorseState, PhaseResult, SimulationEvent, CourseInfo } from '@/types/race-simulator';

export interface CornerPhaseInput {
  horses: HorseState[];
  courseInfo: CourseInfo | null;
  totalHorses: number;
  straightStart: number; // 直線開始地点
}

/**
 * 3-4コーナーフェーズを実行
 */
export function executeCornerPhase(
  input: CornerPhaseInput,
  prevPhase: PhaseResult
): PhaseResult {
  const { horses, courseInfo, totalHorses, straightStart } = input;
  
  const phaseStart = 600;
  const phaseEnd = straightStart;
  const cornerDistance = phaseEnd - phaseStart;
  
  console.log('[CornerPhase] === 3-4コーナーフェーズ開始 ===');
  console.log(`  距離: ${phaseStart}m - ${phaseEnd}m (${cornerDistance}m)`);
  
  const events: SimulationEvent[] = [];
  
  // ========================================
  // 1. コーナーでの基本速度（やや減速）
  // ========================================
  const baseCornerVelocity = 15.0; // コーナー巡航速度
  
  for (const horse of horses) {
    // コーナリングスキルによる速度補正
    const cornerSkillFactor = 1 + (horse.capabilities.cornerSkill - 50) / 100 * 0.2;
    let cornerVelocity = baseCornerVelocity * cornerSkillFactor;
    
    // ========================================
    // 2. 坂の影響
    // ========================================
    if (courseInfo?.slopes) {
      for (const slope of courseInfo.slopes) {
        if (slope.start >= phaseStart && slope.end <= phaseEnd) {
          // コーナー区間内に坂がある
          if (slope.type === 'up') {
            // 上り坂: スタミナで速度が変わる
            const staminaFactor = horse.staminaRemaining / 100;
            const slopeEffect = 1 - (slope.gradient / 100) * 0.5 * (1 - staminaFactor);
            cornerVelocity *= slopeEffect;
            
            console.log(`[CornerPhase] ${horse.horseName}: 上り坂影響 ${(slopeEffect * 100).toFixed(0)}%`);
          } else {
            // 下り坂: やや加速
            cornerVelocity *= 1.05;
          }
        }
      }
    }
    
    // ========================================
    // 3. 内外レーンによる距離差
    // ========================================
    // 外を回るほど距離が伸びる
    let extraDistance = 0;
    
    if (horse.outerPath || horse.lateralPosition > 5) {
      // 外回り: 追加距離
      const outerFactor = Math.abs(horse.lateralPosition) / 10;
      extraDistance = cornerDistance * 0.02 * outerFactor; // 最大2%増
      
      events.push({
        horseNumber: horse.horseNumber,
        horseName: horse.horseName,
        event: 'cut-in',
        description: `外回りで距離+${extraDistance.toFixed(1)}m`
      });
      
      console.log(`[CornerPhase] ${horse.horseName}: 外回り +${extraDistance.toFixed(1)}m`);
    } else if (horse.lateralPosition < -5) {
      // 内寄り: やや距離短縮
      extraDistance = -cornerDistance * 0.01;
      console.log(`[CornerPhase] ${horse.horseName}: 内寄り ${extraDistance.toFixed(1)}m`);
    }
    
    // ========================================
    // 4. 馬群による進路制限
    // ========================================
    const horsesAhead = horses.filter(h => 
      h.currentDistance > horse.currentDistance &&
      h.currentDistance - horse.currentDistance < 5 && // 5m以内
      Math.abs(h.lateralPosition - horse.lateralPosition) < 3 // 横3m以内
    );
    
    if (horsesAhead.length > 0) {
      // 前が詰まっている: 減速
      cornerVelocity *= 0.95;
      horse.blocked = true;
      
      console.log(`[CornerPhase] ${horse.horseName}: 前方に${horsesAhead.length}頭、減速`);
    } else {
      horse.blocked = false;
    }
    
    // ========================================
    // 5. レーン変更の判定
    // ========================================
    if (horse.blocked && !horse.outerPath) {
      // 前が詰まっているので外へ出す
      const prevLateral = horse.lateralPosition;
      horse.lateralPosition += 2; // 2m外へ
      horse.outerPath = true;
      
      events.push({
        horseNumber: horse.horseNumber,
        horseName: horse.horseName,
        event: 'cut-in',
        description: `進路変更: 内→外 (${prevLateral.toFixed(1)}m → ${horse.lateralPosition.toFixed(1)}m)`
      });
      
      console.log(`[CornerPhase] ${horse.horseName}: 外へ進路変更`);
    }
    
    // ========================================
    // 6. 加速開始の判定（直線が近い）
    // ========================================
    const distanceToStraight = phaseEnd - horse.currentDistance;
    
    if (distanceToStraight < 100 && horse.staminaRemaining > 30) {
      // 直線手前100mから加速開始
      const accelerationFactor = 1 + (horse.capabilities.acceleration / 100) * 0.15;
      cornerVelocity *= accelerationFactor;
      
      events.push({
        horseNumber: horse.horseNumber,
        horseName: horse.horseName,
        event: 'accelerate',
        description: `直線手前で加速開始（残${distanceToStraight.toFixed(0)}m）`
      });
      
      console.log(`[CornerPhase] ${horse.horseName}: 加速開始`);
    }
    
    // ========================================
    // 7. スタミナ消費
    // ========================================
    let staminaConsumption = 12; // 基本消費
    
    if (horse.position <= totalHorses * 0.3) {
      // 先行馬
      staminaConsumption = 15;
    } else if (horse.outerPath) {
      // 外回り
      staminaConsumption = 14;
    }
    
    horse.staminaRemaining = Math.max(0, horse.staminaRemaining - staminaConsumption);
    
    if (horse.staminaRemaining < 20) {
      events.push({
        horseNumber: horse.horseNumber,
        horseName: horse.horseName,
        event: 'stamina-loss',
        description: `スタミナ低下（残${horse.staminaRemaining.toFixed(0)}%）`
      });
    }
    
    // ========================================
    // 8. 走行距離と速度を更新
    // ========================================
    horse.currentVelocity = cornerVelocity;
    
    const actualCornerDistance = cornerDistance + extraDistance;
    const cornerTime = actualCornerDistance / cornerVelocity;
    horse.currentDistance += actualCornerDistance;
  }
  
  // ========================================
  // 9. 順位を再計算（currentDistanceで）
  // ========================================
  const sortedHorses = [...horses].sort((a, b) => b.currentDistance - a.currentDistance);
  
  sortedHorses.forEach((h, idx) => {
    h.position = idx + 1;
  });
  
  // distanceFromLeaderを計算
  const leadHorse = sortedHorses[0];
  for (const horse of sortedHorses) {
    horse.distanceFromLeader = leadHorse.currentDistance - horse.currentDistance;
  }
  
  const avgVelocity = sortedHorses.reduce((sum, h) => sum + h.currentVelocity, 0) / sortedHorses.length;
  const phaseTime = cornerDistance / avgVelocity;
  const prevPhaseTime = prevPhase.timeRange.end;
  
  console.log('[CornerPhase] === 3-4コーナーフェーズ完了 ===');
  console.log(`  平均速度: ${avgVelocity.toFixed(1)}m/s, 所要時間: ${phaseTime.toFixed(1)}秒`);
  sortedHorses.slice(0, 5).forEach(h => {
    console.log(`  ${h.position}番手: ${h.horseName} (距離=${h.currentDistance.toFixed(1)}m, スタミナ残${h.staminaRemaining.toFixed(0)}%)`);
  });
  
  const leadingHorses = sortedHorses
    .filter(h => h.position <= 3)
    .map(h => h.horseNumber);
  
  return {
    phaseName: '3-4コーナー',
    distanceRange: { start: phaseStart, end: phaseEnd },
    timeRange: { start: prevPhaseTime, end: prevPhaseTime + phaseTime },
    horses: sortedHorses,
    paceInfo: {
      averageSpeed: avgVelocity,
      leadingHorses,
      paceType: prevPhase.paceInfo.paceType,
    },
    events,
  };
}
