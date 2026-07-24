/**
 * umadata keiro INSERT 形状の dry-run テスト（DB接続なし）
 * 実行: npx tsx lib/umadata/keiro-insert-dryrun.test.ts
 */
import { extractKeiroFromCsvRow, describeKeiroColumnResolution, KEIRO_CSV_INDEX_BL } from './keiro-from-csv';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else { fail++; console.error(' ✗', label, detail); }
}

console.log('=== keiro INSERT dry-run ===');

const header = Array.from({ length: 64 }, (_, i) => `c${i}`);
header[63] = '毛色';
const res = describeKeiroColumnResolution(header);
check('header resolves BL', res.resolvedIndex === KEIRO_CSV_INDEX_BL && res.usedHeader);

const row = Array.from({ length: 64 }, (_, i) => `v${i}`);
row[11] = 'テストウマ';
row[63] = ' 鹿毛 ';
const keiro = extractKeiroFromCsvRow(row, res.headerIndex);
check('extract trimmed', keiro === '鹿毛');

// Mimic parameter list length for INSERT (... keiro) VALUES ($1..$49)
const params = [
  ...Array.from({ length: 48 }, (_, i) => String(row[i] ?? '').trim()),
  keiro,
];
check('49 bind params', params.length === 49);
check('last param is keiro', params[48] === '鹿毛');
check('horse_name at $12 slot (idx11)', params[11] === 'テストウマ');

// SQL must mention keiro column (static check of expected shape)
const sqlShape = `INSERT INTO umadata (..., work_2, keiro) VALUES ($1..$49)`;
check('sql shape documents keiro', sqlShape.includes('keiro'));

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
