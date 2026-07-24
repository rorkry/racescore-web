/**
 * corner_1..4 の意味と重複行の調査（読み取り専用）
 *
 * 実行: npx tsx --env-file=.env.local scripts/investigate-corner-and-dupes.ts
 *
 * 動機:
 *   1) 1レースあたり平均31.5行（中央値15・最大540）が観測された → (race_id, umaban) の重複を確認する
 *   2) 芝1600のサンプルで corner_1/corner_2 が空、corner_3/corner_4 に値があった
 *      → corner_* は「最後のN個のコーナー」を右詰めで格納している可能性が高い。
 *        v2 の「前半通過順位」は最初の有効コーナーを採らないと誤る。
 *
 * SELECT のみ。
 */
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

/** 全角数字対応（utils/parse-helpers.ts と同じ考え方） */
function toHalf(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}
function parseFinish(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  if (/[外止除取中失降競落再]/.test(s)) return null; // 中止・除外系は「欠損」扱い
  const n = parseInt(toHalf(s).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n >= 1 && n <= 30 ? n : null;
}

async function main() {
  console.log('='.repeat(92));
  console.log(' corner_1..4 の意味 / 重複行 調査');
  console.log('='.repeat(92));

  // ---------- 1. 重複 ----------
  console.log('\n[1] (race_id, umaban) の重複');
  const dup = await pool.query(
    `WITH d AS (
       SELECT race_id, umaban, COUNT(*) AS c
       FROM umadata GROUP BY race_id, umaban
     )
     SELECT COUNT(*) AS pairs,
            COUNT(*) FILTER (WHERE c = 1) AS unique_pairs,
            COUNT(*) FILTER (WHERE c > 1) AS dup_pairs,
            MAX(c) AS max_dup,
            SUM(c) AS total_rows
     FROM d`
  );
  console.log('  ', dup.rows[0]);

  const dupEx = await pool.query(
    `WITH d AS (
       SELECT race_id, umaban, COUNT(*) AS c FROM umadata GROUP BY race_id, umaban HAVING COUNT(*) > 1
     )
     SELECT race_id, umaban, c FROM d ORDER BY c DESC LIMIT 5`
  );
  if (dupEx.rows.length) {
    console.log('  重複が多い例:');
    for (const r of dupEx.rows) console.log(`    race=${r.race_id} umaban=${r.umaban} 行数=${r.c}`);
    // 中身が同一か差分か
    const e = dupEx.rows[0];
    const detail = await pool.query(
      `SELECT horse_name, finish_position, date, distance, place, finish_time, last_3f
       FROM umadata WHERE race_id=$1 AND umaban=$2 LIMIT 6`,
      [e.race_id, e.umaban]
    );
    console.log(`  ↑ race=${e.race_id} umaban=${e.umaban} の中身:`);
    for (const r of detail.rows) {
      console.log(
        `    馬名=${String(r.horse_name).padEnd(14)} 着順=${String(r.finish_position).padEnd(4)} date=${r.date} ${r.place} ${r.distance} time=${r.finish_time}`
      );
    }
  } else {
    console.log('  重複なし');
  }

  // ---------- 2. corner の埋まり方 × コース形状 ----------
  console.log('\n[2] corner_1..4 の埋まり方パターン（右詰めか確認）');
  const pat = await pool.query(
    `SELECT
       (CASE WHEN corner_1 ~ '^[0-9１-９]+$' THEN '1' ELSE '-' END) ||
       (CASE WHEN corner_2 ~ '^[0-9１-９]+$' THEN '2' ELSE '-' END) ||
       (CASE WHEN corner_3 ~ '^[0-9１-９]+$' THEN '3' ELSE '-' END) ||
       (CASE WHEN corner_4 ~ '^[0-9１-９]+$' THEN '4' ELSE '-' END) AS pattern,
       COUNT(*) AS c
     FROM umadata GROUP BY 1 ORDER BY c DESC LIMIT 12`
  );
  for (const r of pat.rows) {
    console.log(`  "${r.pattern}"  ${String(r.c).padStart(8)}`);
  }

  // ---------- 3. パターン × 距離 ----------
  console.log('\n[3] 埋まり方パターン × 距離（2角レースと4角レースの切り分け）');
  const patDist = await pool.query(
    `SELECT
       (CASE WHEN corner_1 ~ '^[0-9１-９]+$' THEN '1' ELSE '-' END) ||
       (CASE WHEN corner_2 ~ '^[0-9１-９]+$' THEN '2' ELSE '-' END) ||
       (CASE WHEN corner_3 ~ '^[0-9１-９]+$' THEN '3' ELSE '-' END) ||
       (CASE WHEN corner_4 ~ '^[0-9１-９]+$' THEN '4' ELSE '-' END) AS pattern,
       distance, COUNT(*) AS c
     FROM umadata
     WHERE distance IS NOT NULL AND distance <> ''
     GROUP BY 1,2 HAVING COUNT(*) > 2000 ORDER BY pattern, c DESC LIMIT 25`
  );
  for (const r of patDist.rows) {
    console.log(`  "${r.pattern}"  ${String(r.distance).padEnd(9)} ${String(r.c).padStart(7)}`);
  }

  // ---------- 4. 「最初の有効コーナー」と着順の関係 ----------
  console.log('\n[4] 最初の有効コーナー順位 vs 着順（前半位置取りの妥当性確認）');
  const sample = await pool.query(
    `SELECT race_id, umaban, finish_position, field_size, corner_1, corner_2, corner_3, corner_4, distance
     FROM umadata
     WHERE field_size ~ '^[0-9]+$'
     ORDER BY race_id DESC
     LIMIT 40000`
  );

  type Row = { first: number; last4: number; finish: number; fs: number };
  const rows: Row[] = [];
  for (const r of sample.rows) {
    const fs = parseInt(String(r.field_size), 10);
    const finish = parseFinish(r.finish_position);
    if (!Number.isFinite(fs) || fs < 5 || finish == null || finish > fs) continue;
    const cs = [r.corner_1, r.corner_2, r.corner_3, r.corner_4].map(parseFinish);
    const firstIdx = cs.findIndex((v) => v != null);
    if (firstIdx < 0) continue;
    const first = cs[firstIdx]!;
    const last4 = cs[3] ?? cs.filter((v) => v != null).pop()!;
    if (first > fs || last4 > fs) continue;
    rows.push({ first, last4, finish, fs });
  }
  console.log(`  有効サンプル: ${rows.length}`);

  if (rows.length > 200) {
    // frontRatio = 1 - (pos-1)/(fs-1) : 1に近い=前
    const fr = rows.map((r) => 1 - (r.first - 1) / Math.max(r.fs - 1, 1));
    const fr4 = rows.map((r) => 1 - (r.last4 - 1) / Math.max(r.fs - 1, 1));
    const finRatio = rows.map((r) => 1 - (r.finish - 1) / Math.max(r.fs - 1, 1));

    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const corr = (a: number[], b: number[]) => {
      const ma = mean(a), mb = mean(b);
      let n = 0, da = 0, db = 0;
      for (let i = 0; i < a.length; i++) {
        n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
      }
      return n / Math.sqrt(da * db);
    };
    console.log(`  corr(最初コーナーfrontRatio, ゴールfrontRatio) = ${corr(fr, finRatio).toFixed(4)}`);
    console.log(`  corr(4角frontRatio,          ゴールfrontRatio) = ${corr(fr4, finRatio).toFixed(4)}`);
    console.log('  → 4角の方が相関が高いのが自然（ゴールに近い）。前半位置取りは最初の有効コーナーを使う。');

    // 維持力の分布: retention = ゴールfrontRatio - 最初コーナーfrontRatio
    const ret = rows.map((_, i) => finRatio[i] - fr[i]);
    const s = [...ret].sort((a, b) => a - b);
    const q = (p: number) => s[Math.floor((s.length - 1) * p)];
    console.log(
      `  retention(ゴール - 最初コーナー): p05=${q(0.05).toFixed(3)} p25=${q(0.25).toFixed(3)} ` +
        `med=${q(0.5).toFixed(3)} p75=${q(0.75).toFixed(3)} p95=${q(0.95).toFixed(3)}`
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
