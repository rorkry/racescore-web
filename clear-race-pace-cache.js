const { Client } = require('pg');

(async () => {
  const client = new Client({ 
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:SZjMJzWJNbokVSqXmRHVRThSxqVDRjOz@junction.proxy.rlwy.net:10628/railway' 
  });

  try {
    await client.connect();
    
    // race_pace_cacheテーブルの全データを削除
    const result = await client.query('DELETE FROM race_pace_cache');
    console.log('✅ 展開予想キャッシュを削除しました:', result.rowCount, '件');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
})();
