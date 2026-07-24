/**
 * ai-position-adjust（純粋・副作用なし）
 *
 * 正本の「競うスコア（competitionScore）」に基づき、**表示隊列**の前後位置を
 * ごく小さく前方向へ補正する量を決める純関数。
 *
 * 方針（確定済み）:
 *  - 上位評価馬だけ前方向へ小さく補正。中央(中央値)以下は補正0。
 *  - 低評価馬を後方へは下げない（appliedBonusMeters は常に >= 0）。
 *  - 脚質帯を越えない（より前の脚質の隊列へ食い込まない）。
 *  - 補正はメートル上限（脚質別）でクランプ。累積しない（1回だけ算出）。
 *  - 有効スコアが少なすぎる / 全馬同点 の場合は安全に補正0。
 *
 * ここでは「どれだけ前へ寄せてよいか(m)」だけを返す。実際の適用（表示フレームへの
 * 反映・時間方向のテーパー）は race-3d-integration 側の表示レイヤで行う。
 * dynamics 本体（着順・速度・finishTime・finalStandings）には一切影響しない。
 */

import type { RunningStyle } from './types';

/** 脚質ごとの前方向補正の最大幅（raceDistance に対する割合） */
export const STYLE_MAX_FRACTION: Record<string, number> = {
  escape: 0.003,
  front: 0.005,
  stalker: 0.006,
  closer: 0.004,
  unknown: 0.002,
};

/** 前方向ランク（小さいほど前の脚質）。脚質帯クランプ用 */
const STYLE_FORWARDNESS: Record<string, number> = {
  escape: 0,
  front: 1,
  stalker: 2,
  closer: 3,
  unknown: 2.5,
};

/** 有効スコアがこれ未満なら補正0（少頭数・データ薄で percentile が不安定なため） */
export const MIN_VALID_SCORES = 4;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function normalizeStyle(style: RunningStyle | string | null | undefined): string {
  if (style === 'escape' || style === 'front' || style === 'stalker' || style === 'closer') {
    return style;
  }
  return 'unknown';
}

export interface BonusInputHorse {
  horseNumber: number;
  runningStyle: RunningStyle | string | null | undefined;
  /** 正本の競うスコア（0〜100）。欠損は undefined（0 とみなさない） */
  competitionScore?: number;
  /** 隊列の基準前後位置(m)。start-phase の currentDistance など。脚質帯クランプに使用 */
  baseFormationMeters: number;
}

export type BonusProvenance =
  | 'applied' // 前方向補正あり
  | 'zero-below-median' // 中央値以下 → 補正0
  | 'missing-score' // スコア欠損 → 補正0
  | 'insufficient-field' // 有効スコアが少なすぎる → 全馬補正0
  | 'tie'; // 全馬同点 → 補正0

export interface BonusResult {
  horseNumber: number;
  runningStyle: string;
  competitionScore?: number;
  /** 有効スコア内の順位パーセンタイル（0=最上位, 1=最下位）。欠損は 1 */
  percentile: number;
  /** 0..1（中央値で0, 最上位で1へ） */
  bonusStrength: number;
  styleMaxMeters: number;
  requestedBonusMeters: number;
  /** 前方向のみ・脚質帯クランプ後の適用量(m)。常に >= 0 */
  appliedBonusMeters: number;
  clampedByStyleBand: boolean;
  provenance: BonusProvenance;
}

/**
 * 競うスコアから表示隊列の前方向補正量(m)を算出する（純粋）。
 * @returns horseNumber -> BonusResult
 */
export function computeCompetitionFormationBonus(
  horses: BonusInputHorse[],
  raceDistance: number
): Map<number, BonusResult> {
  const out = new Map<number, BonusResult>();
  const rd = raceDistance > 0 ? raceDistance : 1;

  const valid = horses.filter((h) => typeof h.competitionScore === 'number' && Number.isFinite(h.competitionScore));
  const n = valid.length;

  // 有効スコアが少なすぎる → 全馬補正0（安全 fallback）
  const insufficient = n < MIN_VALID_SCORES;

  // 全馬同点判定
  let scoreMax = -Infinity;
  let scoreMin = Infinity;
  for (const h of valid) {
    const s = h.competitionScore as number;
    if (s > scoreMax) scoreMax = s;
    if (s < scoreMin) scoreMin = s;
  }
  const allTie = n > 0 && scoreMax - scoreMin < 1e-9;

  for (const h of horses) {
    const style = normalizeStyle(h.runningStyle);
    const styleMaxMeters = (STYLE_MAX_FRACTION[style] ?? STYLE_MAX_FRACTION.unknown) * rd;
    const hasScore = typeof h.competitionScore === 'number' && Number.isFinite(h.competitionScore);

    const base: BonusResult = {
      horseNumber: h.horseNumber,
      runningStyle: style,
      competitionScore: hasScore ? (h.competitionScore as number) : undefined,
      percentile: 1,
      bonusStrength: 0,
      styleMaxMeters,
      requestedBonusMeters: 0,
      appliedBonusMeters: 0,
      clampedByStyleBand: false,
      provenance: 'missing-score',
    };

    if (!hasScore) {
      out.set(h.horseNumber, base);
      continue;
    }
    if (insufficient) {
      out.set(h.horseNumber, { ...base, provenance: 'insufficient-field' });
      continue;
    }
    if (allTie) {
      out.set(h.horseNumber, { ...base, percentile: 0, provenance: 'tie' });
      continue;
    }

    const score = h.competitionScore as number;
    // 同点は同じ percentile（strictly-higher 方式）→ horseNumber をタイブレークに使わない
    const strictlyHigher = valid.reduce((c, o) => (((o.competitionScore as number) > score) ? c + 1 : c), 0);
    const percentile = n > 1 ? strictlyHigher / (n - 1) : 0;
    const bonusStrength = clamp01((0.5 - percentile) / 0.5);

    if (bonusStrength <= 0) {
      out.set(h.horseNumber, { ...base, percentile, provenance: 'zero-below-median' });
      continue;
    }

    const requestedBonusMeters = bonusStrength * styleMaxMeters;

    // --- 脚質帯クランプ ---
    // (1) より前の脚質の「最も後方の馬」を越えない（前帯へ食い込まない）
    const thisForward = STYLE_FORWARDNESS[style] ?? STYLE_FORWARDNESS.unknown;
    let ceilingMeters = Infinity;
    for (const o of horses) {
      const of = STYLE_FORWARDNESS[normalizeStyle(o.runningStyle)] ?? STYLE_FORWARDNESS.unknown;
      if (of < thisForward) ceilingMeters = Math.min(ceilingMeters, o.baseFormationMeters);
    }
    // 前帯馬が居る場合、その馬までの隙間の半分までに抑える（明確に帯内へ留める）
    const ceilingCap =
      ceilingMeters === Infinity ? Infinity : Math.max(0, (ceilingMeters - h.baseFormationMeters) * 0.5);

    // (2) 同脚質帯幅の 25% を上限（帯を過度に再編しない）。単独脚質は styleMax のみで律速。
    let minSame = Infinity;
    let maxSame = -Infinity;
    for (const o of horses) {
      if (normalizeStyle(o.runningStyle) === style) {
        minSame = Math.min(minSame, o.baseFormationMeters);
        maxSame = Math.max(maxSame, o.baseFormationMeters);
      }
    }
    const bandWidth = maxSame - minSame;
    const bandCap = bandWidth > 1e-9 ? bandWidth * 0.25 : styleMaxMeters;

    const appliedBonusMeters = Math.max(
      0,
      Math.min(requestedBonusMeters, ceilingCap, bandCap)
    );
    const clampedByStyleBand = appliedBonusMeters < requestedBonusMeters - 1e-9;

    out.set(h.horseNumber, {
      ...base,
      percentile,
      bonusStrength,
      requestedBonusMeters,
      appliedBonusMeters,
      clampedByStyleBand,
      provenance: 'applied',
    });
  }

  return out;
}

/**
 * 表示レイヤ用: 先頭進捗(0..1)に応じた補正テーパー。
 * 発馬直後(0.05付近)から立ち上げ、ゴール前ブレンド開始(≈0.70)より前に必ず0へ戻す。
 *  → goal / finish / finalStandings へは一切影響しない。
 * 立ち上げ・立ち下げは smoothstep（急変なし）。
 */
export function formationBonusTaperWeight(leaderProgress01: number): number {
  const p = clamp01(leaderProgress01);
  const rampUp = smoothstep(0.05, 0.2, p);
  const rampDown = 1 - smoothstep(0.5, 0.62, p);
  return clamp01(rampUp * rampDown);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
