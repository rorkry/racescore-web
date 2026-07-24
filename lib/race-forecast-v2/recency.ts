/**
 * 近走の重み付けと信頼度（純粋関数のみ）
 *
 * recency weight の根拠（DB実測 / scripts/investigate-v2-inputs.ts [6]）:
 *   umadata 42,689頭・平均19.26走
 *     3走以上: 85.3% / 4走以上: 75.3% / 5走以上: 66.3% / 8走以上: 48.4%
 *   → 対象を「直近5走」にすると 66% の馬が満額の信頼度に到達でき、
 *      85% の馬が3走以上（reliability 0.81）を確保できる。5走が妥当。
 *
 * 信頼度の定義:
 *   reliability = 使用できた走の recency weight 合計 / 全5走分の weight 合計
 *   これにより「1走しかない馬」と「5走安定している馬」が自動的に区別される。
 *     1走 → 0.351 / 2走 → 0.614 / 3走 → 0.807 / 4走 → 0.930 / 5走 → 1.000
 *
 * 条件差の扱い:
 *   距離・芝ダ・馬場・頭数・クラスが今回と違う過去走は weight を減衰させる。
 *   「使わない」のではなく「軽くする」ことで、サンプル0を避ける。
 */
import { clamp, clamp01, isValidNumber, NEUTRAL } from './normalization';
import type { PastRaceSample, RaceConditionV2, Surface } from './types';

/**
 * 近走 recency weight（新しい順）。
 * 監査時の初期提案どおり。設定ファイル化しており過去レース検証で調整可能。
 */
export const DEFAULT_RECENCY_WEIGHTS: readonly number[] = [1.0, 0.75, 0.55, 0.35, 0.2];

/** recency weight の合計（reliability の分母） */
export function recencyWeightTotal(weights: readonly number[] = DEFAULT_RECENCY_WEIGHTS): number {
  return weights.reduce((a, b) => a + b, 0);
}

/** index 番目（0 = 前走）の recency weight。範囲外は 0 */
export function recencyWeightAt(
  index: number,
  weights: readonly number[] = DEFAULT_RECENCY_WEIGHTS
): number {
  if (!Number.isInteger(index) || index < 0 || index >= weights.length) return 0;
  return weights[index];
}

/**
 * サンプル数から信頼度を求める。
 * recency weight の累積比なので、recency 設計と一貫する。
 */
export function reliabilityFromSampleSize(
  sampleCount: number,
  weights: readonly number[] = DEFAULT_RECENCY_WEIGHTS
): number {
  if (!isValidNumber(sampleCount) || sampleCount <= 0) return 0;
  const n = Math.min(Math.floor(sampleCount), weights.length);
  let used = 0;
  for (let i = 0; i < n; i++) used += weights[i];
  return clamp01(used / recencyWeightTotal(weights));
}

/**
 * 使用した weight の合計から信頼度を求める（条件差で減衰した weight を反映する版）。
 * weightedRecentAverage の結果と組み合わせて使う。
 */
export function reliabilityFromUsedWeight(
  usedWeight: number,
  weights: readonly number[] = DEFAULT_RECENCY_WEIGHTS
): number {
  if (!isValidNumber(usedWeight) || usedWeight <= 0) return 0;
  return clamp01(usedWeight / recencyWeightTotal(weights));
}

// ============================================================
// 条件差による weight 減衰
// ============================================================

/** 条件差減衰の係数（設定として外出し） */
export interface ConditionSimilarityConfig {
  /** 距離差 100m あたりの減衰 */
  distancePenaltyPer100m: number;
  /** 距離差がこれ以上なら最低値まで落とす（m） */
  distanceMaxDiff: number;
  /** 芝⇔ダートが違う場合の乗数 */
  surfaceMismatchMultiplier: number;
  /** 競馬場が違う場合の乗数 */
  placeMismatchMultiplier: number;
  /** 馬場状態が違う場合の乗数 */
  trackConditionMismatchMultiplier: number;
  /** 頭数差 1頭あたりの減衰 */
  fieldSizePenaltyPerHorse: number;
  /** 減衰後の下限（0 にすると条件違いの走が完全に消えるため下限を設ける） */
  minMultiplier: number;
}

export const DEFAULT_CONDITION_SIMILARITY: ConditionSimilarityConfig = {
  distancePenaltyPer100m: 0.06,
  distanceMaxDiff: 800,
  surfaceMismatchMultiplier: 0.45,
  placeMismatchMultiplier: 0.9,
  trackConditionMismatchMultiplier: 0.85,
  fieldSizePenaltyPerHorse: 0.01,
  minMultiplier: 0.15,
};

/** 馬場状態を「良/稍重/重/不良」の粗いカテゴリへ */
function normalizeTrackCondition(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (s === '') return null;
  if (s.includes('不良')) return '不良';
  if (s.includes('稍')) return '稍重';
  if (s.includes('重')) return '重';
  if (s.includes('良')) return '良';
  return s;
}

/**
 * 過去走が今回のレース条件にどれだけ近いか [minMultiplier, 1]。
 * recency weight に掛けて使う。
 */
export function conditionSimilarityMultiplier(
  sample: PastRaceSample,
  condition: RaceConditionV2,
  cfg: ConditionSimilarityConfig = DEFAULT_CONDITION_SIMILARITY
): number {
  let m = 1;

  // 距離差
  if (isValidNumber(sample.distanceMeters) && isValidNumber(condition.distanceMeters)) {
    const diff = Math.abs(sample.distanceMeters - condition.distanceMeters);
    const capped = Math.min(diff, cfg.distanceMaxDiff);
    m *= Math.max(0, 1 - (capped / 100) * cfg.distancePenaltyPer100m);
  }

  // 芝/ダート
  if (sample.surface && condition.surface && sample.surface !== condition.surface) {
    m *= cfg.surfaceMismatchMultiplier;
  }

  // 競馬場
  if (sample.place && condition.place && sample.place.trim() !== condition.place.trim()) {
    m *= cfg.placeMismatchMultiplier;
  }

  // 馬場状態
  const a = normalizeTrackCondition(sample.trackCondition);
  const b = normalizeTrackCondition(condition.trackCondition);
  if (a && b && a !== b) {
    m *= cfg.trackConditionMismatchMultiplier;
  }

  // 頭数差
  if (isValidNumber(sample.fieldSize) && isValidNumber(condition.fieldSize)) {
    const diff = Math.abs(sample.fieldSize - condition.fieldSize);
    m *= Math.max(0, 1 - diff * cfg.fieldSizePenaltyPerHorse);
  }

  return clamp(m, cfg.minMultiplier, 1);
}

// ============================================================
// 加重平均
// ============================================================

export interface WeightedSample {
  /** 対象の値（既に [0,1] へ正規化済み、または生値） */
  value: number | null;
  /** recency × 条件類似度 で決まる重み */
  weight: number;
}

export interface WeightedAverageResult {
  /** 加重平均。有効サンプルが無ければ null */
  value: number | null;
  /** 使用できた weight の合計 */
  usedWeight: number;
  /** 有効サンプル数 */
  sampleCount: number;
}

/**
 * recency weight による加重平均。
 * - 値が null のサンプルは weight ごと除外（欠損が平均を引っ張らない）
 * - weight <= 0 は無視
 * - 有効サンプルなしなら value = null（呼び出し側が neutral + reliability 0 にする）
 */
export function weightedRecentAverage(
  samples: readonly WeightedSample[]
): WeightedAverageResult {
  let wsum = 0;
  let acc = 0;
  let n = 0;
  for (const s of samples) {
    if (!isValidNumber(s.value)) continue;
    const w = isValidNumber(s.weight) ? Math.max(0, s.weight) : 0;
    if (w <= 0) continue;
    acc += s.value * w;
    wsum += w;
    n++;
  }
  if (wsum <= 0) return { value: null, usedWeight: 0, sampleCount: 0 };
  return { value: acc / wsum, usedWeight: wsum, sampleCount: n };
}

/**
 * 過去走を「新しい順の先頭 N 走」に絞り、recency × 条件類似度の weight を付ける。
 *
 * 重要: sample の重複除去と日付降順ソートは呼び出し側（sample-builder）の責務。
 *       umadata は (race_id, umaban) に最大30件の重複が実在するため、
 *       重複が残っていると recency weighting が壊れる。
 */
export function buildRecencyWeights(
  pastRaces: readonly PastRaceSample[],
  condition: RaceConditionV2,
  opts?: {
    weights?: readonly number[];
    similarity?: ConditionSimilarityConfig;
    /** 条件類似度を使わない（純粋な recency のみ） */
    ignoreCondition?: boolean;
  }
): number[] {
  const weights = opts?.weights ?? DEFAULT_RECENCY_WEIGHTS;
  const out: number[] = [];
  const limit = Math.min(pastRaces.length, weights.length);
  for (let i = 0; i < limit; i++) {
    const base = weights[i];
    const sim = opts?.ignoreCondition
      ? 1
      : conditionSimilarityMultiplier(pastRaces[i], condition, opts?.similarity);
    out.push(base * sim);
  }
  return out;
}

/** 直近5走に限定した past races（新しい順であることが前提） */
export function takeRecent<T>(
  pastRaces: readonly T[],
  maxCount = DEFAULT_RECENCY_WEIGHTS.length
): T[] {
  return pastRaces.slice(0, Math.max(0, maxCount));
}

/**
 * 乖離が大きいときに信頼度を下げる補助。
 * 例: 前半能力から推定した脚質と過去脚質が大きく違う場合。
 * divergence 0 → 1倍、divergence 1 → floor 倍。
 */
export function reliabilityPenaltyForDivergence(divergence: number, floor = 0.4): number {
  const d = clamp01(divergence);
  return clamp(1 - d * (1 - floor), floor, 1);
}

/** neutral な値（明示的に使う場面のため再export） */
export const NEUTRAL_VALUE = NEUTRAL;

/** 今回条件と同一 surface の過去走だけを数える（distanceFit 等の補助） */
export function countSamplesMatching(
  pastRaces: readonly PastRaceSample[],
  predicate: (s: PastRaceSample) => boolean
): number {
  let n = 0;
  for (const s of pastRaces) if (predicate(s)) n++;
  return n;
}

/** surface 一致判定（null は不一致扱いにしない = 判定不能として false） */
export function sameSurface(a: Surface | null, b: Surface | null): boolean {
  return a != null && b != null && a === b;
}
