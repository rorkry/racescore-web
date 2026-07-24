/**
 * umadata / indices の全カラム一覧（読み取り専用・v2 sample-builder 設計用）
 * 実行: npx tsx --env-file=.env.local scripts/investigate-columns.ts
 */
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

async function main() {
  for (const t of ['umadata', 'indices', 'wakujun']) {
    const r = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = $1 ORDER BY ordinal_position`,
      [t]
    );
    console.log(`\n=== ${t} (${r.rowCount} 列) ===`);
    console.log(r.rows.map((x) => `${x.column_name}:${x.data_type}`).join(', '));
  }

  // 1レース分のサンプル（枠番の有無を確認）
  const s = await pool.query(
    `SELECT * FROM umadata WHERE race_id = '2019010508010111' ORDER BY umaban::int LIMIT 2`
  );
  console.log('\n=== umadata 1行の中身 ===');
  for (const [k, v] of Object.entries(s.rows[0] ?? {})) {
    console.log(`  ${k.padEnd(22)} = ${JSON.stringify(v)}`);
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error(e?.message ?? e);
  try { await pool.end(); } catch { /* noop */ }
  process.exit(1);
});
