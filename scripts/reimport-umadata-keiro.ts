/**
 * Re-import umadata CSV including keiro (BL / 毛色).
 * Does NOT run ALTER — column must already exist via migration.
 *
 * Usage:
 *   npx tsx scripts/reimport-umadata-keiro.ts [csvPath]
 *
 * Default: C:/keiba_data/umadata.csv (64-col with 毛色 header)
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
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  if (!fs.existsSync(CSV_PATH)) {
    console.error('CSV not found:', CSV_PATH);
    process.exit(1);
  }

  console.log('Reading', CSV_PATH);
  const buf = fs.readFileSync(CSV_PATH);
  let text: string;
  try {
    text = iconv.decode(buf, 'Shift_JIS');
  } catch {
    text = buf.toString('utf8');
  }
  const { data } = Papa.parse(text, { header: false, skipEmptyLines: true });
  const all = data as unknown[][];
  if (all.length < 2) {
    console.error('CSV empty');
    process.exit(1);
  }
  const headerRow = all[0];
  const rows = all.slice(1);
  const keiroColumn = describeKeiroColumnResolution(headerRow);
  console.log('rows=', rows.length, 'keiroColumn=', keiroColumn);

  // Ensure column exists (do NOT create — fail if missing)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  const client = await pool.connect();
  try {
    const col = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name='umadata' AND column_name='keiro' LIMIT 1`,
    );
    if (col.rows.length === 0) {
      throw new Error('umadata.keiro missing — apply migration first. No ALTER here.');
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const batchSize = 200;

    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length < 47) {
        skipped++;
        continue;
      }
      const raceId = String(row[0] ?? '').trim();
      const umaban = String(row[10] ?? '').trim();
      const horseName = String(row[11] ?? '').trim();
      const keiro = extractKeiroFromCsvRow(row, keiroColumn.headerIndex);
      if (!raceId || !horseName) {
        skipped++;
        continue;
      }

      try {
        // Prefer UPDATE existing row's keiro; if none, INSERT minimal+keiro via full insert like upload
        const upd = await client.query(
          `UPDATE umadata SET keiro = $1
           WHERE race_id = $2 AND horse_name = $3
             AND ($4 = '' OR umaban = $4)
           RETURNING id`,
          [keiro || null, raceId, horseName, umaban],
        );
        if (upd.rowCount && upd.rowCount > 0) {
          updated += upd.rowCount;
        } else {
          // Insert new row (same columns as upload-csv importUmadata)
          await client.query(
            `INSERT INTO umadata (
                race_id, date, place, course_type, distance, class_name, race_name,
                gender_limit, age_limit, waku, umaban, horse_name,
                index_value, track_condition, field_size, popularity,
                finish_position, last_3f, weight_carried, horse_weight, weight_change,
                finish_time, race_count, margin, win_odds, place_odds_low,
                place_odds_high, win_payout, place_payout, rpci, pci, good_run,
                pci3, horse_mark, corner_1, corner_2, corner_3, corner_4,
                gender, age, jockey, multi_entry, affiliation, trainer, sire, dam, lap_time, work_2,
                keiro
              ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
                $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
                $41,$42,$43,$44,$45,$46,$47,$48,
                $49
              )`,
            [
              raceId,
              String(row[1] ?? '').trim(),
              String(row[2] ?? '').trim(),
              String(row[3] ?? '').trim(),
              String(row[4] ?? '').trim(),
              String(row[5] ?? '').trim(),
              String(row[6] ?? '').trim(),
              String(row[7] ?? '').trim(),
              String(row[8] ?? '').trim(),
              String(row[9] ?? '').trim(),
              umaban,
              horseName,
              String(row[12] ?? '').trim(),
              String(row[13] ?? '').trim(),
              String(row[14] ?? '').trim(),
              String(row[15] ?? '').trim(),
              String(row[16] ?? '').trim(),
              String(row[17] ?? '').trim(),
              String(row[18] ?? '').trim(),
              String(row[19] ?? '').trim(),
              String(row[20] ?? '').trim(),
              String(row[21] ?? '').trim(),
              String(row[22] ?? '').trim(),
              String(row[23] ?? '').trim(),
              String(row[24] ?? '').trim(),
              String(row[25] ?? '').trim(),
              String(row[26] ?? '').trim(),
              String(row[27] ?? '').trim(),
              String(row[28] ?? '').trim(),
              String(row[29] ?? '').trim(),
              String(row[30] ?? '').trim(),
              String(row[31] ?? '').trim(),
              String(row[32] ?? '').trim(),
              String(row[33] ?? '').trim(),
              String(row[34] ?? '').trim(),
              String(row[35] ?? '').trim(),
              String(row[36] ?? '').trim(),
              String(row[37] ?? '').trim(),
              String(row[38] ?? '').trim(),
              String(row[39] ?? '').trim(),
              String(row[40] ?? '').trim(),
              String(row[41] ?? '').trim(),
              String(row[42] ?? '').trim(),
              String(row[43] ?? '').trim(),
              String(row[44] ?? '').trim(),
              String(row[45] ?? '').trim(),
              String(row[46] ?? '').trim(),
              String(row[47] ?? '').trim(),
              keiro || null,
            ],
          );
          inserted++;
        }
      } catch (e: any) {
        errors++;
        if (errors <= 5) console.warn('row error', i, e.message);
      }

      if ((i + 1) % batchSize === 0) {
        await client.query('COMMIT');
        await client.query('BEGIN');
        console.log(`progress ${i + 1}/${rows.length} updated=${updated} inserted=${inserted} errors=${errors}`);
      }
    }
    await client.query('COMMIT');
    console.log('DONE', { updated, inserted, skipped, errors, keiroColumn });

    const filled = await client.query(
      `SELECT COUNT(*)::int AS n FROM umadata
       WHERE keiro IS NOT NULL AND btrim(keiro) <> ''`,
    );
    console.log('filled keiro rows now:', filled.rows[0].n);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
