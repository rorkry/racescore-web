/**
 * keiro-from-csv テスト
 * 実行: npx tsx lib/umadata/keiro-from-csv.test.ts
 */
import {
  KEIRO_CSV_INDEX_BL,
  resolveKeiroColumnIndex,
  extractKeiroFromCsvRow,
  describeKeiroColumnResolution,
} from './keiro-from-csv';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; }
  else { fail++; console.error(`  ✗ ${label} ${detail}`); }
}

console.log('=== keiro-from-csv ===');

check('BL index is 63', KEIRO_CSV_INDEX_BL === 63);

{
  const header = Array.from({ length: 64 }, (_, i) => `col${i}`);
  header[63] = '毛色';
  check('header 毛色 → 63', resolveKeiroColumnIndex(header) === 63);
}

{
  const header = Array.from({ length: 70 }, (_, i) => `c${i}`);
  header[50] = '  Keiro ';
  check('header Keiro（空白）→ 50', resolveKeiroColumnIndex(header) === 50);
}

{
  const header = Array.from({ length: 64 }, (_, i) => `c${i}`);
  header[63] = '\uFEFF毛色（父系）';
  check('BOM付き毛色（父系）→ 63', resolveKeiroColumnIndex(header) === 63);
}

{
  const header = Array.from({ length: 48 }, (_, i) => `c${i}`);
  check('ヘッダーに毛色なし → null', resolveKeiroColumnIndex(header) == null);
}

{
  // 64列行: index 63 に鹿毛
  const row = Array.from({ length: 64 }, (_, i) => `v${i}`);
  row[63] = ' 鹿毛 ';
  check('fallback BL extract', extractKeiroFromCsvRow(row, null) === '鹿毛');
}

{
  const row = Array.from({ length: 55 }, (_, i) => `v${i}`);
  row[50] = '葦毛';
  check('headerIndex 優先', extractKeiroFromCsvRow(row, 50) === '葦毛');
}

{
  const row = Array.from({ length: 48 }, () => 'x');
  check('短い行 → 空', extractKeiroFromCsvRow(row, null) === '');
}

{
  const d = describeKeiroColumnResolution(['race_id', '毛色']);
  check('describe usedHeader', d.usedHeader && d.resolvedIndex === 1);
}

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
