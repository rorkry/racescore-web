/**
 * finish_position / field_size / margin / last_3f の実体調査（読み取り専用）
 *
 * 実行: npx tsx --env-file=.env.local scripts/investigate-finish-position.ts
 *
 * 動機:
 *   investigate-v2-inputs.ts で LIMIT（ORDER BY なし）で取得した結果、
 *   finish_position の min=10 / field_size の min=10 という物理的にありえない分布が出た。
 *   → LIMIT ブロックが偏っていた可能性と、列の中身が想定と違う可能性の両方を切り分ける。
 *   finish_position は v2 の道中維持力モデルの中核入力なので、必ず実体を確定させる。
 *
 * SELECT のみ。
 */
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

async function main() {
  console.log('='.repeat(90));
  console.log(' finish_position / field_size 実体調査');
  console.log('='.repeat(90));

  // ---------- 1. finish_position の値ごとの件数（全件集計） ----------
  console.log('\n[1] finish_position の値分布（全822k行・上位30値）');
  const fp = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(finish_position),''),'(空)') AS v, COUNT(*) AS c
     FROM umadata GROUP BY 1 ORDER BY c DESC LIMIT 30`
  );
  for (const r of fp.rows) {
    console.log(`  "${String(r.v).padEnd(8)}" ${String(r.c).padStart(8)}`);
  }

  // ---------- 2. 数値化できる finish_position の全件percentile ----------
  console.log('\n[2] finish_position 数値の全件percentile（SQL集計・偏りなし）');
  const fpq = await pool.query(
    `SELECT COUNT(*) AS n,
            MIN(finish_position::int) AS min,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY finish_position::int) AS p25,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY finish_position::int) AS med,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY finish_position::int) AS p75,
            MAX(finish_position::int) AS max
     FROM umadata WHERE finish_position ~ '^[0-9]+$'`
  );
  console.log('  ', fpq.rows[0]);

  // ---------- 3. field_size の全件percentile ----------
  console.log('\n[3] field_size 数値の全件percentile');
  const fs = await pool.query(
    `SELECT COUNT(*) AS n, MIN(field_size::int) AS min,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY field_size::int) AS med,
            MAX(field_size::int) AS max
     FROM umadata WHERE field_size ~ '^[0-9]+$'`
  );
  console.log('  ', fs.rows[0]);

  // ---------- 4. last_3f / margin / pci の全件percentile ----------
  console.log('\n[4] last_3f / margin / pci の全件percentile（数値化できる行のみ）');
  const nums = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM umadata WHERE last_3f ~ '^[0-9]+(\\.[0-9]+)?$') AS last3f_n,
       (SELECT PERCENTILE_CONT(0.01) WITHIN GROUP (ORDER BY last_3f::float8) FROM umadata WHERE last_3f ~ '^[0-9]+(\\.[0-9]+)?$') AS last3f_p01,
       (SELECT PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY last_3f::float8) FROM umadata WHERE last_3f ~ '^[0-9]+(\\.[0-9]+)?$') AS last3f_med,
       (SELECT PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY last_3f::float8) FROM umadata WHERE last_3f ~ '^[0-9]+(\\.[0-9]+)?$') AS last3f_p99,
       (SELECT COUNT(*) FROM umadata WHERE margin ~ '^-?[0-9]+(\\.[0-9]+)?$') AS margin_n,
       (SELECT PERCENTILE_CONT(0.01) WITHIN GROUP (ORDER BY margin::float8) FROM umadata WHERE margin ~ '^-?[0-9]+(\\.[0-9]+)?$') AS margin_p01,
       (SELECT PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY margin::float8) FROM umadata WHERE margin ~ '^-?[0-9]+(\\.[0-9]+)?$') AS margin_med,
       (SELECT PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY margin::float8) FROM umadata WHERE margin ~ '^-?[0-9]+(\\.[0-9]+)?$') AS margin_p99,
       (SELECT PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY pci::float8) FROM umadata WHERE pci ~ '^[0-9]+(\\.[0-9]+)?$') AS pci_med`
  );
  console.log('  ', nums.rows[0]);

  // ---------- 5. 1レース分の生データを目視 ----------
  console.log('\n[5] 1レース分の生データ（列の意味を目視確認）');
  const oneRace = await pool.query(
    `SELECT race_id FROM umadata
     WHERE finish_position ~ '^[0-9]+$'
     GROUP BY race_id HAVING COUNT(*) >= 8 LIMIT 1`
  );
  if (oneRace.rows.length) {
    const rid = oneRace.rows[0].race_id;
    const detail = await pool.query(
      `SELECT umaban, horse_name, finish_position, field_size, margin, last_3f,
              corner_1, corner_2, corner_3, corner_4, finish_time, pci, distance, date
       FROM umadata WHERE race_id = $1 ORDER BY umaban::int`,
      [rid]
    );
    console.log(`  race_id = ${rid}  (${detail.rowCount} 行)`);
    console.log(
      '  ' +
        ['umaban', '着順', '頭数', '着差', '上3F', 'c1', 'c2', 'c3', 'c4', 'time', 'pci', 'distance']
          .map((x) => x.padEnd(8))
          .join('')
    );
    for (const r of detail.rows) {
      console.log(
        '  ' +
          [r.umaban, r.finish_position, r.field_size, r.margin, r.last_3f, r.corner_1, r.corner_2,
            r.corner_3, r.corner_4, r.finish_time, r.pci, r.distance]
            .map((x) => String(x ?? '').padEnd(8))
            .join('')
      );
    }
  }

  // ---------- 6. 着順が全馬そろうレースが0件だった理由 ----------
  console.log('\n[6] レース単位の着順充足状況');
  const perRace = await pool.query(
    `WITH s AS (
       SELECT race_id, COUNT(*) AS n,
              COUNT(*) FILTER (WHERE finish_position ~ '^[0-9]+$') AS wf
       FROM umadata GROUP BY race_id
     )
     SELECT
       COUNT(*) AS races,
       COUNT(*) FILTER (WHERE wf = 0)            AS zero_finish,
       COUNT(*) FILTER (WHERE wf > 0 AND wf < n) AS partial,
       COUNT(*) FILTER (WHERE wf = n)            AS full_finish,
       AVG(n)::numeric(6,2)  AS avg_rows,
       AVG(wf)::numeric(6,2) AS avg_with_finish
     FROM s`
  );
  console.log('  ', perRace.rows[0]);

  // 1レースあたり行数の分布（umadata の1行が何を表すか）
  const rowsPerRace = await pool.query(
    `WITH s AS (SELECT race_id, COUNT(*) AS n FROM umadata GROUP BY race_id)
     SELECT MIN(n) AS min, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY n) AS med, MAX(n) AS max FROM s`
  );
  console.log('  1レースあたり行数:', rowsPerRace.rows[0]);

  // ---------- 7. finish_position が空の行は何か ----------
  console.log('\n[7] finish_position が数値でない行のサンプル');
  const nonNum = await pool.query(
    `SELECT race_id, umaban, horse_name, finish_position, margin, last_3f, finish_time, class_name, date
     FROM umadata WHERE finish_position !~ '^[0-9]+$' LIMIT 8`
  );
  for (const r of nonNum.rows) {
    console.log(
      `  race=${r.race_id} umaban=${String(r.umaban).padEnd(3)} 着順="${r.finish_position}" 着差="${r.margin}" 上3F="${r.last_3f}" time="${r.finish_time}" date=${r.date}`
    );
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error('調査失敗:', e?.message ?? e);
  try {
    await pool.end();
  } catch {
    /* noop */
  }
  process.exit(1);
});
