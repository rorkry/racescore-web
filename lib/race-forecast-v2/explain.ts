/**
 * 3 Phase の統合と explainability（純粋関数）
 *
 * 本番経路には未接続。development / debug でのみ表を出す想定。
 * 毎フレームログは禁止（レースごとに1回）。
 *
 * 乱数は決定論的（raceKey + horseNumber）で、既定では無効（maxContribution = 0）。
 * 有効化しても totalScore への寄与は maxContribution 以内で、
 * 強い能力差を単独で逆転できない。
 */
import { clamp, clamp01, NEUTRAL } from './normalization';
import { DEFAULT_FORECAST_V2_CONFIG, type ForecastV2Config } from './config/weights';
import { computeEarlyPositionScores, expectedFormationRanks, type EarlyPositionResult, type RunningStyleBand } from './early-position';
import { computeMidRetentionScores, type MidRetentionResult } from './mid-race-retention';
import { computeLateKickScores, type LateKickResult } from './late-kick';
import { neutralCourseAdjustment, type CourseAdjustmentV2 } from './course-adjustments';
import type { FactorContribution, ForecastRaceInputV2 } from './types';

export interface ForecastExplanationV2 {
  horseNumber: number;
  horseName: string;
  earlyScore: number;
  midScore: number;
  lateScore: number;
  /** 3 Phase を統合した総合スコア [0,1] */
  totalScore: number;
  earlyReliability: number;
  midReliability: number;
  lateReliability: number;
  /** 重み付き平均の総合信頼度 [0,1] */
  totalReliability: number;
  /** コース補正の合計影響（Phase 倍率の平均偏差） */
  courseAdjustment: number;
  /** 乱数の寄与（既定 0） */
  randomContribution: number;
  expectedFormationRank: number;
  predictedFinishRank: number;
  expectedBand: RunningStyleBand;
  historicalBand: RunningStyleBand | null;
  fadeRisk: number;
  kickStartProgress: number;
  maxLateGainMeters: number;
  /** 寄与の大きい順に並べた factor 一覧 */
  factors: {
    label: string;
    contribution: number;
    provenance: string;
    phase: 'early' | 'mid' | 'late';
  }[];
}

export interface ForecastResultV2 {
  early: EarlyPositionResult[];
  mid: MidRetentionResult[];
  late: LateKickResult[];
  explanations: ForecastExplanationV2[];
  courseAdjustment: CourseAdjustmentV2;
}

/**
 * 決定論的な擬似乱数 [0,1)。raceKey + horseNumber のみに依存する。
 * 同じ入力なら常に同じ値。Math.random は使わない。
 */
export function deterministicUnit(raceKey: string, horseNumber: number): number {
  // FNV-1a 32bit
  let h = 0x811c9dc5;
  const s = `${raceKey}#${horseNumber}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 上位ビットを使って [0,1) へ
  return ((h >>> 8) & 0xffffff) / 0x1000000;
}

/**
 * 3 Phase を統合して totalScore と説明を作る。
 *
 * Phase weight にコース補正倍率を掛ける（倍率は course-adjustments でクランプ済み）。
 */
export function computeForecastV2(
  race: ForecastRaceInputV2,
  courseAdj: CourseAdjustmentV2 = neutralCourseAdjustment(),
  config: ForecastV2Config = DEFAULT_FORECAST_V2_CONFIG
): ForecastResultV2 {
  const early = computeEarlyPositionScores(race, courseAdj, config);
  const mid = computeMidRetentionScores(race, courseAdj, config);
  const late = computeLateKickScores(race, early, courseAdj, config);

  const earlyBy = new Map(early.map((r) => [r.horseNumber, r]));
  const midBy = new Map(mid.map((r) => [r.horseNumber, r]));
  const lateBy = new Map(late.map((r) => [r.horseNumber, r]));
  const formationRanks = expectedFormationRanks(early);

  // Phase weight にコース補正を適用
  const bw = config.blend;
  const m = courseAdj.phaseMultipliers;
  const wEarly = bw.early * m.early;
  const wMid = bw.mid * m.mid;
  const wLate = bw.late * m.late;
  const wSum = wEarly + wMid + wLate;

  // コース補正の影響量（説明用）
  const courseAdjustmentMagnitude =
    (Math.abs(m.early - 1) + Math.abs(m.mid - 1) + Math.abs(m.late - 1)) / 3;

  const rows: {
    horseNumber: number;
    horseName: string;
    total: number;
    random: number;
    e: EarlyPositionResult;
    mi: MidRetentionResult;
    l: LateKickResult;
  }[] = [];

  for (const horse of race.horses) {
    const e = earlyBy.get(horse.horseNumber);
    const mi = midBy.get(horse.horseNumber);
    const l = lateBy.get(horse.horseNumber);
    if (!e || !mi || !l) continue;

    let total =
      wSum > 0 ? (e.score * wEarly + mi.score * wMid + l.score * wLate) / wSum : NEUTRAL;

    // fadeRisk による減点（維持できない馬の総合評価を下げる）
    total = clamp01(total - mi.fadeRisk * 0.08);

    // 決定論的乱数（既定は無効）
    let random = 0;
    if (config.random.enabled && config.random.maxContribution > 0) {
      const u = deterministicUnit(race.condition.raceKey, horse.horseNumber);
      random = (u - 0.5) * 2 * config.random.maxContribution;
      total = clamp01(total + random);
    }

    rows.push({
      horseNumber: horse.horseNumber,
      horseName: horse.horseName,
      total: clamp(total, config.clamps.totalScoreMin, config.clamps.totalScoreMax),
      random,
      e,
      mi,
      l,
    });
  }

  // 予測着順: totalScore 降順。同値は馬番で決定論的に
  const ranked = [...rows].sort((a, b) =>
    b.total !== a.total ? b.total - a.total : a.horseNumber - b.horseNumber
  );
  const finishRanks = new Map<number, number>();
  ranked.forEach((r, i) => finishRanks.set(r.horseNumber, i + 1));

  const explanations: ForecastExplanationV2[] = rows.map((r) => {
    const factors = [
      ...r.e.contributions.map((c) => ({ ...c, phase: 'early' as const })),
      ...r.mi.contributions.map((c) => ({ ...c, phase: 'mid' as const })),
      ...r.l.contributions.map((c) => ({ ...c, phase: 'late' as const })),
    ]
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .map((c) => ({
        label: c.label,
        contribution: c.contribution,
        provenance: c.missingReason ? `${c.provenance}(${c.missingReason})` : c.provenance,
        phase: c.phase,
      }));

    const totalReliability =
      wSum > 0
        ? (r.e.reliability * wEarly + r.mi.reliability * wMid + r.l.reliability * wLate) / wSum
        : 0;

    return {
      horseNumber: r.horseNumber,
      horseName: r.horseName,
      earlyScore: r.e.score,
      midScore: r.mi.score,
      lateScore: r.l.score,
      totalScore: r.total,
      earlyReliability: r.e.reliability,
      midReliability: r.mi.reliability,
      lateReliability: r.l.reliability,
      totalReliability: clamp01(totalReliability),
      courseAdjustment: courseAdjustmentMagnitude,
      randomContribution: r.random,
      expectedFormationRank: formationRanks.get(r.horseNumber) ?? 0,
      predictedFinishRank: finishRanks.get(r.horseNumber) ?? 0,
      expectedBand: r.e.expectedBand,
      historicalBand: r.e.historicalBand,
      fadeRisk: r.mi.fadeRisk,
      kickStartProgress: r.l.kickStartProgress,
      maxLateGainMeters: r.l.maxLateGainMeters,
      factors,
    };
  });

  explanations.sort((a, b) => a.predictedFinishRank - b.predictedFinishRank);

  return { early, mid, late, explanations, courseAdjustment: courseAdj };
}

/**
 * development / debug 用の表を文字列で返す（console.log しない）。
 * 呼び出し側が NODE_ENV を見て出力するかどうか決める。
 */
export function formatExplanationTable(
  explanations: readonly ForecastExplanationV2[],
  opts?: { topFactors?: number }
): string {
  const topN = opts?.topFactors ?? 4;
  const lines: string[] = [];
  lines.push(
    '予着 隊列 馬番 馬名             総合   前半   維持   後半   信頼  失速  脚質    追出'
  );
  lines.push('-'.repeat(96));
  for (const e of explanations) {
    lines.push(
      [
        String(e.predictedFinishRank).padStart(3),
        String(e.expectedFormationRank).padStart(4),
        String(e.horseNumber).padStart(4),
        (e.horseName || '').slice(0, 14).padEnd(15),
        e.totalScore.toFixed(3).padStart(6),
        e.earlyScore.toFixed(3).padStart(6),
        e.midScore.toFixed(3).padStart(6),
        e.lateScore.toFixed(3).padStart(6),
        e.totalReliability.toFixed(2).padStart(5),
        e.fadeRisk.toFixed(2).padStart(5),
        e.expectedBand.padEnd(7),
        e.kickStartProgress.toFixed(2).padStart(5),
      ].join(' ')
    );
    const top = e.factors.filter((f) => Math.abs(f.contribution) > 0.001).slice(0, topN);
    for (const f of top) {
      const sign = f.contribution >= 0 ? '+' : '-';
      lines.push(
        `        ${f.phase.padEnd(5)} ${f.label.slice(0, 34).padEnd(35)} ${sign}${Math.abs(f.contribution).toFixed(3)}  ${f.provenance}`
      );
    }
  }
  return lines.join('\n');
}
