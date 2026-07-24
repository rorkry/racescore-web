/**
 * Apply keiro migration and verify column.
 * Usage: npx tsx scripts/apply-keiro-migration.ts
 * Does NOT re-upload CSV.
 */
import { Pool } from 'pg';
import { readFileSync } from 'fs';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const before = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='umadata' AND column_name='keiro'`,
    );
    console.log('before keiro exists:', before.rows.length > 0);

    const sql = readFileSync('db/migrations/20260724_add_umadata_keiro.sql', 'utf8');
    console.log('Applying migration SQL...');
    await pool.query(sql);

    const col = await pool.query(
      `SELECT column_name, data_type, udt_name, is_nullable, character_maximum_length
       FROM information_schema.columns
       WHERE table_name='umadata' AND column_name='keiro'`,
    );
    console.log('keiro column meta:', col.rows);

    const cnt = await pool.query('SELECT COUNT(*)::int AS n FROM umadata');
    console.log('umadata rows:', cnt.rows[0].n);

    const sample = await pool.query(
      `SELECT id, race_id, horse_name, umaban, keiro
       FROM umadata ORDER BY id DESC LIMIT 5`,
    );
    console.log('sample after migration:', sample.rows);

    const nullCnt = await pool.query(
      `SELECT COUNT(*)::int AS n FROM umadata WHERE keiro IS NULL`,
    );
    console.log('keiro NULL rows:', nullCnt.rows[0].n);

    // sanity: other columns still present
    const cols = await pool.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name='umadata'`,
    );
    console.log('total umadata columns:', cols.rows[0].n);

    if (col.rows.length !== 1 || col.rows[0].data_type !== 'text') {
      console.error('MIGRATION_VERIFY_FAILED');
      process.exit(1);
    }
    console.log('MIGRATION_OK');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
