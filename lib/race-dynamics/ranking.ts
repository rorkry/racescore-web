/**
 * race-dynamics / ranking
 *
 * 順位計算（純粋）。
 *  - ゴール済み馬は finishTime 昇順で上位（確定・固定）
 *  - 未ゴール馬は raceProgress 降順
 */

export interface Rankable {
  horseNumber: number;
  raceProgress: number;
  finished: boolean;
  finishTime?: number;
  rank: number;
}

export function computeRanks<T extends Rankable>(horses: T[]): void {
  const finished = horses.filter((h) => h.finished);
  const running = horses.filter((h) => !h.finished);

  finished.sort((a, b) => {
    const ta = a.finishTime ?? Infinity;
    const tb = b.finishTime ?? Infinity;
    if (ta !== tb) return ta - tb;
    return a.horseNumber - b.horseNumber; // タイブレーク（決定論）
  });
  running.sort((a, b) => {
    if (b.raceProgress !== a.raceProgress) return b.raceProgress - a.raceProgress;
    return a.horseNumber - b.horseNumber;
  });

  let rank = 1;
  for (const h of finished) h.rank = rank++;
  for (const h of running) h.rank = rank++;
}
