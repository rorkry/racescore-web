/**
 * rule_candidates テーブル作成スクリプト
 * 
 * 使用方法:
 * npx tsx scripts/create-rule-candidates-table.ts
 */

import { Pool } from 'pg';

async function createTable() {
  // 環境変数を直接使用（Next.jsプロジェクトでは.env.localが自動読み込み）
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or POSTGRES_URL environment variable is not set');
  }
  
  const pool = new Pool({
    connectionString: databaseUrl
  });

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
        
        -- AIの推論（トレーサビリティ）
        ai_reasoning JSONB NOT NULL,
        -- {
        --   hypothesis: "...",
        --   expected_outcome: "...",
        --   reasoning: "...",
        --   interpretation: {...},
        --   generated_at: "...",
        --   model: "gpt-4o-mini"
        -- }
        
        status TEXT DEFAULT 'pending',
        reviewed_at TIMESTAMP,
        research_session_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Table created successfully');

    // インデックス作成
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_rule_candidates_user_id ON rule_candidates(user_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_rule_candidates_status ON rule_candidates(status);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_rule_candidates_session ON rule_candidates(research_session_id);
    `);

    console.log('✅ Indexes created successfully');

    // テーブル情報を表示
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'rule_candidates'
      ORDER BY ordinal_position
    `);

    console.log('\nTable structure:');
    console.table(result.rows);
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createTable().catch(console.error);
