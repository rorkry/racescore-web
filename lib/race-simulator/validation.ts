/**
 * シミュレーション結果の整合性検証
 * 
 * Phase 4.1で追加した速度・距離計算の正しさを検証
 */

import type { SimulationResult, HorseState, PhaseResult } from '@/types/race-simulator';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalDistance: number;
    totalTime: number;
    avgVelocity: number;
  };
}

/**
 * シミュレーション結果を検証
 */
export function validateSimulation(result: SimulationResult, expectedDistance: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  console.log('\n========================================');
  console.log('[Validation] シミュレーション整合性検証開始');
  console.log('========================================\n');
  
  // ========================================
  // 1. 最終順位の一致チェック
  // ========================================
  const finalPhase = result.phases.straight || result.phases.goal;
  const finalStandings = result.finalStandings;
  
  for (let i = 0; i < finalStandings.length; i++) {
    const expected = finalStandings[i];
    const actual = finalPhase.horses.find(h => h.horseNumber === expected.horseNumber);
    
    if (!actual) {
      errors.push(`最終順位に馬${expected.horseNumber}が見つかりません`);
      continue;
    }
    
    if (actual.position !== expected.position) {
      errors.push(`馬${expected.horseNumber}: 順位不一致 (expected=${expected.position}, actual=${actual.position})`);
    }
  }
  
  // ========================================
  // 2. 各Phaseでの整合性チェック
  // ========================================
  const phases: PhaseResult[] = [
    result.phases.start,
    result.phases.formation,
    result.phases.straight,
  ];
  
  for (const phase of phases) {
    console.log(`[Validation] ${phase.phaseName} チェック中...`);
    
    // 2-1. distanceFromLeaderの整合性
    const leadHorse = phase.horses[0];
    
    for (const horse of phase.horses) {
      const calculatedGap = leadHorse.currentDistance - horse.currentDistance;
      const actualGap = horse.distanceFromLeader;
      
      if (Math.abs(calculatedGap - actualGap) > 1.0) {
        errors.push(`${phase.phaseName} 馬${horse.horseNumber}: distanceFromLeader不整合 (計算=${calculatedGap.toFixed(1)}m, 実際=${actualGap.toFixed(1)}m)`);
      }
    }
    
    // 2-2. 速度の異常値チェック
    for (const horse of phase.horses) {
      if (horse.currentVelocity < 5 || horse.currentVelocity > 25) {
        errors.push(`${phase.phaseName} 馬${horse.horseNumber}: 速度異常 (${horse.currentVelocity.toFixed(1)}m/s)`);
      }
    }
    
    // 2-3. スタミナの範囲チェック
    for (const horse of phase.horses) {
      if (horse.staminaRemaining < 0 || horse.staminaRemaining > 100) {
        errors.push(`${phase.phaseName} 馬${horse.horseNumber}: スタミナ異常 (${horse.staminaRemaining.toFixed(0)})`);
      }
    }
    
    // 2-4. 馬が後退していないかチェック（Phase間比較）
    const phaseIdx = phases.indexOf(phase);
    if (phaseIdx > 0) {
      const prevPhase = phases[phaseIdx - 1];
      
      for (const horse of phase.horses) {
        const prevHorse = prevPhase.horses.find(h => h.horseNumber === horse.horseNumber);
        
        if (prevHorse && horse.currentDistance < prevHorse.currentDistance) {
          errors.push(`${phase.phaseName} 馬${horse.horseNumber}: 後退 (prev=${prevHorse.currentDistance.toFixed(1)}m, current=${horse.currentDistance.toFixed(1)}m)`);
        }
      }
    }
    
    // 2-5. 順位の飛びチェック
    const positions = phase.horses.map(h => h.position).sort((a, b) => a - b);
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] !== i + 1) {
        errors.push(`${phase.phaseName}: 順位に飛びあり (expected=${i + 1}, actual=${positions[i]})`);
        break;
      }
    }
    
    // 2-6. 同じ位置に複数馬が重なっていないかチェック
    for (let i = 0; i < phase.horses.length; i++) {
      for (let j = i + 1; j < phase.horses.length; j++) {
        const h1 = phase.horses[i];
        const h2 = phase.horses[j];
        
        const distanceDiff = Math.abs(h1.currentDistance - h2.currentDistance);
        const lateralDiff = Math.abs(h1.lateralPosition - h2.lateralPosition);
        
        if (distanceDiff < 0.5 && lateralDiff < 0.5) {
          warnings.push(`${phase.phaseName}: 馬${h1.horseNumber}と馬${h2.horseNumber}が重複 (距離差=${distanceDiff.toFixed(2)}m, 横差=${lateralDiff.toFixed(2)}m)`);
        }
      }
    }
  }
  
  // ========================================
  // 3. 全体統計
  // ========================================
  const finalHorse = finalPhase.horses[0];
  const totalDistance = finalHorse.currentDistance;
  const totalTime = finalPhase.timeRange.end;
  const avgVelocity = totalDistance / totalTime;
  
  console.log('\n[Validation] 全体統計:');
  console.log(`  総走行距離: ${totalDistance.toFixed(1)}m (期待=${expectedDistance}m)`);
  console.log(`  総所要時間: ${totalTime.toFixed(1)}秒`);
  console.log(`  平均速度: ${avgVelocity.toFixed(1)}m/s (≒${(avgVelocity * 3.6).toFixed(0)}km/h)`);
  
  // 距離の乖離チェック
  const distanceDiff = Math.abs(totalDistance - expectedDistance);
  if (distanceDiff > expectedDistance * 0.1) {
    errors.push(`総走行距離が期待値から大きく乖離 (差=${distanceDiff.toFixed(1)}m)`);
  } else if (distanceDiff > 10) {
    warnings.push(`総走行距離がやや乖離 (差=${distanceDiff.toFixed(1)}m)`);
  }
  
  // ========================================
  // 4. 結果サマリ
  // ========================================
  console.log('\n========================================');
  console.log('[Validation] 検証結果サマリ');
  console.log('========================================');
  console.log(`エラー: ${errors.length}件`);
  console.log(`警告: ${warnings.length}件`);
  
  if (errors.length > 0) {
    console.log('\n【エラー詳細】');
    errors.forEach((err, idx) => console.log(`  ${idx + 1}. ${err}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n【警告詳細】');
    warnings.forEach((warn, idx) => console.log(`  ${idx + 1}. ${warn}`));
  }
  
  console.log('\n========================================\n');
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalDistance,
      totalTime,
      avgVelocity,
    },
  };
}
