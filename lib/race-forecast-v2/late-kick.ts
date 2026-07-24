/**
 * 後半追い上げモデル（純粋関数・レース単位）
 *
 * 主軸は上がり3F（last_3f・充足率99.2%）。
 * L4F は DB実測で「後半4Fの秒数・小さいほど速い」と確定したため補助として使う
 * （corr(L4F, last_3f) = +0.9836 / 芝ダで差はちょうど1F分 = docs/RACE_FORECAST_V2_DATA_FINDINGS.md §1）。
 * 設定 lateModel.l4fDirection = 'disabled' で無効化できる。
 *
 * 二重加点の回避:
 *  - competitionScore 全体をそのまま加えない
 *  - breakdown のうち「後半に関係する成分」だけを使う（makikaeshi / margin / finish / cluster）
 *  - potential と 通過順位×ペース はここでは使わない（道中 / 前半で既に使っている）
 *
 * 前半消耗:
 *  - 前で運んだ馬は後半の余力が減るという前提を freshness として反映する
 *  - ただし「前で運んで後半も伸びる馬」を潰さないよう、消耗は小さめの係数にする
 */
import {
  clamp,
  clamp01,
  clampContribution,
  combineWeighted,
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
import {
  DEFAULT_FORECAST_V2_CONFIG,
  VALID_RANGES,
  type ForecastV2Config,
} from './config/weights';
import { neutralCourseAdjustment, type CourseAdjustmentV2 } from './course-adjustments';
import type {
  CompetitionBreakdownV2,
  FactorContribution,
  ForecastHorseInputV2,
  ForecastRaceInputV2,
  PastRaceSample,
} from './types';
import type { EarlyPositionResult } from './early-position';

export interface LateKickResult {
  horseNumber: number;
  score: number;
  reliability: number;
  /** 追い上げを開始する raceProgress（0..1）。後半力が高いほど早く動ける */
  kickStartProgress: number;
  /** 直線で進出できる最大距離(m) */
  maxLateGainMeters: number;
  contributions: FactorContribution[];
}

/**
 * competitionScore の breakdown から「後半に関係する成分」だけを取り出して [0,1] へ。
 * 前半・道中で使う成分（passing / paceSync / potential / positionImprovement / courseFit）は含めない。
 */
export function lateComponentOfBreakdown(b: CompetitionBreakdownV2 | undefined): number | null {
  if (!b) return null;
  const parts = [b.comeback, b.margin, b.finish, b.cluster].filter(isValidNumber);
  if (parts.length === 0) return null;
  const sum = parts.reduce((a, c) => a + c, 0);
  // breakdown の各成分は 0..1 前後の寄与として作られているため平均で代表させる
  return clamp01(sum / parts.length);
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
 * レース全体の後半追い上げ力を計算する。
 *
 * earlyResults を渡すと前半消耗（freshness）を反映できる。省略時は消耗を中立にする。
 */
export function computeLateKickScores(
  race: ForecastRaceInputV2,
  earlyResults?: readonly EarlyPositionResult[],
  courseAdj: CourseAdjustmentV2 = neutralCourseAdjustment(),
  config: ForecastV2Config = DEFAULT_FORECAST_V2_CONFIG
): LateKickResult[] {
  const horses = race.horses;
  const n = horses.length;
  const lm = config.lateModel;

  const earlyByHorse = new Map<number, EarlyPositionResult>();
  if (earlyResults) for (const r of earlyResults) earlyByHorse.set(r.horseNumber, r);

  // ---- 素の集計 ----
  const last3fAvg = horses.map((h) =>
    recencyAverageOfIndex(h, race, (s) => s.last3fSeconds, VALID_RANGES.last3fSeconds)
  );
  const l4fAvg = horses.map((h) =>
    recencyAverageOfIndex(h, race, (s) => s.l4fSeconds, VALID_RANGES.l4fSeconds)
  );
  const makikaeshiAvg = horses.map((h) =>
    // makikaeshi は 57.8% が 0 の実測値。0 を欠損として扱わない
    recencyAverageOfIndex(h, race, (s) => s.makikaeshi, VALID_RANGES.makikaeshi)
  );
  const marginAvg = horses.map((h) =>
    recencyAverageOfIndex(h, race, (s) => s.marginSeconds, VALID_RANGES.marginSeconds)
  );
  const compLate = horses.map((h) => lateComponentOfBreakdown(h.competitionBreakdown));

  // ---- レース内 percentile ----
  const last3fNorm = normalizeLowerIsBetter(winsorizeWithinRace(last3fAvg.map((x) => x.value)));
  const l4fNorm =
    lm.l4fDirection === 'disabled'
      ? horses.map(() => null)
      : lm.l4fDirection === 'lower-is-better'
        ? normalizeLowerIsBetter(winsorizeWithinRace(l4fAvg.map((x) => x.value)))
        : normalizeHigherIsBetter(winsorizeWithinRace(l4fAvg.map((x) => x.value)));
  const makikaeshiNorm = normalizeHigherIsBetter(
    winsorizeWithinRace(makikaeshiAvg.map((x) => x.value))
  );
  const marginNorm = normalizeLowerIsBetter(winsorizeWithinRace(marginAvg.map((x) => x.value)));
  const compLateNorm = normalizeHigherIsBetter(compLate);

  const w = config.late;
  const clamps = config.clamps;
  const results: LateKickResult[] = [];

  for (let i = 0; i < n; i++) {
    const horse = horses[i];
    const contributions: FactorContribution[] = [];
    const parts: { value: number; reliability: number; weight: number }[] = [];

    // (a) 上がり3F（主軸）
    {
      const rel = reliabilityFromUsedWeight(last3fAvg[i].usedWeight);
      const value = last3fNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.last3f });
      contributions.push({
        label: '上がり3F',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: last3fAvg[i].value == null ? 'missing' : 'umadata',
        missingReason: last3fAvg[i].value == null ? 'column-empty' : undefined,
      });
    }

    // (b) L4F（方向確定済み・補助）
    {
      const disabled = lm.l4fDirection === 'disabled';
      const rel = disabled ? 0 : reliabilityFromUsedWeight(l4fAvg[i].usedWeight);
      const value = l4fNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.l4f });
      contributions.push({
        label: disabled ? 'L4F（無効化中）' : 'L4F（後半4F・秒）',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: disabled || l4fAvg[i].value == null ? 'missing' : 'indices',
        missingReason: disabled
          ? 'direction-unknown'
          : l4fAvg[i].value == null
            ? 'column-empty'
            : undefined,
      });
    }

    // (c) 競うスコアの後半成分
    {
      const has = compLate[i] != null;
      const rel = has ? 1 : 0;
      const value = compLateNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.competitionLate });
      contributions.push({
        label: '競うスコア後半成分（巻き返し・着差・クラスタ）',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: has ? 'competition-score' : 'missing',
        missingReason: has ? undefined : 'column-empty',
      });
    }

    // (d) makikaeshi 単体（breakdown が無い場合の代替。ある場合は weight を下げる）
    {
      const hasBreakdown = compLate[i] != null;
      const rel = reliabilityFromUsedWeight(makikaeshiAvg[i].usedWeight) * (hasBreakdown ? 0.35 : 1);
      const value = makikaeshiNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.makikaeshi });
      contributions.push({
        label: hasBreakdown ? 'makikaeshi（breakdownと重複のため減衰）' : 'makikaeshi（巻き返し）',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: makikaeshiAvg[i].value == null ? 'missing' : 'indices',
        missingReason: makikaeshiAvg[i].value == null ? 'column-empty' : undefined,
      });
    }

    // (e) 着差
    {
      const rel = reliabilityFromUsedWeight(marginAvg[i].usedWeight);
      const value = marginNorm[i] ?? NEUTRAL;
      parts.push({ value, reliability: rel, weight: w.margin });
      contributions.push({
        label: '着差',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: marginAvg[i].value == null ? 'missing' : 'umadata',
        missingReason: marginAvg[i].value == null ? 'column-empty' : undefined,
      });
    }

    // (f) freshness（前半消耗の少なさ）
    {
      const early = earlyByHorse.get(horse.horseNumber);
      let value = NEUTRAL;
      let rel = 0;
      if (early) {
        // 前で運ぶほど消耗する。earlyScore 0.5 を基準に、上振れ分だけ freshness を減らす
        const effort = clamp01(early.expectedFrontRatio);
        value = clamp01(1 - effort * lm.earlyEffortCostFactor);
        rel = clamp01(early.reliability);
      }
      parts.push({ value, reliability: rel, weight: w.freshness });
      contributions.push({
        label: '前半消耗の少なさ',
        contribution: 0,
        normalized: value,
        reliability: rel,
        provenance: early ? 'derived' : 'missing',
        missingReason: early ? undefined : 'not-applicable',
      });
    }

    const combined = combineWeighted(parts);

    // ---- 直線が長いコースでは後半力の差を少し強調 ----
    const straightEmphasis = 1 + (courseAdj.straightLengthNorm - 0.5) * 0.2;
    const emphasized = clamp01(NEUTRAL + (combined.score - NEUTRAL) * straightEmphasis);
    const score = clamp(emphasized, clamps.phaseScoreMin, clamps.phaseScoreMax);

    // ---- 追い上げ開始地点: 後半力が高いほど早く（値が小さく）動ける ----
    const kickStartProgress = clamp(
      lm.kickStartProgressMax - (lm.kickStartProgressMax - lm.kickStartProgressMin) * score,
      lm.kickStartProgressMin,
      lm.kickStartProgressMax
    );

    // ---- 最大進出量(m): レース距離に対する比 × スコア ----
    const maxLateGainMeters =
      race.condition.distanceMeters * lm.maxLateGainFraction * clamp01(score);

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
      horseNumber: horse.horseNumber,
      score,
      reliability: clamp01(combined.reliability),
      kickStartProgress,
      maxLateGainMeters,
      contributions,
    });
  }

  return results;
}
