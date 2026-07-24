/**
 * tracking-rows テスト
 * 実行: npx tsx lib/race-simulator/tracking-rows.test.ts
 *
 * 検証:
 *  - 現在順位でソートされる
 *  - 先頭差(gap)が 0 以上に整形される（先頭は 0）
 *  - 枠は実データ優先・無ければ fallbackWaku（決定的）
 *  - 枠色・文字色が枠に対応
 *  - 短縮名（狭幅用）が最大4文字
 */
import { buildTrackingRows, fallbackWaku } from './tracking-rows';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}

console.log('=== tracking-rows ===');

const horses = [
  { horseNumber: 3, position: 2, horseName: 'アイウエオカキク', distanceFromLeader: 1.5 },
  { horseNumber: 1, position: 1, horseName: 'サンプル馬', distanceFromLeader: 0 },
  { horseNumber: 2, position: 3, horseName: 'テスト', distanceFromLeader: -0.3 }, // 異常値(負)は 0 に丸める
];

// 実データ枠: 3→枠5, 1→枠1, 2→なし（fallback）
const wakuMap = new Map<number, number>([[3, 5], [1, 1]]);
const rows = buildTrackingRows(horses, (hn) => wakuMap.get(hn));

// 1) 順位でソート
check('順位でソート', rows.map((r) => r.horseNumber).join(',') === '1,3,2', rows.map((r) => r.horseNumber).join(','));
check('先頭は position=1', rows[0].position === 1 && rows[0].horseNumber === 1);

// 2) gap 整形
check('先頭の gap=0', rows[0].gap === 0);
check('2位の gap=1.5', rows.find((r) => r.horseNumber === 3)!.gap === 1.5);
check('負の gap は 0 に丸め', rows.find((r) => r.horseNumber === 2)!.gap === 0);

// 3) 枠: 実データ優先 / fallback
check('実データ枠優先(3→5)', rows.find((r) => r.horseNumber === 3)!.waku === 5);
check('実データ枠優先(1→1)', rows.find((r) => r.horseNumber === 1)!.waku === 1);
check('枠なしは fallback(2→fallbackWaku)', rows.find((r) => r.horseNumber === 2)!.waku === fallbackWaku(2, 3));

// 4) 枠色・文字色
check('枠1は白背景+黒文字', rows.find((r) => r.horseNumber === 1)!.color === '#f2f2f2' && rows.find((r) => r.horseNumber === 1)!.textColor === '#111111');

// 5) 短縮名（最大4文字）
check('短縮名は最大4文字', rows.find((r) => r.horseNumber === 3)!.shortName.length <= 4, rows.find((r) => r.horseNumber === 3)!.shortName);
check('短い名はそのまま', rows.find((r) => r.horseNumber === 2)!.shortName === 'テスト');

// 6) fallbackWaku: 18頭でも 1..8 に収まる
{
  const total = 18;
  const wakus = Array.from({ length: total }, (_, i) => fallbackWaku(i + 1, total));
  check('fallbackWaku は 1..8 に収まる(18頭)', wakus.every((w) => w >= 1 && w <= 8));
  check('fallbackWaku は単調非減少(18頭)', wakus.every((w, i) => i === 0 || w >= wakus[i - 1]));
}

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
