/**
 * 展開予想 v2 の正規化（純粋関数のみ・副作用なし）
 *
 * 方向の統一:
 *   出力は常に [0,1]。良いほど 1・悪いほど 0・neutral は 0.5。
 *   T2F / L4F / 上がり3F / 着差 のように「小さいほど良い」値は
 *   normalizeLowerIsBetter で反転させる。
 *
 * legacy の失敗を構造的に防ぐ設計:
 *   - 指数の絶対値を直接足さない（レース内 percentile へ変換する）
 *     → legacy は絶対値の分段線形 + `score/weight*100` で全馬100に飽和した
 *   - 欠損は neutral 0.5 を返すが reliability 0 を伴う（値だけで得しない）
 *   - 0 を欠損として扱わない（null のみが欠損）
 *   - NaN / Infinity を返さない
 *   - 同値は同じ出力（horseNumber や配列 index をタイブレークに使わない）
 *   - 入力配列をシャッフルしても各要素の結果は変わらない
 */

/** [0,1] に丸める。NaN は neutral に落とす */
export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0.5;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return (lo + hi) / 2;
  return x < lo ? lo : x > hi ? hi : x;
}

/** レース内 neutral 値 */
export const NEUTRAL = 0.5;

/** 有効な数値か（null / undefined / NaN / Infinity を除く。0 は有効） */
export function isValidNumber(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

/**
 * 同順位を平均ランクにした percentile を返す（昇順基準）。
 *
 * - 戻り値は入力と同じ長さ。欠損（null）の位置は null
 * - 有効値が 1 個だけ、または全て同値のときは 0.5
 * - 同値は必ず同じ percentile（index をタイブレークに使わない）
 * - 最小値が 0.0、最大値が 1.0
 */
export function percentileRanksWithTies(
  values: readonly (number | null | undefined)[]
): (number | null)[] {
  const valid: { v: number; i: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isValidNumber(v)) valid.push({ v, i });
  }

  const out = new Array<number | null>(values.length).fill(null);
  const n = valid.length;
  if (n === 0) return out;
  if (n === 1) {
    out[valid[0].i] = NEUTRAL;
    return out;
  }

  // 値でソート（安定性は不要: 同値は同じ平均ランクを共有する）
  valid.sort((a, b) => a.v - b.v);

  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && valid[j + 1].v === valid[k].v) j++;
    // 1始まりの平均ランク
    const avgRank = (k + j) / 2 + 1;
    // 全馬同値なら avgRank=(n+1)/2 → p=0.5 に自然に落ちる
    const p = (avgRank - 1) / (n - 1);
    for (let m = k; m <= j; m++) out[valid[m].i] = p;
    k = j + 1;
  }
  return out;
}

/**
 * 「大きいほど良い」指標をレース内 percentile へ変換する。
 * 欠損は null（呼び出し側で neutral + reliability 0 にする）。
 */
export function normalizeHigherIsBetter(
  values: readonly (number | null | undefined)[]
): (number | null)[] {
  return percentileRanksWithTies(values);
}

/**
 * 「小さいほど良い」指標をレース内 percentile へ変換して反転する。
 * T2F / L4F / 上がり3F / 着差 / 通過順位 に使う。
 */
export function normalizeLowerIsBetter(
  values: readonly (number | null | undefined)[]
): (number | null)[] {
  const asc = percentileRanksWithTies(values);
  return asc.map((p) => (p == null ? null : 1 - p));
}

/**
 * レース内で外れ値を分位点にクランプする（winsorize）。
 *
 * indices には物理的にありえない値が実在するため必須:
 *   L4F: min 10.70 / max 110.70（実体は後半4Fの秒数なので44〜56が正常帯）
 *   T2F: min -13.60（負の秒数）
 *   上がり3F: min 13.20（1F分の時間）
 *
 * - 有効値が minSamples 未満のときは何もしない（分位点が信用できない）
 * - 欠損はそのまま null
 */
export function winsorizeWithinRace(
  values: readonly (number | null | undefined)[],
  lowerP = 0.05,
  upperP = 0.95,
  minSamples = 6
): (number | null)[] {
  const valid = values.filter(isValidNumber) as number[];
  if (valid.length < minSamples) {
    return values.map((v) => (isValidNumber(v) ? v : null));
  }
  const sorted = [...valid].sort((a, b) => a - b);
  const lo = quantileSorted(sorted, lowerP);
  const hi = quantileSorted(sorted, upperP);
  return values.map((v) => (isValidNumber(v) ? clamp(v, lo, hi) : null));
}

/** ソート済み配列の分位点（線形補間） */
export function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * clamp(q, 0, 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 絶対的な妥当範囲でのフィルタ。範囲外は null（欠損）にする。
 * winsorize はレース内相対なので、レース全体が壊れている場合に備えて併用する。
 */
export function rejectOutOfRange(
  value: number | null | undefined,
  min: number,
  max: number
): number | null {
  if (!isValidNumber(value)) return null;
  return value >= min && value <= max ? value : null;
}

/**
 * 頭数で正規化した「前方度」。
 *   1 に近い = 前、0 に近い = 後ろ
 *
 *   frontRatio = 1 - (position - 1) / max(fieldSize - 1, 1)
 *
 * legacy は生の通過順位を絶対閾値で比較していたため、
 * 8頭立ての5番手と18頭立ての5番手を同じ扱いにしていた。
 */
export function frontRatio(
  position: number | null | undefined,
  fieldSize: number | null | undefined
): number | null {
  if (!isValidNumber(position) || !isValidNumber(fieldSize)) return null;
  if (position < 1 || fieldSize < 1 || position > fieldSize) return null;
  if (fieldSize === 1) return NEUTRAL;
  return clamp01(1 - (position - 1) / (fieldSize - 1));
}

/**
 * robust z-score（中央値と MAD ベース）。
 * percentile が使えない場面（レース間比較など）の代替。
 * 出力は [0,1] にロジスティック圧縮する。
 */
export function robustZTo01(
  value: number | null | undefined,
  population: readonly (number | null | undefined)[],
  higherIsBetter: boolean
): number | null {
  if (!isValidNumber(value)) return null;
  const valid = (population.filter(isValidNumber) as number[]).slice().sort((a, b) => a - b);
  if (valid.length < 3) return null;
  const med = quantileSorted(valid, 0.5);
  const absDev = valid.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = quantileSorted(absDev, 0.5);
  // MAD=0（全馬同値付近）なら neutral
  if (!(mad > 0)) return NEUTRAL;
  const z = (0.6745 * (value - med)) / mad;
  const signed = higherIsBetter ? z : -z;
  // ロジスティック圧縮: z=±2 で概ね 0.88 / 0.12
  return clamp01(1 / (1 + Math.exp(-signed)));
}

/** 全馬同値・欠損時に返す neutral な正規化値 */
export function neutralForMissing(): number {
  return NEUTRAL;
}

/**
 * 寄与量の上限クランプ。
 * 単一 factor だけで極端な順位にならないようにする（PHASE 8 要件）。
 */
export function clampContribution(contribution: number, maxAbs: number): number {
  if (!Number.isFinite(contribution)) return 0;
  return clamp(contribution, -Math.abs(maxAbs), Math.abs(maxAbs));
}

/**
 * 重み付き線形合成。
 * - reliability が低い factor は自動的に neutral 側へ縮退させる（shrink to neutral）
 *   → 欠損の多い馬が「極端な値」で上位に来ないようにする
 * - 重みの合計で割るため、factor が欠けても尺度が変わらない
 * - 全 factor が欠損なら neutral 0.5
 */
export function combineWeighted(
  parts: readonly { value: number; reliability: number; weight: number }[]
): { score: number; reliability: number; effectiveWeight: number } {
  let wsum = 0;
  let acc = 0;
  let relAcc = 0;
  for (const p of parts) {
    const w = Number.isFinite(p.weight) ? Math.max(0, p.weight) : 0;
    if (w === 0) continue;
    const rel = clamp01(p.reliability);
    const v = clamp01(p.value);
    // 信頼度で neutral へ縮退
    const shrunk = NEUTRAL + (v - NEUTRAL) * rel;
    acc += shrunk * w;
    relAcc += rel * w;
    wsum += w;
  }
  if (wsum === 0) {
    return { score: NEUTRAL, reliability: 0, effectiveWeight: 0 };
  }
  return {
    score: clamp01(acc / wsum),
    reliability: clamp01(relAcc / wsum),
    effectiveWeight: wsum,
  };
}

/** smoothstep（コース補正やテーパーで使う） */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
