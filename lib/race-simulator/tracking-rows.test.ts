/**
 * tracking-rows テスト（レース進行連動）
 * 実行: npx tsx lib/race-simulator/tracking-rows.test.ts
 */
import {
  buildTrackingRows,
  trackingInputsFromDynamics,
  fallbackWaku,
} from './tracking-rows';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  ✗ ${label} ${detail}`); }
}

console.log('=== tracking-rows ===');

const raceDistance = 1600;
const wakuOf = (hn: number) => ((hn - 1) % 8) + 1;

// dynamics フレーム風（raceProgress はメートル）
const frameEarly = [
  { horseNumber: 1, raceProgress: 160, rank: 2 },
  { horseNumber: 2, raceProgress: 192, rank: 1 },
  { horseNumber: 3, raceProgress: 128, rank: 3 },
];
const frameLate = [
  { horseNumber: 1, raceProgress: 1280, rank: 1 },
  { horseNumber: 2, raceProgress: 1200, rank: 2 },
  { horseNumber: 3, raceProgress: 1120, rank: 3 },
];

const earlyInputs = trackingInputsFromDynamics(frameEarly, raceDistance, (n) => `馬${n}`);
const lateInputs = trackingInputsFromDynamics(frameLate, raceDistance, (n) => `馬${n}`);
const earlyRows = buildTrackingRows(earlyInputs, { wakuOf, raceDistance });
const lateRows = buildTrackingRows(lateInputs, { wakuOf, raceDistance });

check('早期: 先頭は rank1=馬2', earlyRows[0].horseNumber === 2 && earlyRows[0].gapLabel === '先頭');
check('早期: 後続は 先頭差 +Xm', earlyRows[1].gapLabel.startsWith('先頭差 +') && earlyRows[1].gap > 0);
check('早期: 全馬が常に0mではない', earlyRows.some((r) => r.gap > 0));
check('早期: 走破距離が progress に比例', Math.abs(earlyRows.find((r) => r.horseNumber === 2)!.distanceRun - 192) < 1);
check('早期: runLabel は走破のみ', earlyRows[0].runLabel === '192m' || earlyRows[0].runLabel.endsWith('m'));
check('早期: 先頭に曖昧な0mラベルを出さない', earlyRows[0].gapLabel === '先頭');

check('後期: progress増で走破距離が増える',
  lateRows.find((r) => r.horseNumber === 1)!.distanceRun >
  earlyRows.find((r) => r.horseNumber === 1)!.distanceRun);

check('後期: 先頭が馬1へ追従', lateRows[0].horseNumber === 1 && lateRows[0].gapLabel === '先頭');
check('後期: 残り距離が表示', lateRows[0].remaining != null && lateRows[0].remaining < raceDistance);
check('距離ラベルに走破が含まれる', lateRows[0].distanceLabel.includes('走破'));

// pause相当: 同じ入力なら同じ行
const again = buildTrackingRows(lateInputs, { wakuOf, raceDistance });
check('同一入力は同一表示', again[0].distanceRun === lateRows[0].distanceRun && again[0].gap === lateRows[0].gap);

// レース切替相当: 空→初期
const empty = buildTrackingRows([], { wakuOf, raceDistance });
check('空入力は空行', empty.length === 0);

// fallbackWaku
{
  const wakus = Array.from({ length: 18 }, (_, i) => fallbackWaku(i + 1, 18));
  check('fallbackWaku 1..8', wakus.every((w) => w >= 1 && w <= 8));
}

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
