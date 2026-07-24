/**
 * v2 予測モデルの入力データ調査（読み取り専用）
 *
 * 実行: npx tsx --env-file=.env.local scripts/investigate-v2-inputs.ts
 *
 * 目的（PHASE 1）:
 *   - 各入力の実スケール（winsorize境界・正規化方式の決定に必要）
 *   - 各入力の充足率（reliability 設計と欠損戦略の決定に必要）
 *   - 1頭あたりの近走数分布（recency weight を何走まで持つかの決定に必要）
 *   - バックテストに使えるレース数
 *
 * SELECT のみ。書き込み・schema変更は行わない。
 */
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === '') return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function describe(label: string, xs: number[], zeroNote = false): string {
  if (xs.length === 0) return `${label.padEnd(13)} n=0`;
  const s = [...xs].sort((a, b) => a - b);
  const zeros = xs.filter((v) => v === 0).length;
  const neg = xs.filter((v) => v < 0).length;
  return (
    `${label.padEnd(13)} n=${String(xs.length).padStart(6)}  ` +
    `min=${s[0].toFixed(2).padStart(8)} p01=${quantile(s, 0.01).toFixed(2).padStart(7)} ` +
    `p25=${quantile(s, 0.25).toFixed(2).padStart(7)} med=${quantile(s, 0.5).toFixed(2).padStart(7)} ` +
    `p75=${quantile(s, 0.75).toFixed(2).padStart(7)} p99=${quantile(s, 0.99).toFixed(2).padStart(7)} ` +
    `max=${s[s.length - 1].toFixed(2).padStart(8)}` +
    (zeroNote ? `  0値=${((zeros / xs.length) * 100).toFixed(1)}% 負値=${((neg / xs.length) * 100).toFixed(1)}%` : '')
  );
}

async function main() {
  console.log('='.repeat(96));
  console.log(' v2 入力データ調査（PHASE 1）');
  console.log('='.repeat(96));

  // ---------- 1. データ範囲 ----------
  console.log('\n[1] データ範囲');
  const range = await pool.query(
    `SELECT MIN(SUBSTRING(race_id,1,8)) AS min_d, MAX(SUBSTRING(race_id,1,8)) AS max_d,
            COUNT(*) AS rows, COUNT(DISTINCT race_id) AS races,
            COUNT(DISTINCT TRIM(horse_name)) AS horses
     FROM umadata WHERE race_id ~ '^[0-9]{8}'`
  );
  const r1 = range.rows[0];
  console.log(`  umadata: ${r1.rows} 行 / ${r1.races} レース / ${r1.horses} 頭  期間 ${r1.min_d} 〜 ${r1.max_d}`);

  const idxRange = await pool.query(
    `SELECT MIN(SUBSTRING(race_id,1,8)) AS min_d, MAX(SUBSTRING(race_id,1,8)) AS max_d,
            COUNT(*) AS rows, COUNT(DISTINCT SUBSTRING(race_id,1,16)) AS races
     FROM indices WHERE race_id ~ '^[0-9]{8}'`
  );
  const r2 = idxRange.rows[0];
  console.log(`  indices: ${r2.rows} 行 / ${r2.races} レース  期間 ${r2.min_d} 〜 ${r2.max_d}`);

  // ---------- 2. umadata 充足率 ----------
  console.log('\n[2] umadata 充足率（非NULLかつ非空）');
  const cov = await pool.query(
    `SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE finish_position ~ '^[0-9]+$')        AS finish_position,
      COUNT(*) FILTER (WHERE last_3f IS NOT NULL AND last_3f<>'')  AS last_3f,
      COUNT(*) FILTER (WHERE finish_time IS NOT NULL AND finish_time<>'') AS finish_time,
      COUNT(*) FILTER (WHERE field_size ~ '^[0-9]+$')              AS field_size,
      COUNT(*) FILTER (WHERE margin IS NOT NULL AND margin<>'')    AS margin,
      COUNT(*) FILTER (WHERE pci IS NOT NULL AND pci<>'')          AS pci,
      COUNT(*) FILTER (WHERE rpci IS NOT NULL AND rpci<>'')        AS rpci,
      COUNT(*) FILTER (WHERE pci3 IS NOT NULL AND pci3<>'')        AS pci3,
      COUNT(*) FILTER (WHERE lap_time IS NOT NULL AND lap_time<>'') AS lap_time,
      COUNT(*) FILTER (WHERE corner_1 ~ '^[0-9]+$')                AS corner_1,
      COUNT(*) FILTER (WHERE corner_2 ~ '^[0-9]+$')                AS corner_2,
      COUNT(*) FILTER (WHERE corner_3 ~ '^[0-9]+$')                AS corner_3,
      COUNT(*) FILTER (WHERE corner_4 ~ '^[0-9]+$')                AS corner_4,
      COUNT(*) FILTER (WHERE track_condition IS NOT NULL AND track_condition<>'') AS track_condition,
      COUNT(*) FILTER (WHERE course_type IS NOT NULL AND course_type<>'')         AS course_type,
      COUNT(*) FILTER (WHERE class_name IS NOT NULL AND class_name<>'')           AS class_name
     FROM umadata`
  );
  const cv = cov.rows[0];
  const total = Number(cv.total);
  for (const k of Object.keys(cv)) {
    if (k === 'total') continue;
    const n = Number(cv[k]);
    console.log(`  ${k.padEnd(17)} ${String(n).padStart(8)} / ${total}  = ${((n / total) * 100).toFixed(1)}%`);
  }

  // ---------- 3. indices 充足率 ----------
  console.log('\n[3] indices 充足率');
  const icov = await pool.query(
    `SELECT COUNT(*) AS total,
      COUNT("L4F") AS l4f, COUNT("T2F") AS t2f, COUNT(pfs_past) AS pfs_past,
      COUNT(potential) AS potential, COUNT(makikaeshi) AS makikaeshi,
      COUNT(cushion) AS cushion, COUNT(corner_lane) AS corner_lane,
      COUNT(revouma) AS revouma, COUNT(revouma2) AS revouma2
     FROM indices`
  );
  const ic = icov.rows[0];
  const itotal = Number(ic.total);
  for (const k of Object.keys(ic)) {
    if (k === 'total') continue;
    const n = Number(ic[k]);
    console.log(`  ${k.padEnd(13)} ${String(n).padStart(8)} / ${itotal}  = ${((n / itotal) * 100).toFixed(1)}%`);
  }

  // ---------- 4. indices の実スケール ----------
  console.log('\n[4] indices 実スケール（winsorize境界の決定用）');
  const s = await pool.query(
    `SELECT "L4F" AS l4f, "T2F" AS t2f, pfs_past, potential, makikaeshi, cushion, corner_lane, revouma, revouma2
     FROM indices LIMIT 120000`
  );
  const col = (k: string) => s.rows.map((r) => parseNum(r[k])).filter((v): v is number => v != null);
  console.log('  ' + describe('L4F(秒)', col('l4f'), true));
  console.log('  ' + describe('T2F(秒)', col('t2f'), true));
  console.log('  ' + describe('pfs_past', col('pfs_past'), true));
  console.log('  ' + describe('potential', col('potential'), true));
  console.log('  ' + describe('makikaeshi', col('makikaeshi'), true));
  console.log('  ' + describe('cushion', col('cushion'), true));
  console.log('  ' + describe('corner_lane', col('corner_lane'), true));
  console.log('  ' + describe('revouma', col('revouma'), true));
  console.log('  ' + describe('revouma2', col('revouma2'), true));

  // ---------- 5. umadata 数値列の実スケール ----------
  console.log('\n[5] umadata 実スケール');
  const u = await pool.query(
    `SELECT last_3f, margin, pci, rpci, field_size, finish_position, corner_2, corner_4
     FROM umadata
     WHERE finish_position ~ '^[0-9]+$'
     LIMIT 120000`
  );
  const ucol = (k: string) => u.rows.map((r) => parseNum(r[k])).filter((v): v is number => v != null);
  console.log('  ' + describe('last_3f(秒)', ucol('last_3f'), true));
  console.log('  ' + describe('margin', ucol('margin'), true));
  console.log('  ' + describe('pci', ucol('pci'), true));
  console.log('  ' + describe('rpci', ucol('rpci'), true));
  console.log('  ' + describe('field_size', ucol('field_size')));
  console.log('  ' + describe('finish_pos', ucol('finish_position')));
  console.log('  ' + describe('corner_2', ucol('corner_2'), true));
  console.log('  ' + describe('corner_4', ucol('corner_4'), true));

  // margin の生値サンプル（形式確認）
  const mSample = await pool.query(
    `SELECT DISTINCT margin FROM umadata
     WHERE margin IS NOT NULL AND margin<>'' LIMIT 40`
  );
  console.log('  margin 生値サンプル: ' + mSample.rows.map((r) => `"${r.margin}"`).join(' '));

  // ---------- 6. 1頭あたり近走数（recency weight 設計） ----------
  console.log('\n[6] 1頭あたりの出走数分布（recency weight を何走まで持つか）');
  const hist = await pool.query(
    `WITH per_horse AS (
       SELECT TRIM(horse_name) AS h, COUNT(*) AS c
       FROM umadata WHERE horse_name IS NOT NULL AND horse_name<>''
       GROUP BY TRIM(horse_name)
     )
     SELECT
       COUNT(*) AS horses,
       AVG(c)::numeric(10,2) AS avg_races,
       COUNT(*) FILTER (WHERE c >= 1) AS ge1,
       COUNT(*) FILTER (WHERE c >= 2) AS ge2,
       COUNT(*) FILTER (WHERE c >= 3) AS ge3,
       COUNT(*) FILTER (WHERE c >= 4) AS ge4,
       COUNT(*) FILTER (WHERE c >= 5) AS ge5,
       COUNT(*) FILTER (WHERE c >= 8) AS ge8
     FROM per_horse`
  );
  const h = hist.rows[0];
  const hs = Number(h.horses);
  console.log(`  対象頭数: ${hs}  平均出走数: ${h.avg_races}`);
  for (const [k, label] of [['ge1', '1走以上'], ['ge2', '2走以上'], ['ge3', '3走以上'], ['ge4', '4走以上'], ['ge5', '5走以上'], ['ge8', '8走以上']] as const) {
    const n = Number(h[k]);
    console.log(`  ${label}: ${String(n).padStart(7)} 頭 = ${((n / hs) * 100).toFixed(1)}%`);
  }

  // ---------- 7. バックテスト可能レース ----------
  console.log('\n[7] バックテストに使えるレース');
  const bt = await pool.query(
    `WITH race_stats AS (
       SELECT race_id,
              COUNT(*) AS n,
              COUNT(*) FILTER (WHERE finish_position ~ '^[0-9]+$') AS with_finish,
              COUNT(*) FILTER (WHERE last_3f IS NOT NULL AND last_3f<>'') AS with_last3f,
              COUNT(*) FILTER (WHERE corner_2 ~ '^[0-9]+$') AS with_corner2
       FROM umadata
       WHERE race_id ~ '^[0-9]{8}'
       GROUP BY race_id
     )
     SELECT
       COUNT(*) AS races,
       COUNT(*) FILTER (WHERE n >= 5 AND with_finish = n) AS all_finish,
       COUNT(*) FILTER (WHERE n >= 5 AND with_finish = n AND with_last3f = n) AS all_finish_last3f,
       COUNT(*) FILTER (WHERE n >= 5 AND with_finish = n AND with_corner2 >= n*0.8) AS with_corner_80pct
     FROM race_stats`
  );
  const b = bt.rows[0];
  console.log(`  全レース                     : ${b.races}`);
  console.log(`  5頭以上・全馬に着順          : ${b.all_finish}`);
  console.log(`  ↑かつ全馬に上がり3F          : ${b.all_finish_last3f}`);
  console.log(`  ↑かつ8割以上に2角通過順      : ${b.with_corner_80pct}`);

  // 指数がそろっているレース（v2の指数系入力が使える範囲）
  const btIdx = await pool.query(
    `WITH idx_races AS (
       SELECT SUBSTRING(race_id,1,16) AS rid, COUNT(*) AS n
       FROM indices WHERE "L4F" IS NOT NULL GROUP BY SUBSTRING(race_id,1,16)
     )
     SELECT COUNT(*) AS races, COUNT(*) FILTER (WHERE n >= 5) AS races_ge5 FROM idx_races`
  );
  console.log(`  L4Fがあるレース              : ${btIdx.rows[0].races}（5頭以上: ${btIdx.rows[0].races_ge5}）`);

  // 年別
  const byYear = await pool.query(
    `SELECT SUBSTRING(race_id,1,4) AS y, COUNT(DISTINCT race_id) AS races
     FROM umadata WHERE race_id ~ '^[0-9]{8}' GROUP BY 1 ORDER BY 1`
  );
  console.log('  年別レース数:');
  for (const r of byYear.rows) console.log(`    ${r.y}: ${String(r.races).padStart(6)}`);

  const byYearIdx = await pool.query(
    `SELECT SUBSTRING(race_id,1,4) AS y, COUNT(DISTINCT SUBSTRING(race_id,1,16)) AS races
     FROM indices WHERE race_id ~ '^[0-9]{8}' GROUP BY 1 ORDER BY 1`
  );
  console.log('  年別 indices レース数:');
  for (const r of byYearIdx.rows) console.log(`    ${r.y}: ${String(r.races).padStart(6)}`);

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
