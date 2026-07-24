/**
 * Count keiro coverage and find diverse races.
 * Usage: npx tsx scripts/check-keiro-coverage.ts
 */
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const filled = await pool.query(
      `SELECT COUNT(*)::int AS n FROM umadata
       WHERE keiro IS NOT NULL AND btrim(keiro) <> ''`,
    );
    const total = await pool.query(`SELECT COUNT(*)::int AS n FROM umadata`);
    const distinct = await pool.query(
      `SELECT keiro, COUNT(*)::int AS n FROM umadata
       WHERE keiro IS NOT NULL AND btrim(keiro) <> ''
       GROUP BY keiro ORDER BY n DESC`,
    );
    console.log('total', total.rows[0].n, 'filled', filled.rows[0].n);
    console.log('distinct keiro:', distinct.rows);

    const races = await pool.query(
      `SELECT race_id, COUNT(*)::int AS n, COUNT(DISTINCT btrim(keiro))::int AS coats
       FROM umadata
       WHERE keiro IS NOT NULL AND btrim(keiro) <> ''
       GROUP BY race_id
       HAVING COUNT(DISTINCT btrim(keiro)) >= 3 AND COUNT(*) >= 8
       ORDER BY coats DESC, n DESC
       LIMIT 8`,
    );
    console.log('diverse races:', races.rows);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
