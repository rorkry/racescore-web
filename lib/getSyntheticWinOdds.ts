// lib/getSyntheticWinOdds.ts
import type { TrioOddsResponse } from '@/lib/fetchTrio';

/**
 * 3連単オッズ JSON から「馬番 → 合成単勝オッズ」を計算
 */
export function getSyntheticWinOdds(data: TrioOddsResponse) {
  // 馬番(2桁) → 投票総額(＝1/オッズ) を積み上げる
  const pool: Record<string, number> = {};

  for (const [key, odd] of Object.entries(data.o6)) {
    if (odd <= 0) continue;               // 0.3(無効) や 0 はスキップ
    const [a, b, c] = key.match(/.{2}/g)!; // "枠番3桁＋馬番3桁" → 2桁×3
    const prob = 1 / odd;

    [a, b, c].forEach(v => {
      pool[v] = (pool[v] ?? 0) + prob;
    });
  }

  // 合成単勝 = 1 / Σ確率
  const winOdds: Record<string, number> = {};
  for (const [uma, prob] of Object.entries(pool)) {
    winOdds[uma] = +(1 / prob).toFixed(1);  // 小数1桁
  }

  return winOdds;
}