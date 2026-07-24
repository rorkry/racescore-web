/**
 * forecast-layout-to-3d（旧2D展開予想図 → 3D 座標アダプタ）
 *
 * 2D の相対関係（前後順位・内外）を壊さず、3D の course distance / lateral へ変換する。
 * 旧2Dロジック自体は変更しない（読み取り → 変換のみ）。
 *
 * 役割の分離（重要 / 混同禁止）:
 *  - 馬番 horseNumber            : 発馬ゲートの内外位置（Phase A）。gateIndex = horseNumber - 1。
 *  - waku（枠番）                : 枠色の表示のみ。ゲート横位置には使わない。
 *  - start-phase / expectedPosition2C : 発馬後の展開形成（Phase B）の前後・内外。
 *  - expectedPositionGoal        : ゴール前の展開位置（旧2D）。
 *  - finalStandings.position     : 最終入線順の正本（PredictedFinishTarget）。
 *
 * 正本:
 *  - スタート後（展開形成）: expectedPosition2C（または start phase の position）昇順 = 先頭が小さい
 *  - ゴール前: expectedPositionGoal
 *  - 最終入線: finalStandings.position（predictedRank）
 *  - 発馬横位置: horseNumber（内→外）
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
 * 優先方針（正式仕様）:
 *  - 0.00〜0.70: dynamics 中心
 *  - 0.70〜0.88: 旧2D expectedPositionGoal へ自然に接近（blendToGoal→1）
 *  - 0.88〜1.00: 旧2Dゴール前を強く反映しつつ、予想着順（finalStandings.position）へ収束
 *  - 1.00     : finalStandings.position の入線順へ完全収束（convergeToFinish=1）
 *
 * convergeToFinish は「予想着順への並べ替え」であり、表示だけの最終書換ではなく
 * 進捗（メートル）の順序統計量を予想着順へ滑らかに割り当てる（convergeFrameToPredictedFinish）。
 */
export const GOAL_BLEND_START = 0.70;
export const GOAL_BLEND_PEAK = 0.88;
export const FINISH_CONVERGE_START = 0.90;
export const FINISH_CONVERGE_END = 1.00;

/**
 * 発馬フェーズの分離（Phase A: ゲート配置 / Phase B: 展開形成）。
 * 単位は dynamics 時間（秒）。
 *  - 0〜GATE_HOLD_SEC     : ゲート順（馬番）を強く維持（全頭ほぼ同一前後・馬番で内→外）
 *  - GATE_HOLD_SEC〜START_BLEND_END_SEC : start-phase 展開（dynamics）へ smoothstep で移行
 *  - START_BLEND_END_SEC 以降 : dynamics へ完全委譲
 */
export const GATE_HOLD_SEC = 1.0;
export const START_BLEND_END_SEC = 5.0;

/** ゲート横配置のパラメータ（dynamics simulator と同じ規約に合わせる） */
const GATE_RAIL_MARGIN = 1.0;   // m（ラチ余白）
const GATE_MAX_SPACING = 2.0;   // m（隣接ゲート間の最大間隔）

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
 * 先頭馬の raceProgress から、ゴール予想への blend 率と入線収束率を求める。
 *
 * - blendToGoal: 0..1（dynamics → 旧2Dゴール配置）。0.70→0.88 で上昇し、
 *   入線収束区間(0.90→1.00)で 0 へ減衰する。
 *   → 入線直前は「実進捗（自然な着差・通過）」を残し、順序だけを予想着順へ寄せる。
 * - convergeToFinish: 0..1（予想着順=finalStandings.position への順序収束）。0.90→1.00。
 *
 * この設計により、旧2Dゴール前展開を途中まで維持しつつ、
 * 全頭が実際にゴール線を予想着順どおりに通過する（値は実進捗、順序は予想着順）。
 */
export function computeGoalBlendWeights(leaderProgress01: number): {
  blendToGoal: number;
  convergeToFinish: number;
} {
  const p = Math.max(0, Math.min(1, leaderProgress01));
  const rise = smoothstep(GOAL_BLEND_START, GOAL_BLEND_PEAK, p);
  const decay = smoothstep(FINISH_CONVERGE_START, FINISH_CONVERGE_END, p);
  const blendToGoal = rise * (1 - decay);
  const convergeToFinish = decay;
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

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// =====================================================================
// 発馬ゲート配置（Phase A）
// =====================================================================

/**
 * 発馬時のゲート横位置（馬番ベース）。
 *
 *  - gateIndex     = horseNumber - 1
 *  - centeredIndex = gateIndex - (maxGateIndex)/2     （頭数に応じた中央揃え）
 *  - lateral       = centeredIndex * spacing          （負=内 / 正=外）
 *
 * 馬番1が最内（最も負）、最大馬番が最外（最も正）。waku は一切使わない。
 * 前後差は付けない（0秒は全頭ほぼ同一 = level スタート）。
 */
export function buildStartGateLayout(
  horseNumbers: number[],
  opts: { raceDistance: number; trackWidth?: number },
): Layout3DPose[] {
  const n = horseNumbers.length;
  if (n === 0) return [];
  const trackWidth = opts.trackWidth != null && opts.trackWidth > 0 ? opts.trackWidth : 24;
  const halfWidth = Math.max(2, trackWidth / 2 - GATE_RAIL_MARGIN);
  // gateIndex は馬番由来（欠番があっても内→外の単調性を保つ）
  const maxGateIndex = Math.max(1, ...horseNumbers.map((hn) => hn - 1));
  const spacing = Math.min((halfWidth * 2) / maxGateIndex, GATE_MAX_SPACING);
  const centerIndex = maxGateIndex / 2;
  // 展開開始前のわずかな前進量（0でも可。level を保つため全頭同一）
  const startDistance = 0;

  return horseNumbers.map((hn) => {
    const gateIndex = hn - 1;
    const centered = gateIndex - centerIndex;
    const lateral = clampNum(centered * spacing, -halfWidth, halfWidth);
    return {
      horseNumber: hn,
      currentDistance: startDistance,
      lateralPosition: lateral,
      // rank は発馬時点の内→外順（馬番順）。表示の前後には使わない。
      rank: gateIndex + 1,
      distanceFromLeader: 0,
    };
  });
}

/**
 * 発馬フェーズの表示ブレンド（ゲート配置 → 展開形成/dynamics）。
 *
 *  - weightToDynamics=0（0秒）: 全頭を先頭進捗に揃え（level）、横位置はゲート（馬番内→外）
 *  - weightToDynamics=1（数秒後）: dynamics のフレーム（start-phase 展開）へ完全移行
 *
 * 前後を「先頭進捗基準の level」から blend するため、0秒で急な横/前後ワープが起きない。
 * identity は horseNumber で対応（配列 index 禁止）。
 */
export function blendFrameFromStartGate<T extends BlendableHorse>(
  frame: T[],
  opts: { startGate: Layout3DPose[]; weightToDynamics: number },
): T[] {
  const w = clamp01(opts.weightToDynamics);
  if (opts.startGate.length === 0) return frame;
  const gateMap = new Map(opts.startGate.map((p) => [p.horseNumber, p]));
  // 0秒の level 基準 = 現フレームの先頭進捗（全頭がここへ揃う）
  const leaderDyn = frame.reduce((m, h) => Math.max(m, h.raceProgress), 0);

  return frame.map((h) => {
    const g = gateMap.get(h.horseNumber);
    if (!g) return h;
    const progress = leaderDyn + (h.raceProgress - leaderDyn) * w;
    const lateral = g.lateralPosition + (h.lateralPosition - g.lateralPosition) * w;
    return { ...h, raceProgress: progress, lateralPosition: lateral };
  });
}

/** 発馬ブレンド率（dynamics 時間 t 秒 → 0..1） */
export function startGateWeight(timeSec: number): number {
  return smoothstep(GATE_HOLD_SEC, START_BLEND_END_SEC, timeSec);
}

// =====================================================================
// 予想着順（最終入線）の正本 PredictedFinishTarget
// =====================================================================

/** 最終入線順の正本。finalStandings.position から生成し、全表示系が共有する。 */
export interface PredictedFinishTarget {
  horseId: string;
  horseNumber: number;
  /** 予想着順（1=1着）。finalStandings.position 由来 */
  predictedRank: number;
  /** 1着からの着差(m)。1着=0、以降は決定的に単調増加 */
  finishGapMeters: number;
}

export interface FinishTargetInput {
  horseId?: string;
  horseNumber: number;
  /** finalStandings.position（予想着順）。無ければ配列順の代替は呼び出し側で付与 */
  position?: number;
  /** 予想スコア（高いほど強い）。着差スケールに使う。任意 */
  score?: number;
  /** 既に着差(m)が予測に含まれる場合はそれを使う。任意 */
  finishGapMeters?: number;
}

const MIN_FINISH_GAP_STEP = 0.4;  // m（2着以降の最小着差）
const MAX_FINISH_GAP_STEP = 2.0;  // m（隣接着差の上限）
const FINISH_GAP_SCORE_SCALE = 0.04; // score差 → 着差(m) 係数

/**
 * finalStandings から PredictedFinishTarget[] を生成する（予想着順=正本）。
 *
 * 重要:
 *  - 元配列を破壊しない（[...].sort）
 *  - position 昇順、同点は horseNumber 昇順で決定的 tie-break
 *  - horseId を優先し、無ければ String(horseNumber)
 *  - 着差は既存 finishGapMeters があればそれ、無ければ score 差から決定的に生成
 *  - 全頭同一座標を禁止（着差は 1着=0、2着以降は最小 0.4m 以上で単調増加）
 */
export function buildPredictedFinishTargets(
  horses: FinishTargetInput[],
): PredictedFinishTarget[] {
  const n = horses.length;
  if (n === 0) return [];

  const hasExplicitGap = horses.some(
    (h) => h.finishGapMeters != null && Number.isFinite(h.finishGapMeters),
  );

  const sorted = [...horses].sort((a, b) => {
    const pa = a.position ?? Number.MAX_SAFE_INTEGER;
    const pb = b.position ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return a.horseNumber - b.horseNumber;
  });

  let cumulative = 0;
  return sorted.map((h, idx) => {
    const predictedRank = idx + 1;
    if (idx > 0) {
      if (hasExplicitGap) {
        // 既存着差を使う（1着基準の絶対着差として解釈）。単調性は保証する。
        const gap = h.finishGapMeters != null && Number.isFinite(h.finishGapMeters)
          ? Math.max(cumulative + MIN_FINISH_GAP_STEP, h.finishGapMeters)
          : cumulative + MIN_FINISH_GAP_STEP;
        cumulative = gap;
      } else {
        const prev = sorted[idx - 1];
        const scoreDiff = Math.max(0, (prev.score ?? 0) - (h.score ?? 0));
        const step = clampNum(
          MIN_FINISH_GAP_STEP + scoreDiff * FINISH_GAP_SCORE_SCALE,
          MIN_FINISH_GAP_STEP,
          MAX_FINISH_GAP_STEP,
        );
        cumulative += step;
      }
    }
    return {
      horseId: h.horseId ?? String(h.horseNumber),
      horseNumber: h.horseNumber,
      predictedRank,
      finishGapMeters: cumulative,
    };
  });
}

/**
 * 入線収束（Phase: 0.90〜1.00）。
 *
 * 現フレームの進捗（メートル）の順序統計量を「予想着順」へ滑らかに割り当てる。
 *  - slot = 現フレーム進捗の降順配列
 *  - 予想着順 r の馬 → target = min(slot[r-1], rd - finishGap_r)
 *
 * これにより:
 *  - 進捗の「値」（旧2D/dynamics 由来の自然な着差・速度）は走行中は保たれる
 *  - 順序だけが予想着順へ収束する（表示だけの並べ替えではなく進捗そのものを寄せる）
 *  - 予想着順どおりにゴール線へ到達する（先頭がゴール線 rd、以降は最小着差ぶん後方）
 *  - 全頭が rd に完全に重なって停止しない（finishGap により決定的に分離）
 *
 * finishGap は「1着=0、以降単調増加」（buildPredictedFinishTargets）。
 * これにより順序（rank）と分離（gap）の双方が保証され、逆転・完全重複が起きない。
 *
 * convergeToFinish=1 で完全収束。identity は horseNumber。
 */
export function convergeFrameToPredictedFinish<T extends BlendableHorse>(
  frame: T[],
  finishTargets: Array<{ horseNumber: number; predictedRank: number; finishGapMeters: number }>,
  convergeToFinish: number,
  raceDistance: number,
): T[] {
  const cf = clamp01(convergeToFinish);
  if (cf <= 0 || finishTargets.length === 0) return frame;
  const rd = raceDistance > 0 ? raceDistance : 1;
  const targetOf = new Map(
    finishTargets.map((t) => [t.horseNumber, { rank: t.predictedRank, gap: t.finishGapMeters }]),
  );
  const slots = frame.map((h) => h.raceProgress).sort((a, b) => b - a);
  const m = slots.length;
  return frame.map((h) => {
    const t = targetOf.get(h.horseNumber);
    if (t == null) return h;
    const slot = slots[Math.max(0, Math.min(m - 1, t.rank - 1))];
    // 走行中は slot（自然な実進捗の順序値）、ゴール線付近は rd-gap で決定的に分離
    const target = Math.min(slot, rd - t.gap);
    return { ...h, raceProgress: h.raceProgress + (target - h.raceProgress) * cf };
  });
}
