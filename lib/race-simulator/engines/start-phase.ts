/**
 * スタートフェーズエンジン
 * 
 * スタート〜隊列形成（0-200m）
 * 
 * 処理内容:
 * 1. 内枠から順に処理（椅子取りゲーム）
 * 2. startSpeed + leadingIntention でスタートダッシュ力計算
 * 3. 前走1Cで1-3番手なら leadingIntention +20
 * 4. PFS（過去の先行成功率）を考慮
 * 5. 外枠で startSpeed が著しく高い場合、内に切れ込む
 */

import type { HorseState, PhaseResult, SimulationEvent } from '@/types/race-simulator';

export interface StartPhaseInput {
  horses: HorseState[];
  totalHorses: number;
}

export interface StartPhaseOutput {
  horses: HorseState[];
  events: SimulationEvent[];
}

/**
 * スタートフェーズを実行
 */
export function executeStartPhase(input: StartPhaseInput): PhaseResult {
  const { horses, totalHorses } = input;
  
  console.log('[StartPhase] === スタートフェーズ開始 ===');
  
  // 枠番順にソート（内枠から処理）
  const sortedByWaku = [...horses].sort((a, b) => a.waku - b.waku);
  
  const events: SimulationEvent[] = [];
  const occupiedPositions: Map<number, { horseNumber: number; score: number }> = new Map();
  
  // スコア差の閾値
  const DOMINANT_THRESHOLD = 15;  // これ以上速ければ内に切れ込める
  
  for (const horse of sortedByWaku) {
    const { horseNumber, horseName, waku, capabilities, leadingIntention, pfs } = horse;
    
    // ========================================
    // スタートダッシュスコアを計算
    // ========================================
    let startDashScore = capabilities.startSpeed * 0.7 + leadingIntention * 0.3;
    
    // 前走1C通過順位でブースト
    if (horse.pastPositionPattern.startsWith('1-') || 
        horse.pastPositionPattern.startsWith('2-') || 
        horse.pastPositionPattern.startsWith('3-')) {
      startDashScore += 10;
      console.log(`[StartPhase] ${horseName}: 前走先行経験あり +10`);
    }
    
    // PFSが高い場合ブースト
    if (pfs >= 80) {
      startDashScore += 8;
    } else if (pfs >= 60) {
      startDashScore += 4;
    }
    
    // ========================================
    // 位置決定（椅子取りゲーム）
    // ========================================
    const occupiedList = Array.from(occupiedPositions.values());
    const innerHorsesAvgScore = occupiedList.length > 0
      ? occupiedList.reduce((sum, h) => sum + h.score, 0) / occupiedList.length
      : 0;
    
    let finalPosition: number;
    let cutIn = false;
    
    if (occupiedList.length === 0) {
      // 最初の馬（1枠）
      if (startDashScore >= 85) {
        finalPosition = 1;
      } else if (startDashScore >= 70) {
        finalPosition = 2;
      } else if (startDashScore >= 55) {
        finalPosition = totalHorses * 0.35;
      } else {
        finalPosition = totalHorses * 0.6;
      }
      
      occupiedPositions.set(Math.ceil(finalPosition), { horseNumber, score: startDashScore });
      console.log(`[StartPhase] ${horseName}(${waku}枠): スコア${startDashScore.toFixed(0)} → 位置${finalPosition.toFixed(1)}`);
    } else {
      const scoreDiff = startDashScore - innerHorsesAvgScore;
      
      // 内側より著しく速い → 切れ込む
      if (scoreDiff >= DOMINANT_THRESHOLD) {
        const frontPositions = Array.from(occupiedPositions.keys()).sort((a, b) => a - b);
        const currentFront = frontPositions[0] || 1;
        
        if (startDashScore >= 80) {
          // 圧倒的に速い: ハナを奪う
          finalPosition = 1;
          cutIn = true;
          
          // 既存の馬を1つ後ろにずらす
          const displaced = occupiedPositions.get(1);
          if (displaced) {
            occupiedPositions.delete(1);
            occupiedPositions.set(2, displaced);
            console.log(`[StartPhase]   → 馬${displaced.horseNumber}を位置2に押し出し`);
          }
          
          events.push({
            horseNumber,
            horseName,
            event: 'cut-in',
            description: `外枠から内に切れ込み、ハナに立つ（スコア差+${scoreDiff.toFixed(0)}）`
          });
        } else {
          // 番手を確保
          finalPosition = currentFront + 1;
          cutIn = true;
          
          events.push({
            horseNumber,
            horseName,
            event: 'cut-in',
            description: `内より速く番手を確保（スコア差+${scoreDiff.toFixed(0)}）`
          });
        }
        
        occupiedPositions.set(finalPosition, { horseNumber, score: startDashScore });
        console.log(`[StartPhase] ${horseName}(${waku}枠): 内より速い(+${scoreDiff.toFixed(0)}) → 切れ込み位置${finalPosition}`);
      }
      // 内側と同等 → スコアに応じて位置決定
      else if (Math.abs(scoreDiff) <= 5) {
        if (startDashScore >= 70) {
          const maxOccupied = Math.max(...Array.from(occupiedPositions.keys()));
          finalPosition = maxOccupied + 0.5 + waku * 0.05;
        } else {
          finalPosition = totalHorses * 0.4 + waku * 0.05;
        }
        
        occupiedPositions.set(Math.ceil(finalPosition), { horseNumber, score: startDashScore });
        console.log(`[StartPhase] ${horseName}(${waku}枠): 内と同等(スコア${startDashScore.toFixed(0)}) → 位置${finalPosition.toFixed(1)}`);
      }
      // 内側より遅い → 控える
      else {
        const basePosition = totalHorses * 0.5 + (100 - startDashScore) / 100 * totalHorses * 0.5;
        finalPosition = Math.min(totalHorses, basePosition + waku * 0.08);
        
        console.log(`[StartPhase] ${horseName}(${waku}枠): 内より遅い(${scoreDiff.toFixed(0)}) → 位置${finalPosition.toFixed(1)}`);
      }
    }
    
    // ========================================
    // 【Phase 4.1】速度・距離を計算
    // ========================================
    // スタートダッシュの速度（m/s）
    // 基本速度 15m/s + スコアによる補正
    const baseVelocity = 15.0;
    const velocityBonus = (startDashScore - 50) / 50 * 3; // ±3m/s
    const velocity = Math.max(10, Math.min(20, baseVelocity + velocityBonus));
    
    // このフェーズでの走行距離（200m）
    const phaseDistance = 200;
    const avgVelocity = velocity * 0.9; // 加速中なので平均速度は低め
    
    // 順位に応じた距離差（前の馬ほど先に進む）
    const distanceGap = (finalPosition - 1) * 2.5; // 1馬身≒2.5m
    const actualDistance = phaseDistance - distanceGap;
    
    // HorseState を更新
    horse.position = finalPosition;
    horse.internalLane = waku;
    horse.currentDistance = actualDistance;
    horse.currentVelocity = velocity;
    horse.distanceFromLeader = distanceGap; // currentDistanceの差から計算
    
    // 横位置（レーン移動があれば反映）
    if (cutIn) {
      horse.lateralPosition = (waku - 4.5) * 2.5 - 3; // 内に寄る
      horse.outerPath = false;
    } else if (waku >= 6 && finalPosition > totalHorses * 0.5) {
      horse.lateralPosition = (waku - 4.5) * 2.5 + 2; // 外に膨らむ
      horse.outerPath = true;
    } else {
      horse.lateralPosition = (waku - 4.5) * 2.5;
    }
  }
  
  // 位置で再ソート
  const sortedHorses = [...horses].sort((a, b) => a.position - b.position);
  
  // 位置を1から連番に正規化
  sortedHorses.forEach((h, idx) => {
    h.position = idx + 1;
  });
  
  // ========================================
  // 【Phase 4.1】整合性チェック
  // ========================================
  const leadHorse = sortedHorses[0];
  for (const horse of sortedHorses) {
    // distanceFromLeader = 先頭馬のcurrentDistance - 自馬のcurrentDistance
    const calculatedGap = leadHorse.currentDistance - horse.currentDistance;
    
    if (Math.abs(calculatedGap - horse.distanceFromLeader) > 0.1) {
      console.warn(`[StartPhase] 整合性エラー: ${horse.horseName} distanceFromLeader=${horse.distanceFromLeader.toFixed(1)}m, 計算値=${calculatedGap.toFixed(1)}m`);
      // 修正
      horse.distanceFromLeader = calculatedGap;
    }
  }
  
  // 所要時間を計算
  const phaseDistance = 200;
  const avgVelocity = sortedHorses.reduce((sum, h) => sum + h.currentVelocity, 0) / sortedHorses.length;
  const phaseTime = phaseDistance / avgVelocity;
  
  console.log('[StartPhase] === スタートフェーズ完了 ===');
  console.log(`  距離: ${phaseDistance}m, 平均速度: ${avgVelocity.toFixed(1)}m/s, 所要時間: ${phaseTime.toFixed(1)}秒`);
  sortedHorses.slice(0, 5).forEach(h => {
    console.log(`  ${h.position}番手: ${h.horseName} (距離=${h.currentDistance.toFixed(1)}m, 速度=${h.currentVelocity.toFixed(1)}m/s)`);
  });
  
  // 先頭グループを特定
  const leadingHorses = sortedHorses
    .filter(h => h.position <= 3)
    .map(h => h.horseNumber);
  
  return {
    phaseName: 'スタート〜隊列形成',
    distanceRange: { start: 0, end: 200 },
    timeRange: { start: 0, end: phaseTime },
    horses: sortedHorses,
    paceInfo: {
      averageSpeed: avgVelocity,
      leadingHorses,
      paceType: 'middle', // 仮
    },
    events,
  };
}
