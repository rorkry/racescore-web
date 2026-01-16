// predictionsテーブルに配当カラムを追加するスクリプト
const Database = require('better-sqlite3');
const db = new Database('races.db');

console.log('=== 配当カラム追加 ===\n');

try {
  // 既存のカラムをチェック
  const columns = db.prepare("PRAGMA table_info(predictions)").all();
  const columnNames = columns.map(c => c.name);

  if (!columnNames.includes('tansho_payout')) {
    db.exec('ALTER TABLE predictions ADD COLUMN tansho_payout INTEGER');
    console.log('✅ tansho_payout カラム追加');
  } else {
    console.log('ℹ️ tansho_payout カラムは既に存在');
  }

  if (!columnNames.includes('fukusho_payout')) {
    db.exec('ALTER TABLE predictions ADD COLUMN fukusho_payout INTEGER');
    console.log('✅ fukusho_payout カラム追加');
  } else {
    console.log('ℹ️ fukusho_payout カラムは既に存在');
  }

  console.log('\n🎉 完了！');
} catch (err) {
  console.error('❌ エラー:', err.message);
}

db.close();
