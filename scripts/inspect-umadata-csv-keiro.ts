/**
 * Inspect local umadata CSV for BL/keiro column.
 * Usage: npx tsx scripts/inspect-umadata-csv-keiro.ts [path]
 */
import fs from 'fs';
import iconv from 'iconv-lite';
import Papa from 'papaparse';
import {
  describeKeiroColumnResolution,
  extractKeiroFromCsvRow,
} from '../lib/umadata/keiro-from-csv';

const paths = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'C:/keiba_data/umadata.csv',
      'C:/keiba_data/umadataall.csv',
      'C:/keiba_data/racescore-web/data/umadata.csv',
    ];

for (const p of paths) {
  if (!fs.existsSync(p)) {
    console.log('missing', p);
    continue;
  }
  const buf = fs.readFileSync(p);
  let text: string;
  try {
    text = iconv.decode(buf, 'Shift_JIS');
  } catch {
    text = buf.toString('utf8');
  }
  const parsed = Papa.parse(text, { header: false, skipEmptyLines: true, preview: 20 });
  const rows = parsed.data as string[][];
  const header = rows[0] || [];
  const res = describeKeiroColumnResolution(header);
  console.log('\n===', p);
  console.log('bytes=', buf.length, 'headerCols=', header.length, 'keiroRes=', res);
  console.log('header[60..63]=', header.slice(60, 64).map((x) => JSON.stringify(x)));

  let nonEmpty = 0;
  const coats = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const k = extractKeiroFromCsvRow(rows[i], res.headerIndex);
    if (k) {
      nonEmpty++;
      coats.set(k, (coats.get(k) ?? 0) + 1);
    }
  }
  console.log('preview nonEmpty keiro:', nonEmpty, '/', Math.max(0, rows.length - 1));
  console.log('preview coat values:', [...coats.entries()].slice(0, 10));
  if (rows[1]) {
    console.log('sample horse=', rows[1][11], 'keiro=', JSON.stringify(extractKeiroFromCsvRow(rows[1], res.headerIndex)));
  }
}
