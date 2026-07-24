/**
 * tracking-rows（画面端トラッキングパネル用の純粋ロジック）
 *
 * 全頭の識別を保証するトラッキング表示のための行データを、レース状態（読み取り専用）から組み立てる。
 * simulation ロジックには一切触れない（現在の順位・先頭差を整形するだけ）。
 * THREE / React / DOM 非依存でテスト可能。
 */

import { WAKU_HEX, wakuCssColor, wakuTextColor } from './broadcast-cel-horse';

export interface TrackingHorseInput {
  horseNumber: number;
  position: number;              // 現在順位（1=先頭）
  horseName?: string | null;
  distanceFromLeader?: number | null; // 先頭からの差(m)
}

export interface TrackingRow {
  horseNumber: number;
  position: number;
  gap: number;            // 先頭差(m, 0以上)
  name: string;           // 短縮名（空なら空文字）
  shortName: string;      // さらに短縮（狭幅表示用・最大4文字）
  waku: number;           // 1..8
  color: string;          // 枠色（CSS）
  textColor: string;      // 枠色に対する文字色
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

/**
 * 現在順位でソートしたトラッキング行を返す。
 * @param horses レース状態（読み取り専用）
 * @param wakuOf horseNumber→枠(1..8) を返す関数（実データ優先。無ければ fallbackWaku を使う）
 */
export function buildTrackingRows(
  horses: TrackingHorseInput[],
  wakuOf: (horseNumber: number) => number | undefined,
): TrackingRow[] {
  const total = horses.length;
  const rows: TrackingRow[] = horses.map((h) => {
    const waku = ((Math.max(1, wakuOf(h.horseNumber) ?? fallbackWaku(h.horseNumber, total)) - 1) % 8) + 1;
    const gapRaw = h.distanceFromLeader ?? 0;
    const gap = Number.isFinite(gapRaw) ? Math.max(0, gapRaw) : 0;
    const name = (h.horseName ?? '').trim();
    return {
      horseNumber: h.horseNumber,
      position: h.position,
      gap,
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

export { WAKU_HEX };
