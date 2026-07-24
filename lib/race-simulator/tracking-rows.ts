/**
 * tracking-rows（画面端トラッキングパネル用の純粋ロジック）
 *
 * 3D 描画と同じ補間済み馬状態（dynamics 優先）から行を組み立てる。
 * simulation 本体の ranking は変更しない（表示用の整形のみ）。
 */

import { wakuCssColor, wakuTextColor } from './broadcast-cel-horse';

export interface TrackingHorseInput {
  horseNumber: number;
  /** 現在順位（1=先頭）。未指定なら走破距離から算出 */
  position?: number;
  horseName?: string | null;
  /** 先頭からの差(m)。未指定なら走破距離から算出 */
  leaderGapMeters?: number | null;
  /** @deprecated use leaderGapMeters */
  distanceFromLeader?: number | null;
  /** 現在走破距離(m) */
  currentDistanceMeters?: number | null;
  /** @deprecated use currentDistanceMeters */
  currentDistance?: number | null;
  /**
   * 正規化進捗 0..1（走破距離の代替）。
   * ※ dynamics の raceProgress（メートル）とは別物。混在禁止。
   */
  progress01?: number | null;
  /** @deprecated use progress01 — 歴史的に 0..1 として解釈 */
  raceProgress?: number | null;
}

export interface TrackingRow {
  horseNumber: number;
  position: number;
  /** 先頭差(m, 0以上)。先頭は 0 */
  leaderGapMeters: number;
  /** @deprecated alias of leaderGapMeters */
  gap: number;
  /** 表示用: 先頭 →「先頭」、後続 →「先頭差 +2.4m」 */
  gapLabel: string;
  /** 走破距離(m) */
  distanceRunMeters: number;
  /** @deprecated alias */
  distanceRun: number;
  /** ゴールまでの残り(m)。不明時は null */
  remainingMeters: number | null;
  /** @deprecated alias */
  remaining: number | null;
  /** 表示用走破ラベル（例: 842m） */
  runLabel: string;
  /** 表示用残りラベル（例: 残り358m）。不明時は空 */
  remainingLabel: string;
  /** 表示用走破/残りラベル（互換） */
  distanceLabel: string;
  name: string;
  shortName: string;
  waku: number;
  color: string;
  textColor: string;
}

export interface BuildTrackingOptions {
  /** レース距離(m)。残り距離表示に使う */
  raceDistance?: number;
  wakuOf: (horseNumber: number) => number | undefined;
}

/** 枠が決定できない場合の JRA 枠割り fallback（決定的）。 */
export function fallbackWaku(horseNumber: number, total: number): number {
  if (total <= 8) return Math.max(1, Math.min(8, horseNumber));
  const base = Math.floor(total / 8);
  const extra = total % 8;
  let acc = 0;
  for (let w = 1; w <= 8; w++) {
    const inWaku = base + (w > 8 - extra ? 1 : 0);
    acc += inWaku;
    if (horseNumber <= acc) return w;
  }
  return 8;
}

function shorten(name: string, max: number): string {
  const s = (name ?? '').trim();
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function resolveDistanceRunMeters(h: TrackingHorseInput, raceDistance?: number): number {
  const meters = h.currentDistanceMeters ?? h.currentDistance;
  if (meters != null && Number.isFinite(meters)) {
    return Math.max(0, meters);
  }
  const p01 = h.progress01 ?? h.raceProgress;
  if (p01 != null && Number.isFinite(p01) && raceDistance != null && raceDistance > 0) {
    // progress01 のみ 0..1 として扱う（メートルと混在させない）
    return Math.max(0, Math.min(raceDistance, p01 * raceDistance));
  }
  return 0;
}

/**
 * 3D と同じフレーム状態からトラッキング行を組み立てる。
 * - 順位: 明示 position があればそれを使い、無ければ走破距離降順で算出（表示用のみ）
 * - 先頭差: 明示 leaderGapMeters があればそれ、無ければ leaderDist - dist
 * - ラベルは曖昧な「0m」を出さず、先頭 / 先頭差 +Xm / 走破Xm / 残りXm を分離
 */
export function buildTrackingRows(
  horses: TrackingHorseInput[],
  wakuOfOrOpts: ((horseNumber: number) => number | undefined) | BuildTrackingOptions,
): TrackingRow[] {
  const opts: BuildTrackingOptions =
    typeof wakuOfOrOpts === 'function' ? { wakuOf: wakuOfOrOpts } : wakuOfOrOpts;
  const { wakuOf, raceDistance } = opts;
  const total = horses.length;

  const withDist = horses.map((h) => ({
    h,
    dist: resolveDistanceRunMeters(h, raceDistance),
  }));

  // 表示用順位: 明示 position が全頭にあればそれを使い、欠けていれば走破距離から算出
  const allHavePos = withDist.every(({ h }) => h.position != null && h.position > 0);
  let rankByNumber = new Map<number, number>();
  if (allHavePos) {
    for (const { h } of withDist) rankByNumber.set(h.horseNumber, h.position!);
  } else {
    const sorted = [...withDist].sort((a, b) => {
      if (b.dist !== a.dist) return b.dist - a.dist;
      return a.h.horseNumber - b.h.horseNumber;
    });
    sorted.forEach((x, i) => rankByNumber.set(x.h.horseNumber, i + 1));
  }

  const leaderDist = withDist.reduce((m, x) => Math.max(m, x.dist), 0);

  const rows: TrackingRow[] = withDist.map(({ h, dist }) => {
    const waku = ((Math.max(1, wakuOf(h.horseNumber) ?? fallbackWaku(h.horseNumber, total)) - 1) % 8) + 1;
    const position = rankByNumber.get(h.horseNumber) ?? total;
    const explicitGap = h.leaderGapMeters ?? h.distanceFromLeader;
    let leaderGapMeters: number;
    if (explicitGap != null && Number.isFinite(explicitGap)) {
      leaderGapMeters = Math.max(0, explicitGap);
    } else {
      leaderGapMeters = Math.max(0, leaderDist - dist);
    }
    // 先頭馬は gap を 0 に揃える（表示は「先頭」）
    if (position === 1) leaderGapMeters = 0;

    const remainingMeters =
      raceDistance != null && raceDistance > 0
        ? Math.max(0, raceDistance - dist)
        : null;

    const gapLabel = position === 1 ? '先頭' : `先頭差 +${leaderGapMeters.toFixed(1)}m`;
    const runLabel = `${Math.round(dist)}m`;
    const remainingLabel = remainingMeters != null ? `残り${Math.round(remainingMeters)}m` : '';
    const distanceLabel =
      remainingMeters != null
        ? `走破 ${Math.round(dist)}m / ${remainingLabel}`
        : `走破 ${Math.round(dist)}m`;

    const name = (h.horseName ?? '').trim();
    return {
      horseNumber: h.horseNumber,
      position,
      leaderGapMeters,
      gap: leaderGapMeters,
      gapLabel,
      distanceRunMeters: dist,
      distanceRun: dist,
      remainingMeters,
      remaining: remainingMeters,
      runLabel,
      remainingLabel,
      distanceLabel,
      name,
      shortName: shorten(name, 4),
      waku,
      color: wakuCssColor(waku),
      textColor: wakuTextColor(waku),
    };
  });

  rows.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.horseNumber - b.horseNumber;
  });
  return rows;
}

/**
 * dynamics フレーム（raceProgressMeters）から TrackingHorseInput を作る。
 * 順位・先頭差は表示距離から算出（3D 位置関係と一致）。タイは finishTime → 馬番。
 */
export function trackingInputsFromDynamics(
  frame: Array<{
    horseNumber: number;
    /** meters (0..raceDistance) */
    raceProgress: number;
    rank?: number;
    finished?: boolean;
    finishTime?: number;
    horseId?: string;
  }>,
  raceDistance: number,
  nameOf?: (horseNumber: number) => string | undefined,
): TrackingHorseInput[] {
  const rd = raceDistance > 0 ? raceDistance : 1;
  const sorted = [...frame].sort((a, b) => {
    const da = Math.max(0, Math.min(rd, a.raceProgress));
    const db = Math.max(0, Math.min(rd, b.raceProgress));
    if (db !== da) return db - da;
    if (a.finished && b.finished) {
      return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
    }
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return a.horseNumber - b.horseNumber;
  });
  const leaderDist = sorted.length > 0 ? Math.max(0, Math.min(rd, sorted[0].raceProgress)) : 0;
  return sorted.map((h, i) => {
    const dist = Math.max(0, Math.min(rd, h.raceProgress));
    return {
      horseNumber: h.horseNumber,
      position: i + 1,
      horseName: nameOf?.(h.horseNumber),
      currentDistanceMeters: dist,
      currentDistance: dist,
      leaderGapMeters: Math.max(0, leaderDist - dist),
      distanceFromLeader: Math.max(0, leaderDist - dist),
    };
  });
}
