/**
 * Check race_id format and matching
 */

const Database = require('better-sqlite3');
const db = new Database('./race-data.db');

console.log('============================================================');
console.log('Race ID Format Check - 20251228');
console.log('============================================================\n');

// 1. Check indices table for 20251228
console.log('1. Checking indices table for 20251228...\n');
const indicesRows = db.prepare(`
  SELECT race_id, T2F, revouma, potential, makikaeshi, L4F, cushion
  FROM indices 
  WHERE race_id LIKE '20251228%'
  LIMIT 10
`).all();

console.log(`Found ${indicesRows.length} records in indices table`);
if (indicesRows.length > 0) {
  console.log('Sample records:');
  indicesRows.slice(0, 3).forEach(row => {
    console.log(`  race_id: ${row.race_id}`);
    console.log(`    T2F: ${row.T2F}, revouma: ${row.revouma}, potential: ${row.potential}`);
  });
} else {
  console.log('❌ NO DATA FOUND in indices table for 20251228');
}

// 2. Check wakujun table for 20251228
console.log('\n2. Checking wakujun table for 1228 (date field)...\n');
const wakujunRows = db.prepare(`
  SELECT date, place, race_number, umaban, umamei, year
  FROM wakujun 
  WHERE date = '1228' AND year = 2025
  LIMIT 10
`).all();

console.log(`Found ${wakujunRows.length} records in wakujun table`);
if (wakujunRows.length > 0) {
  console.log('Sample records:');
  wakujunRows.slice(0, 3).forEach(row => {
    console.log(`  date: ${row.date}, place: ${row.place}, race: ${row.race_number}, umaban: ${row.umaban}, year: ${row.year}`);
    console.log(`    umamei: ${row.umamei}`);
  });
} else {
  console.log('❌ NO DATA FOUND in wakujun table for 1228');
}

// 3. Check umadata table for 20251228
console.log('\n3. Checking umadata table for 20251228...\n');
const umadataRows = db.prepare(`
  SELECT race_id_new_no_horse_num, year, 馬名, T2F
  FROM umadata 
  WHERE race_id_new_no_horse_num LIKE '20251228%'
  LIMIT 10
`).all();

console.log(`Found ${umadataRows.length} records in umadata table`);
if (umadataRows.length > 0) {
  console.log('Sample records:');
  umadataRows.slice(0, 3).forEach(row => {
    console.log(`  race_id: ${row.race_id_new_no_horse_num}, year: ${row.year}`);
    console.log(`    馬名: ${row.馬名}, T2F: ${row.T2F}`);
  });
} else {
  console.log('❌ NO DATA FOUND in umadata table for 20251228');
}

// 4. Compare race_id formats
console.log('\n4. Analyzing race_id format...\n');

if (indicesRows.length > 0) {
  const sampleRaceId = indicesRows[0].race_id;
  console.log(`Sample race_id from indices: ${sampleRaceId}`);
  console.log(`Length: ${sampleRaceId.length}`);
  console.log(`Format breakdown:`);
  console.log(`  YYYYMMDD: ${sampleRaceId.substring(0, 8)}`);
  console.log(`  場所コード: ${sampleRaceId.substring(8, 10)}`);
  console.log(`  レース番号: ${sampleRaceId.substring(10, 12)}`);
  console.log(`  馬番: ${sampleRaceId.substring(12, 14)}`);
}

// 5. Check if generateIndexRaceId logic matches
console.log('\n5. Testing generateIndexRaceId logic...\n');

function testGenerateIndexRaceId(year, date, place, raceNumber, umaban) {
  // 場所コードマッピング
  const placeCodeMap = {
    '札幌': '01',
    '函館': '02',
    '福島': '03',
    '新潟': '04',
    '東京': '05',
    '中山': '06',
    '中京': '07',
    '京都': '08',
    '阪神': '09',
    '小倉': '10',
  };

  const placeCode = placeCodeMap[place] || '00';
  const raceNum = String(raceNumber).padStart(2, '0');
  const horseNum = String(umaban).padStart(2, '0');
  
  return `${year}${date}${placeCode}${raceNum}${horseNum}`;
}

if (wakujunRows.length > 0) {
  const sample = wakujunRows[0];
  const generatedRaceId = testGenerateIndexRaceId(
    sample.year,
    sample.date,
    sample.place,
    sample.race_number,
    sample.umaban
  );
  console.log(`Generated race_id from wakujun: ${generatedRaceId}`);
  
  // Check if this exists in indices
  const matchingIndex = db.prepare(`
    SELECT race_id, T2F, revouma
    FROM indices 
    WHERE race_id = ?
  `).get(generatedRaceId);
  
  if (matchingIndex) {
    console.log(`✅ MATCH FOUND in indices table!`);
    console.log(`  T2F: ${matchingIndex.T2F}, revouma: ${matchingIndex.revouma}`);
  } else {
    console.log(`❌ NO MATCH in indices table for generated race_id`);
  }
}

console.log('\n============================================================');
console.log('Check completed');
console.log('============================================================');

db.close();


















