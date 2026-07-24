/**
 * forecast-layout-to-3d（旧2D展開予想図 → 3D 座標アダプタ）
 *
 * 2D の相対関係（前後順位・内外）を壊さず、3D の course distance / lateral へ変換する。
 * 旧2Dロジック自体は変更しない（読み取り → 変換のみ）。
 *
 * 正本:
 *  - スタート後: expectedPosition2C（または start phase の position）昇順 = 先頭が小さい
 *  - ゴール前: expectedPositionGoal（または finalStandings の position）
 *  - 内外: waku（小さい = 内）
 *
 * identity は常に horseNumber で保持（配列 index 禁止）。
 */

export interface ForecastHorseLayout {
  horseNumber: number;
  /** 2D 隊列位置（小さいほど先頭）。スタート後=expectedPosition2C、ゴール前=expectedPositionGoal */
  forecastPosition: number;
  /** 枠番 1..8 */
  waku: number;
}

export interface CourseLayout3D {
  /** フェーズ基準距離(m)。スタート後なら start endDistance、ゴール前なら raceDistance 付近 */
  anchorDistance: number;
  /** 1馬身あたりの前後差(m) */
  lengthsPerHorse?: number;
  /** 走路半幅(m)。lateral のクランプに使う */
  halfTrackWidth?: number;
  /** 枠→横位置のスケール(m/枠)。start-phase と同じ (waku-4.5)*scale */
  wakuLateralScale?: number;
}

export interface Layout3DPose {
  horseNumber: number;
  /** 走破距離(m) */
  currentDistance: number;
  /** 横位置(m)。負=内寄り（JRA慣習に合わせ start-phase と同式） */
  lateralPosition: number;
  /** 前後順位 1=先頭（forecastPosition 昇順） */
  rank: number;
  /** 先頭からの差(m) */
  distanceFromLeader: number;
}

const DEFAULT_LENGTH = 2.5;
const DEFAULT_WAKU_SCALE = 2.5;

/**
 * 2D 隊列を 3D の距離・横位置へ変換する。
 * 前後順は forecastPosition 昇順、同値なら waku 昇順（内優先）で安定化。
 */
export function convertForecastLayoutTo3D(
  horses: ForecastHorseLayout[],
  course: CourseLayout3D,
): Layout3DPose[] {
  const length = course.lengthsPerHorse ?? DEFAULT_LENGTH;
  const wakuScale = course.wakuLateralScale ?? DEFAULT_WAKU_SCALE;
  const half = course.halfTrackWidth ?? 12;
  const anchor = course.anchorDistance;

  const sorted = [...horses].sort((a, b) => {
    if (a.forecastPosition !== b.forecastPosition) return a.forecastPosition - b.forecastPosition;
    if (a.waku !== b.waku) return a.waku - b.waku;
    return a.horseNumber - b.horseNumber;
  });

  const poses: Layout3DPose[] = sorted.map((h, idx) => {
    const rank = idx + 1;
    const currentDistance = Math.max(0, anchor - (rank - 1) * length);
    const waku = Math.max(1, Math.min(8, h.waku || 1));
    let lateral = (waku - 4.5) * wakuScale;
    lateral = Math.max(-half, Math.min(half, lateral));
    return {
      horseNumber: h.horseNumber,
      currentDistance,
      lateralPosition: lateral,
      rank,
      distanceFromLeader: (rank - 1) * length,
    };
  });

  return poses;
}

/**
 * 2つの配置の前後順が horseNumber 単位で一致するか（テスト用）。
 * 戻り値: 不一致の horseNumber 一覧。
 */
export function diffRankOrder(
  a: Array<{ horseNumber: number; rank: number }>,
  b: Array<{ horseNumber: number; rank: number }>,
): number[] {
  const mapB = new Map(b.map((x) => [x.horseNumber, x.rank]));
  const mismatches: number[] = [];
  for (const x of a) {
    const br = mapB.get(x.horseNumber);
    if (br == null || br !== x.rank) mismatches.push(x.horseNumber);
  }
  return mismatches;
}

/**
 * 内外順（lateral 昇順 = 内→外）の horseNumber 列を返す。
 */
export function orderByLateralInnerFirst(
  poses: Array<{ horseNumber: number; lateralPosition: number }>,
): number[] {
  return [...poses]
    .sort((a, b) => {
      if (a.lateralPosition !== b.lateralPosition) return a.lateralPosition - b.lateralPosition;
      return a.horseNumber - b.horseNumber;
    })
    .map((p) => p.horseNumber);
}

/** ゴール前 forecast blend の進行度区間（0..1, leaderProgress01）
 *
 * 優先方針:
 *  - <0.70: dynamics のみ
 *  - 0.70〜0.84: 旧2Dゴール前配置へ緩やかに接近
 *  - 0.84〜0.94: 旧2Dゴール前を最も強く反映（converge=0）
 *  - 0.94〜1.00: 最終着順（dynamics finish）へ滑らかに収束
 */
export const GOAL_BLEND_START = 0.70;
export const GOAL_BLEND_PEAK = 0.84;
export const FINISH_CONVERGE_START = 0.94;
export const FINISH_CONVERGE_END = 1.00;

export interface GoalForecastInputHorse {
  horseNumber: number;
  /** スタート後位置（expectedPosition2C / start.position）。小さいほど先頭 */
  startPosition: number;
  waku: number;
  /** 競うスコア相当（高いほど前）。無ければ 0 */
  kisoScore?: number;
  /** L4F 相当（高いほど前）。無ければ 0 */
  l4fScore?: number;
  runningStyle?: string;
}

/**
 * 旧2D CourseStyleRacePace のゴール位置式を純粋関数化したもの。
 *
 * ゴール位置 = スタート×0.3 + スコア順位影響×0.5 + L4F影響×0.2
 * （小さいほど先頭）
 *
 * 2D UI 自体は変更しない。3D が同じ式を共有するための抽出。
 */
export function computeExpectedGoalPositions(
  horses: GoalForecastInputHorse[],
): Array<{ horseNumber: number; expectedPositionGoal: number; waku: number }> {
  const n = horses.length;
  if (n === 0) return [];

  const byScore = [...horses].sort((a, b) => (b.kisoScore ?? 0) - (a.kisoScore ?? 0));
  const scorePct = new Map<number, number>();
  byScore.forEach((h, idx) => {
    scorePct.set(h.horseNumber, n > 1 ? (idx / (n - 1)) * 100 : 50);
  });

  const withL4 = horses.filter((h) => (h.l4fScore ?? 0) > 0);
  const byL4 = [...withL4].sort((a, b) => (b.l4fScore ?? 0) - (a.l4fScore ?? 0));
  const l4Pct = new Map<number, number>();
  byL4.forEach((h, idx) => {
    l4Pct.set(h.horseNumber, byL4.length > 1 ? (idx / (byL4.length - 1)) * 100 : 50);
  });

  return horses.map((h) => {
    const startInfluence = h.startPosition * 0.3;
    const scoreInfluence = ((scorePct.get(h.horseNumber) ?? 50) / 100) * n * 0.5;
    const l4Influence = ((l4Pct.get(h.horseNumber) ?? 50) / 100) * n * 0.2;
    let goal = startInfluence + scoreInfluence + l4Influence;
    goal = Math.max(1, Math.min(n + 1, goal));
    return {
      horseNumber: h.horseNumber,
      expectedPositionGoal: goal,
      waku: h.waku,
    };
  });
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * 先頭馬の raceProgress から、ゴール予想への blend 率と最終着順への収束率を求める。
 * - blendToGoal: 0..1（dynamics → 旧2Dゴール配置）
 * - convergeToFinish: 0..1（ゴール予想 → 実着順配置）
 */
export function computeGoalBlendWeights(leaderProgress01: number): {
  blendToGoal: number;
  convergeToFinish: number;
} {
  const p = Math.max(0, Math.min(1, leaderProgress01));
  const blendToGoal = smoothstep(GOAL_BLEND_START, GOAL_BLEND_PEAK, p);
  const convergeToFinish = smoothstep(FINISH_CONVERGE_START, FINISH_CONVERGE_END, p);
  return { blendToGoal, convergeToFinish };
}

export interface BlendableHorse {
  horseNumber: number;
  raceProgress: number;
  lateralPosition: number;
}

/**
 * dynamics フレームを旧2Dゴール配置・最終着順配置へ滑らかにブレンドする。
 * horseNumber で対応（配列 index 禁止）。急ワープしないよう weight は呼び出し側の smoothstep。
 *
 * 重要: goal/finish の currentDistance は「絶対メートル」としては使わない。
 * distanceFromLeader（隊列内オフセット）を現在の先頭距離に載せ替えて相対配置だけ寄せる。
 * これにより blend 開始時にパック全体が数百メートル飛ばない。
 *
 * targetProgress = lerp(dyn, goalRelative, blendToGoal)
 * その後 targetProgress = lerp(targetProgress, finishRelative, convergeToFinish)
 * lateral も同様。
 */
export function blendFrameTowardForecastLayouts<T extends BlendableHorse>(
  frame: T[],
  opts: {
    raceDistance: number;
    goalLayout: Layout3DPose[];
    finishLayout: Layout3DPose[];
    blendToGoal: number;
    convergeToFinish: number;
  },
): T[] {
  const rd = opts.raceDistance > 0 ? opts.raceDistance : 1;
  const goalMap = new Map(opts.goalLayout.map((p) => [p.horseNumber, p]));
  const finishMap = new Map(opts.finishLayout.map((p) => [p.horseNumber, p]));
  const bg = Math.max(0, Math.min(1, opts.blendToGoal));
  const cf = Math.max(0, Math.min(1, opts.convergeToFinish));

  const leaderDyn = frame.reduce((m, h) => Math.max(m, h.raceProgress), 0);
  // 入線収束時はゴール線を先頭基準にする（相対オフセットは finish.distanceFromLeader）
  const leaderFinish = rd;

  return frame.map((h) => {
    const g = goalMap.get(h.horseNumber);
    const f = finishMap.get(h.horseNumber);
    let progress = h.raceProgress;
    let lateral = h.lateralPosition;

    if (g && bg > 0) {
      const gMeters = Math.max(0, Math.min(rd, leaderDyn - g.distanceFromLeader));
      progress = progress + (gMeters - progress) * bg;
      lateral = lateral + (g.lateralPosition - lateral) * bg;
    }
    if (f && cf > 0) {
      const fMeters = Math.max(0, Math.min(rd, leaderFinish - f.distanceFromLeader));
      progress = progress + (fMeters - progress) * cf;
      lateral = lateral + (f.lateralPosition - lateral) * cf;
    }

    return { ...h, raceProgress: progress, lateralPosition: lateral };
  });
}
