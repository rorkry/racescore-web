/**
 * 3-4コーナーフェーズエンジン（Phase 4.1完全版）
 * 
 * 改善内容:
 * 1. CourseInfoからコーナー半径を取得（fallback付き）
 * 2. lateralPositionを滑らかに変更（target/velocity方式）
 * 3. スパート開始地点を状態依存で計算
 * 4. スタミナ消費式の内訳をログ
 */

import type { HorseState, PhaseResult, SimulationEvent, CourseInfo } from '@/types/race-simulator';

export interface CornerPhaseInput {
  horses: HorseState[];
  courseInfo: CourseInfo | null;
  totalHorses: number;
  endDistance: number; // このフェーズの終端距離（boundaries.corner.end、通常は straightStart）
}

interface LaneOption {
  direction: 'stay' | 'inner' | 'outer' | 'wait';
  targetLateral: number;
  score: number;
  reason: string;
}

interface StaminaConsumptionLog {
  baseRate: number;
  velocityFactor: number;
  positionFactor: number;
  outerFactor: number;
  slopeFactor: number;
  staminaFactor: number;
  totalConsumption: number;
}

/**
 * 3-4コーナーフェーズを実行
 */
export function executeCornerPhase(
  input: CornerPhaseInput,
  prevPhase: PhaseResult
): PhaseResult {
  const { horses, courseInfo, totalHorses, endDistance } = input;
  
  // endDistanceの妥当性チェック
  if (!Number.isFinite(endDistance) || endDistance < 0) {
    throw new Error(`[CornerPhase] 不正なendDistance: ${endDistance}`);
  }
  
  // 前フェーズの終了地点から開始
  const phaseStart = prevPhase.distanceRange.end;
  const phaseEnd = endDistance;
  const cornerDistance = phaseEnd - phaseStart;
  
  console.log('[CornerPhase] === 3-4コーナーフェーズ開始 ===');
  console.log(`  距離: ${phaseStart}m - ${phaseEnd}m (${cornerDistance}m)`);
  
  // ゼロ長フェーズ（コーナーデータ無し、スプリント等）の場合は即終了
  if (cornerDistance < 1e-6) {
    console.log('[CornerPhase] コーナーゼロ長のため即終了');
    const leadingHorses = horses.filter(h => h.position <= 3).map(h => h.horseNumber);
    return {
      phaseName: '3-4コーナー',
      distanceRange: { start: phaseStart, end: phaseEnd },
      timeRange: { start: prevPhase.timeRange.end, end: prevPhase.timeRange.end },
      horses,
      paceInfo: {
        averageSpeed: horses.reduce((sum, h) => sum + h.currentVelocity, 0) / horses.length,
        leadingHorses,
        paceType: prevPhase.paceInfo.paceType,
      },
      events: [],
    };
  }
  
  const events: SimulationEvent[] = [];
  const warnings: string[] = [];
  
  // ========================================
  // コース形状の設定（CourseInfoから取得）
  // ========================================
  let baseRadius = 50; // fallback値
  let cornerAngle = cornerDistance / baseRadius; // ラジアン
  let courseWidth = 15;
  let minLateral = -5;
  let maxLateral = 10;
  let usingFallback = true;
  
  if (courseInfo && courseInfo.corners && courseInfo.corners.length > 0) {
    // 3-4コーナーを検索
    const corner3_4 = courseInfo.corners.find(c => 
      c.name.includes('3') || c.name.includes('4') ||
      (c.position >= phaseStart && c.position <= phaseEnd)
    );
    
    if (corner3_4) {
      baseRadius = corner3_4.radius;
      cornerAngle = (corner3_4.angle * Math.PI) / 180; // 度→ラジアン
      usingFallback = false;
      console.log(`  コーナー情報: ${corner3_4.name}, 半径${baseRadius}m, 角度${corner3_4.angle}度`);
    }
    
    // コース幅と安全余裕を取得
    if (courseInfo.courseWidth) {
      courseWidth = courseInfo.courseWidth;
    }
    const innerSafety = courseInfo.innerRailSafetyMargin || 1.5;
    const outerSafety = courseInfo.outerRailSafetyMargin || 1.0;
    minLateral = -(courseWidth / 2 - innerSafety);
    maxLateral = courseWidth / 2 - outerSafety;
  }
  
  if (usingFallback) {
    warnings.push('COURSE_GEOMETRY_FALLBACK: コーナー半径が未登録のため50mを使用');
    // [旧2D内部診断・3D表示には直接影響なし]
    // この corner-phase の内部近似値は finalStandings 算出にのみ使う内部計算で、
    // 3D描画（dynamics/display frame）には渡らない。
    console.warn(`  [旧2D内部診断・3D表示には直接影響なし] コーナー半径が未登録のため、fallback値50mを使用`);
  }
  
  // 距離と円弧長の整合性チェック
  const calculatedArcLength = baseRadius * cornerAngle;
  const distanceDiff = Math.abs(calculatedArcLength - cornerDistance);
  if (distanceDiff > cornerDistance * 0.3) {
    warnings.push(`コーナー円弧長(${calculatedArcLength.toFixed(0)}m)と実距離(${cornerDistance}m)が大きく乖離`);
    // [旧2D内部診断・3D表示には直接影響なし]
    console.warn(`  [旧2D内部診断・3D表示には直接影響なし] 円弧長と実距離の乖離: ${distanceDiff.toFixed(0)}m`);
  }
  
  console.log(`  基準半径: ${baseRadius}m, 角度: ${(cornerAngle * 180 / Math.PI).toFixed(1)}度`);
  console.log(`  横位置範囲: ${minLateral.toFixed(1)}m 〜 ${maxLateral.toFixed(1)}m`);
  
  // ========================================
  // 各馬の初期化
  // ========================================
  for (const horse of horses) {
    horse.targetLateralPosition = horse.lateralPosition;
    horse.lateralVelocity = 0;
    horse.laneChangeState = 'none';
    horse.accelerationStarted = false;
  }
  
  // ========================================
  // タイムステップシミュレーション（1秒刻み）
  // ========================================
  const timeStep = 1.0;
  // 区間長から必要ステップ数を算出（平均速度14m/s想定）
  const numSteps = Math.max(1, Math.ceil(cornerDistance / 14));
  const startTime = prevPhase.timeRange.end;
  
  for (let step = 0; step < numSteps; step++) {
    const currentTime = startTime + step * timeStep;
    
    for (const horse of horses) {
      const cornerProgress = horse.currentDistance - phaseStart;
      if (cornerProgress < 0 || cornerProgress >= cornerDistance) continue;
      
      // ========================================
      // 1. 基本速度
      // ========================================
      const cornerSkillFactor = 1 + (horse.capabilities.cornerSkill - 50) / 100 * 0.15;
      let targetVelocity = 14.5 * cornerSkillFactor;
      
      // ========================================
      // 2. 坂の影響
      // ========================================
      let slopeEffect = 1.0;
      let slopeDescription = '';
      if (courseInfo?.slopes) {
        for (const slope of courseInfo.slopes) {
          if (horse.currentDistance >= slope.start && horse.currentDistance <= slope.end) {
            const gradientEffect = slope.gradient / 100;
            const staminaFactor = horse.staminaRemaining / 100;
            
            if (slope.type === 'up') {
              slopeEffect = 1 - gradientEffect * 0.3 * (1 - staminaFactor * 0.7);
              slopeDescription = `上り${slope.gradient}%`;
            } else {
              const maxSpeedBoost = 1.08;
              slopeEffect = Math.min(maxSpeedBoost, 1 + gradientEffect * 0.2);
              slopeDescription = `下り${slope.gradient}%`;
            }
          }
        }
      }
      
      targetVelocity *= slopeEffect;
      
      // ========================================
      // 3. ブロック判定（相対速度込み）
      // ========================================
      const blockInfo = checkBlocking(horse, horses);
      
      if (blockInfo.blocked) {
        const relativeSpeed = horse.currentVelocity - blockInfo.frontHorseVelocity;
        
        if (relativeSpeed > 0.5) {
          targetVelocity *= 0.88;
          horse.blocked = true;
        } else if (relativeSpeed > 0) {
          targetVelocity *= 0.94;
          horse.blocked = true;
        } else {
          horse.blocked = false;
        }
      } else {
        horse.blocked = false;
      }
      
      // ========================================
      // 4. レーン変更の意思決定（2秒ごと）
      // ========================================
      if (step % 2 === 0 && horse.laneChangeState === 'none') {
        const distanceToStraight = endDistance - horse.currentDistance;
        
        const laneDecision = decideLaneChange(
          horse,
          horses,
          blockInfo,
          distanceToStraight,
          cornerAngle,
          baseRadius,
          minLateral,
          maxLateral
        );
        
        if (laneDecision.direction !== 'stay' && laneDecision.direction !== 'wait') {
          horse.targetLateralPosition = laneDecision.targetLateral;
          horse.laneChangeState = 'planning';
          horse.laneChangeStartedAt = currentTime;
          horse.laneChangeReason = laneDecision.reason;
          
          events.push({
            horseNumber: horse.horseNumber,
            horseName: horse.horseName,
            event: 'cut-in',
            description: `進路変更計画: ${laneDecision.reason}`
          });
        }
      }
      
      // ========================================
      // 5. 横移動の実行（滑らかに）
      // ========================================
      if (horse.targetLateralPosition !== undefined && 
          Math.abs(horse.targetLateralPosition - horse.lateralPosition) > 0.1) {
        
        horse.laneChangeState = 'moving';
        
        // 横移動速度の上限（基本1.0m/s）
        let maxLateralSpeed = 1.0;
        
        // 制限条件
        if (horse.currentVelocity > 16) maxLateralSpeed *= 0.7; // 高速時
        if (cornerAngle > 1.5) maxLateralSpeed *= 0.8; // 急カーブ
        if (blockInfo.blocked) maxLateralSpeed *= 0.6; // 前方混雑
        if (Math.abs(horse.lateralPosition) > courseWidth * 0.4) maxLateralSpeed *= 0.7; // コース端
        
        const lateralDiff = horse.targetLateralPosition - horse.lateralPosition;
        horse.lateralVelocity = Math.sign(lateralDiff) * 
          Math.min(Math.abs(lateralDiff), maxLateralSpeed * timeStep);
        
        // 移動先に馬がいる場合は中止
        const targetClear = !horses.some(other =>
          other.horseNumber !== horse.horseNumber &&
          Math.abs(other.currentDistance - horse.currentDistance) < 3 &&
          Math.abs(other.lateralPosition - (horse.lateralPosition + horse.lateralVelocity)) < 2
        );
        
        if (targetClear) {
          horse.lateralPosition += horse.lateralVelocity;
          horse.lateralPosition = Math.max(minLateral, Math.min(maxLateral, horse.lateralPosition));
        } else {
          // 移動中止
          horse.targetLateralPosition = horse.lateralPosition;
          horse.lateralVelocity = 0;
          horse.laneChangeState = 'completed';
        }
        
        // 移動完了判定
        if (Math.abs(horse.targetLateralPosition - horse.lateralPosition) < 0.1) {
          horse.laneChangeState = 'completed';
          horse.lateralVelocity = 0;
          
          if (horse.lateralPosition > 3) {
            horse.outerPath = true;
          }
        }
      }
      
      // ========================================
      // 6. 円弧長から追加走行距離を計算
      // ========================================
      const horseRadius = baseRadius + horse.lateralPosition;
      const horseArcLength = horseRadius * cornerAngle;
      const baseArcLength = baseRadius * cornerAngle;
      const extraDistanceTotal = horseArcLength - baseArcLength;
      const extraDistanceThisStep = (extraDistanceTotal / numSteps);
      
      // ========================================
      // 7. スパート開始判定（個別・状態依存）
      // ========================================
      const distanceToStraight = endDistance - horse.currentDistance;
      
      if (!horse.accelerationStarted) {
        const shouldAccelerate = checkAccelerationTiming(
          horse,
          distanceToStraight,
          totalHorses,
          blockInfo,
          horses,
          endDistance
        );
        
        if (shouldAccelerate && !horse.blocked && horse.staminaRemaining > 25) {
          horse.accelerationStarted = true;
          horse.accelerationStartDistance = horse.currentDistance;
          
          events.push({
            horseNumber: horse.horseNumber,
            horseName: horse.horseName,
            event: 'accelerate',
            description: `加速開始（直線${distanceToStraight.toFixed(0)}m手前、脚質・能力・状況判断）`
          });
        }
      }
      
      if (horse.accelerationStarted && !horse.blocked) {
        const accelerationBonus = 1 + (horse.capabilities.acceleration / 100) * 0.12;
        targetVelocity *= accelerationBonus;
      }
      
      // ========================================
      // 8. 速度更新（滑らかに）
      // ========================================
      const velocityDiff = targetVelocity - horse.currentVelocity;
      const maxAcceleration = 1.5; // m/s^2
      const velocityChange = Math.sign(velocityDiff) * 
        Math.min(Math.abs(velocityDiff), maxAcceleration * timeStep);
      horse.currentVelocity += velocityChange;
      horse.currentVelocity = Math.max(10, Math.min(20, horse.currentVelocity));
      
      // ========================================
      // 9. 走行距離更新（endDistanceを超えないようクランプ）
      // ========================================
      const distanceThisStep = horse.currentVelocity * timeStep + extraDistanceThisStep;
      const newDistance = horse.currentDistance + distanceThisStep;
      horse.currentDistance = Math.min(endDistance, newDistance);
      
      // ========================================
      // 10. スタミナ消費（連続計算＋ログ）
      // ========================================
      const staminaLog = calculateStaminaConsumption(
        horse,
        timeStep,
        extraDistanceThisStep,
        slopeEffect,
        totalHorses
      );
      
      horse.staminaRemaining = Math.max(0, horse.staminaRemaining - staminaLog.totalConsumption);
      
      // デバッグログ（最初のstepのみ）
      if (step === 0 && horse.position <= 3) {
        console.log(`[CornerPhase] ${horse.horseName} スタミナ消費内訳:`);
        console.log(`  baseRate=${staminaLog.baseRate.toFixed(2)} velocity=${staminaLog.velocityFactor.toFixed(2)} position=${staminaLog.positionFactor.toFixed(2)}`);
        console.log(`  outer=${staminaLog.outerFactor.toFixed(2)} slope=${staminaLog.slopeFactor.toFixed(2)} stamina=${staminaLog.staminaFactor.toFixed(2)}`);
        console.log(`  → 消費=${staminaLog.totalConsumption.toFixed(2)}%`);
      }
      
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
  // 11. 順位を再計算
  // ========================================
  const sortedHorses = [...horses].sort((a, b) => b.currentDistance - a.currentDistance);
  sortedHorses.forEach((h, idx) => h.position = idx + 1);
  
  const leadHorse = sortedHorses[0];
  for (const horse of sortedHorses) {
    horse.distanceFromLeader = leadHorse.currentDistance - horse.currentDistance;
  }
  
  const avgVelocity = sortedHorses.reduce((sum, h) => sum + h.currentVelocity, 0) / sortedHorses.length;
  const phaseTime = numSteps * timeStep;
  
  console.log('[CornerPhase] === 3-4コーナーフェーズ完了 ===');
  console.log(`  平均速度: ${avgVelocity.toFixed(1)}m/s, 所要時間: ${phaseTime.toFixed(1)}秒`);
  sortedHorses.slice(0, 5).forEach(h => {
    console.log(`  ${h.position}番手: ${h.horseName} (距離=${h.currentDistance.toFixed(1)}m, 横=${h.lateralPosition.toFixed(1)}m, スタミナ残${h.staminaRemaining.toFixed(0)}%)`);
  });
  
  // ========================================
  // 12. 検証チェック
  // ========================================
  validateCornerPhase(sortedHorses, baseRadius, cornerAngle, phaseStart, phaseEnd, warnings);
  
  const leadingHorses = sortedHorses.filter(h => h.position <= 3).map(h => h.horseNumber);
  
  return {
    phaseName: '3-4コーナー',
    distanceRange: { start: phaseStart, end: phaseEnd },
    timeRange: { start: startTime, end: startTime + phaseTime },
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
  allHorses: HorseState[]
): { blocked: boolean; frontDistance: number; frontHorseVelocity: number; clearLeft: boolean; clearRight: boolean } {
  const frontThreshold = 8;
  const lateralThreshold = 2.5;
  
  let blocked = false;
  let minFrontDistance = Infinity;
  let frontHorseVelocity = horse.currentVelocity;
  
  for (const other of allHorses) {
    if (other.horseNumber === horse.horseNumber) continue;
    
    const longitudinalGap = other.currentDistance - horse.currentDistance;
    const lateralGap = Math.abs(other.lateralPosition - horse.lateralPosition);
    
    if (longitudinalGap > 0 && longitudinalGap < frontThreshold && lateralGap < lateralThreshold) {
      blocked = true;
      if (longitudinalGap < minFrontDistance) {
        minFrontDistance = longitudinalGap;
        frontHorseVelocity = other.currentVelocity;
      }
    }
  }
  
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
  
  return { blocked, frontDistance: minFrontDistance, frontHorseVelocity, clearLeft, clearRight };
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
  
  options.push({
    direction: 'stay',
    targetLateral: horse.lateralPosition,
    score: blockInfo.blocked ? 30 : 70,
    reason: '現在のレーンを維持',
  });
  
  if (horse.lateralPosition > minLateral + 1) {
    const newLateral = Math.max(minLateral, horse.lateralPosition - 2);
    const innerRadius = baseRadius + newLateral;
    const extraDistance = (innerRadius - baseRadius) * cornerAngle;
    const innerScore = blockInfo.clearLeft ? 60 + (extraDistance < 0 ? 10 : 0) : 20;
    
    options.push({
      direction: 'inner',
      targetLateral: newLateral,
      score: innerScore,
      reason: `内側に空間、距離短縮${Math.abs(extraDistance).toFixed(1)}m`,
    });
  }
  
  if (horse.lateralPosition < maxLateral - 1) {
    const newLateral = Math.min(maxLateral, horse.lateralPosition + 2.5);
    const outerRadius = baseRadius + newLateral;
    const extraDistance = (outerRadius - baseRadius) * cornerAngle;
    let outerScore = blockInfo.clearRight ? 50 : 20;
    if (blockInfo.blocked && blockInfo.clearRight) outerScore = 75;
    outerScore -= extraDistance * 2;
    
    options.push({
      direction: 'outer',
      targetLateral: newLateral,
      score: outerScore,
      reason: `外側へ進路変更、前方${blockInfo.frontDistance.toFixed(1)}mにブロック、追加距離${extraDistance.toFixed(1)}m`,
    });
  }
  
  if (distanceToStraight < 80) {
    options.push({
      direction: 'wait',
      targetLateral: horse.lateralPosition,
      score: 55,
      reason: `直線近い（残${distanceToStraight.toFixed(0)}m）ため待機`,
    });
  }
  
  options.sort((a, b) => b.score - a.score);
  return options[0];
}

/**
 * 加速開始タイミング判定（基準値+状態依存）
 */
function checkAccelerationTiming(
  horse: HorseState,
  distanceToStraight: number,
  totalHorses: number,
  blockInfo: any,
  allHorses: HorseState[],
  endDistance: number
): boolean {
  const positionRatio = horse.position / totalHorses;
  
  // 脚質ごとの基準値
  let baseAccelerationPoint = 100;
  if (positionRatio < 0.2) baseAccelerationPoint = 120; // 逃げ・先行
  else if (positionRatio < 0.5) baseAccelerationPoint = 100; // 中団
  else if (positionRatio < 0.8) baseAccelerationPoint = 80; // 差し
  else baseAccelerationPoint = 60; // 追い込み
  
  // 状態による補正
  let adjustment = 0;
  
  // 能力
  if (horse.capabilities.acceleration > 60) adjustment -= 10;
  if (horse.capabilities.stamina > 60) adjustment -= 5;
  
  // スタミナ残量
  if (horse.staminaRemaining < 40) adjustment += 20;
  else if (horse.staminaRemaining > 70) adjustment -= 10;
  
  // 先頭との距離
  if (horse.distanceFromLeader > 15) adjustment -= 15; // 大きく離されている
  
  // ブロック状況
  if (blockInfo.blocked) adjustment -= 15;
  
  // 前方の空き
  const horsesAhead = allHorses.filter(h => h.currentDistance > horse.currentDistance).length;
  if (horsesAhead < totalHorses * 0.3) adjustment -= 10; // 前方が空いている
  
  // 周辺の馬が加速を始めたか
  const nearbyAccelerating = allHorses.some(other =>
    Math.abs(other.currentDistance - horse.currentDistance) < 10 &&
    other.accelerationStarted === true
  );
  if (nearbyAccelerating) adjustment -= 5;
  
  const finalAccelerationPoint = baseAccelerationPoint + adjustment;
  
  return distanceToStraight <= finalAccelerationPoint;
}

/**
 * スタミナ消費計算（内訳付き）
 */
function calculateStaminaConsumption(
  horse: HorseState,
  timeStep: number,
  extraDistance: number,
  slopeEffect: number,
  totalHorses: number
): StaminaConsumptionLog {
  const baseRate = 0.8; // %/秒
  
  const velocityFactor = (horse.currentVelocity / 15) ** 1.5;
  const positionFactor = horse.position <= totalHorses * 0.3 ? 1.2 : 1.0;
  const outerFactor = 1 + Math.abs(extraDistance) * 0.1;
  const slopeFactor = slopeEffect < 1.0 ? 1.3 : 1.0;
  const staminaAbility = horse.capabilities.stamina / 100;
  const staminaFactor = 1 / Math.max(0.5, staminaAbility);
  
  const totalConsumption = baseRate * timeStep * velocityFactor * positionFactor * outerFactor * slopeFactor * staminaFactor;
  
  return {
    baseRate,
    velocityFactor,
    positionFactor,
    outerFactor,
    slopeFactor,
    staminaFactor,
    totalConsumption,
  };
}

/**
 * コーナーフェーズの検証
 */
function validateCornerPhase(
  horses: HorseState[],
  baseRadius: number,
  cornerAngle: number,
  phaseStart: number,
  phaseEnd: number,
  warnings: string[]
): void {
  console.log('[CornerPhase] === 検証チェック ===');
  
  const sortedByLateral = [...horses].sort((a, b) => a.lateralPosition - b.lateralPosition);
  let lateralDistanceOK = true;
  
  for (let i = 1; i < sortedByLateral.length; i++) {
    const inner = sortedByLateral[i - 1];
    const outer = sortedByLateral[i];
    if (outer.lateralPosition > inner.lateralPosition + 1 && outer.currentDistance < inner.currentDistance - 5) {
      warnings.push(`外側の馬(${outer.horseName})の方が走行距離が短い`);
      lateralDistanceOK = false;
    }
  }
  
  if (lateralDistanceOK) {
    console.log('  ✓ 外側の馬ほど走行距離が長い（または同等）');
  }
  
  const lateralRangeOK = horses.every(h => h.lateralPosition >= -6 && h.lateralPosition <= 11);
  if (lateralRangeOK) {
    console.log('  ✓ 全馬の横位置が走行可能範囲内');
  } else {
    warnings.push('走行可能範囲を超えた馬あり');
  }
  
  const staminaOK = horses.every(h => h.staminaRemaining >= 0 && h.staminaRemaining <= 100);
  if (staminaOK) {
    console.log('  ✓ 全馬のスタミナが0-100%内');
  } else {
    warnings.push('スタミナ異常値あり');
  }
  
  if (warnings.length > 0) {
    // [旧2D内部診断・3D表示には直接影響なし]
    console.warn(`  [旧2D内部診断・3D表示には直接影響なし] 警告${warnings.length}件`);
  }
}
