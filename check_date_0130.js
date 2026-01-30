// データベースで1月30日・31日のデータを確認するスクリプト
const { Pool } = require('pg');

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    try {
        console.log('=== wakujunテーブル 1/30データ確認 ===\n');

        // 1. date列の一覧を確認
        const dates = await pool.query(`
      SELECT DISTINCT date, year, COUNT(*) as count
      FROM wakujun
      WHERE year = '2026' OR year = '2025'
      GROUP BY date, year
      ORDER BY year DESC, date DESC
      LIMIT 20
    `);
        console.log('【最新の日付一覧（2025-2026年）】');
        dates.rows.forEach(row => {
            console.log(`  ${row.year}年 ${row.date}: ${row.count}件`);
        });

        // 2. 0130のデータを確認
        console.log('\n【date="0130"のデータ確認】');
        const data0130 = await pool.query(`
      SELECT DISTINCT date, year, place, COUNT(*) as count
      FROM wakujun
      WHERE date = '0130'
      GROUP BY date, year, place
      ORDER BY year DESC
    `);
        if (data0130.rows.length === 0) {
            console.log('  ❌ date="0130"のデータが見つかりません');
        } else {
            data0130.rows.forEach(row => {
                console.log(`  ${row.year}年/date=${row.date}: ${row.place} - ${row.count}件`);
            });
        }

        // 3. 1月の全データを確認
        console.log('\n【date="01XX"（1月）のデータ確認】');
        const jan = await pool.query(`
      SELECT DISTINCT date, year, COUNT(*) as count
      FROM wakujun
      WHERE date LIKE '01%' AND year IN ('2025', '2026')
      GROUP BY date, year
      ORDER BY year DESC, date DESC
    `);
        if (jan.rows.length === 0) {
            console.log('  ❌ 1月のデータが見つかりません');
        } else {
            jan.rows.forEach(row => {
                console.log(`  ${row.year}年/${row.date}: ${row.count}件`);
            });
        }

        // 4. year列の型と値を確認
        console.log('\n【year列の型と値確認】');
        const years = await pool.query(`
      SELECT DISTINCT year, pg_typeof(year) as type
      FROM wakujun
      WHERE year IS NOT NULL
      ORDER BY year DESC
      LIMIT 10
    `);
        years.rows.forEach(row => {
            console.log(`  year="${row.year}" (type: ${row.type})`);
        });

        // 5. 最新のデータを確認
        console.log('\n【最新10件のレコード確認】');
        const latest = await pool.query(`
      SELECT year, date, place, race_number, umamei
      FROM wakujun
      ORDER BY year DESC, date DESC
      LIMIT 10
    `);
        latest.rows.forEach(row => {
            console.log(`  ${row.year}/${row.date} ${row.place}${row.race_number}R: ${row.umamei}`);
        });

    } catch (error) {
        console.error('エラー:', error.message);
    } finally {
        await pool.end();
    }
}

main();
