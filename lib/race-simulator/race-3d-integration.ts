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
import {
  computeCompetitionFormationBonus,
  formationBonusTaperWeight,
  type BonusInputHorse,
  type BonusResult,
} from '../race-dynamics/ai-position-adjust';
import { hashString } from '../race-dynamics/seed';
import {
  convertForecastLayoutTo3D,
  computeExpectedGoalPositions,
  computeGoalBlendWeights,
  blendFrameTowardForecastLayouts,
  buildStartGateLayout,
  blendFrameFromStartGate,
  startGateWeight,
  buildPredictedFinishTargets,
  convergeFrameToPredictedFinish,
  START_BLEND_END_SEC,
  type Layout3DPose,
  type PredictedFinishTarget,
} from './forecast-layout-to-3d';

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
  /** start-phase の横位置(m)。dynamics 初期状態へ踏襲 */
  lateralPosition?: number;
  /** start-phase の走破距離(m)。初期 progress オフセットに使用 */
  currentDistance?: number;
  runningStyle?: string;
  capabilities?: {
    startSpeed?: number;
    cruiseSpeed?: number;
    acceleration?: number;
    stamina?: number;
    cornerSkill?: number;
  };
  /**
   * 正本の競うスコア（0〜100・高いほど高評価）。/api/simulator で join 済み。
   * ローカル能力集約値（capabilities 由来）とは別物。表示隊列の位置補正のみに使用し、
   * finish / finalStandings / dynamics には影響しない。欠損時は undefined。
   */
  competitionScore?: number;
}

/**
 * 表示用の配置群（dynamics 本体は変更しない・表示座標のみ）。
 *  - startGate: 発馬ゲート配置（Phase A・馬番の内→外）
 *  - start   : スタート後の展開形成（Phase B・expectedPosition2C 由来）
 *  - goal    : ゴール前の展開（旧2D expectedPositionGoal）
 *  - finish  : 最終入線（finalStandings.position）— 横位置のみ保持。前後順は finishTargets で規定
 *  - finishTargets: 最終入線順の正本（PredictedFinishTarget）
 */
export interface ForecastLayouts3D {
  startGate: Layout3DPose[];
  start: Layout3DPose[];
  goal: Layout3DPose[];
  finish: Layout3DPose[];
  finishTargets: PredictedFinishTarget[];
  raceDistance: number;
}

/** finalStandings 由来の予想スコア（高いほど強い）。着差スケール用。 */
function predictedScoreOf(h: SimHorseLike): number {
  const cap = h.capabilities ?? {};
  return (
    (cap.cruiseSpeed ?? 50) * 0.5 +
    (cap.acceleration ?? 50) * 0.3 +
    (cap.stamina ?? 50) * 0.2
  );
}

/**
 * SimulationResult から旧2D相当のスタート後・ゴール前・最終着順レイアウトを構築する。
 * ゴール前は CourseStyleRacePace と同じ式（computeExpectedGoalPositions）。
 * 最終着順は finalStandings.position（結果）。表示ブレンド用で着順ロジック自体は変えない。
 */
export function buildForecastLayoutsFromSimulation(
  sim: SimulationLike,
  raceDistance: number,
  trackWidth?: number,
): ForecastLayouts3D | null {
  const startHorses = sim.phases?.start?.horses ?? [];
  const finishHorses = sim.finalStandings ?? startHorses;
  if (startHorses.length === 0 || raceDistance <= 0) return null;

  // Phase A: 発馬ゲート配置（馬番の内→外）。waku は使わない。
  const startGate = buildStartGateLayout(
    startHorses.map((h) => h.horseNumber),
    { raceDistance, trackWidth },
  );

  const startAnchor = Math.max(
    ...startHorses.map((h) => h.currentDistance ?? 0),
    raceDistance * 0.12,
  );

  const start = convertForecastLayoutTo3D(
    startHorses.map((h, i) => ({
      horseNumber: h.horseNumber,
      forecastPosition: h.position ?? i + 1,
      waku: h.waku ?? ((h.horseNumber - 1) % 8) + 1,
    })),
    { anchorDistance: startAnchor },
  );

  const goalInputs = startHorses.map((h, i) => {
    const cap = h.capabilities ?? {};
    const kisoScore =
      (cap.cruiseSpeed ?? 50) * 0.5 +
      (cap.acceleration ?? 50) * 0.3 +
      (cap.stamina ?? 50) * 0.2;
    return {
      horseNumber: h.horseNumber,
      startPosition: h.position ?? i + 1,
      waku: h.waku ?? ((h.horseNumber - 1) % 8) + 1,
      kisoScore,
      l4fScore: cap.acceleration ?? 50,
      runningStyle: h.runningStyle,
    };
  });
  const goalExpected = computeExpectedGoalPositions(goalInputs);
  const goal = convertForecastLayoutTo3D(
    goalExpected.map((g) => ({
      horseNumber: g.horseNumber,
      forecastPosition: g.expectedPositionGoal,
      waku: g.waku,
    })),
    { anchorDistance: raceDistance * 0.96 },
  );

  // 最終入線順の正本: finalStandings.position（予想着順）。配列 index で紐付けない。
  const finishTargets = buildPredictedFinishTargets(
    finishHorses.map((h, i) => ({
      horseId: String(h.horseNumber),
      horseNumber: h.horseNumber,
      position: h.position ?? i + 1,
      score: predictedScoreOf(h),
    })),
  );
  // finish レイアウトの横位置は goal（旧2D）の内外を引き継ぎ、入線時に横が潰れないようにする。
  const goalLatByHn = new Map(goal.map((p) => [p.horseNumber, p.lateralPosition]));
  const finish: Layout3DPose[] = finishTargets.map((t) => ({
    horseNumber: t.horseNumber,
    currentDistance: Math.max(0, raceDistance - t.finishGapMeters),
    lateralPosition: goalLatByHn.get(t.horseNumber) ?? 0,
    rank: t.predictedRank,
    distanceFromLeader: t.finishGapMeters,
  }));

  return { startGate, start, goal, finish, finishTargets, raceDistance };
}

/**
 * 表示用: dynamics 補間 + 発馬フェーズのゲート/展開 blend + ゴール前旧2D blend + 予想着順への収束。
 * simulation / dynamics の着順計算は変更しない（表示座標のみ）。
 *
 * 段階（time は dynamics 時間・秒 / leaderProgress01 は先頭馬の進捗0..1）:
 *  1. 発馬（time < START_BLEND_END_SEC）: ゲート配置(馬番) → dynamics(start-phase 展開) へ smoothstep 移行。
 *  2. ゴール前（0.70〜0.88）: 旧2D expectedPositionGoal へ接近（blendToGoal）。
 *  3. 入線収束（0.90〜1.00）: 進捗の順序統計量を finalStandings.position（予想着順）へ収束。
 *
 * 入線順の正本は layouts.finishTargets（finalStandings.position）。dynamics rank では上書きしない。
 */
/**
 * 競うスコア由来の「表示隊列 前方向補正」コンテキスト。
 * appliedMetersByHorse: 馬番 -> 前方向へ寄せる最大メートル（>=0）。
 * dynamics / finish / finalStandings には影響しない。formation〜corner の表示のみ。
 */
export interface FormationBonusContext {
  appliedMetersByHorse: Map<number, number>;
}

/**
 * 表示フレームへ competitionScore 由来の前方向補正を適用（表示専用）。
 *  - 先頭進捗に応じたテーパーで、発馬直後に立ち上げ・ゴール前ブレンド開始より前に0へ戻す。
 *  - 前方向のみ（raceProgress を増やすだけ）。lateralPosition は変更しない。
 *  - 累積しない（毎フレーム raw frame から一発適用）。
 */
function applyFormationBonus(
  frame: HorseFrameState[],
  bonus: FormationBonusContext | null | undefined,
  leaderProgress01: number,
): HorseFrameState[] {
  if (!bonus || bonus.appliedMetersByHorse.size === 0) return frame;
  const w = formationBonusTaperWeight(leaderProgress01);
  if (w <= 0) return frame;
  return frame.map((h) => {
    const add = bonus.appliedMetersByHorse.get(h.horseNumber) ?? 0;
    if (add <= 0) return h;
    // 前方向のみ。lateralPosition/rank/finished などは一切変更しない。
    return { ...h, raceProgress: h.raceProgress + w * add };
  });
}

export function interpolateDynamicsForDisplay(
  result: RaceDynamicsResult,
  time: number,
  layouts: ForecastLayouts3D | null,
  bonus?: FormationBonusContext | null,
): HorseFrameState[] {
  const frame = interpolateDynamics(result, time);

  // 先頭進捗（bonus テーパー / goal blend 用）。goal blend の判定は raw frame 基準（既存挙動）。
  const rdAll =
    layouts && layouts.raceDistance > 0
      ? layouts.raceDistance
      : result.raceDistance > 0
        ? result.raceDistance
        : 1;
  const leaderMetersAll = frame.reduce((m, h) => Math.max(m, h.raceProgress), 0);
  const leaderProgress01 = Math.min(1, Math.max(0, leaderMetersAll / rdAll));

  if (!layouts) return applyFormationBonus(frame, bonus, leaderProgress01);

  // 1. 発馬フェーズ: ゲート配置 → 展開形成（dynamics）。この区間は補正しない（テーパーも0付近）。
  if (layouts.startGate.length > 0 && time < START_BLEND_END_SEC) {
    return blendFrameFromStartGate(frame, {
      startGate: layouts.startGate,
      weightToDynamics: startGateWeight(time),
    });
  }

  // 2. formation〜corner: 競うスコア由来の前方向補正（表示のみ・テーパーで自動的に0へ戻る）
  const boosted = applyFormationBonus(frame, bonus, leaderProgress01);

  if (layouts.goal.length === 0) return boosted;

  const { blendToGoal, convergeToFinish } = computeGoalBlendWeights(leaderProgress01);
  // goal blend 開始(≈0.70)時点でテーパーは既に0のため boosted===frame（goal/finish は不変）。
  if (blendToGoal <= 0 && convergeToFinish <= 0) return boosted;

  // 3. ゴール前: 旧2D expectedPositionGoal へ接近（finish は別段階で扱うため convergeToFinish=0）
  const goalBlended = blendFrameTowardForecastLayouts(boosted, {
    raceDistance: layouts.raceDistance,
    goalLayout: layouts.goal,
    finishLayout: [],
    blendToGoal,
    convergeToFinish: 0,
  });

  // 4. 入線収束: finalStandings.position（予想着順=正本）へ進捗の順序を寄せる
  return convergeFrameToPredictedFinish(
    goalBlended,
    layouts.finishTargets,
    convergeToFinish,
    layouts.raceDistance,
  );
}

/**
 * SimulationResult から競うスコア由来の「表示隊列 前方向補正」を構築する（表示専用）。
 *  - 脚質は buildHorseInputsFromSimulation（dynamics と同一の解決）を正本とする。
 *  - competitionScore / 基準前後位置(currentDistance) は start-phase 馬から取得。
 *  - dynamics / finish / finalStandings には影響しない。
 */
export function buildFormationBonusFromSimulation(
  sim: SimulationLike,
  raceDistance: number,
): Map<number, BonusResult> {
  const startHorses = sim.phases?.start?.horses ?? sim.finalStandings ?? [];
  if (startHorses.length === 0) return new Map();

  // 脚質は dynamics 入力と同じ解決を使う（表示と挙動の脚質を一致させる）
  const inputs = buildHorseInputsFromSimulation(sim);
  const styleByHn = new Map<number, string>();
  for (const inp of inputs) styleByHn.set(inp.horseNumber, inp.runningStyle);

  const bonusInputs: BonusInputHorse[] = startHorses.map((h) => ({
    horseNumber: h.horseNumber,
    runningStyle: styleByHn.get(h.horseNumber) ?? h.runningStyle ?? null,
    competitionScore: h.competitionScore,
    baseFormationMeters: h.currentDistance ?? 0,
  }));

  return computeCompetitionFormationBonus(bonusInputs, raceDistance);
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
      // 発馬横位置は馬番基準（waku ではない）。gateIndex = horseNumber - 1。
      gateIndex: h.horseNumber - 1,
    };
  });

  const base = adaptFormationToHorseInputs(raw);

  // staminaBase / 初期横位置 / スタート隊列オフセットを start-phase から補完
  // （旧2D/ start-phase の前後・内外関係を dynamics 初期状態へ踏襲）
  const maxDist = Math.max(0, ...horses.map((h) => h.currentDistance ?? 0));
  return base.map((hi) => {
    const src = horses.find((h) => h.horseNumber === hi.horseNumber);
    const staminaBase =
      src?.staminaRemaining != null
        ? clamp01(src.staminaRemaining / 100)
        : undefined;
    const initialLateralPosition =
      src?.lateralPosition != null && Number.isFinite(src.lateralPosition)
        ? src.lateralPosition
        : undefined;
    // スタート後隊列: currentDistance が大きいほど先頭 → 微小 progress オフセット
    let initialProgressOffset: number | undefined;
    if (maxDist > 0 && src?.currentDistance != null && Number.isFinite(src.currentDistance)) {
      // 最大でも 0.04（レース全体の 4%）。中間は dynamics が自然に進める。
      initialProgressOffset = clamp01(src.currentDistance / Math.max(maxDist, 1)) * 0.04;
    }
    return {
      ...hi,
      ...(staminaBase != null ? { staminaBase } : {}),
      ...(initialLateralPosition != null ? { initialLateralPosition } : {}),
      ...(initialProgressOffset != null ? { initialProgressOffset } : {}),
    };
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

  const result = simulateRaceDynamics(inputs, {
    raceDistance: layout.raceDistance,
    trackWidth: layout.geometry.trackWidth,
    seed,
    pace,
  });

  return unifyFinishOrderWithPrediction(result, sim);
}

/**
 * dynamics.finishOrder を「予想着順（finalStandings.position）」へ整合させる。
 *
 * 表示（interpolateDynamicsForDisplay）は進捗を予想着順へ収束させるため、
 * finishOrder も同じ正本を使う（別系統の最終結果で上書きしない）。
 * 通過時刻は dynamics の実 finishTime を昇順に並べ、予想着順へ割り当てる
 * （時間差の自然さは保ちつつ、順序だけ予想着順にする）。
 */
function unifyFinishOrderWithPrediction(
  result: RaceDynamicsResult,
  sim: SimulationLike,
): RaceDynamicsResult {
  const finishHorses = sim.finalStandings ?? sim.phases?.start?.horses ?? [];
  if (finishHorses.length === 0) return result;

  const targets = buildPredictedFinishTargets(
    finishHorses.map((h, i) => ({
      horseId: String(h.horseNumber),
      horseNumber: h.horseNumber,
      position: h.position ?? i + 1,
      score: predictedScoreOf(h),
    })),
  );
  if (targets.length === 0) return result;

  const sortedTimes = result.finishOrder
    .map((f) => f.finishTime)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const fallbackTime = sortedTimes[sortedTimes.length - 1] ?? result.totalTime;

  const byRank = [...targets].sort((a, b) => a.predictedRank - b.predictedRank);
  const unified = byRank.map((t, idx) => ({
    horseId: t.horseId,
    horseNumber: t.horseNumber,
    rank: t.predictedRank,
    finishTime: sortedTimes[idx] ?? fallbackTime,
  }));

  return { ...result, finishOrder: unified };
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
