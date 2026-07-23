/**
 * race-3d-integration（純粋・THREE非依存）
 *
 * ResolvedCourse / CourseInfo と既存 SimulationResult を、
 *  1. racecourse-geometry の RacecourseLayout（geometry + startMarker）
 *  2. race-dynamics の RaceDynamicsResult（各馬独立の raceProgress）
 * へ橋渡しする。
 *
 * 3D描画側はこの layout と dynamics を「位置とレース進行の正本」として使う。
 * ここでは THREE を使わない（テスト容易性・SSR安全のため）。
 */

import type {
  RacecourseGeometry,
  StartMarker,
  GeometrySource,
  RacecourseDirection,
} from '../racecourse-geometry/types';
import {
  resolveRoute,
  resolveStartMarker,
  backCalculateStartMarker,
} from '../racecourse-geometry';
import type {
  HorseInput,
  HorseFrameState,
  RaceDynamicsResult,
  PaceType,
} from '../race-dynamics/types';
import {
  simulateRaceDynamics,
  adaptFormationToHorseInputs,
  type RawFormationHorse,
} from '../race-dynamics';
import { hashString } from '../race-dynamics/seed';

/** CourseInfo の最小形（place / distance / trackType / clockwise / paceTendency） */
export interface CourseInfoLike {
  place?: string;
  distance?: number;
  trackType?: string;
  clockwise?: boolean;
  paceTendency?: string;
  route?: string;
}

/** SimulationResult の最小形 */
export interface SimulationLike {
  raceKey?: string;
  raceDistance?: number;
  phases?: {
    start?: { horses?: SimHorseLike[] };
    [k: string]: unknown;
  };
  finalStandings?: SimHorseLike[];
}

export interface SimHorseLike {
  horseNumber: number;
  horseName?: string;
  position?: number;
  waku?: number;
  leadingIntention?: number;
  staminaRemaining?: number;
  capabilities?: {
    startSpeed?: number;
    cruiseSpeed?: number;
    acceleration?: number;
    stamina?: number;
    cornerSkill?: number;
  };
}

export interface RacecourseLayout {
  geometry: RacecourseGeometry;
  routeId: string;
  startMarker: StartMarker;
  finishPathDistance: number;
  raceDistance: number;
  direction: RacecourseDirection;
  provenance: GeometrySource;
  warnings: string[];
  /** startMarker が逆算フォールバックか */
  startMarkerIsFallback: boolean;
}

/**
 * CourseInfo から RacecourseLayout を解決する。
 * 実在しない組み合わせは null（推測で捏造しない）。
 */
export function resolveRacecourseLayout(
  courseInfo: CourseInfoLike | null | undefined
): RacecourseLayout | null {
  if (!courseInfo || !courseInfo.place || !courseInfo.trackType || courseInfo.distance == null) {
    return null;
  }
  const res = resolveRoute({
    venue: courseInfo.place,
    surface: courseInfo.trackType,
    route: courseInfo.route,
    raceDistance: courseInfo.distance,
  });
  if (!res) return null;

  const geometry = res.geometry;
  const raceDistance = courseInfo.distance;

  let startMarker = resolveStartMarker(geometry, raceDistance);
  if (!startMarker) {
    startMarker = backCalculateStartMarker(
      geometry,
      raceDistance,
      geometry.sourceUrls[0] ?? ''
    );
  }

  const warnings = [...res.warnings];
  if (
    courseInfo.clockwise != null &&
    ((courseInfo.clockwise && geometry.direction !== 'clockwise') ||
      (!courseInfo.clockwise && geometry.direction === 'clockwise'))
  ) {
    warnings.push(
      `courseInfo.clockwise(${courseInfo.clockwise}) と registry direction(${geometry.direction}) が不一致。registryを優先`
    );
  }

  return {
    geometry,
    routeId: geometry.id,
    startMarker,
    finishPathDistance: geometry.finishPathDistance,
    raceDistance,
    direction: geometry.direction,
    provenance: geometry.provenance,
    warnings,
    startMarkerIsFallback: startMarker.confidence === 'fallback',
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * 既存 SimulationResult の初期隊列・能力から HorseInput[] を作る。
 * 展開予想 adapter を経由して脚質・能力正規化を共通化する。
 */
export function buildHorseInputsFromSimulation(sim: SimulationLike): HorseInput[] {
  const horses: SimHorseLike[] =
    sim.phases?.start?.horses && sim.phases.start.horses.length > 0
      ? sim.phases.start.horses
      : sim.finalStandings ?? [];

  const n = horses.length;
  if (n === 0) return [];

  const raw: RawFormationHorse[] = horses.map((h, i) => {
    const rank = h.position ?? i + 1;
    const rankRatio = n > 1 ? (rank - 1) / (n - 1) : 0.5;
    const cap = h.capabilities ?? {};
    const ability = clamp01(
      ((cap.cruiseSpeed ?? 50) * 0.4 +
        (cap.acceleration ?? 50) * 0.3 +
        (cap.startSpeed ?? 50) * 0.15 +
        (cap.stamina ?? 50) * 0.15) /
        100
    );
    return {
      horseId: String(h.horseNumber),
      horseNumber: h.horseNumber,
      expectedRankRatio: rankRatio,
      ability,
      gateIndex: (h.waku ?? h.horseNumber ?? i + 1) - 1,
    };
  });

  const base = adaptFormationToHorseInputs(raw);

  // staminaBase を staminaRemaining から補完
  return base.map((hi) => {
    const src = horses.find((h) => h.horseNumber === hi.horseNumber);
    const staminaBase =
      src?.staminaRemaining != null
        ? clamp01(src.staminaRemaining / 100)
        : undefined;
    return staminaBase != null ? { ...hi, staminaBase } : hi;
  });
}

/**
 * レースのダイナミクスを実行する。seed は raceKey から決定論的に導出。
 */
export function runRaceDynamicsForRace(
  sim: SimulationLike,
  layout: RacecourseLayout,
  courseInfo?: CourseInfoLike | null
): RaceDynamicsResult | null {
  const inputs = buildHorseInputsFromSimulation(sim);
  if (inputs.length === 0) return null;

  const pace = normalizePace(courseInfo?.paceTendency);
  const seed = hashString(sim.raceKey || `${layout.routeId}:${layout.raceDistance}`);

  return simulateRaceDynamics(inputs, {
    raceDistance: layout.raceDistance,
    trackWidth: layout.geometry.trackWidth,
    seed,
    pace,
  });
}

function normalizePace(p: string | undefined): PaceType | undefined {
  if (p === 'slow' || p === 'middle' || p === 'high') return p;
  return undefined;
}

/**
 * dynamics 結果を時刻 time（秒）で補間して各馬の状態を返す。
 * 連続値(raceProgress/lateral/speed/stamina)は線形補間、
 * 離散値(rank/blocked/finished)は直前フレームから採用。
 */
export function interpolateDynamics(
  result: RaceDynamicsResult,
  time: number
): HorseFrameState[] {
  const frames = result.frames;
  if (frames.length === 0) return [];
  if (time <= frames[0].time) return frames[0].horses;
  const last = frames[frames.length - 1];
  if (time >= last.time) return last.horses;

  // 二分探索で time を挟む区間
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= time) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  const span = b.time - a.time;
  const t = span > 1e-9 ? (time - a.time) / span : 0;

  return a.horses.map((ha) => {
    const hb = b.horses.find((x) => x.horseNumber === ha.horseNumber) ?? ha;
    return {
      ...ha,
      raceProgress: ha.raceProgress + (hb.raceProgress - ha.raceProgress) * t,
      lateralPosition: ha.lateralPosition + (hb.lateralPosition - ha.lateralPosition) * t,
      speed: ha.speed + (hb.speed - ha.speed) * t,
      stamina: ha.stamina + (hb.stamina - ha.stamina) * t,
      // rank/blocked/finished は直前フレーム a を採用（離散）
    };
  });
}

/** pack（馬群）の代表進行度・広がりを求める */
export function computePackProgress(horses: HorseFrameState[]): {
  avgProgress: number;
  minProgress: number;
  maxProgress: number;
  leaderProgress: number;
  avgLateral: number;
  laneSpread: number;
} | null {
  if (horses.length === 0) return null;
  let sum = 0, min = Infinity, max = -Infinity;
  let latSum = 0, latMin = Infinity, latMax = -Infinity;
  for (const h of horses) {
    sum += h.raceProgress;
    min = Math.min(min, h.raceProgress);
    max = Math.max(max, h.raceProgress);
    latSum += h.lateralPosition;
    latMin = Math.min(latMin, h.lateralPosition);
    latMax = Math.max(latMax, h.lateralPosition);
  }
  const n = horses.length;
  return {
    avgProgress: sum / n,
    minProgress: min,
    maxProgress: max,
    leaderProgress: max,
    avgLateral: latSum / n,
    laneSpread: latMax - latMin,
  };
}
