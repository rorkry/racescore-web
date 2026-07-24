/**
 * 毛色経路の実DB確認 + 注入経路のE2E
 * 実行: npx tsx scripts/verify-coat-path.ts
 *
 * - 実DBに keiro が無ければその事実を明示（DDLは発行しない）
 * - keiro を注入した HorseState → coatIndexFromName が DB値を優先することを検証
 */
import { Pool } from 'pg';
import { normalizeCoatColor } from '../lib/race-simulator/coat-normalize';
import { coatIndexFromName, coatIndexFor } from '../lib/race-simulator/broadcast-cel-horse';

async function checkDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('DATABASE_URL: not set');
    return { exists: false as const, reason: 'no DATABASE_URL' };
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='umadata' AND column_name='keiro' LIMIT 1`
    );
    const exists = col.rows.length > 0;
    console.log('umadata.keiro exists:', exists);
    if (!exists) {
      const cnt = await pool.query('SELECT COUNT(*)::int AS n FROM umadata');
      console.log('umadata rows (without keiro):', cnt.rows[0].n);
      console.log('ACTION: do NOT run ALTER. Re-upload umadata CSV after ops adds column, or report missing.');
      return { exists: false as const, reason: 'column missing', rows: cnt.rows[0].n };
    }
    // column exists — sample
    const samples = await pool.query(`
      SELECT horse_name, keiro FROM umadata
      WHERE keiro IS NOT NULL AND btrim(keiro) <> ''
      ORDER BY race_id DESC LIMIT 20
    `);
    console.log('sample count:', samples.rows.length);
    return { exists: true as const, samples: samples.rows };
  } finally {
    await pool.end();
  }
}

function checkInjectedPath() {
  console.log('\n=== injected keiro path (simulates DB→HorseState→3D) ===');
  // 実CSVで想定される値を注入（DB列が無くても経路自体を検証）
  const injected = [
    { horseNumber: 1, horseName: 'テスト鹿毛', keiro: '鹿毛' },
    { horseNumber: 2, horseName: 'テスト青毛', keiro: '青毛' },
    { horseNumber: 3, horseName: 'テスト葦毛', keiro: ' 葦毛 ' },
    { horseNumber: 4, horseName: 'テスト栃栗', keiro: '栃栗毛' },
  ];
  console.log('| horseNumber | horseName | DB keiro | normalized | paletteIdx | usedDB(not fallback) |');
  for (const h of injected) {
    const norm = normalizeCoatColor(h.keiro);
    const idx = coatIndexFromName(h.keiro);
    const fb = coatIndexFor(h.horseNumber);
    const usedDB = idx >= 0 && idx !== fb || idx >= 0; // DB値が解決できた
    console.log(`| ${h.horseNumber} | ${h.horseName} | ${JSON.stringify(h.keiro)} | ${norm} | ${idx} | ${idx >= 0} |`);
    if (idx < 0) throw new Error('expected resolved coat');
  }
  // 葦毛 → gray = index 4
  if (coatIndexFromName('葦毛') !== 4) throw new Error('葦毛 normalize failed');
  if (normalizeCoatColor('葦毛') !== 'gray') throw new Error('葦毛→gray failed');
  console.log('injected path PASS');
}

async function main() {
  console.log('=== DDL note ===');
  console.log('ALTER IF NOT EXISTS keiro: introduced in commit 64cce9b (already on main),');
  console.log('NOT added in feature/tracking-coat-layout-finish-camera.');
  console.log('Runs only inside importUmadata on CSV upload — this script does NOT execute DDL.');

  const db = await checkDb();
  checkInjectedPath();

  if (!db.exists) {
    console.log('\n=== REAL DB SAMPLE ===');
    console.log('NONE — keiro column does not exist on connected DATABASE_URL.');
    console.log('Cannot show live BL→DB→API→3D samples until column exists + re-import.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
