/**
 * Fast keiro backfill from 64-col umadata CSV (UPDATE only, no ALTER).
 * Usage: npx tsx scripts/reimport-umadata-keiro-fast.ts [csvPath]
 */
import fs from 'fs';
import { Pool } from 'pg';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import {
  describeKeiroColumnResolution,
  extractKeiroFromCsvRow,
} from '../lib/umadata/keiro-from-csv';

const CSV_PATH = process.argv[2] || 'C:/keiba_data/umadata.csv';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const buf = fs.readFileSync(CSV_PATH);
  let text: string;
  try { text = iconv.decode(buf, 'Shift_JIS'); } catch { text = buf.toString('utf8'); }
  const { data } = Papa.parse(text, { header: false, skipEmptyLines: true });
  const all = data as unknown[][];
  const header = all[0];
  const rows = all.slice(1);
  const keiroRes = describeKeiroColumnResolution(header);
  console.log('rows', rows.length, keiroRes);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 4,
  });

  const col = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='umadata' AND column_name='keiro' LIMIT 1`,
  );
  if (col.rows.length === 0) throw new Error('keiro column missing');

  // Build unique map race_id|horse_name -> keiro
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 47) continue;
    const raceId = String(row[0] ?? '').trim();
    const horseName = String(row[11] ?? '').trim();
    const keiro = extractKeiroFromCsvRow(row, keiroRes.headerIndex);
    if (!raceId || !horseName || !keiro) continue;
    map.set(`${raceId}\t${horseName}`, keiro);
  }
  console.log('unique keys with keiro', map.size);

  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query('BEGIN');
    // temp table
    await client.query(`CREATE TEMP TABLE tmp_keiro (race_id text, horse_name text, keiro text)`);
    const entries = [...map.entries()];
    const chunk = 500;
    for (let i = 0; i < entries.length; i += chunk) {
      const slice = entries.slice(i, i + chunk);
      const values: string[] = [];
      const params: string[] = [];
      let p = 1;
      for (const [key, keiro] of slice) {
        const [raceId, horseName] = key.split('\t');
        values.push(`($${p++},$${p++},$${p++})`);
        params.push(raceId, horseName, keiro);
      }
      await client.query(
        `INSERT INTO tmp_keiro (race_id, horse_name, keiro) VALUES ${values.join(',')}`,
        params,
      );
      if ((i / chunk) % 10 === 0) console.log('loaded temp', Math.min(i + chunk, entries.length));
    }

    const res = await client.query(`
      UPDATE umadata u
      SET keiro = t.keiro
      FROM tmp_keiro t
      WHERE u.race_id = t.race_id AND u.horse_name = t.horse_name
        AND (u.keiro IS DISTINCT FROM t.keiro)
    `);
    updated = res.rowCount ?? 0;
    await client.query('COMMIT');
    console.log('UPDATED', updated);

    const filled = await client.query(
      `SELECT COUNT(*)::int AS n FROM umadata WHERE keiro IS NOT NULL AND btrim(keiro) <> ''`,
    );
    const distinct = await client.query(
      `SELECT keiro, COUNT(*)::int AS n FROM umadata
       WHERE keiro IS NOT NULL AND btrim(keiro) <> ''
       GROUP BY keiro ORDER BY n DESC`,
    );
    console.log('filled', filled.rows[0].n);
    console.log('distinct', distinct.rows);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
