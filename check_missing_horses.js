// 馬が表示されない問題のデバッグスクリプト
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'keiba.db');
const db = new Database(dbPath);

// 最新のレース日付を取得
const latestRaces = db.prepare(`
  SELECT DISTINCT date, place, race_number 
  FROM wakujun 
  ORDER BY date DESC 
  LIMIT 10
`).all();

console.log('=== 最新のレース一覧 ===');
latestRaces.forEach(r => {
  console.log(`${r.date} ${r.place} ${r.race_number}R`);
});

// 最新のレースを選択
const targetRace = latestRaces[0];
console.log(`\n=== 対象レース: ${targetRace.date} ${targetRace.place} ${targetRace.race_number}R ===`);

// wakujunテーブルから全出走馬を取得
const horses = db.prepare(`
  SELECT umaban, waku, umamei, kishu 
  FROM wakujun 
  WHERE date = ? AND place = ? AND race_number = ?
  ORDER BY CAST(umaban AS INTEGER)
`).all(targetRace.date, targetRace.place, targetRace.race_number);

console.log(`\nwakujunテーブルの馬数: ${horses.length}頭`);
console.log('\n馬番 | 枠 | 馬名 | 騎手');
console.log('-----|-----|------|------');
horses.forEach(h => {
  console.log(`${h.umaban.padStart(4)} | ${h.waku.padStart(3)} | ${(h.umamei || '').trim()} | ${(h.kishu || '').trim()}`);
});

// 各馬のumadataの有無を確認
console.log('\n=== 各馬のumadataデータ確認 ===');
horses.forEach(horse => {
  const horseName = (horse.umamei || '').trim();
  const umadataCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM umadata WHERE TRIM(horse_name) = ?
  `).get(horseName);
  
  console.log(`${horse.umaban}: ${horseName} - umadata: ${umadataCount.cnt}件`);
});

// tosu（頭数）を確認
const raceInfo = db.prepare(`
  SELECT tosu FROM wakujun WHERE date = ? AND place = ? AND race_number = ? LIMIT 1
`).get(targetRace.date, targetRace.place, targetRace.race_number);

console.log(`\n登録頭数(tosu): ${raceInfo?.tosu || 'N/A'}頭`);

db.close();
