/**
 * RacePaceCard コンポーネントのローカル型定義
 */

import type { 
  RacePacePrediction, 
  HorsePositionPrediction,
  RunningStyle 
} from '@/types/race-pace-types';
import type { SurgeIntensity } from '@/lib/race-pace-surge';
import type { HorseLayout } from '@/lib/race-pace-layout';

/**
 * バイアス設定
 */
export interface BiasSettings {
  'uchi-mae': boolean;
  'soto-mae': boolean;
  'uchi-ushiro': boolean;
  'soto-ushiro': boolean;
  'nigashi': boolean;
}

/**
 * 拡張された馬情報（偏差値・レイアウト付き）
 */
export interface EnhancedHorsePosition extends HorsePositionPrediction {
  scoreDeviation?: number;
  layout?: HorseLayout;
  surgeIntensity?: SurgeIntensity;
}

/**
 * コース特性情報
 */
export interface CourseInfo {
  straightLength: number;
  hasSlope: boolean;
  slopePosition?: string;
  outerFrameAdvantage: number;
  innerFrameAdvantage: number;
}














