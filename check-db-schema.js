const Database = require('better-sqlite3');
const db = new Database('./races.db', { readonly: true });

console.log('=== umadata columns ===');
const cols = db.prepare("PRAGMA table_info(umadata)").all();
cols.forEach(c => console.log(c.name + ' (' + c.type + ')'));

console.log('\n=== Sample race data with time ===');
const sample = db.prepare(`
  SELECT date, place, distance, class_name, 
         finish_time, track_condition, finish_position, horse_name, age
  FROM umadata 
  WHERE finish_time IS NOT NULL AND finish_time != '' 
  LIMIT 5
`).all();
console.log(JSON.stringify(sample, null, 2));

console.log('\n=== Class names sample ===');
const classes = db.prepare(`
  SELECT DISTINCT class_name 
  FROM umadata 
  WHERE class_name IS NOT NULL AND class_name != ''
  LIMIT 30
`).all();
console.log(classes.map(c => c.class_name).join('\n'));

console.log('\n=== Sample races on same day/course (winning times) ===');
const sameDay = db.prepare(`
  SELECT date, place, distance, class_name, finish_time, track_condition, finish_position, horse_name, age
  FROM umadata
  WHERE date LIKE '2025%' AND place LIKE '%東京%' AND distance LIKE '%1600%' AND finish_position = '1'
  ORDER BY date DESC, class_name
  LIMIT 15
`).all();
console.log(JSON.stringify(sameDay, null, 2));

console.log('\n=== Distance format sample ===');
const distSample = db.prepare(`
  SELECT DISTINCT distance FROM umadata WHERE distance IS NOT NULL LIMIT 10
`).all();
console.log(distSample.map(d => d.distance).join(', '));

console.log('\n=== Finish position format (winners) ===');
const winners = db.prepare(`
  SELECT DISTINCT finish_position 
  FROM umadata 
  WHERE finish_position IN ('1', '１', '01', '１位')
  LIMIT 5
`).all();
console.log('Winners finish_position values:', winners);

console.log('\n=== Sample winning race data ===');
const winnerSample = db.prepare(`
  SELECT date, place, distance, class_name, finish_time, track_condition, horse_name, finish_position
  FROM umadata
  WHERE finish_position = '１' OR finish_position = '1'
  ORDER BY date DESC
  LIMIT 5
`).all();
console.log(JSON.stringify(winnerSample, null, 2));

console.log('\n=== Time comparison test (京都 ダ1800 2026.1.5) ===');
const testDates = ['2026. 1. 4', '2026. 1. 5', '2026. 1. 6', '2026.01.04', '2026.01.05', '2026.01.06'];
console.log('Testing dates:', testDates);
const timeCompTest = db.prepare(`
  SELECT date, place, distance, class_name, finish_time, track_condition, horse_name
  FROM umadata
  WHERE date IN (?, ?, ?, ?, ?, ?)
    AND place LIKE '%京都%'
    AND distance = 'ダ1800'
    AND finish_position = '１'
  ORDER BY date DESC
`).all(...testDates);
console.log(`Found ${timeCompTest.length} races:`, JSON.stringify(timeCompTest, null, 2));

db.close();

