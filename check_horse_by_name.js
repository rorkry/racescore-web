// 馬名で馬データを検索するテスト
const Database = require('better-sqlite3');

const db = new Database('races.db', { readonly: true });

// 引数から馬名を取得（デフォルトはテスト用）
const horseName = process.argv[2] || 'ドウデュース';

console.log(`\n=== 馬名「${horseName}」のデータ検索 ===\n`);

// umadata テーブルから馬名で検索
const results = db.prepare(`
  SELECT 
    horse_name, date, place, class_name, distance, 
    finish_position, popularity, jockey, horse_weight,
    finish_time, margin
  FROM umadata 
  WHERE horse_name = ? 
  ORDER BY date DESC
  LIMIT 20
`).all(horseName);

if (results.length === 0) {
  console.log(`❌ 馬名「${horseName}」のデータは見つかりませんでした。`);
  
  // 部分一致で検索してみる
  const partialResults = db.prepare(`
    SELECT DISTINCT horse_name 
    FROM umadata 
    WHERE horse_name LIKE ? 
    LIMIT 10
  `).all(`%${horseName}%`);
  
  if (partialResults.length > 0) {
    console.log(`\n💡 部分一致で見つかった馬名:`);
    partialResults.forEach(r => console.log(`  - ${r.horse_name}`));
  }
} else {
  console.log(`✅ ${results.length}件の過去走データが見つかりました\n`);
  
  results.forEach((r, i) => {
    console.log(`【${i + 1}】 ${r.date} ${r.place} ${r.class_name}`);
    console.log(`    距離: ${r.distance}m | 着順: ${r.finish_position}着 | 人気: ${r.popularity}番人気`);
    console.log(`    騎手: ${r.jockey} | 馬体重: ${r.horse_weight}kg`);
    console.log(`    タイム: ${r.finish_time} | 着差: ${r.margin}`);
    console.log('');
  });
}

// umadataテーブルの総馬数と総レコード数を確認
const stats = db.prepare(`
  SELECT 
    COUNT(*) as total_records,
    COUNT(DISTINCT horse_name) as unique_horses
  FROM umadata
`).get();

console.log(`\n=== データベース統計 ===`);
console.log(`総レコード数: ${stats.total_records.toLocaleString()}件`);
console.log(`ユニーク馬数: ${stats.unique_horses.toLocaleString()}頭`);

db.close();
