/**
 * display-frame（純粋関数・共通ロジック）
 *
 * 3D描画側の各消費者（馬メッシュ配置・broadcastカメラ・followカメラ・
 * 先頭馬ラベル・trackingパネル）が「同一フレームで同じ座標源」を参照するための
 * 共通ロジックをここへ集約する。
 *
 * 正本の優先順位（変更しない）:
 *   1. dynamics（race-dynamics） + interpolateDynamicsForDisplay
 *      （start gate blend / goal blend / predicted finish convergence を含む）
 *   2. dynamics が無い場合のみ、旧timeline補間値（currentState.horses）へ fallback
 *
 * race dynamics 本体・予想着順ロジック・camera director の根本設計は変更しない。
 * ここでは既存の正本を「読むだけ」で、各消費者に同じ値を配る。
 */

import type { RaceDynamicsResult } from '../race-dynamics/types';
import { interpolateDynamicsForDisplay, type ForecastLayouts3D, type RacecourseLayout, type FormationBonusContext } from './race-3d-integration';
import { trackingInputsFromDynamics } from './tracking-rows';
import { sampleRaceProgressPose } from '../racecourse-geometry';

/** 各消費者へ配る「現在フレーム」の馬状態。単位はメートル(raceProgress)/メートル(lateralPosition)で統一。 */
export interface DisplayHorseFrame {
  horseNumber: number;
  raceProgress: number;
  lateralPosition: number;
  blocked: boolean;
  finished: boolean;
  finishTime?: number;
}

/** dynamics が無い場合の fallback 入力（旧timeline補間値=currentState.horses由来）。 */
export interface FallbackHorseInput {
  horseNumber: number;
  currentDistance: number;
  lateralPosition?: number;
  blocked?: boolean;
}

/**
 * 現在時刻の display frame を解決する。
 * dynamics があれば interpolateDynamicsForDisplay の結果（start gate blend /
 * goal blend / predicted finish convergence 込み）を最優先で使う。
 * dynamics が無い場合のみ fallbackHorses（旧timeline補間値）を使う。
 */
export function resolveDisplayFrame(params: {
  dynamics: RaceDynamicsResult | null;
  /** dynamics 内部時間（秒）。呼び出し側で currentTime/timelineDuration から比率変換したもの */
  dynamicsTime: number;
  forecastLayouts: ForecastLayouts3D | null;
  fallbackHorses: FallbackHorseInput[];
  /** 競うスコア由来の表示隊列 前方向補正（formation〜corner のみ・表示専用）。省略可 */
  formationBonus?: FormationBonusContext | null;
}): DisplayHorseFrame[] {
  const { dynamics, dynamicsTime, forecastLayouts, fallbackHorses, formationBonus } = params;
  if (dynamics) {
    const frame = interpolateDynamicsForDisplay(dynamics, dynamicsTime, forecastLayouts, formationBonus);
    return frame.map((h) => ({
      horseNumber: h.horseNumber,
      raceProgress: h.raceProgress,
      lateralPosition: h.lateralPosition,
      blocked: h.blocked,
      finished: h.finished,
      finishTime: h.finishTime,
    }));
  }
  return fallbackHorses.map((h) => ({
    horseNumber: h.horseNumber,
    raceProgress: h.currentDistance,
    lateralPosition: h.lateralPosition ?? 0,
    blocked: h.blocked ?? false,
    finished: false,
  }));
}

/**
 * display frame から先頭馬(horseNumber)を判定する。
 * trackingパネル（tracking-rows.ts の trackingInputsFromDynamics）と同一アルゴリズムを
 * 使うことで、先頭馬ラベルとtrackingの先頭馬表示を必ず一致させる。
 * 配列indexではなく horseNumber で対応するため、frame の並び順には依存しない。
 */
export function resolveLeaderHorseNumber(frame: DisplayHorseFrame[], raceDistance: number): number | null {
  if (frame.length === 0) return null;
  const rows = trackingInputsFromDynamics(frame, raceDistance);
  return rows[0]?.horseNumber ?? null;
}

/**
 * display frame 上の指定馬(horseNumber)のワールド座標(pose)を、
 * 馬メッシュ配置（positionHorsesOnGeometry）と同一の計算式(sampleRaceProgressPose)で取得する。
 * followカメラの target が実際の馬メッシュ位置と一致することを保証するために使う。
 * 配列indexではなく horseNumber で対応する。見つからない/座標が不正な場合は null。
 */
export function resolveHorseWorldPose(
  layout: RacecourseLayout,
  frame: DisplayHorseFrame[],
  horseNumber: number,
) {
  const horse = frame.find((h) => h.horseNumber === horseNumber);
  if (!horse || !Number.isFinite(horse.raceProgress) || !Number.isFinite(horse.lateralPosition)) {
    return null;
  }
  const pose = sampleRaceProgressPose(
    layout.geometry,
    layout.startMarker.pathDistance,
    horse.raceProgress,
    horse.lateralPosition,
  );
  if (!Number.isFinite(pose.position.x) || !Number.isFinite(pose.position.y) || !Number.isFinite(pose.position.z)) {
    return null;
  }
  return pose;
}
