/**
 * 馬の能力分析器
 * 
 * 既存の指数（T2F, L4F, potential, makikaeshi, PFS等）から
 * シミュレーター用の5つの能力値を算出
 */

import type { HorseCapabilities } from '@/types/race-simulator';
import type { HorseIndices } from './data-fetcher';

/**
 * 能力値を算出（0-100スケール）
 */
export function analyzeCapabilities(
  indices: HorseIndices,
  totalHorses: number
): HorseCapabilities {
  return {
    startSpeed: calculateStartSpeed(indices),
    cruiseSpeed: calculateCruiseSpeed(indices),
    acceleration: calculateAcceleration(indices),
    stamina: calculateStamina(indices),
    cornerSkill: calculateCornerSkill(indices),
  };
}

/**
 * スタートダッシュ力（0-100）
 * 
 * 主要因子:
 * - T2F（前半2F）: 最重要
 * - PFS（先行期待度）
 * - 前走1C通過順位
 */
function calculateStartSpeed(indices: HorseIndices): number {
  let score = 50; // デフォルト
  let weight = 0;
  
  // ========================================
  // 1. T2F（前半2Fラップ）: 最重要 60%
  // ========================================
  if (indices.avgData.T2F !== null) {
    const t2f = indices.avgData.T2F;
    
    // T2Fが速いほど高スコア
    // 22.0秒 → 100点
    // 23.0秒 → 85点
    // 24.0秒 → 65点
    // 25.0秒 → 45点
    // 26.0秒 → 20点
    let t2fScore = 0;
    if (t2f <= 22.0) {
      t2fScore = 100;
    } else if (t2f <= 23.0) {
      t2fScore = 85 + (23.0 - t2f) * 15; // 85-100
    } else if (t2f <= 24.0) {
      t2fScore = 65 + (24.0 - t2f) * 20; // 65-85
    } else if (t2f <= 25.0) {
      t2fScore = 45 + (25.0 - t2f) * 20; // 45-65
    } else if (t2f <= 26.0) {
      t2fScore = 20 + (26.0 - t2f) * 25; // 20-45
    } else {
      t2fScore = Math.max(0, 20 - (t2f - 26.0) * 10);
    }
    
    score = t2fScore * 0.6;
    weight += 0.6;
  }
  
  // ========================================
  // 2. PFS（先行期待度）: 20%
  // ========================================
  if (indices.avgData.pfs !== null) {
    // PFSは既に0-100スケールと仮定
    score += indices.avgData.pfs * 0.2;
    weight += 0.2;
  }
  
  // ========================================
  // 3. 前走1C通過順位: 20%
  // ========================================
  if (indices.lastRace.corner1 !== null) {
    const corner1 = indices.lastRace.corner1;
    
    // 1-3番手 → 高スコア
    let corner1Score = 0;
    if (corner1 === 1) {
      corner1Score = 100;
    } else if (corner1 === 2) {
      corner1Score = 90;
    } else if (corner1 === 3) {
      corner1Score = 80;
    } else if (corner1 <= 5) {
      corner1Score = 60;
    } else if (corner1 <= 8) {
      corner1Score = 40;
    } else {
      corner1Score = 20;
    }
    
    score += corner1Score * 0.2;
    weight += 0.2;
  }
  
  // 重み正規化
  if (weight > 0) {
    score = score / weight * 100;
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * 巡航速度（0-100）
 * 
 * 主要因子:
 * - potential（ポテンシャル指数）
 * - T2F（一定以上で巡航力あり）
 */
function calculateCruiseSpeed(indices: HorseIndices): number {
  let score = 50;
  let weight = 0;
  
  // ========================================
  // 1. potential（ポテンシャル指数）: 70%
  // ========================================
  if (indices.avgData.potential !== null) {
    const potential = indices.avgData.potential;
    
    // potentialは通常0-10程度のスケール
    // 8以上 → 優秀
    // 5前後 → 平均
    // 3以下 → 低い
    let potentialScore = 0;
    if (potential >= 8.0) {
      potentialScore = 90 + (potential - 8.0) * 5; // 90-100+
    } else if (potential >= 6.0) {
      potentialScore = 70 + (potential - 6.0) * 10; // 70-90
    } else if (potential >= 4.0) {
      potentialScore = 50 + (potential - 4.0) * 10; // 50-70
    } else if (potential >= 2.0) {
      potentialScore = 30 + (potential - 2.0) * 10; // 30-50
    } else {
      potentialScore = Math.max(0, 30 - (2.0 - potential) * 15);
    }
    
    score = potentialScore * 0.7;
    weight += 0.7;
  }
  
  // ========================================
  // 2. T2F（補助的）: 30%
  // ========================================
  if (indices.avgData.T2F !== null) {
    const t2f = indices.avgData.T2F;
    
    // T2Fが23-25秒の範囲で巡航力あり
    let t2fScore = 0;
    if (t2f <= 23.5) {
      t2fScore = 80; // 速すぎると持続力不足
    } else if (t2f <= 24.5) {
      t2fScore = 90; // 理想的な巡航ペース
    } else if (t2f <= 25.5) {
      t2fScore = 70;
    } else {
      t2fScore = 50;
    }
    
    score += t2fScore * 0.3;
    weight += 0.3;
  }
  
  if (weight > 0) {
    score = score / weight * 100;
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * 加速力（0-100）
 * 
 * 主要因子:
 * - L4F（後半4F指数）: 最重要
 * - makikaeshi（巻き返し指数）
 */
function calculateAcceleration(indices: HorseIndices): number {
  let score = 50;
  let weight = 0;
  
  // ========================================
  // 1. L4F（後半4F指数）: 60%
  // ========================================
  if (indices.avgData.L4F !== null) {
    const l4f = indices.avgData.L4F;
    
    // L4Fは通常40-50程度、高いほど追い込み力あり
    let l4fScore = 0;
    if (l4f >= 50.0) {
      l4fScore = 95 + (l4f - 50.0) * 1; // 95-100+
    } else if (l4f >= 48.0) {
      l4fScore = 85 + (l4f - 48.0) * 5; // 85-95
    } else if (l4f >= 46.0) {
      l4fScore = 70 + (l4f - 46.0) * 7.5; // 70-85
    } else if (l4f >= 44.0) {
      l4fScore = 50 + (l4f - 44.0) * 10; // 50-70
    } else if (l4f >= 42.0) {
      l4fScore = 30 + (l4f - 42.0) * 10; // 30-50
    } else {
      l4fScore = Math.max(0, 30 - (42.0 - l4f) * 7.5);
    }
    
    score = l4fScore * 0.6;
    weight += 0.6;
  }
  
  // ========================================
  // 2. makikaeshi（巻き返し指数）: 40%
  // ========================================
  if (indices.avgData.makikaeshi !== null) {
    const makikaeshi = indices.avgData.makikaeshi;
    
    // makikaeshiは通常0-10程度
    // 5以上 → 巻き返し力あり
    // 3前後 → 平均
    // 2以下 → 低い
    let makikaeshiScore = 0;
    if (makikaeshi >= 6.0) {
      makikaeshiScore = 90 + (makikaeshi - 6.0) * 5; // 90-100+
    } else if (makikaeshi >= 4.0) {
      makikaeshiScore = 70 + (makikaeshi - 4.0) * 10; // 70-90
    } else if (makikaeshi >= 2.5) {
      makikaeshiScore = 50 + (makikaeshi - 2.5) * 13.3; // 50-70
    } else if (makikaeshi >= 1.5) {
      makikaeshiScore = 30 + (makikaeshi - 1.5) * 20; // 30-50
    } else {
      makikaeshiScore = Math.max(0, 30 - (1.5 - makikaeshi) * 20);
    }
    
    score += makikaeshiScore * 0.4;
    weight += 0.4;
  }
  
  if (weight > 0) {
    score = score / weight * 100;
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * スタミナ（0-100）
 * 
 * 主要因子:
 * - potential（持続力）
 * - 距離適性（過去同距離実績）
 */
function calculateStamina(indices: HorseIndices): number {
  let score = 50;
  let weight = 0;
  
  // ========================================
  // 1. potential（持続力）: 60%
  // ========================================
  if (indices.avgData.potential !== null) {
    const potential = indices.avgData.potential;
    
    // potentialが高いほどスタミナあり
    let potentialScore = 0;
    if (potential >= 7.0) {
      potentialScore = 85 + (potential - 7.0) * 7.5; // 85-100+
    } else if (potential >= 5.0) {
      potentialScore = 65 + (potential - 5.0) * 10; // 65-85
    } else if (potential >= 3.0) {
      potentialScore = 45 + (potential - 3.0) * 10; // 45-65
    } else if (potential >= 1.5) {
      potentialScore = 30 + (potential - 1.5) * 10; // 30-45
    } else {
      potentialScore = Math.max(0, 30 - (1.5 - potential) * 20);
    }
    
    score = potentialScore * 0.6;
    weight += 0.6;
  }
  
  // ========================================
  // 2. 距離適性（同距離での実績数）: 40%
  // ========================================
  const raceCount = indices.avgData.raceCount;
  
  // 同距離±200mでの実績数
  let raceCountScore = 0;
  if (raceCount >= 8) {
    raceCountScore = 80; // 豊富な実績
  } else if (raceCount >= 5) {
    raceCountScore = 70;
  } else if (raceCount >= 3) {
    raceCountScore = 60;
  } else if (raceCount >= 1) {
    raceCountScore = 50;
  } else {
    raceCountScore = 40; // 実績なし
  }
  
  score += raceCountScore * 0.4;
  weight += 0.4;
  
  if (weight > 0) {
    score = score / weight * 100;
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * コーナリングスキル（0-100）
 * 
 * 主要因子:
 * - 過去2C, 3C, 4Cの平均通過順位
 * - cushion値（クッション適性）
 */
function calculateCornerSkill(indices: HorseIndices): number {
  let score = 50;
  let weight = 0;
  
  // ========================================
  // 1. 過去コーナー通過順位: 70%
  // ========================================
  const corner2Avg = average(indices.pastPositions.corner2);
  const corner3Avg = average(indices.pastPositions.corner3);
  const corner4Avg = average(indices.pastPositions.corner4);
  
  if (corner2Avg !== null && corner3Avg !== null && corner4Avg !== null) {
    const avgCornerPos = (corner2Avg + corner3Avg + corner4Avg) / 3;
    
    // コーナーで前にいるほど高スコア
    let cornerScore = 0;
    if (avgCornerPos <= 3) {
      cornerScore = 90;
    } else if (avgCornerPos <= 5) {
      cornerScore = 75;
    } else if (avgCornerPos <= 8) {
      cornerScore = 60;
    } else if (avgCornerPos <= 12) {
      cornerScore = 45;
    } else {
      cornerScore = 30;
    }
    
    score = cornerScore * 0.7;
    weight += 0.7;
  }
  
  // ========================================
  // 2. cushion値（クッション適性）: 30%
  // ========================================
  if (indices.cushion !== null) {
    const cushion = indices.cushion;
    
    // cushionは馬場適性を示す指数
    // 高いほど良馬場で走る、低いほど重馬場向き
    // コーナースキルとは間接的な関係だが、馬場に応じたコーナリングの安定性を示す
    let cushionScore = 50 + cushion * 5; // cushionが0なら50、10なら100
    
    score += cushionScore * 0.3;
    weight += 0.3;
  }
  
  if (weight > 0) {
    score = score / weight * 100;
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * 配列の平均を計算
 */
function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * デバッグ用: 能力値の詳細を出力
 */
export function logCapabilities(
  horseName: string,
  capabilities: HorseCapabilities,
  indices: HorseIndices
): void {
  console.log(`[Capabilities] ${horseName}:`);
  console.log(`  スタート: ${capabilities.startSpeed.toFixed(0)} (T2F=${indices.avgData.T2F?.toFixed(1)}, pfs=${indices.avgData.pfs?.toFixed(1)}, 前走1C=${indices.lastRace.corner1})`);
  console.log(`  巡航速度: ${capabilities.cruiseSpeed.toFixed(0)} (potential=${indices.avgData.potential?.toFixed(1)})`);
  console.log(`  加速力  : ${capabilities.acceleration.toFixed(0)} (L4F=${indices.avgData.L4F?.toFixed(1)}, makikaeshi=${indices.avgData.makikaeshi?.toFixed(1)})`);
  console.log(`  スタミナ: ${capabilities.stamina.toFixed(0)} (potential=${indices.avgData.potential?.toFixed(1)}, 実績=${indices.avgData.raceCount}走)`);
  console.log(`  コーナー: ${capabilities.cornerSkill.toFixed(0)}`);
}
