import { Pool } from 'pg';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='umadata' ORDER BY ordinal_position`
    );
    console.log('umadata columns:', cols.rows.map((r) => r.column_name).join(', '));
    const cnt = await pool.query('SELECT COUNT(*)::int AS n FROM umadata');
    console.log('umadata rows:', cnt.rows[0].n);
    // search any color-like column
    const colorish = cols.rows.filter((r) =>
      /keiro|coat|hair|color|毛/i.test(r.column_name)
    );
    console.log('color-like columns:', colorish);
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
