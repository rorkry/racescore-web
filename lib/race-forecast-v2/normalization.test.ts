/**
 * 正規化・信頼度の単体テスト
 * 実行: npx tsx lib/race-forecast-v2/normalization.test.ts
 *
 * 監査で見つかった legacy の失敗を再発させないことを検証する:
 *  - 全馬が同じ値へ飽和しない（legacy: score/weight*100 で全馬100）
 *  - 欠損馬が実データ馬より有利にならない（legacy: PFS欠損 default 50）
 *  - 0 を欠損として扱わない（legacy: `|| null` が 0 を null 化）
 *  - T2F/L4F/上がり3F は小さいほど高評価
 *  - 配列 index / horseNumber をタイブレークに使わない（shuffle 耐性）
 */
import {
  clamp01,
  combineWeighted,
  frontRatio,
  isValidNumber,
  normalizeHigherIsBetter,
  normalizeLowerIsBetter,
  percentileRanksWithTies,
  quantileSorted,
  rejectOutOfRange,
  robustZTo01,
  winsorizeWithinRace,
  clampContribution,
  NEUTRAL,
} from './normalization';
import {
  DEFAULT_RECENCY_WEIGHTS,
  buildRecencyWeights,
  conditionSimilarityMultiplier,
  reliabilityFromSampleSize,
  reliabilityFromUsedWeight,
  reliabilityPenaltyForDivergence,
  weightedRecentAverage,
} from './recency';
import type { PastRaceSample, RaceConditionV2 } from './types';
import { missingMetric } from './types';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`  NG  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}
function near(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}
function section(t: string) {
  console.log(`\n--- ${t} ---`);
}

// ============================================================
section('percentileRanksWithTies');
// ============================================================
{
  const p = percentileRanksWithTies([10, 20, 30]);
  check('最小=0 / 中間=0.5 / 最大=1', near(p[0]!, 0) && near(p[1]!, 0.5) && near(p[2]!, 1), JSON.stringify(p));

  const allSame = percentileRanksWithTies([7, 7, 7, 7]);
  check('全馬同値 → 全て 0.5', allSame.every((v) => near(v!, 0.5)), JSON.stringify(allSame));

  const one = percentileRanksWithTies([5]);
  check('有効値1個 → 0.5', near(one[0]!, 0.5));

  const none = percentileRanksWithTies([null, undefined, NaN as unknown as number]);
  check('有効値なし → 全て null', none.every((v) => v === null));

  const ties = percentileRanksWithTies([1, 2, 2, 3]);
  check('同値は同じ percentile', near(ties[1]!, ties[2]!), JSON.stringify(ties));

  const withMissing = percentileRanksWithTies([10, null, 30]);
  check('欠損は null・他は有効値だけで順位付け', withMissing[1] === null && near(withMissing[0]!, 0) && near(withMissing[2]!, 1), JSON.stringify(withMissing));

  // 0 を欠損扱いしない
  const zero = percentileRanksWithTies([0, 5, 10]);
  check('0 は有効値として扱う', zero[0] !== null && near(zero[0]!, 0), JSON.stringify(zero));

  // shuffle 耐性
  const base = [4, 9, 1, 9, 7, 2];
  const pBase = percentileRanksWithTies(base);
  const order = [3, 0, 5, 1, 4, 2];
  const shuffled = order.map((i) => base[i]);
  const pShuf = percentileRanksWithTies(shuffled);
  let shuffleOk = true;
  for (let k = 0; k < order.length; k++) {
    if (!near(pBase[order[k]]!, pShuf[k]!)) shuffleOk = false;
  }
  check('shuffle 耐性（同じ値なら同じ結果）', shuffleOk);

  // 8頭 / 18頭で安定
  const f8 = percentileRanksWithTies(Array.from({ length: 8 }, (_, i) => i));
  const f18 = percentileRanksWithTies(Array.from({ length: 18 }, (_, i) => i));
  check('8頭: 最小0 最大1', near(f8[0]!, 0) && near(f8[7]!, 1));
  check('18頭: 最小0 最大1', near(f18[0]!, 0) && near(f18[17]!, 1));
  check('8頭/18頭ともに中央値付近が0.5', near(quantileSorted(f8.map((v) => v!), 0.5), 0.5) && near(quantileSorted(f18.map((v) => v!), 0.5), 0.5));
}

// ============================================================
section('方向の統一（小さいほど良い / 大きいほど良い）');
// ============================================================
{
  // T2F: 22.0秒が最速 → 1.0
  const t2f = [22.0, 24.0, 26.0];
  const nt = normalizeLowerIsBetter(t2f);
  check('T2F: 小さいほど高評価', near(nt[0]!, 1) && near(nt[2]!, 0), JSON.stringify(nt));

  // L4F: DB実測で「後半4Fの秒数」と確定 → 小さいほど速い
  const l4f = [45.5, 48.0, 51.2];
  const nl = normalizeLowerIsBetter(l4f);
  check('L4F: 小さいほど高評価', nl[0]! > nl[1]! && nl[1]! > nl[2]!, JSON.stringify(nl));

  // 上がり3F
  const last3f = [33.8, 35.5, 37.9];
  const n3 = normalizeLowerIsBetter(last3f);
  check('上がり3F: 小さいほど高評価', near(n3[0]!, 1) && near(n3[2]!, 0));

  // 着差（勝ち馬は負値）
  const margin = [-0.3, 0.0, 1.5, 4.0];
  const nm = normalizeLowerIsBetter(margin);
  check('着差: 小さい（勝ち馬の負値）ほど高評価', near(nm[0]!, 1) && near(nm[3]!, 0), JSON.stringify(nm));

  // potential / makikaeshi / pfs_past: 大きいほど良い
  const pot = [1.2, 3.7, 6.5];
  const np = normalizeHigherIsBetter(pot);
  check('potential: 大きいほど高評価', near(np[0]!, 0) && near(np[2]!, 1));

  // 方向を反転させないこと
  check('大きいほど良い指標を反転していない', np[2]! > np[0]!);

  // 通過順位: 小さい（前）ほど良い
  const cornerPos = [1, 8, 15];
  const nc = normalizeLowerIsBetter(cornerPos);
  check('通過順位: 小さいほど高評価', near(nc[0]!, 1) && near(nc[2]!, 0));
}

// ============================================================
section('winsorize / 範囲外除去（実測された異常値対策）');
// ============================================================
{
  // L4F の実測: min 10.70 / max 110.70（正常帯は 44〜56）
  const l4f = [10.7, 46.0, 47.0, 48.0, 49.0, 50.0, 110.7];
  const w = winsorizeWithinRace(l4f, 0.05, 0.95, 6);
  check('winsorize: 下側外れ値が引き上げられる', w[0]! > 10.7, String(w[0]));
  check('winsorize: 上側外れ値が引き下げられる', w[6]! < 110.7, String(w[6]));
  check('winsorize: 中央付近は不変', near(w[3]!, 48.0));

  const few = winsorizeWithinRace([1, 100], 0.05, 0.95, 6);
  check('サンプル不足なら winsorize しない', near(few[0]!, 1) && near(few[1]!, 100));

  const withNull = winsorizeWithinRace([null, 46, 47, 48, 49, 50, 51], 0.05, 0.95, 6);
  check('winsorize: 欠損は null のまま', withNull[0] === null);

  // T2F の負値（実測 min -13.60）は絶対範囲で除去
  check('T2F 負値を範囲外として除去', rejectOutOfRange(-13.6, 18, 32) === null);
  check('T2F 正常値は通す', rejectOutOfRange(24.6, 18, 32) === 24.6);
  check('上がり3F の 13.2秒（1F分）を除去', rejectOutOfRange(13.2, 30, 50) === null);
  check('rejectOutOfRange: 0 は範囲内なら通す', rejectOutOfRange(0, -1, 1) === 0);
}

// ============================================================
section('frontRatio（頭数正規化）');
// ============================================================
{
  check('18頭立て1番手 → 1', near(frontRatio(1, 18)!, 1));
  check('18頭立て18番手 → 0', near(frontRatio(18, 18)!, 0));
  check('8頭立て1番手 → 1', near(frontRatio(1, 8)!, 1));
  // legacy は生順位を絶対閾値で比較していたため下記が同値になっていた
  const a = frontRatio(5, 8)!;
  const b = frontRatio(5, 18)!;
  check('8頭の5番手 と 18頭の5番手 は別評価', !near(a, b), `${a} vs ${b}`);
  check('8頭の5番手 < 18頭の5番手（相対的に後ろ）', a < b);
  check('欠損は null', frontRatio(null, 18) === null && frontRatio(5, null) === null);
  check('範囲外(position>fieldSize)は null', frontRatio(20, 18) === null);
}

// ============================================================
section('combineWeighted（欠損が有利にならないこと）');
// ============================================================
{
  // 実データを持つ「優秀な馬」
  const good = combineWeighted([
    { value: 0.9, reliability: 1.0, weight: 0.5 },
    { value: 0.85, reliability: 1.0, weight: 0.5 },
  ]);
  // 全欠損の馬（neutral + reliability 0）
  const missing = combineWeighted([
    { value: 0.5, reliability: 0, weight: 0.5 },
    { value: 0.5, reliability: 0, weight: 0.5 },
  ]);
  check('優秀馬 > 欠損馬', good.score > missing.score, `${good.score} vs ${missing.score}`);
  check('欠損馬は neutral 0.5', near(missing.score, 0.5));
  check('欠損馬の reliability は 0', near(missing.reliability, 0));

  // 「低評価の実データ馬」は欠損馬より低くなるべき
  const bad = combineWeighted([
    { value: 0.1, reliability: 1.0, weight: 0.5 },
    { value: 0.05, reliability: 1.0, weight: 0.5 },
  ]);
  check('低評価の実データ馬 < 欠損馬（欠損が得しない=順位で上に行かない）', bad.score < missing.score);
  check('低評価馬 < 優秀馬', bad.score < good.score);

  // 高い値でも信頼度が低ければ neutral 側へ縮退する
  const highButUnreliable = combineWeighted([{ value: 1.0, reliability: 0.1, weight: 1 }]);
  check('高値だが低信頼 → neutral 寄り', highButUnreliable.score < 0.6 && highButUnreliable.score > 0.5, String(highButUnreliable.score));

  const allZeroWeight = combineWeighted([{ value: 1, reliability: 1, weight: 0 }]);
  check('全 weight 0 → neutral', near(allZeroWeight.score, 0.5) && near(allZeroWeight.reliability, 0));

  // NaN 安全性
  const nan = combineWeighted([{ value: NaN, reliability: NaN, weight: 1 }]);
  check('NaN 入力でも NaN を返さない', Number.isFinite(nan.score) && Number.isFinite(nan.reliability));
}

// ============================================================
section('reliability（1走 vs 5走）');
// ============================================================
{
  const r1 = reliabilityFromSampleSize(1);
  const r3 = reliabilityFromSampleSize(3);
  const r5 = reliabilityFromSampleSize(5);
  check('1走 < 3走 < 5走', r1 < r3 && r3 < r5, `${r1.toFixed(3)} / ${r3.toFixed(3)} / ${r5.toFixed(3)}`);
  check('5走で満額 1.0', near(r5, 1));
  check('1走は約0.35', Math.abs(r1 - 0.351) < 0.01, r1.toFixed(3));
  check('0走は 0', near(reliabilityFromSampleSize(0), 0));
  check('負・NaN は 0', near(reliabilityFromSampleSize(-3), 0) && near(reliabilityFromSampleSize(NaN), 0));
  check('6走以上でも 1.0 を超えない', near(reliabilityFromSampleSize(20), 1));

  const total = DEFAULT_RECENCY_WEIGHTS.reduce((a, b) => a + b, 0);
  check('reliabilityFromUsedWeight: 満額 weight → 1', near(reliabilityFromUsedWeight(total), 1));
  check('reliabilityFromUsedWeight: 半分 → 0.5', near(reliabilityFromUsedWeight(total / 2), 0.5));
  check('reliabilityFromUsedWeight: 0 → 0', near(reliabilityFromUsedWeight(0), 0));

  check('divergence 大 → 信頼度を下げる', reliabilityPenaltyForDivergence(1) < reliabilityPenaltyForDivergence(0));
  check('divergence 0 → 減衰なし', near(reliabilityPenaltyForDivergence(0), 1));
}

// ============================================================
section('weightedRecentAverage');
// ============================================================
{
  const r = weightedRecentAverage([
    { value: 1.0, weight: 1.0 },
    { value: 0.0, weight: 1.0 },
  ]);
  check('等重み平均 = 0.5', near(r.value!, 0.5));
  check('usedWeight / sampleCount が正しい', near(r.usedWeight, 2) && r.sampleCount === 2);

  const recent = weightedRecentAverage([
    { value: 1.0, weight: 1.0 }, // 前走
    { value: 0.0, weight: 0.2 }, // 5走前
  ]);
  check('前走が重い（recency weighting が効く）', recent.value! > 0.8, String(recent.value));

  const withMissing = weightedRecentAverage([
    { value: null, weight: 1.0 },
    { value: 0.7, weight: 0.75 },
  ]);
  check('欠損サンプルは weight ごと除外', near(withMissing.value!, 0.7) && withMissing.sampleCount === 1);

  const empty = weightedRecentAverage([{ value: null, weight: 1 }]);
  check('有効サンプルなし → value null', empty.value === null && empty.sampleCount === 0);

  const zeroValue = weightedRecentAverage([{ value: 0, weight: 1 }]);
  check('値 0 は有効（欠損扱いしない）', zeroValue.value === 0 && zeroValue.sampleCount === 1);
}

// ============================================================
section('条件差による weight 減衰');
// ============================================================
{
  const condition: RaceConditionV2 = {
    raceKey: 'test',
    distanceMeters: 1600,
    surface: '芝',
    place: '東京',
    fieldSize: 16,
    trackCondition: '良',
    route: null,
  };
  function sample(over: Partial<PastRaceSample>): PastRaceSample {
    return {
      raceId: 'r',
      dateNumber: 20260101,
      fieldSize: 16,
      distanceMeters: 1600,
      surface: '芝',
      place: '東京',
      trackCondition: '良',
      className: null,
      courseType: null,
      finishPosition: 5,
      abnormalFinish: false,
      marginSeconds: 0.5,
      last3fSeconds: 35.0,
      pci: 48,
      rpci: 48,
      corners: [null, null, 6, 5],
      firstCornerPosition: 6,
      lastCornerPosition: 5,
      l4fSeconds: 47.5,
      t2fSeconds: 24.2,
      pfsPast: 45,
      potential: 4.0,
      makikaeshi: 2.0,
      cushion: 9.3,
      cornerLane: 2,
      ...over,
    };
  }

  check('同一条件 → 1.0', near(conditionSimilarityMultiplier(sample({}), condition), 1));

  const diffSurface = conditionSimilarityMultiplier(sample({ surface: 'ダ' }), condition);
  check('芝⇔ダ違い → 大きく減衰', diffSurface < 0.6, diffSurface.toFixed(3));

  const diffDist = conditionSimilarityMultiplier(sample({ distanceMeters: 2400 }), condition);
  check('距離差800m → 減衰', diffDist < 0.6, diffDist.toFixed(3));

  const smallDiff = conditionSimilarityMultiplier(sample({ distanceMeters: 1700 }), condition);
  check('距離差100m → わずかな減衰', smallDiff > 0.9 && smallDiff < 1, smallDiff.toFixed(3));

  const worst = conditionSimilarityMultiplier(
    sample({ surface: 'ダ', distanceMeters: 3000, place: '札幌', trackCondition: '不良', fieldSize: 5 }),
    condition
  );
  check('全条件違いでも下限を下回らない（サンプル0を避ける）', worst >= 0.15 - 1e-9, worst.toFixed(3));

  // recency × 条件類似度
  const w = buildRecencyWeights([sample({}), sample({ surface: 'ダ' })], condition);
  check('buildRecencyWeights: 前走は満額', near(w[0], 1));
  check('buildRecencyWeights: 条件違いの2走前は減衰', w[1] < DEFAULT_RECENCY_WEIGHTS[1]);
  check('buildRecencyWeights: 5走を超えない', buildRecencyWeights(Array(10).fill(sample({})), condition).length === 5);
}

// ============================================================
section('robustZTo01 / clamp / その他');
// ============================================================
{
  const pop = [40, 45, 46, 47, 48, 49, 50, 55];
  const low = robustZTo01(40, pop, false); // 小さいほど良い
  const high = robustZTo01(55, pop, false);
  check('robustZ: 小さいほど良い方向', low! > high!, `${low} vs ${high}`);
  check('robustZ: 出力は [0,1]', low! >= 0 && low! <= 1 && high! >= 0 && high! <= 1);
  check('robustZ: MAD=0 なら neutral', near(robustZTo01(5, [5, 5, 5, 5], true)!, 0.5));
  check('robustZ: サンプル不足は null', robustZTo01(5, [1, 2], true) === null);

  check('clamp01: NaN → neutral', near(clamp01(NaN), 0.5));
  check('clamp01: 範囲外を丸める', near(clamp01(-1), 0) && near(clamp01(2), 1));
  check('clampContribution: 上限で切る', near(clampContribution(0.9, 0.2), 0.2) && near(clampContribution(-0.9, 0.2), -0.2));
  check('clampContribution: NaN → 0', near(clampContribution(NaN, 0.2), 0));

  check('isValidNumber: 0 は有効', isValidNumber(0));
  check('isValidNumber: null/NaN は無効', !isValidNumber(null) && !isValidNumber(NaN));

  const m = missingMetric('no-past-race');
  check('missingMetric: neutral 0.5 + reliability 0', near(m.value, NEUTRAL) && m.reliability === 0);
  check('missingMetric: 理由を保持', m.missingReason === 'no-past-race');
  check('missingMetric: raw は null', m.raw === null);
}

// ============================================================
console.log('\n' + '='.repeat(60));
console.log(` normalization/recency: pass=${pass} fail=${fail}`);
console.log('='.repeat(60));
if (fail > 0) process.exit(1);
