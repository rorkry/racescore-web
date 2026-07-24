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
  distanceFromLeader?: number | null;
  /** 現在走破距離(m) */
  currentDistance?: number | null;
  /** 0..1 の raceProgress（あれば走破距離の代わりに使える） */
  raceProgress?: number | null;
}

export interface TrackingRow {
  horseNumber: number;
  position: number;
  /** 先頭差(m, 0以上)。先頭は 0 */
  gap: number;
  /** 表示用: 先頭 →「先頭」、後続 →「+2.4m」 */
  gapLabel: string;
  /** 走破距離(m) */
  distanceRun: number;
  /** ゴールまでの残り(m)。不明時は null */
  remaining: number | null;
  /** 表示用走破/残りラベル */
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

function resolveDistanceRun(h: TrackingHorseInput, raceDistance?: number): number {
  if (h.currentDistance != null && Number.isFinite(h.currentDistance)) {
    return Math.max(0, h.currentDistance);
  }
  if (h.raceProgress != null && Number.isFinite(h.raceProgress) && raceDistance != null && raceDistance > 0) {
    return Math.max(0, Math.min(raceDistance, h.raceProgress * raceDistance));
  }
  return 0;
}

/**
 * 3D と同じフレーム状態からトラッキング行を組み立てる。
 * - 順位: 明示 position があればそれを使い、無ければ走破距離降順で算出（表示用のみ）
 * - 先頭差: 明示 distanceFromLeader があればそれ、無ければ leaderDist - dist
 * - ラベルは曖昧な「0m」を出さず、先頭 / +Xm / 走破 / 残り を明示
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
    dist: resolveDistanceRun(h, raceDistance),
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
    let gap: number;
    if (h.distanceFromLeader != null && Number.isFinite(h.distanceFromLeader)) {
      gap = Math.max(0, h.distanceFromLeader);
    } else {
      gap = Math.max(0, leaderDist - dist);
    }
    // 先頭馬は gap を 0 に揃える（表示は「先頭」）
    if (position === 1) gap = 0;

    const remaining =
      raceDistance != null && raceDistance > 0
        ? Math.max(0, raceDistance - dist)
        : null;

    const gapLabel = position === 1 ? '先頭' : `+${gap.toFixed(1)}m`;
    const distanceLabel =
      remaining != null
        ? `走破 ${dist.toFixed(0)}m / 残り ${remaining.toFixed(0)}m`
        : `走破 ${dist.toFixed(0)}m`;

    const name = (h.horseName ?? '').trim();
    return {
      horseNumber: h.horseNumber,
      position,
      gap,
      gapLabel,
      distanceRun: dist,
      remaining,
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
 * dynamics フレーム（raceProgress）から TrackingHorseInput を作る。
 * raceDistance があれば m 単位の走破距離・先頭差へ換算する。
 */
export function trackingInputsFromDynamics(
  frame: Array<{
    horseNumber: number;
    raceProgress: number;
    rank: number;
    horseId?: string;
  }>,
  raceDistance: number,
  nameOf?: (horseNumber: number) => string | undefined,
): TrackingHorseInput[] {
  const rd = raceDistance > 0 ? raceDistance : 1;
  const dists = frame.map((h) => ({
    horseNumber: h.horseNumber,
    dist: Math.max(0, Math.min(rd, h.raceProgress * rd)),
    rank: h.rank,
  }));
  const leaderDist = dists.reduce((m, x) => Math.max(m, x.dist), 0);
  return dists.map((x) => ({
    horseNumber: x.horseNumber,
    position: x.rank,
    horseName: nameOf?.(x.horseNumber),
    currentDistance: x.dist,
    raceProgress: x.dist / rd,
    distanceFromLeader: Math.max(0, leaderDist - x.dist),
  }));
}
