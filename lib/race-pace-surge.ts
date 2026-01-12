/**
 * レース展開予想 - 噴射エフェクト判定ロジック
 * 
 * 偏差値と位置取りから「来る可能性が高い馬」を判定
 */

import type { RunningStyle } from '@/types/race-pace-types';

export type SurgeIntensity = 'strong' | 'medium' | 'weak' | null;

export interface SurgeHorse {
  horseNumber: number;
  intensity: SurgeIntensity;
}

/**
 * 偏差値に基づく噴射強度を判定
 * 
 * @param scoreDeviation - 偏差値
 * @param startPosition - スタート位置
 * @param goalPosition - ゴール位置
 * @param totalHorses - 出走頭数
 * @returns 噴射強度
 */
export function determineSurgeIntensity(
  scoreDeviation: number,
  startPosition: number,
  goalPosition: number,
  totalHorses: number
): SurgeIntensity {
  const positionGain = startPosition - goalPosition;
  const relativeStartPos = startPosition / totalHorses;
  
  // 偏差値70以上（レース内圧倒的） + 浮上
  if (scoreDeviation >= 70 && positionGain >= 5.0) {
    return 'strong';
  }
  
  // 偏差値65以上（レース内上位） + 顕著な浮上
  if (scoreDeviation >= 65 && positionGain >= 4.0) {
    return 'strong';
  }
  
  // 偏差値60以上（レース内有力） + 浮上
  if (scoreDeviation >= 60) {
    if (positionGain >= 5.0) {
      return 'strong';
    } else if (positionGain >= 3.0) {
      return 'medium';
    }
  }
  
  // 偏差値55以上（レース内中堅上位） + 浮上
  if (scoreDeviation >= 55) {
    if (positionGain >= 6.0) {
      return 'medium';
    } else if (positionGain >= 4.0) {
      return 'weak';
    }
  }
  
  // 偏差値50以上（レース内平均やや上） + 大きな浮上
  if (scoreDeviation >= 50) {
    if (positionGain >= 7.0) {
      return 'weak';
    }
  }
  
  return null;
}

/**
 * レース全体から噴射エフェクトを判定
 * 
 * @param horses - 馬情報配列（scoreDeviation, startPosition, goalPosition を含む）
 * @param totalHorses - 出走頭数
 * @returns 噴射する馬の配列
 */
export function identifySurgeHorses<T extends {
  horseNumber: number;
  scoreDeviation?: number;
  expectedPosition2C: number;
  expectedPositionGoal: number;
}>(
  horses: T[],
  totalHorses: number
): SurgeHorse[] {
  return horses
    .map(horse => {
      const scoreDeviation = horse.scoreDeviation ?? 50;
      const intensity = determineSurgeIntensity(
        scoreDeviation,
        horse.expectedPosition2C,
        horse.expectedPositionGoal,
        totalHorses
      );
      
      if (intensity) {
        return {
          horseNumber: horse.horseNumber,
          intensity
        };
      }
      return null;
    })
    .filter((surge): surge is SurgeHorse => surge !== null);
}

/**
 * 特定の馬が噴射対象かどうかを判定
 * 
 * @param horseNumber - 馬番
 * @param surgeHorses - 噴射馬リスト
 * @returns 噴射強度（噴射しない場合は null）
 */
export function getSurgeIntensity(
  horseNumber: number,
  surgeHorses: SurgeHorse[]
): SurgeIntensity {
  const surge = surgeHorses.find(s => s.horseNumber === horseNumber);
  return surge?.intensity ?? null;
}










