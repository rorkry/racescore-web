/* ------------------------------------------------------------------
 * Z‑score based labeling
 *   - Always top 1 horse ⇒ 'くるでしょ'
 *   - 次点 A 数 : 12頭以上=3, 8-11頭=2, 7頭以下=1
 *   - z >= 0    ⇒ 'ちょっときそう'
 *   - z >= -0.5 ⇒ 'こなそう'
 *   - else      ⇒ 'きません'
 * ------------------------------------------------------------------ */
export function assignLabelsByZ(scores: number[]): string[] {
  const n = scores.length;
  if (n === 0) return [];
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;

  const sorted = scores
    .map((s, i) => ({ s, i, z: (s - mean) / sd }))
    .sort((a, b) => b.s - a.s);

  // initial labels
  const labels = Array<string>(n).fill('きません');

  // Top‑1 ⇒ S
  labels[sorted[0].i] = 'くるでしょ';

  // A head count
  let aCount = 1;
  if (n >= 12) aCount = 3;
  else if (n >= 8) aCount = 2;

  for (let k = 1; k <= aCount && k < sorted.length; k++) {
    labels[sorted[k].i] = 'めっちゃきそう';
  }

  // --- B / C by percentage of remaining horses --------------------
  const rest = sorted.slice(aCount + 1);        // 未分類の残り
  const totalRest = rest.length;
  const bN = Math.ceil(totalRest * 0.30);       // 上位 30% → B
  const cN = Math.ceil(totalRest * 0.30);       // 次の 30% → C

  rest.forEach(({ i }, idx) => {
    if (idx < bN)           labels[i] = 'ちょっときそう';
    else if (idx < bN + cN) labels[i] = 'こなそう';
    // 残りは 'きません' のまま
  });
  return labels;
}
