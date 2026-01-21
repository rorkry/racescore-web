const { getDb } = require('./lib/db');
const db = getDb();

const horseName = process.argv[2] || 'ジーネキング';

const rows = db.prepare(`
  SELECT date, place, distance, finish_position, lap_time 
  FROM umadata 
  WHERE horse_name = $1
  ORDER BY date DESC 
  LIMIT 10
`).all(horseName);

console.log(`\n=== ${horseName} の過去走 ===`);
rows.forEach((r, i) => {
  console.log(`${i+1}. ${r.date} ${r.place} ${r.distance} 着順:${r.finish_position} ラップ:${r.lap_time || 'なし'}`);
});
