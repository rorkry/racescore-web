const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = await pool.connect();
  
  try {
    // 1. 少頭数レース（8頭以下）
    console.log('=== 少頭数レース（8頭以下）===');
    const smallField = await db.query(`
      SELECT year, date, place, race_number, COUNT(*) as horse_count
      FROM umadata
      WHERE year = '2023'
      GROUP BY year, date, place, race_number
      HAVING COUNT(*) <= 8
      ORDER BY horse_count
      LIMIT 5
    `);
    smallField.rows.forEach(r => console.log(`${r.year}${r.date}_${r.place}_${r.race_number.padStart(2, '0')} : ${r.horse_count}頭`));
    
    // 2. 多頭数レース（16頭以上）
    console.log('\n=== 多頭数レース（16頭以上）===');
    const largeField = await db.query(`
      SELECT year, date, place, race_number, COUNT(*) as horse_count
      FROM umadata
      WHERE year = '2023'
      GROUP BY year, date, place, race_number
      HAVING COUNT(*) >= 16
      ORDER BY horse_count DESC
      LIMIT 5
    `);
    largeField.rows.forEach(r => console.log(`${r.year}${r.date}_${r.place}_${r.race_number.padStart(2, '0')} : ${r.horse_count}頭`));
    
    // 3. 中頭数レース（12頭前後）
    console.log('\n=== 中頭数レース（12頭前後）===');
    const midField = await db.query(`
      SELECT year, date, place, race_number, COUNT(*) as horse_count
      FROM umadata
      WHERE year = '2023'
      GROUP BY year, date, place, race_number
      HAVING COUNT(*) BETWEEN 11 AND 13
      LIMIT 5
    `);
    midField.rows.forEach(r => console.log(`${r.year}${r.date}_${r.place}_${r.race_number.padStart(2, '0')} : ${r.horse_count}頭`));
  } finally {
    db.release();
    await pool.end();
  }
})();
