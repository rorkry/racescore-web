require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkIndicesColumns() {
  try {
    const res = await pool.query('SELECT * FROM indices LIMIT 1');
    
    if (res.rows.length > 0) {
      console.log('✅ indicesテーブルのカラム一覧:');
      console.log(Object.keys(res.rows[0]).join(', '));
      console.log('\n📊 サンプルデータ:');
      console.log(JSON.stringify(res.rows[0], null, 2));
    } else {
      console.log('⚠️ indicesテーブルにデータがありません');
    }
    
    await pool.end();
  } catch (err) {
    console.error('❌ エラー:', err.message);
    await pool.end();
  }
}

checkIndicesColumns();
