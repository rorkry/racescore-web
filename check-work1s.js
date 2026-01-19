const Database = require('better-sqlite3');
const db = new Database('races.db');

// work_1s カラムにラップデータが入っているか確認
const rows = db.prepare(`
  SELECT work_1s, horse_name, date, place 
  FROM umadata 
  WHERE work_1s IS NOT NULL AND work_1s != '' 
  LIMIT 10
`).all();

console.log('work_1s samples:');
console.log(rows);

// カラム一覧も確認
const columns = db.prepare("PRAGMA table_info(umadata)").all();
console.log('\numadata columns:');
columns.forEach(c => console.log(`  ${c.cid}: ${c.name}`));
