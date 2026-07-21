/**
 * rule_candidates テーブル作成（シンプル版）
 */

import pg from 'pg';
const { Pool } = pg;

async function migrate() {
  // 環境変数から直接取得
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL or POSTGRES_URL not found');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    console.log('Creating rule_candidates table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rule_candidates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        conditions JSONB NOT NULL,
        statistics JSONB NOT NULL,
        confidence JSONB NOT NULL,
        validation_results JSONB NOT NULL DEFAULT '[]'::jsonb,
        ai_reasoning JSONB NOT NULL,
        status TEXT DEFAULT 'pending',
        reviewed_at TIMESTAMP,
        research_session_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Table created');

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rule_candidates_user_id ON rule_candidates(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rule_candidates_status ON rule_candidates(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rule_candidates_session ON rule_candidates(research_session_id)`);

    console.log('✅ Indexes created');

    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'rule_candidates'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
