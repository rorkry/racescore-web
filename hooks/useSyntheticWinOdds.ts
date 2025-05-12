// hooks/useSyntheticWinOdds.ts
import { useEffect, useState } from 'react';
import { fetchTrioOdds } from '@/lib/fetchTrio';

export interface SyntheticOdd {
  horseNo: number;  // 馬番
  odds: number;     // 合成オッズ（小数 1 桁）
}

function calcSynthetic(o6: Record<string, number>): SyntheticOdd[] {
  const sum: Record<number, number> = {};

  for (const [comb, odd] of Object.entries(o6)) {
    // 6桁キー = 枠1桁 + 馬番2桁 を3着分連結 → 1着馬番は先頭3桁の「下2桁」
    const first = Number(comb.slice(1, 3));
    if (odd >= 99999.9) continue;             // 情報無しは無視
    sum[first] = (sum[first] ?? 0) + 1 / odd;
  }

  return Object.entries(sum)
    .map(([no, s]) => ({ horseNo: Number(no), odds: +(1 / s).toFixed(1) }))
    .sort((a, b) => a.horseNo - b.horseNo);
}

export function useSyntheticWinOdds(raceKey?: string) {
  const [data,    setData]    = useState<SyntheticOdd[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!raceKey) return;
    setLoading(true);

    fetchTrioOdds(raceKey)
      .then(res => {
        setData(calcSynthetic(res?.o6 ?? {}));
        setError(null);
      })
      .catch(err => {
        setError(err.message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [raceKey]);

  return { data, loading, error };
}