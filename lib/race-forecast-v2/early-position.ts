/**
 * 前半位置取りモデル（純粋関数・レース単位）
 *
 * 「前にいた」だけでなく「どういうペースで前にいたか」を評価する。
 *   - ハイペースを前方追走 → 満額評価
 *   - スローペースで前方   → 割引（slowPaceFrontDiscount）
 *   - ハイペースで後方     → 先行力の証拠として使わない（ペースで増幅しない）
 *
 * 通過順位は必ず頭数で正規化する（frontRatio）。
 * 通過順位は corner_1 ではなく「最初に埋まっているコーナー」を使う
 * （DB は最後のN個のコーナーを右詰め格納するため。corner_1 の充足率は44.9%）。
 *
 * 指数は絶対値を足さず、レース内 percentile へ変換する（legacy の飽和を回避）。
 */
import {
  clamp01,
  clampContribution,
  combineWeighted,
  frontRatio,
  isValidNumber,
  normalizeHigherIsBetter,
  normalizeLowerIsBetter,
  rejectOutOfRange,
  winsorizeWithinRace,
  NEUTRAL,
} from './normalization';
import {
  buildRecencyWeights,
  reliabilityFromUsedWeight,
  reliabilityPenaltyForDivergence,
  takeRecent,
  weightedRecentAverage,
  DEFAULT_RECENCY_WEIGHTS,
} from './recency';
import { paceOfSample } from './pace';
import {
  DEFAULT_FORECAST_V2_CONFIG,
  VALID_RANGES,
  type ForecastV2Config,
} from './config/weights';
import {
  gateEarlyAdjustment,
  neutralCourseAdjustment,
  type CourseAdjustmentV2,
} from './course-adjustments';
import type {
  FactorContribution,
  ForecastRaceInputV2,
  ForecastHorseInputV2,
  PastRaceSample,
} from './types';

/** 予想脚質帯 */
export type RunningStyleBand = 'escape' | 'front' | 'stalker' | 'closer';

export interface EarlyPositionResult {
  horseNumber: number;
  score: number;
  reliability: number;
  /** 予想される前半の frontRatio [0,1]（1 = 最前） */
  expectedFrontRatio: number;
  /** 予想脚質帯 */
  expectedBand: RunningStyleBand;
  /** 過去走から見た脚質帯（比較用） */
  historicalBand: RunningStyleBand | null;
  contributions: FactorContribution[];
}

/** frontRatio → 脚質帯 */
export function bandFromFrontRatio(
  fr: number,
  edges: { escape: number; front: number; stalker: number }
): RunningStyleBand {
  if (fr >= edges.escape) return 'escape';
  if (fr >= edges.front) return 'front';
  if (fr >= edges.stalker) return 'stalker';
  return 'closer';
}

/** 脚質帯を数値化（乖離度の計算用） */
function bandIndex(b: RunningStyleBand): number {
  return b === 'escape' ? 0 : b === 'front' ? 1 : b === 'stalker' ? 2 : 3;
}

/**
 * 1走分の「ペース補正済み前方追走クレジット」[0,1]。
 *
 * fr >= forwardThreshold（前方）のとき、その価値をペースで割り引く:
 *   pace=1（ハイ）  → 満額（= fr）
 *   pace=0（スロー） → threshold からの上積みが slowPaceFrontDiscount 倍
 * fr < forwardThreshold（後方）のとき、ペースでは増減させない。
 */
export function paceAdjustedFrontCredit(
  fr: number | null,
  pace: number | null,
  cfg: { slowPaceFrontDiscount: number; forwardThreshold: number }
): number | null {
  if (fr == null || !isValidNumber(fr)) return null;
  const th = cfg.forwardThreshold;
  if (fr < th) {
    // 後方追走: 先行力の証拠にしない（ペース無関係にそのまま）
    return clamp01(fr);
  }
  // ペース不明なら中間的な扱い（割引を半分だけ適用）
  const p = pace == null ? 0.5 : clamp01(pace);
  const factor = cfg.slowPaceFrontDiscount + (1 - cfg.slowPaceFrontDiscount) * p;
  return clamp01(th + (fr - th) * factor);
}

/** 過去走から前方追走クレジットの加重平均を取る */
function computeFrontAbility(
  horse: ForecastHorseInputV2,
  race: ForecastRaceInputV2,
  config: ForecastV2Config
): { value: number | null; usedWeight: number; sampleCount: number } {
  const recent = takeRecent(horse.pastRaces);
  const weights = buildRecencyWeights(recent, race.condition);
  const samples = recent.map((s, i) => {
    const fr = frontRatio(s.firstCornerPosition, s.fieldSize);
    const credit = paceAdjustedFrontCredit(fr, paceOfSample(s), config.earlyModel);
    return { value: credit, weight: weights[i] ?? 0 };
  });
  return weightedRecentAverage(samples);
}

/** 前方追走の一貫性（前半を前で運べた割合）。平均とは別の情報を持つ */
function computeForwardConsistency(
  horse: ForecastHorseInputV2,
  race: ForecastRaceInputV2,
  config: ForecastV2Config
): { value: number | null; usedWeight: number; sampleCount: number } {
  const recent = takeRecent(horse.pastRaces);
  const weights = buildRecencyWeights(recent, race.condition);
  const samples = recent.map((s, i) => {
    const fr = frontRatio(s.firstCornerPosition, s.fieldSize);
    if (fr == null) return { value: null, weight: 0 };
    return { value: fr >= config.earlyModel.forwardThreshold ? 1 : 0, weight: weights[i] ?? 0 };
  });
  return weightedRecentAverage(samples);
}

/** 過去走の frontRatio 平均から脚質帯を求める */
function computeHistoricalBand(
  horse: ForecastHorseInputV2,
  race: ForecastRaceInputV2,
  config: ForecastV2Config
): { band: RunningStyleBand | null; meanFrontRatio: number | null; dispersion: number } {
  const recent = takeRecent(horse.pastRaces);
  const weights = buildRecencyWeights(recent, race.condition);
  const frs: { v: number; w: number }[] = [];
  for (let i = 0; i < recent.length; i++) {
    const fr = frontRatio(recent[i].firstCornerPosition, recent[i].fieldSize);
    if (fr != null) frs.push({ v: fr, w: weights[i] ?? 0 });
  }
  const avg = weightedRecentAverage(frs.map((x) => ({ value: x.v, weight: x.w })));
  if (avg.value == null) return { band: null, meanFrontRatio: null, dispersion: 0 };

  // 加重標準偏差（脚質のばらつき）
  let wsum = 0;
  let acc = 0;
  for (const x of frs) {
    if (x.w <= 0) continue;
    acc += x.w * (x.v - avg.value) ** 2;
    wsum += x.w;
  }
  const dispersion = wsum > 0 ? Math.sqrt(acc / wsum) : 0;

  return {
    band: bandFromFrontRatio(avg.value, config.earlyModel.bandEdges),
    meanFrontRatio: avg.value,
    dispersion,
  };
}

/** 指数の recency 加重平均（絶対値。percentile 化は field 単位で行う） */
function recencyAverageOfIndex(
  horse: ForecastHorseInputV2,
  race: ForecastRaceInputV2,
  pick: (s: PastRaceSample) => number | null,
  range: { min: number; max: number }
): { value: number | null; usedWeight: number; sampleCount: number } {
  const recent = takeRecent(horse.pastRaces);
  const weights = buildRecencyWeights(recent, race.condition);
  const samples = recent.map((s, i) => ({
    value: rejectOutOfRange(pick(s), range.min, range.max),
    weight: weights[i] ?? 0,
  }));
  return weightedRecentAverage(samples);
}

/**
 * レース全体の前半位置取りスコアを計算する。
 *
 * 指数はレース内 percentile へ変換するため、必ず全馬まとめて処理する。
 */
export function computeEarlyPositionScores(
  race: ForecastRaceInputV2,
  courseAdj: CourseAdjustmentV2 = neutralCourseAdjustment(),
  config: ForecastV2Config = DEFAULT_FORECAST_V2_CONFIG
): EarlyPositionResult[] {
  const horses = race.horses;
  const n = horses.length;

  // ---- 1. 馬ごとの素の集計 ----
  const frontAbility = horses.map((h) => computeFrontAbility(h, race, config));
  const consistency = horses.map((h) => computeForwardConsistency(h, race, config));
  const historical = horses.map((h) => computeHistoricalBand(h, race, config));
  const t2fAvg = horses.map((h) =>
    recencyAverageOfIndex(h, race, (s) => s.t2fSeconds, VALID_RANGES.t2fSeconds)
  );
  const pfsAvg = horses.map((h) =>
    recencyAverageOfIndex(h, race, (s) => s.pfsPast, VALID_RANGES.pfsPast)
  );

  // ---- 2. レース内 percentile（外れ値は winsorize してから） ----
  const t2fNorm = normalizeLowerIsBetter(
    winsorizeWithinRace(t2fAvg.map((x) => x.value))
  );
  const pfsNorm = normalizeHigherIsBetter(
    winsorizeWithinRace(pfsAvg.map((x) => x.value))
  );
  // 前方追走クレジットも percentile 化する（絶対値のばらつきをレース内で相対化）
  const frontNorm = normalizeHigherIsBetter(frontAbility.map((x) => x.value));
  const consistencyNorm = normalizeHigherIsBetter(consistency.map((x) => x.value));

  const w = config.early;
  const clamps = config.clamps;

  // ---- 3. 合成 ----
  const results: EarlyPositionResult[] = [];
  for (let i = 0; i < n; i++) {
    const horse = horses[i];
    const contributions: FactorContribution[] = [];

    const gateAdj = gateEarlyAdjustment(courseAdj, horse.gateNumber, race.condition.fieldSize, clamps);

    const parts: { value: number; reliability: number; weight: number }[] = [];

    // (a) ペース補正済み通過順位
    {
      const rel = reliabilityFromUsedWeight(frontAbility[i].usedWeight);
      const value = frontNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.paceAdjustedFrontAbility });
      contributions.push({
        label: 'ペース補正済み通過順位',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: frontAbility[i].value == null ? 'missing' : 'umadata',
        missingReason: frontAbility[i].value == null ? 'column-empty' : undefined,
      });
    }

    // (b) T2F（小さいほど速い）
    {
      const rel = reliabilityFromUsedWeight(t2fAvg[i].usedWeight);
      const value = t2fNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.t2f });
      contributions.push({
        label: 'T2F（前半2F）',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: t2fAvg[i].value == null ? 'missing' : 'indices',
        missingReason: t2fAvg[i].value == null ? 'column-empty' : undefined,
      });
    }

    // (c) 過去先行力 pfs_past
    {
      const rel = reliabilityFromUsedWeight(pfsAvg[i].usedWeight);
      const value = pfsNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.historicalPfs });
      contributions.push({
        label: '過去先行力（pfs_past）',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: pfsAvg[i].value == null ? 'missing' : 'indices',
        missingReason: pfsAvg[i].value == null ? 'column-empty' : undefined,
      });
    }

    // (d) 前方追走の一貫性
    {
      const rel = reliabilityFromUsedWeight(consistency[i].usedWeight);
      const value = consistencyNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.forwardConsistency });
      contributions.push({
        label: '前方追走の一貫性',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: consistency[i].value == null ? 'missing' : 'derived',
        missingReason: consistency[i].value == null ? 'column-empty' : undefined,
      });
    }

    // (e) コース・枠補正（[0,1] の中心 0.5 に対する加算として扱う）
    {
      const value = clamp01(NEUTRAL + gateAdj / Math.max(1e-6, clamps.maxGateAdjustment) * 0.5);
      // provenance が estimated なら course-adjustments 側で既に減衰済み
      const rel = gateAdj === 0 ? 0 : 1;
      parts.push({ value, reliability: rel, weight: w.courseStart });
      contributions.push({
        label: 'コース・枠の発走補正',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: gateAdj === 0 ? 'missing' : 'course-geometry',
        missingReason: gateAdj === 0 ? 'not-applicable' : undefined,
      });
    }

    const combined = combineWeighted(parts);

    // ---- 4. 脚質乖離による信頼度の減衰 ----
    const expectedFrontRatio = clamp01(combined.score);
    const expectedBand = bandFromFrontRatio(expectedFrontRatio, config.earlyModel.bandEdges);
    const histBand = historical[i].band;
    let reliability = combined.reliability;
    if (histBand) {
      // 帯の乖離（0..3）を [0,1] にして信頼度を下げる
      const divergence = Math.abs(bandIndex(expectedBand) - bandIndex(histBand)) / 3;
      reliability *= reliabilityPenaltyForDivergence(
        divergence,
        config.earlyModel.styleDivergenceReliabilityFloor
      );
    }
    // 脚質のばらつきが大きい馬も信頼度を下げる
    reliability *= reliabilityPenaltyForDivergence(clamp01(historical[i].dispersion * 2), 0.6);

    // ---- 5. 寄与量を算出（説明用。合計が score - 0.5 に対応する） ----
    let wsum = 0;
    for (const p of parts) wsum += p.weight;
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      const shrunk = NEUTRAL + (p.value - NEUTRAL) * clamp01(p.reliability);
      const raw = wsum > 0 ? ((shrunk - NEUTRAL) * p.weight) / wsum : 0;
      contributions[k].contribution = clampContribution(raw, clamps.maxFactorContribution);
    }

    results.push({
      horseNumber: horse.horseNumber,
      score: clamp01(
        Math.min(clamps.phaseScoreMax, Math.max(clamps.phaseScoreMin, combined.score))
      ),
      reliability: clamp01(reliability),
      expectedFrontRatio,
      expectedBand,
      historicalBand: histBand,
      contributions,
    });
  }

  return results;
}

/** 期待隊列順位（1 = 先頭）。expectedFrontRatio の降順 */
export function expectedFormationRanks(results: readonly EarlyPositionResult[]): Map<number, number> {
  const sorted = [...results].sort((a, b) => {
    if (b.expectedFrontRatio !== a.expectedFrontRatio) {
      return b.expectedFrontRatio - a.expectedFrontRatio;
    }
    // 同値は馬番で決定論的に（順位表示のためのタイブレークのみ。スコアには影響しない）
    return a.horseNumber - b.horseNumber;
  });
  const map = new Map<number, number>();
  sorted.forEach((r, i) => map.set(r.horseNumber, i + 1));
  return map;
}

export { DEFAULT_RECENCY_WEIGHTS };
