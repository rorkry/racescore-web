/**
 * 隊列形成フェーズエンジン
 * 
 * 隊列確定〜ペース形成（200m-600m）
 * 
 * 処理内容:
 * 1. 先行馬の頭数カウント → ペース決定
 * 2. ペースが「ハイ」の場合、先行馬の stamina消費 +30%
 * 3. 後方馬は stamina温存
 * 4. 距離延長馬は位置取り +1-2
 * 5. 距離短縮馬は位置取り -1-2
 */

import type { HorseState, PhaseResult, SimulationEvent, CourseInfo } from '@/types/race-simulator';

export interface FormationPhaseInput {
  horses: HorseState[];
  courseInfo: CourseInfo | null;
  totalHorses: number;
}

/**
 * 隊列形成フェーズを実行
 */
export function executeFormationPhase(
  input: FormationPhaseInput,
  prevPhase: PhaseResult
): PhaseResult {
  const { horses, courseInfo, totalHorses } = input;
  
  console.log('[FormationPhase] === 隊列形成フェーズ開始 ===');
  
  const events: SimulationEvent[] = [];
  
  // ========================================
  // 1. 先行馬の頭数をカウント
  // ========================================
  const frontRunners = horses.filter(h => h.position <= totalHorses * 0.3).length;
  
  // ========================================
  // 2. ペースを決定
  // ========================================
  let paceType: 'slow' | 'middle' | 'high';
  
  const frontRatio = frontRunners / totalHorses;
  
  if (frontRatio >= 0.45 || frontRunners >= 6) {
    paceType = 'high';
    console.log(`[FormationPhase] ペース: ハイペース（先行${frontRunners}頭, ${(frontRatio * 100).toFixed(0)}%）`);
  } else if (frontRatio <= 0.15 || frontRunners <= 1) {
    paceType = 'slow';
    console.log(`[FormationPhase] ペース: スローペース（先行${frontRunners}頭, ${(frontRatio * 100).toFixed(0)}%）`);
  } else {
    paceType = 'middle';
    console.log(`[FormationPhase] ペース: ミドルペース（先行${frontRunners}頭, ${(frontRatio * 100).toFixed(0)}%）`);
  }
  
  // コース特性でペース調整
  if (courseInfo?.paceTendency === 'high' && paceType === 'middle') {
    paceType = 'high';
    console.log(`[FormationPhase] コース特性により ハイペースに修正`);
  } else if (courseInfo?.paceTendency === 'slow' && paceType === 'middle') {
    paceType = 'slow';
    console.log(`[FormationPhase] コース特性により スローペースに修正`);
  }
  
  // ========================================
  // 3. スタミナ消費を計算
  // ========================================
  for (const horse of horses) {
    let staminaConsumption = 10; // 基本消費量
    
    // ペースによる消費量調整
    if (paceType === 'high') {
      if (horse.position <= totalHorses * 0.3) {
        // 先行馬はハイペースで大幅消費
        staminaConsumption = 20;
        
        events.push({
          horseNumber: horse.horseNumber,
          horseName: horse.horseName,
          event: 'stamina-loss',
          description: 'ハイペースで先行、スタミナ消費大'
        });
      } else {
        // 後方馬も若干消費
        staminaConsumption = 8;
      }
    } else if (paceType === 'slow') {
      if (horse.position <= totalHorses * 0.2) {
        // 逃げ馬はスローでも消費
        staminaConsumption = 8;
      } else {
        // 後方馬はスタミナ温存
        staminaConsumption = 3;
      }
    }
    
    // スタミナ消費を適用
    horse.staminaRemaining = Math.max(0, horse.staminaRemaining - staminaConsumption);
  }
  
  // ========================================
  // 4. 距離延長・短縮による位置取り変化
  // ========================================
  for (const horse of horses) {
    // TODO: 前走距離との比較が必要
    // 現状は pastPositionPattern から推定
    
    // 距離延長の場合、位置取りが上がる傾向
    // 距離短縮の場合、位置取りが下がる傾向
    // ここではシンプルに leadingIntention で判定
    
    if (horse.leadingIntention >= 70) {
      // 先行意欲が高い馬は前に出る
      if (horse.position > 3) {
        const positionGain = 1;
        horse.position = Math.max(1, horse.position - positionGain);
        
        events.push({
          horseNumber: horse.horseNumber,
          horseName: horse.horseName,
          event: 'accelerate',
          description: '先行意欲が高く、位置を上げる'
        });
      }
    } else if (horse.leadingIntention <= 30) {
      // 先行意欲が低い馬は控える
      if (horse.position <= totalHorses * 0.4) {
        const positionLoss = 1;
        horse.position = Math.min(totalHorses, horse.position + positionLoss);
        
        events.push({
          horseNumber: horse.horseNumber,
          horseName: horse.horseName,
          event: 'decelerate',
          description: '先行意欲が低く、控える'
        });
      }
    }
  }
  
  // ========================================
  // 5. 位置を再ソート
  // ========================================
  const sortedHorses = [...horses].sort((a, b) => a.position - b.position);
  
  // 位置を1から連番に正規化
  sortedHorses.forEach((h, idx) => {
    h.position = idx + 1;
    h.distanceFromLeader = (h.position - 1) * 2.5; // 1馬身≒2.5m（距離が伸びた）
  });
  
  console.log('[FormationPhase] === 隊列形成フェーズ完了 ===');
  console.log(`  ペース: ${paceType}`);
  console.log(`  先行${frontRunners}頭`);
  sortedHorses.slice(0, 5).forEach(h => {
    console.log(`  ${h.position}番手: ${h.horseName} (スタミナ残${h.staminaRemaining.toFixed(0)}%)`);
  });
  
  // 先頭グループを特定
  const leadingHorses = sortedHorses
    .filter(h => h.position <= 3)
    .map(h => h.horseNumber);
  
  return {
    phaseName: '隊列確定〜ペース形成',
    distanceRange: { start: 200, end: 600 },
    horses: sortedHorses,
    paceInfo: {
      averageSpeed: paceType === 'high' ? 85 : paceType === 'slow' ? 65 : 75,
      leadingHorses,
      paceType,
    },
    events,
  };
}
