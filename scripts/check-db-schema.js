/**
 * DBスキーマ確認スクリプト
 */

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL環境変数を設定してください');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  try {
    // umadataのカラムを取得
    const umadata = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'umadata' 
      ORDER BY ordinal_position
    `);
    console.log('=== umadata columns ===');
    for (const row of umadata.rows) {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    }
    
    // indicesのカラムを取得
    const indices = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'indices' 
      ORDER BY ordinal_position
    `);
    console.log('\n=== indices columns ===');
    for (const row of indices.rows) {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    }
    
    // race_levelテーブルがあるか確認
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('\n=== tables ===');
    console.log(tables.rows.map(r => r.table_name).join(', '));
    
    // サンプルデータ
    console.log('\n=== sample umadata (with lap) ===');
    const sample = await client.query(`
      SELECT race_id, horse_name, finish_position, margin, lap_time, winning_time, popularity, tansho_payout, win_odds
      FROM umadata 
      WHERE lap_time IS NOT NULL AND lap_time != '' 
      LIMIT 3
    `);
    console.log(JSON.stringify(sample.rows, null, 2));
    
    // indicesサンプル
    console.log('\n=== sample indices ===');
    const indicesSample = await client.query(`
      SELECT * FROM indices LIMIT 3
    `);
    console.log(JSON.stringify(indicesSample.rows, null, 2));
    
    // データ件数
    console.log('\n=== data counts ===');
    const umadataCount = await client.query('SELECT COUNT(*) FROM umadata');
    const indicesCount = await client.query('SELECT COUNT(*) FROM indices');
    console.log(`umadata: ${umadataCount.rows[0].count} rows`);
    console.log(`indices: ${indicesCount.rows[0].count} rows`);
    
    // 単勝配当カラムの確認
    console.log('\n=== 単勝配当データの確認 ===');
    const payoutCheck = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(tansho_payout) as with_tansho,
        COUNT(win_odds) as with_odds
      FROM umadata
    `);
    console.log(JSON.stringify(payoutCheck.rows[0], null, 2));
    
  } finally {
    await client.end();
  }
}

main().catch(console.error);
