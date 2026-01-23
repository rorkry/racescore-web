/**
 * win_oddsカラムの状態確認＆更新スクリプト
 * 
 * 1. DBにwin_oddsカラムが存在するか確認
 * 2. 値が入っているか確認
 * 3. CSVから更新（必要な場合）
 * 
 * 使い方:
 * $env:DATABASE_URL = "postgresql://..."
 * node scripts/check-and-update-odds.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL環境変数を設定してください');
  process.exit(1);
}

async function main() {
  console.log('=== win_odds カラム確認 ===\n');
  
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  try {
    // 1. カラム存在確認
    console.log('1. カラム存在確認...');
    const columns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'umadata' 
      AND column_name IN ('win_odds', 'win_payout', 'place_odds_low', 'place_odds_high')
      ORDER BY column_name
    `);
    
    console.log('   オッズ関連カラム:');
    for (const col of columns.rows) {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    }
    
    if (columns.rows.length === 0) {
      console.log('   ❌ オッズ関連カラムが存在しません');
      console.log('\n   カラムを追加する必要があります:');
      console.log('   ALTER TABLE umadata ADD COLUMN win_odds TEXT;');
      console.log('   ALTER TABLE umadata ADD COLUMN win_payout TEXT;');
      
      // カラム追加
      console.log('\n2. カラムを追加中...');
      await client.query('ALTER TABLE umadata ADD COLUMN IF NOT EXISTS win_odds TEXT');
      await client.query('ALTER TABLE umadata ADD COLUMN IF NOT EXISTS win_payout TEXT');
      console.log('   ✅ カラム追加完了');
    }
    
    // 2. データ確認
    console.log('\n3. データ確認...');
    const stats = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(win_odds) as has_odds,
        COUNT(NULLIF(win_odds, '')) as has_odds_value,
        COUNT(win_payout) as has_payout,
        COUNT(NULLIF(win_payout, '')) as has_payout_value
      FROM umadata
    `);
    
    const s = stats.rows[0];
    console.log(`   総レコード数: ${s.total}`);
    console.log(`   win_odds あり: ${s.has_odds_value} (${((s.has_odds_value / s.total) * 100).toFixed(1)}%)`);
    console.log(`   win_payout あり: ${s.has_payout_value} (${((s.has_payout_value / s.total) * 100).toFixed(1)}%)`);
    
    // 3. サンプル確認
    console.log('\n4. サンプルデータ...');
    const sample = await client.query(`
      SELECT race_id, horse_name, popularity, finish_position, win_odds, win_payout
      FROM umadata
      WHERE win_odds IS NOT NULL AND win_odds != ''
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
      LIMIT 5
    `);
    
    if (sample.rows.length > 0) {
      console.log('   オッズが入っているデータ例:');
      for (const row of sample.rows) {
        console.log(`   ${row.horse_name}: オッズ=${row.win_odds}, 配当=${row.win_payout}, 人気=${row.popularity}, 着順=${row.finish_position}`);
      }
    } else {
      console.log('   ⚠️ オッズデータが入っているレコードがありません');
    }
    
    // 4. 結論
    console.log('\n=== 結論 ===');
    if (parseInt(s.has_odds_value) > 0) {
      console.log('✅ win_oddsにデータが存在します');
      console.log('   検証スクリプトを再実行してください');
    } else {
      console.log('⚠️ win_oddsにデータがありません');
      console.log('   umadata.csvを再アップロードするか、CSVからオッズを更新する必要があります');
      console.log('\n   方法1: 管理画面からumadata.csvを再アップロード');
      console.log('   方法2: UPDATE文でCSVからオッズを更新（別スクリプト必要）');
    }
    
  } finally {
    await client.end();
  }
}

main().catch(console.error);
