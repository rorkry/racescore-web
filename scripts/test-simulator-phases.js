/**
 * Phase 4.1 実データ検証スクリプト
 * 
 * ローカルまたはRailway環境で実行可能
 */

const { Pool } = require('pg');

// Railway環境のDATABASE_URLまたはローカルを使用
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/keiba';

async function testSimulatorPhases() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    console.log('========================================');
    console.log('Phase 4.1 実データ検証');
    console.log('========================================\n');
    
    // テスト対象レースを取得
    const db = await pool.connect();
    
    // 1. 少頭数レース（8頭以下）
    console.log('【1. 少頭数レース検索】');
    const smallRaces = await db.query(`
      SELECT year, date, place, race_number, COUNT(*) as horse_count
      FROM umadata
      WHERE year >= '2023'
      GROUP BY year, date, place, race_number
      HAVING COUNT(*) <= 8
      ORDER BY year DESC, date DESC
      LIMIT 1
    `);
    
    // 2. 多頭数レース（16頭以上）
    console.log('【2. 多頭数レース検索】');
    const largeRaces = await db.query(`
      SELECT year, date, place, race_number, COUNT(*) as horse_count
      FROM umadata
      WHERE year >= '2023'
      GROUP BY year, date, place, race_number
      HAVING COUNT(*) >= 16
      ORDER BY year DESC, date DESC
      LIMIT 1
    `);
    
    // 3. 中頭数レース（12頭前後）
    console.log('【3. 中頭数レース（逃げ・先行チェック用）検索】');
    const midRaces = await db.query(`
      SELECT year, date, place, race_number, COUNT(*) as horse_count
      FROM umadata
      WHERE year >= '2023'
      GROUP BY year, date, place, race_number
      HAVING COUNT(*) BETWEEN 11 AND 14
      ORDER BY year DESC, date DESC
      LIMIT 3
    `);
    
    db.release();
    
    const testRaces = [
      ...(smallRaces.rows.length > 0 ? [smallRaces.rows[0]] : []),
      ...(largeRaces.rows.length > 0 ? [largeRaces.rows[0]] : []),
      ...(midRaces.rows.slice(0, 3)),
    ].slice(0, 5);
    
    if (testRaces.length === 0) {
      console.error('テスト対象レースが見つかりませんでした');
      return;
    }
    
    console.log(`\n検証対象: ${testRaces.length}レース\n`);
    
    for (const race of testRaces) {
      const raceKey = `${race.year}${race.date}_${race.place}_${race.race_number.padStart(2, '0')}`;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`レース: ${raceKey} (${race.horse_count}頭)`);
      console.log('='.repeat(60));
      
      // Next.js APIを使わず、直接シミュレーションを実行
      // (実際にはNext.jsのモジュールをrequireする必要があるが、
      //  ここではAPIエンドポイント経由で呼び出すことを想定)
      
      console.log('→ APIエンドポイント /api/simulator/validate を使用してテストしてください');
      console.log(`   POST body: { "raceKeys": ["${raceKey}"] }\n`);
    }
    
    console.log('\n========================================');
    console.log('検証完了');
    console.log('========================================');
    
  } catch (error) {
    console.error('エラー:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testSimulatorPhases();
