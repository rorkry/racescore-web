/**
 * Check database schema
 */

const Database = require('better-sqlite3');
const db = new Database('./race-data.db');

console.log('============================================================');
console.log('Database Schema Check');
console.log('============================================================\n');

// Get all tables
const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' 
  ORDER BY name
`).all();

console.log(`Found ${tables.length} tables:\n`);
tables.forEach(table => {
  console.log(`- ${table.name}`);
});

// Check if indices table exists
const hasIndices = tables.some(t => t.name === 'indices');
console.log(`\n${hasIndices ? '✅' : '❌'} indices table exists: ${hasIndices}`);

// If indices exists, show its structure
if (hasIndices) {
  console.log('\nindices table structure:');
  const columns = db.prepare(`PRAGMA table_info(indices)`).all();
  columns.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });
  
  // Show sample data
  const sampleData = db.prepare(`SELECT * FROM indices LIMIT 3`).all();
  console.log(`\nSample data (${sampleData.length} records):`);
  sampleData.forEach(row => {
    console.log(JSON.stringify(row, null, 2));
  });
}

console.log('\n============================================================');

db.close();










