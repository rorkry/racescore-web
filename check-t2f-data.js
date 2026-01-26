const { Client } = require('pg');

(async () => {
  const client = new Client({ 
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:SZjMJzWJNbokVSqXmRHVRThSxqVDRjOz@junction.proxy.rlwy.net:10628/railway' 
  });

  try {
    await client.connect();
    
    // 1. ゴールドダイアーの過去走データを確認
    const umadata = await client.query(`
      SELECT race_id, umaban, horse_name, date, distance, corner_1, corner_2
      FROM umadata 
      WHERE horse_name = 'ゴールドダイアー'
      ORDER BY race_id DESC
      LIMIT 5
    `);
    console.log('=== ゴールドダイアー umadata ===');
    console.table(umadata.rows);
    
    // 2. 最新のrace_idでindicesを確認
    if (umadata.rows.length > 0) {
      const latestRaceId = umadata.rows[0].race_id;
      const horseNum = (umadata.rows[0].umaban || '00').toString().padStart(2, '0');
      const fullRaceId = latestRaceId + horseNum;
      
      console.log('\n=== indices検索 ===');
      console.log('検索ID:', fullRaceId);
      
      const indices = await client.query('SELECT race_id, "T2F", "L4F", potential, makikaeshi FROM indices WHERE race_id = $1', [fullRaceId]);
      console.log('indices結果:');
      console.table(indices.rows);
      
      // 部分一致でも確認
      const indicesPartial = await client.query('SELECT race_id, "T2F", "L4F" FROM indices WHERE race_id LIKE $1 LIMIT 5', [latestRaceId + '%']);
      console.log('\nrace_id前方一致:');
      console.table(indicesPartial.rows);
    }
    
    // 3. indicesテーブルのサンプルデータ
    const sampleIndices = await client.query('SELECT race_id, "T2F", "L4F" FROM indices WHERE "T2F" > 0 LIMIT 5');
    console.log('\n=== indicesサンプル（T2F > 0）===');
    console.table(sampleIndices.rows);
    
    // 4. indicesテーブルの総レコード数
    const countResult = await client.query('SELECT COUNT(*) as total, COUNT(CASE WHEN "T2F" > 0 THEN 1 END) as with_t2f FROM indices');
    console.log('\n=== indicesテーブル統計 ===');
    console.table(countResult.rows);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
})();
