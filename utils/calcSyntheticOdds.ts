export function calcSyntheticOdds(
    horseNo: number,
    o6: Record<string, number>
  ): number | null {
    const prefix = horseNo.toString().padStart(2, '0'); // '01'〜'18'
    let invSum = 0;
    for (const [comb, odd] of Object.entries(o6)) {
      if (comb.startsWith(prefix) && odd > 0) invSum += 1 / odd;
    }
    return invSum ? Number((1 / invSum).toFixed(1)) : null;
  }