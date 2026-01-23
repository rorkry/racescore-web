/**
 * DBカラム確認スクリプト
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
    // umadataテーブルのカラム
    console.log('=== umadata テーブルのカラム ===\n');
    const umadata = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'umadata' 
      ORDER BY ordinal_position
    `);
    
    for (const col of umadata.rows) {
      console.log(`${col.column_name} (${col.data_type})`);
    }
    
    console.log(`\n合計: ${umadata.rows.length}カラム`);
    
    // indicesテーブルのカラム
    console.log('\n=== indices テーブルのカラム ===\n');
    const indices = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'indices' 
      ORDER BY ordinal_position
    `);
    
    for (const col of indices.rows) {
      console.log(`${col.column_name} (${col.data_type})`);
    }
    
    console.log(`\n合計: ${indices.rows.length}カラム`);
    
    // サンプルデータ
    console.log('\n=== umadata サンプル（1行目） ===\n');
    const sample = await client.query('SELECT * FROM umadata LIMIT 1');
    if (sample.rows.length > 0) {
      for (const [key, value] of Object.entries(sample.rows[0])) {
        const displayValue = value === null ? 'NULL' : 
                            value === '' ? '(空文字)' : 
                            String(value).substring(0, 50);
        console.log(`${key}: ${displayValue}`);
      }
    }
    
  } finally {
    await client.end();
  }
}

main().catch(console.error);
