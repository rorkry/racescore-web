/**
 * 実DBから毛色サンプルを取得する検証スクリプト（一時）
 * 実行: npx tsx scripts/verify-coat-samples.ts
 * 秘密情報は出力しない。毛色・馬名・馬番のみ。
 */
import { Pool } from 'pg';
import { normalizeCoatColor } from '../lib/race-simulator/coat-normalize';
import { coatIndexFromName, COAT_PALETTE, coatIndexFor } from '../lib/race-simulator/broadcast-cel-horse';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  // 1) keiro 列の有無
  const col = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='umadata' AND column_name='keiro'`
  );
  console.log('umadata.keiro column exists:', col.rows.length > 0);

  if (col.rows.length === 0) {
    console.log('keiro column missing — stop without DDL');
    await pool.end();
    return;
  }

  // 2) 毛色が複数あるレースを探す（wakujun と umadata を馬名で結合）
  const races = await pool.query(`
    WITH coats AS (
      SELECT DISTINCT ON (horse_name)
        horse_name, keiro
      FROM umadata
      WHERE keiro IS NOT NULL AND btrim(keiro) <> ''
      ORDER BY horse_name, race_id DESC
    )
    SELECT w.year, w.date, w.place, w.race_number,
           COUNT(*) AS n,
           COUNT(DISTINCT c.keiro) AS distinct_coats
    FROM wakujun w
    JOIN coats c ON c.horse_name = btrim(w.umamei)
    GROUP BY w.year, w.date, w.place, w.race_number
    HAVING COUNT(DISTINCT c.keiro) >= 3 AND COUNT(*) >= 8
    ORDER BY distinct_coats DESC, n DESC
    LIMIT 5
  `);
  console.log('candidate races:', races.rows.length);
  if (races.rows.length === 0) {
    // fallback: any horses with keiro
    const any = await pool.query(`
      SELECT horse_name, keiro FROM umadata
      WHERE keiro IS NOT NULL AND btrim(keiro) <> ''
      ORDER BY race_id DESC LIMIT 10
    `);
    console.log('fallback keiro samples:', any.rows);
    await pool.end();
    return;
  }

  const r = races.rows[0];
  console.log('picked race:', r);

  const horses = await pool.query(
    `
    WITH coats AS (
      SELECT DISTINCT ON (horse_name)
        horse_name, keiro, race_id
      FROM umadata
      WHERE keiro IS NOT NULL AND btrim(keiro) <> ''
      ORDER BY horse_name, race_id DESC
    )
    SELECT w.umaban::int AS horse_number,
           btrim(w.umamei) AS horse_name,
           w.waku::int AS waku,
           c.keiro AS db_keiro,
           c.race_id AS umadata_race_id
    FROM wakujun w
    JOIN coats c ON c.horse_name = btrim(w.umamei)
    WHERE w.year = $1 AND w.date = $2 AND w.place = $3 AND w.race_number::text = $4::text
    ORDER BY w.umaban::int
    `,
    [r.year, r.date, r.place, String(r.race_number)]
  );

  console.log('\n=== coat samples ===');
  console.log('| horseNumber | horseName | DB keiro | normalized | paletteIdx | paletteNote | usedDB |');
  for (const h of horses.rows) {
    const norm = normalizeCoatColor(h.db_keiro);
    const byName = coatIndexFromName(h.db_keiro);
    const fb = coatIndexFor(h.horse_number);
    const idx = byName >= 0 ? byName : fb;
    const usedDB = byName >= 0;
    const note = ['bay','darkBay','black','chestnut','gray','darkChestnut','white'][idx] ?? String(idx);
    console.log(
      `| ${h.horse_number} | ${h.horse_name} | ${h.db_keiro} | ${norm} | ${idx} | ${note} | ${usedDB} |`
    );
  }

  // 異なる毛色を優先して最低3頭
  const unique: typeof horses.rows = [];
  const seen = new Set<string>();
  for (const h of horses.rows) {
    const k = String(h.db_keiro).trim();
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(h);
    }
    if (unique.length >= 5) break;
  }
  console.log('\n=== diversity pick (>=3) ===');
  for (const h of unique) {
    console.log(JSON.stringify({
      horseNumber: h.horse_number,
      horseName: h.horse_name,
      db_keiro: h.db_keiro,
      normalized: normalizeCoatColor(h.db_keiro),
      paletteIndex: coatIndexFromName(h.db_keiro),
      paletteSize: COAT_PALETTE.length,
    }));
  }

  console.log('\npickedRaceKey fields:', {
    year: r.year,
    date: r.date,
    place: r.place,
    race_number: r.race_number,
  });

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
