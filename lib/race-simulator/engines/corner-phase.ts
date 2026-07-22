/**
 * 3-4コーナーフェーズエンジン（改良版）
 * 
 * Phase 4.1 実データ検証対応:
 * - 円弧長から追加走行距離を計算
 * - 相対速度込みブロック判定
 * - 意思決定ベースのレーン変更
 * - 連続的スタミナ消費
 * - 実際の勾配による速度補正
 * - 個別スパート開始判定
 */

import type { HorseState, PhaseResult, SimulationEvent, CourseInfo } from '@/types/race-simulator';

export interface CornerPhaseInput {
  horses: HorseState[];
  courseInfo: CourseInfo | null;
  totalHorses: number;
  straightStart: number; // 直線開始地点
}

interface LaneOption {
  direction: 'stay' | 'inner' | 'outer' | 'wait';
  newLateralPosition: number;
  score: number;
  reason: string;
  risks: string[];
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
  // コース形状の設定
  // ========================================
  const baseRadius = 50; // コース基準線の半径（m）
  const cornerAngle = cornerDistance / baseRadius; // ラジアン
  const maxLateralPosition = 10; // 外柵までの最大横位置（m）
  const minLateralPosition = -5; // 内柵までの最小横位置（m）
  const safetyMargin = 1.5; // 安全余裕（m）
  
  console.log(`  コーナー角度: ${(cornerAngle * 180 / Math.PI).toFixed(1)}度`);
  console.log(`  基準半径: ${baseRadius}m`);
  
  // ========================================
  // タイムステップシミュレーション（1秒刻み）
  // ========================================
  const timeStep = 1.0; // 1秒
  const numSteps = Math.ceil(cornerDistance / 15); // 概算
  
  for (let step = 0; step < numSteps; step++) {
    const elapsedTime = step * timeStep;
    
    for (const horse of horses) {
      // 現在のコーナー進入距離
      const cornerProgress = horse.currentDistance - phaseStart;
      if (cornerProgress < 0 || cornerProgress >= cornerDistance) continue;
      
      // ========================================
      // 1. 基本速度（コーナーリング）
      // ========================================
      const cornerSkillFactor = 1 + (horse.capabilities.cornerSkill - 50) / 100 * 0.15;
      let targetVelocity = 14.5 * cornerSkillFactor;
      
      // ========================================
      // 2. 坂の影響（実際の位置と勾配から）
      // ========================================
      let slopeEffect = 1.0;
      if (courseInfo?.slopes) {
        for (const slope of courseInfo.slopes) {
          if (horse.currentDistance >= slope.start && horse.currentDistance <= slope.end) {
            const gradientEffect = slope.gradient / 100; // %を係数に
            const staminaFactor = horse.staminaRemaining / 100;
            
            if (slope.type === 'up') {
              // 上り坂: スタミナが低いほど減速
              slopeEffect = 1 - gradientEffect * 0.3 * (1 - staminaFactor * 0.7);
            } else {
              // 下り坂: 加速するが最大速度制限あり
              const maxSpeedBoost = 1.08;
              slopeEffect = Math.min(maxSpeedBoost, 1 + gradientEffect * 0.2);
            }
            
            if (step === 0) {
              console.log(`[CornerPhase] ${horse.horseName}: 坂補正 ${(slopeEffect * 100).toFixed(1)}% (${slope.type}, 勾配${slope.gradient}%)`);
            }
          }
        }
      }
      
      targetVelocity *= slopeEffect;
      
      // ========================================
      // 3. ブロック判定（相対速度込み）
      // ========================================
      const blockInfo = checkBlocking(horse, horses, courseInfo);
      
      if (blockInfo.blocked) {
        // 前方馬との相対速度に応じて減速
        const relativeSpeed = horse.currentVelocity - blockInfo.frontHorseVelocity;
        
        if (relativeSpeed > 0.5) {
          // 前方馬より明らかに速い: 強制減速
          targetVelocity *= 0.90;
          horse.blocked = true;
          
          if (step === 0) {
            console.log(`[CornerPhase] ${horse.horseName}: 前方${blockInfo.frontDistance.toFixed(1)}mに馬、減速`);
          }
        } else if (relativeSpeed > 0) {
          // やや速い: 軽度減速
          targetVelocity *= 0.95;
          horse.blocked = true;
        } else {
          // 同速または遅い: ブロック解除
          horse.blocked = false;
        }
      } else {
        horse.blocked = false;
      }
      
      // ========================================
      // 4. レーン変更の意思決定
      // ========================================
      if (step % 2 === 0) { // 2秒ごとに判定
        const laneDecision = decideLaneChange(
          horse,
          horses,
          blockInfo,
          straightStart - horse.currentDistance,
          cornerAngle,
          baseRadius,
          minLateralPosition,
          maxLateralPosition
        );
        
        if (laneDecision.direction !== 'stay') {
          // レーン変更を実行（瞬間移動ではなく徐々に）
          const maxLateralSpeed = 1.0; // 横移動速度 m/s
          const targetLateral = laneDecision.newLateralPosition;
          const lateralDiff = targetLateral - horse.lateralPosition;
          const lateralMove = Math.sign(lateralDiff) * Math.min(Math.abs(lateralDiff), maxLateralSpeed * timeStep);
          
          const prevLateral = horse.lateralPosition;
          horse.lateralPosition += lateralMove;
          
          if (laneDecision.direction === 'outer') {
            horse.outerPath = true;
          }
          
          events.push({
            horseNumber: horse.horseNumber,
            horseName: horse.horseName,
            event: 'cut-in',
            description: `${laneDecision.reason} (${prevLateral.toFixed(1)}m → ${horse.lateralPosition.toFixed(1)}m)`
          });
          
          if (step === 0) {
            console.log(`[CornerPhase] ${horse.horseName}: ${laneDecision.reason}`);
          }
        }
      }
      
      // ========================================
      // 5. 円弧長から追加走行距離を計算
      // ========================================
      const horseRadius = baseRadius + horse.lateralPosition;
      const baseArcLength = baseRadius * cornerAngle;
      const horseArcLength = horseRadius * cornerAngle;
      const extraDistancePerCorner = horseArcLength - baseArcLength;
      
      // このタイムステップでの追加距離（全体を分割）
      const extraDistanceThisStep = (extraDistancePerCorner / numSteps);
      
      if (step === 0 && Math.abs(extraDistanceThisStep) > 0.1) {
        console.log(`[CornerPhase] ${horse.horseName}: 横位置${horse.lateralPosition.toFixed(1)}m → 追加距離${extraDistanceThisStep.toFixed(2)}m/step (総計${extraDistancePerCorner.toFixed(1)}m)`);
      }
      
      // ========================================
      // 6. スパート開始判定（個別）
      // ========================================
      const distanceToStraight = straightStart - horse.currentDistance;
      const shouldAccelerate = checkAccelerationTiming(
        horse,
        distanceToStraight,
        totalHorses,
        blockInfo
      );
      
      if (shouldAccelerate && !horse.blocked) {
        const accelerationBonus = 1 + (horse.capabilities.acceleration / 100) * 0.12;
        targetVelocity *= accelerationBonus;
        
        if (step === 0) {
          events.push({
            horseNumber: horse.horseNumber,
            horseName: horse.horseName,
            event: 'accelerate',
            description: `直線${distanceToStraight.toFixed(0)}m手前で加速開始（脚質・能力による）`
          });
          console.log(`[CornerPhase] ${horse.horseName}: 加速開始（残${distanceToStraight.toFixed(0)}m）`);
        }
      }
      
      // ========================================
      // 7. 速度更新（滑らかに）
      // ========================================
      const velocityDiff = targetVelocity - horse.currentVelocity;
      const maxAcceleration = 1.5; // m/s^2
      const velocityChange = Math.sign(velocityDiff) * Math.min(Math.abs(velocityDiff), maxAcceleration * timeStep);
      horse.currentVelocity += velocityChange;
      
      // 速度を合理的な範囲に制限
      horse.currentVelocity = Math.max(10, Math.min(20, horse.currentVelocity));
      
      // ========================================
      // 8. 走行距離更新
      // ========================================
      const distanceThisStep = horse.currentVelocity * timeStep + extraDistanceThisStep;
      horse.currentDistance += distanceThisStep;
      
      // ========================================
      // 9. スタミナ消費（連続計算）
      // ========================================
      const staminaConsumption = calculateStaminaConsumption(
        horse,
        timeStep,
        extraDistanceThisStep,
        slopeEffect,
        totalHorses
      );
      
      horse.staminaRemaining = Math.max(0, horse.staminaRemaining - staminaConsumption);
      
      if (horse.staminaRemaining < 20 && step === 0) {
        events.push({
          horseNumber: horse.horseNumber,
          horseName: horse.horseName,
          event: 'stamina-loss',
          description: `スタミナ低下（残${horse.staminaRemaining.toFixed(0)}%）`
        });
      }
    }
  }
  
  // ========================================
  // 10. 順位を再計算（currentDistanceで）
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
    console.log(`  ${h.position}番手: ${h.horseName} (距離=${h.currentDistance.toFixed(1)}m, 横=${h.lateralPosition.toFixed(1)}m, スタミナ残${h.staminaRemaining.toFixed(0)}%)`);
  });
  
  // ========================================
  // 11. 検証チェック
  // ========================================
  validateCornerPhase(sortedHorses, baseRadius, cornerAngle, phaseStart, phaseEnd);
  
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

/**
 * ブロック判定（相対速度込み）
 */
function checkBlocking(
  horse: HorseState,
  allHorses: HorseState[],
  courseInfo: CourseInfo | null
): { blocked: boolean; frontDistance: number; frontHorseVelocity: number; clearLeft: boolean; clearRight: boolean } {
  const frontThreshold = 8; // 前方判定距離（m）
  const lateralThreshold = 2.5; // 横方向の重なり判定（m）
  
  let blocked = false;
  let minFrontDistance = Infinity;
  let frontHorseVelocity = horse.currentVelocity;
  
  for (const other of allHorses) {
    if (other.horseNumber === horse.horseNumber) continue;
    
    const longitudinalGap = other.currentDistance - horse.currentDistance;
    const lateralGap = Math.abs(other.lateralPosition - horse.lateralPosition);
    
    // 前方にいて、横が重なっている
    if (longitudinalGap > 0 && longitudinalGap < frontThreshold && lateralGap < lateralThreshold) {
      blocked = true;
      if (longitudinalGap < minFrontDistance) {
        minFrontDistance = longitudinalGap;
        frontHorseVelocity = other.currentVelocity;
      }
    }
  }
  
  // 左右の空きスペースをチェック
  const clearLeft = !allHorses.some(other => 
    other.horseNumber !== horse.horseNumber &&
    Math.abs(other.currentDistance - horse.currentDistance) < 3 &&
    other.lateralPosition < horse.lateralPosition &&
    horse.lateralPosition - other.lateralPosition < 3
  );
  
  const clearRight = !allHorses.some(other => 
    other.horseNumber !== horse.horseNumber &&
    Math.abs(other.currentDistance - horse.currentDistance) < 3 &&
    other.lateralPosition > horse.lateralPosition &&
    other.lateralPosition - horse.lateralPosition < 3
  );
  
  return {
    blocked,
    frontDistance: blocked ? minFrontDistance : Infinity,
    frontHorseVelocity,
    clearLeft,
    clearRight,
  };
}

/**
 * レーン変更の意思決定
 */
function decideLaneChange(
  horse: HorseState,
  allHorses: HorseState[],
  blockInfo: any,
  distanceToStraight: number,
  cornerAngle: number,
  baseRadius: number,
  minLateral: number,
  maxLateral: number
): LaneOption {
  const options: LaneOption[] = [];
  
  // オプション1: 現在のレーンを維持
  options.push({
    direction: 'stay',
    newLateralPosition: horse.lateralPosition,
    score: blockInfo.blocked ? 30 : 70,
    reason: '現在のレーンを維持',
    risks: blockInfo.blocked ? ['前方にブロック'] : [],
  });
  
  // オプション2: 内側へ移動
  if (horse.lateralPosition > minLateral + 1) {
    const newLateral = Math.max(minLateral, horse.lateralPosition - 2);
    const innerRadius = baseRadius + newLateral;
    const extraDistance = (innerRadius - baseRadius) * cornerAngle;
    
    const innerScore = blockInfo.clearLeft ? 60 + (extraDistance < 0 ? 10 : 0) : 20;
    
    options.push({
      direction: 'inner',
      newLateralPosition: newLateral,
      score: innerScore,
      reason: `内側に空間、距離短縮${Math.abs(extraDistance).toFixed(1)}m`,
      risks: blockInfo.clearLeft ? [] : ['内側に馬あり'],
    });
  }
  
  // オプション3: 外側へ移動
  if (horse.lateralPosition < maxLateral - 1) {
    const newLateral = Math.min(maxLateral, horse.lateralPosition + 2.5);
    const outerRadius = baseRadius + newLateral;
    const extraDistance = (outerRadius - baseRadius) * cornerAngle;
    
    let outerScore = blockInfo.clearRight ? 50 : 20;
    if (blockInfo.blocked && blockInfo.clearRight) {
      outerScore = 75; // 前がブロックされてて右が空いてる: 高評価
    }
    outerScore -= extraDistance * 2; // 追加距離ペナルティ
    
    options.push({
      direction: 'outer',
      newLateralPosition: newLateral,
      score: outerScore,
      reason: `外側へ進路変更、前方${blockInfo.frontDistance.toFixed(1)}mにブロック、追加距離${extraDistance.toFixed(1)}m`,
      risks: blockInfo.clearRight ? [`追加距離+${extraDistance.toFixed(1)}m`] : ['外側に馬あり'],
    });
  }
  
  // オプション4: 待機（直線近いので無理に動かない）
  if (distanceToStraight < 80) {
    options.push({
      direction: 'wait',
      newLateralPosition: horse.lateralPosition,
      score: 55,
      reason: `直線近い（残${distanceToStraight.toFixed(0)}m）ため待機`,
      risks: [],
    });
  }
  
  // 最高スコアのオプションを選択
  options.sort((a, b) => b.score - a.score);
  return options[0];
}

/**
 * 加速開始タイミング判定（個別）
 */
function checkAccelerationTiming(
  horse: HorseState,
  distanceToStraight: number,
  totalHorses: number,
  blockInfo: any
): boolean {
  // 脚質推定（位置から）
  const positionRatio = horse.position / totalHorses;
  
  let accelerationPoint = 100; // デフォルト: 直線100m手前
  
  if (positionRatio < 0.2) {
    // 逃げ・先行: 早めに加速
    accelerationPoint = 120;
  } else if (positionRatio < 0.5) {
    // 中団: 標準
    accelerationPoint = 100;
  } else if (positionRatio < 0.8) {
    // 差し: 遅めに加速
    accelerationPoint = 80;
  } else {
    // 追い込み: かなり遅く
    accelerationPoint = 60;
  }
  
  // 能力・スタミナによる補正
  if (horse.capabilities.acceleration > 60) {
    accelerationPoint -= 10; // 加速力高い: 早めに仕掛ける
  }
  
  if (horse.staminaRemaining < 40) {
    accelerationPoint += 20; // スタミナ低い: 温存
  }
  
  // ブロックされている場合は遅らせる
  if (blockInfo.blocked) {
    accelerationPoint -= 15;
  }
  
  return distanceToStraight <= accelerationPoint && horse.staminaRemaining > 25;
}

/**
 * スタミナ消費計算（連続）
 */
function calculateStaminaConsumption(
  horse: HorseState,
  timeStep: number,
  extraDistance: number,
  slopeEffect: number,
  totalHorses: number
): number {
  const baseConsumptionRate = 0.8; // %/秒
  
  // 速度による消費増
  const velocityFactor = (horse.currentVelocity / 15) ** 1.5;
  
  // 位置取り（先行は消費大）
  const positionFactor = horse.position <= totalHorses * 0.3 ? 1.2 : 1.0;
  
  // 外回りによる消費増
  const outerFactor = 1 + Math.abs(extraDistance) * 0.1;
  
  // 坂による消費増
  const slopeFactor = slopeEffect < 1.0 ? 1.3 : 1.0;
  
  // スタミナ能力
  const staminaAbility = horse.capabilities.stamina / 100;
  const staminaFactor = 1 / Math.max(0.5, staminaAbility);
  
  const consumption = baseConsumptionRate * timeStep * velocityFactor * positionFactor * outerFactor * slopeFactor * staminaFactor;
  
  return consumption;
}

/**
 * コーナーフェーズの検証
 */
function validateCornerPhase(
  horses: HorseState[],
  baseRadius: number,
  cornerAngle: number,
  phaseStart: number,
  phaseEnd: number
): void {
  console.log('[CornerPhase] === 検証チェック ===');
  
  // 外側の馬ほど距離が長いか
  const sortedByLateral = [...horses].sort((a, b) => a.lateralPosition - b.lateralPosition);
  let prevDistance = 0;
  let lateralDistanceOK = true;
  
  for (const horse of sortedByLateral) {
    if (prevDistance > 0 && horse.currentDistance < prevDistance - 5) {
      console.warn(`  ⚠️ 外側の馬の方が走行距離が短い: ${horse.horseName} (横${horse.lateralPosition.toFixed(1)}m, 距離${horse.currentDistance.toFixed(1)}m)`);
      lateralDistanceOK = false;
    }
    prevDistance = horse.currentDistance;
  }
  
  if (lateralDistanceOK) {
    console.log('  ✓ 外側の馬ほど走行距離が長い');
  }
  
  // レーン変更が範囲内か
  const lateralRangeOK = horses.every(h => h.lateralPosition >= -6 && h.lateralPosition <= 11);
  if (lateralRangeOK) {
    console.log('  ✓ 全馬の横位置が走行可能範囲内');
  } else {
    console.warn('  ⚠️ 走行可能範囲を超えた馬あり');
  }
  
  // スタミナが範囲内か
  const staminaOK = horses.every(h => h.staminaRemaining >= 0 && h.staminaRemaining <= 100);
  if (staminaOK) {
    console.log('  ✓ 全馬のスタミナが0-100%内');
  } else {
    console.warn('  ⚠️ スタミナ異常値あり');
  }
}
