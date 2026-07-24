/**
 * 道中維持力モデル（純粋関数・レース単位）
 *
 * 「前へ行ける能力」と「前へ行ったまま維持できる能力」を分離する。
 *
 * 核心となる符号の定義:
 *   retention = frontRatio(ゴール) - frontRatio(最初のコーナー)
 *     > 0 : 位置を上げた（維持できた / 押し上げた）
 *     = 0 : 位置維持
 *     < 0 : 位置を下げた（失速）
 *   frontRatio は「1 = 前」なので、retention が大きいほど良い。
 *
 * 実測分布（n=39,684 / docs/RACE_FORECAST_V2_DATA_FINDINGS.md §3）:
 *   p05 -0.714 / p25 -0.267 / 中央 0.000 / p75 +0.200 / p95 +0.556
 *   → retentionMin/Max を [-0.7, +0.55] として [0,1] へ線形化する。
 *
 * 「前半だけ速いが毎回止まる馬」が逃げ切り候補にならないよう、
 * retention が負の馬は fadeRisk が上がり、道中スコアが下がる。
 * 逆に「ハイペースを先行して小さな着差に耐えた馬」は enduranceEvidence で高く評価する。
 */
import {
  clamp,
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
  takeRecent,
  weightedRecentAverage,
} from './recency';
import { paceOfSample } from './pace';
import {
  DEFAULT_FORECAST_V2_CONFIG,
  VALID_RANGES,
  type ForecastV2Config,
} from './config/weights';
import { neutralCourseAdjustment, type CourseAdjustmentV2 } from './course-adjustments';
import type {
  FactorContribution,
  ForecastHorseInputV2,
  ForecastRaceInputV2,
  PastRaceSample,
} from './types';

export interface MidRetentionResult {
  horseNumber: number;
  score: number;
  reliability: number;
  /** [0,1]。1 = 前半の位置を維持できず失速するリスクが高い */
  fadeRisk: number;
  contributions: FactorContribution[];
}

/**
 * 1走分の retention を [0,1] へ。
 * 中止・除外（finishPosition = null）は使わない。
 */
export function retentionOfSample(
  s: PastRaceSample,
  cfg: { retentionMin: number; retentionMax: number }
): number | null {
  if (s.abnormalFinish) return null;
  const early = frontRatio(s.firstCornerPosition, s.fieldSize);
  const finish = frontRatio(s.finishPosition, s.fieldSize);
  if (early == null || finish == null) return null;
  const raw = finish - early;
  const span = cfg.retentionMax - cfg.retentionMin;
  if (!(span > 0)) return NEUTRAL;
  return clamp01((raw - cfg.retentionMin) / span);
}

/**
 * 「厳しいペースを前で受けて小さな着差で凌いだ」証拠 [0,1]。
 *
 *   前方度 × ペースの厳しさ × 着差の小ささ
 *
 * 前方にいなかった走・スローだった走は証拠にならないので低い値になる。
 */
export function enduranceEvidenceOfSample(
  s: PastRaceSample,
  forwardThreshold: number
): number | null {
  if (s.abnormalFinish) return null;
  const early = frontRatio(s.firstCornerPosition, s.fieldSize);
  if (early == null) return null;
  const pace = paceOfSample(s);
  const margin = rejectOutOfRange(
    s.marginSeconds,
    VALID_RANGES.marginSeconds.min,
    VALID_RANGES.marginSeconds.max
  );
  if (pace == null && margin == null) return null;

  // 前方度: forwardThreshold を超えた分だけを評価（後方追走は耐えた証拠にならない）
  const forwardness = clamp01((early - forwardThreshold) / Math.max(1e-6, 1 - forwardThreshold));
  // ペースの厳しさ（不明なら中立 0.5）
  const paceHardness = pace == null ? NEUTRAL : clamp01(pace);
  // 着差の小ささ: 0秒差=1、3秒差で0（勝ち馬の負値は1に張り付く）
  const marginQuality = margin == null ? NEUTRAL : clamp01(1 - Math.max(0, margin) / 3);

  return clamp01(forwardness * paceHardness * marginQuality);
}

/** 距離適性 [0,1]。今回距離に近い距離での出走が多いほど高い */
export function distanceFitOf(
  horse: ForecastHorseInputV2,
  race: ForecastRaceInputV2,
  cfg: { distanceFitTolerance: number; distanceFitMaxDiff: number }
): { value: number | null; usedWeight: number; sampleCount: number } {
  const recent = takeRecent(horse.pastRaces);
  // 距離適性そのものを測るので、条件差減衰（距離差ペナルティ）は掛けない
  const weights = buildRecencyWeights(recent, race.condition, { ignoreCondition: true });
  const target = race.condition.distanceMeters;
  const samples = recent.map((s, i) => {
    if (!isValidNumber(s.distanceMeters) || !isValidNumber(target)) {
      return { value: null, weight: 0 };
    }
    const diff = Math.abs(s.distanceMeters - target);
    let v: number;
    if (diff <= cfg.distanceFitTolerance) v = 1;
    else if (diff >= cfg.distanceFitMaxDiff) v = 0;
    else {
      v =
        1 -
        (diff - cfg.distanceFitTolerance) /
          Math.max(1e-6, cfg.distanceFitMaxDiff - cfg.distanceFitTolerance);
    }
    return { value: clamp01(v), weight: weights[i] ?? 0 };
  });
  return weightedRecentAverage(samples);
}

/** 馬場・コース適性 [0,1]。同じ馬場種別・同じ競馬場での好走度 */
export function surfaceCourseFitOf(
  horse: ForecastHorseInputV2,
  race: ForecastRaceInputV2
): { value: number | null; usedWeight: number; sampleCount: number } {
  const recent = takeRecent(horse.pastRaces);
  const weights = buildRecencyWeights(recent, race.condition, { ignoreCondition: true });
  const samples = recent.map((s, i) => {
    if (s.abnormalFinish) return { value: null, weight: 0 };
    const fin = frontRatio(s.finishPosition, s.fieldSize);
    if (fin == null) return { value: null, weight: 0 };

    // 条件一致度: 芝ダ一致を主、競馬場一致を従
    let match = 0;
    let matchWeight = 0;
    if (s.surface && race.condition.surface) {
      match += s.surface === race.condition.surface ? 1 : 0;
      matchWeight += 1;
    }
    if (s.place && race.condition.place) {
      match += s.place.trim() === race.condition.place.trim() ? 1 : 0;
      matchWeight += 0.5;
    }
    if (matchWeight <= 0) return { value: null, weight: 0 };
    const similarity = match / matchWeight;
    // 条件が一致している走の着順を重く見る
    return { value: fin, weight: (weights[i] ?? 0) * clamp01(0.2 + 0.8 * similarity) };
  });
  return weightedRecentAverage(samples);
}

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
 * レース全体の道中維持力を計算する。
 *
 * potential は competitionScore の potential 成分と二重加点しないため、
 * competitionBreakdown が存在する場合は breakdown 側の potential 成分を優先する。
 */
export function computeMidRetentionScores(
  race: ForecastRaceInputV2,
  courseAdj: CourseAdjustmentV2 = neutralCourseAdjustment(),
  config: ForecastV2Config = DEFAULT_FORECAST_V2_CONFIG
): MidRetentionResult[] {
  const horses = race.horses;
  const n = horses.length;
  const mm = config.midModel;

  // ---- 馬ごとの素の集計 ----
  const retention = horses.map((h) => {
    const recent = takeRecent(h.pastRaces);
    const weights = buildRecencyWeights(recent, race.condition);
    return weightedRecentAverage(
      recent.map((s, i) => ({ value: retentionOfSample(s, mm), weight: weights[i] ?? 0 }))
    );
  });

  const endurance = horses.map((h) => {
    const recent = takeRecent(h.pastRaces);
    const weights = buildRecencyWeights(recent, race.condition);
    return weightedRecentAverage(
      recent.map((s, i) => ({
        value: enduranceEvidenceOfSample(s, config.earlyModel.forwardThreshold),
        weight: weights[i] ?? 0,
      }))
    );
  });

  const potentialAvg = horses.map((h) =>
    recencyAverageOfIndex(h, race, (s) => s.potential, VALID_RANGES.potential)
  );
  const distFit = horses.map((h) => distanceFitOf(h, race, mm));
  const courseFit = horses.map((h) => surfaceCourseFitOf(h, race));

  // ---- レース内 percentile ----
  const retentionNorm = normalizeHigherIsBetter(retention.map((x) => x.value));
  const enduranceNorm = normalizeHigherIsBetter(endurance.map((x) => x.value));
  const distFitNorm = normalizeHigherIsBetter(distFit.map((x) => x.value));
  const courseFitNorm = normalizeHigherIsBetter(courseFit.map((x) => x.value));

  // potential: breakdown があればそれを使う（二重加点防止のため一方だけ）
  const potentialSource = horses.map((h) => {
    if (h.competitionBreakdown && isValidNumber(h.competitionBreakdown.potential)) {
      return { value: h.competitionBreakdown.potential, provenance: 'competition-score' as const, usedWeight: 1, sampleCount: 1 };
    }
    const a = potentialAvg[horses.indexOf(h)];
    return { value: a.value, provenance: (a.value == null ? 'missing' : 'indices') as 'indices' | 'missing', usedWeight: a.usedWeight, sampleCount: a.sampleCount };
  });
  const potentialNorm = normalizeHigherIsBetter(
    winsorizeWithinRace(potentialSource.map((x) => x.value))
  );

  const w = config.mid;
  const clamps = config.clamps;
  const results: MidRetentionResult[] = [];

  for (let i = 0; i < n; i++) {
    const contributions: FactorContribution[] = [];
    const parts: { value: number; reliability: number; weight: number }[] = [];

    // (a) 位置維持
    {
      const rel = reliabilityFromUsedWeight(retention[i].usedWeight);
      const value = retentionNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.positionRetention });
      contributions.push({
        label: '位置維持（前半→ゴール）',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: retention[i].value == null ? 'missing' : 'umadata',
        missingReason: retention[i].value == null ? 'column-empty' : undefined,
      });
    }

    // (b) ハイペース先行で耐えた実績
    {
      const rel = reliabilityFromUsedWeight(endurance[i].usedWeight);
      const value = enduranceNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.enduranceEvidence });
      contributions.push({
        label: 'ハイペース先行の耐久実績',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: endurance[i].value == null ? 'missing' : 'derived',
        missingReason: endurance[i].value == null ? 'column-empty' : undefined,
      });
    }

    // (c) potential（competitionScore 成分と排他）
    {
      const src = potentialSource[i];
      const rel = src.provenance === 'competition-score' ? 1 : reliabilityFromUsedWeight(src.usedWeight);
      const value = potentialNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.potential });
      contributions.push({
        label: 'potential（持続力）',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: src.provenance,
        missingReason: src.value == null ? 'column-empty' : undefined,
      });
    }

    // (d) 距離適性
    {
      const rel = reliabilityFromUsedWeight(distFit[i].usedWeight);
      const value = distFitNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.distanceFit });
      contributions.push({
        label: '距離適性',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: distFit[i].value == null ? 'missing' : 'umadata',
        missingReason: distFit[i].value == null ? 'column-empty' : undefined,
      });
    }

    // (e) 馬場・コース適性
    {
      const rel = reliabilityFromUsedWeight(courseFit[i].usedWeight);
      const value = courseFitNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.surfaceCourseFit });
      contributions.push({
        label: '馬場・コース適性',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: courseFit[i].value == null ? 'missing' : 'umadata',
        missingReason: courseFit[i].value == null ? 'column-empty' : undefined,
      });
    }

    const combined = combineWeighted(parts);

    // ---- 急坂コースでは維持力の差をわずかに強調する ----
    // （倍率は course-adjustments 側でクランプ済み。ここでは neutral 起点でスケールする）
    const slopeEmphasis = 1 + courseAdj.finishSlopeSeverity * 0.1;
    const emphasized = clamp01(NEUTRAL + (combined.score - NEUTRAL) * slopeEmphasis);

    // ---- fadeRisk: 前半で前に行くのに維持できない度合い ----
    const retRaw = retention[i].value;
    let fadeRisk = 0;
    if (retRaw != null) {
      // retention の正規化値が低い = 失速している
      const retNormalizedRaw = retRaw; // [0,1]（retentionOfSample で線形化済み）
      const neutralRetention =
        (0 - mm.retentionMin) / Math.max(1e-6, mm.retentionMax - mm.retentionMin);
      fadeRisk = clamp01((neutralRetention - retNormalizedRaw) / Math.max(1e-6, neutralRetention));
      // 信頼度が低ければ fadeRisk も薄める
      fadeRisk *= clamp01(reliabilityFromUsedWeight(retention[i].usedWeight));
    }

    // ---- 寄与量 ----
    let wsum = 0;
    for (const p of parts) wsum += p.weight;
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      const shrunk = NEUTRAL + (p.value - NEUTRAL) * clamp01(p.reliability);
      const raw = wsum > 0 ? ((shrunk - NEUTRAL) * p.weight) / wsum : 0;
      contributions[k].contribution = clampContribution(raw, clamps.maxFactorContribution);
    }

    results.push({
      horseNumber: horses[i].horseNumber,
      score: clamp(emphasized, clamps.phaseScoreMin, clamps.phaseScoreMax),
      reliability: clamp01(combined.reliability),
      fadeRisk: clamp01(fadeRisk),
      contributions,
    });
  }

  return results;
}
