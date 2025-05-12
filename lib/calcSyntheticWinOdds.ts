/**
 * 3連単オッズ（O6）→ 各馬の合成単勝オッズを計算する
 *
 * @param o6 "馬番2桁 × 3 (=6桁)" の 6 桁キー → オッズ
 *           例:  "010203": 123.4   // 01‐02‐03 (着順通り) の 123.4倍
 * @returns  馬番(01〜18) → オッズ。計算不可なら undefined
 */
export function calcSyntheticWinOdds(
    o6: Record<string, number>,
  ): Record<string, number | undefined> {
    // 18頭立てまで想定
    const probs: number[] = Array(19).fill(0); // [馬番] = 合成確率
    const counts: number[] = Array(19).fill(0);   // [馬番] = 1着として現れた組数
  
    for (const [comb, odd] of Object.entries(o6)) {
      if (odd <= 0) continue;      // 無投票や無効値は除外
      if (odd >= 99999.9) continue; // 上限値は実質「∞」なので無視
  
      // O6 キーは「馬番2桁 × 3」、不足している場合もあるので 0 埋めして 6 桁にする
      const key6 = comb.toString().padStart(6, '0');  // 例) "10203" → "010203"
      const first = key6.slice(0, 2);                 // 先頭 2 桁 = 1 着馬番
      const firstNum = Number(first);
      if (firstNum < 1 || firstNum > 18) continue;    // 想定外の馬番は無視

      const p = 1 / odd;                              // オッズ → 的中確率
  
      probs[firstNum] += p;      // その馬が1着になる確率を足し込む
      counts[firstNum] += 1;   // その馬が1着として出現した回数
    }
  
    const result: Record<string, number | undefined> = {};
  
    for (let i = 1; i <= 18; i++) {
      const prob  = probs[i];
      const count = counts[i];

      // ① 出現回数が 3 組未満なら信頼できないとみなし undefined
      // ② 合成オッズが 200 倍超は実戦上あり得ないので undefined
      if (count >= 3 && prob > 0) {
        const odd = +(1 / prob).toFixed(1);
        if (odd <= 200) {
          result[i.toString().padStart(2, '0')] = odd;
        }
      }
    }
    return result;
  }