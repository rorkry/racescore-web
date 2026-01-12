/**
 * 指数推定ライブラリ
 * 
 * 実際の指数データがない場合に、着順・着差・通過順位から指数を推定する
 */

import { EstimatedIndices } from '@/types/saga-analysis';

interface RaceData {
  finish_position: number;
  margin?: number | string;
  distance: number;
  position_2corner?: string;
  position_3corner?: string;
  position_4corner?: string;
}

/**
 * 着差文字列を秒数に変換
 */
function parseMargin(margin: string | number | undefined): number {
  if (!margin) return 0;
  if (typeof margin === 'number') return margin;
  
  const str = margin.trim();
  if (str === '大差') return 2.5;
  if (str === '同着') return 0;
  if (str.includes('1/2')) return parseFloat(str.replace('1/2', '.5')) || 0.5;
  if (str.includes('1/4')) return parseFloat(str.replace('1/4', '.25')) || 0.25;
  if (str.includes('3/4')) return parseFloat(str.replace('3/4', '.75')) || 0.75;
  
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * L4F（後半4F速度指数）を推定
 * 着順が良いほど、着差が小さいほど、L4Fは良い（低い）値になる
 */
function estimateL4F(rank: number, margin: number, distance: number): number {
  // 基準値（距離によって調整）
  let baseL4F = 47.0; // 標準的なL4F
  
  if (distance >= 2000) {
    baseL4F += 1.0; // 長距離はL4Fが遅くなる
  } else if (distance <= 1400) {
    baseL4F -= 0.5; // 短距離はL4Fが速くなる
  }
  
  // 着順によるペナルティ（1着が最も良い）
  const rankPenalty = (rank - 1) * 0.3;
  
  // 着差によるペナルティ
  const marginPenalty = Math.min(margin, 5) * 0.2;
  
  // L4Fは高いほど良い（速い）ので、ペナルティを引く
  const l4f = baseL4F + rankPenalty - marginPenalty;
  
  return Math.round(l4f * 10) / 10;
}

/**
 * T2F（前半2Fラップ）を推定
 * 2角での位置取りから前半のスピードを推定
 */
function estimateT2F(position: string | null | undefined, rank: number): number {
  let baseT2F = 24.0; // 標準的なT2F（秒）
  
  if (position) {
    const pos = parseInt(position);
    if (!isNaN(pos)) {
      if (pos <= 3) {
        baseT2F = 23.5; // 先行していれば速い
      } else if (pos <= 6) {
        baseT2F = 24.0;
      } else if (pos <= 10) {
        baseT2F = 24.5;
      } else {
        baseT2F = 25.0; // 後方は遅い
      }
    }
  }
  
  // 勝ち馬は前半も速い傾向
  if (rank === 1) baseT2F -= 0.2;
  else if (rank >= 10) baseT2F += 0.2;
  
  return Math.round(baseT2F * 10) / 10;
}

/**
 * ポテンシャル指数を推定
 * 着順と着差から将来性を推定
 */
function estimatePotential(rank: number, margin: number): number {
  if (rank === 1) {
    return 3.5 + Math.random() * 1.0;
  }
  if (rank === 2) {
    return margin < 0.5 ? 3.0 : 2.5;
  }
  if (rank === 3) {
    return 2.0 + (margin < 1.0 ? 0.5 : 0);
  }
  if (rank <= 5) {
    return 1.5;
  }
  if (rank <= 8) {
    return 1.0;
  }
  return 0.5;
}

/**
 * 巻き返し指数を推定
 * 後方から追い込んで好走した場合に高い値
 */
function estimateMakikaeshi(
  position: string | null | undefined, 
  rank: number,
  position4corner?: string
): number {
  if (!position) return 0;
  
  const pos2 = parseInt(position);
  const pos4 = position4corner ? parseInt(position4corner) : pos2;
  
  if (isNaN(pos2)) return 0;
  
  // 後方から好走した場合
  if (pos2 >= 8 && rank <= 3) {
    return 3.0 + Math.random() * 1.0;
  }
  if (pos2 >= 6 && rank <= 5) {
    return 2.0 + Math.random() * 0.5;
  }
  // 位置を上げて好走した場合
  if (!isNaN(pos4) && pos4 < pos2 && rank <= 5) {
    return 1.5 + Math.random() * 0.5;
  }
  
  return 0;
}

/**
 * レースデータから指数を推定
 */
export function estimateIndices(race: RaceData): EstimatedIndices {
  const { finish_position, margin, distance, position_2corner, position_4corner } = race;
  
  const marginSec = parseMargin(margin);
  
  return {
    l4f: estimateL4F(finish_position, marginSec, distance),
    t2f: estimateT2F(position_2corner, finish_position),
    potential: estimatePotential(finish_position, marginSec),
    makikaeshi: estimateMakikaeshi(position_2corner, finish_position, position_4corner),
    isEstimated: true
  };
}

/**
 * 指数データがある場合はそれを使い、なければ推定する
 */
export function getOrEstimateIndices(
  race: RaceData,
  existingIndices?: { l4f?: number; t2f?: number; potential?: number; makikaeshi?: number }
): EstimatedIndices {
  if (existingIndices && (existingIndices.l4f || existingIndices.t2f)) {
    return {
      l4f: existingIndices.l4f || 0,
      t2f: existingIndices.t2f || 0,
      potential: existingIndices.potential || 0,
      makikaeshi: existingIndices.makikaeshi || 0,
      isEstimated: false
    };
  }
  
  return estimateIndices(race);
}









