/**
 * Check Index Folders and Files
 */

const fs = require('fs');
const path = require('path');

const INDEX_FOLDERS = [
  { name: 'L4F', path: 'C:\\競馬データ\\L4F\\2025' },
  { name: 'T2F', path: 'C:\\競馬データ\\T2F\\2025' },
  { name: 'potential', path: 'C:\\競馬データ\\ポテンシャル指数\\2025' },
  { name: 'revouma', path: 'C:\\競馬データ\\レボウマ\\2025' },
  { name: 'makikaeshi', path: 'C:\\競馬データ\\巻き返し指数\\2025' },
  { name: 'cushion', path: 'C:\\競馬データ\\クッション値\\2025' },
];

console.log('============================================================');
console.log('Index Folders Check');
console.log('============================================================\n');

for (const folder of INDEX_FOLDERS) {
  console.log(`\n[${folder.name}]`);
  console.log(`Path: ${folder.path}`);
  
  if (!fs.existsSync(folder.path)) {
    console.log('❌ FOLDER NOT FOUND');
    continue;
  }
  
  console.log('✅ Folder exists');
  
  try {
    const files = fs.readdirSync(folder.path);
    const csvFiles = files.filter(f => 
      f.endsWith('.csv') && !f.includes('作成用')
    );
    
    console.log(`Total files: ${files.length}`);
    console.log(`CSV files (excluding 作成用): ${csvFiles.length}`);
    
    if (csvFiles.length > 0) {
      console.log('CSV files:');
      csvFiles.forEach(f => console.log(`  - ${f}`));
      
      // Check first CSV file content
      const firstCsv = path.join(folder.path, csvFiles[0]);
      const content = fs.readFileSync(firstCsv, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim() !== '');
      console.log(`\nFirst CSV file: ${csvFiles[0]}`);
      console.log(`  Lines: ${lines.length}`);
      console.log(`  Sample (first 3 lines):`);
      lines.slice(0, 3).forEach(line => console.log(`    ${line}`));
    } else {
      console.log('⚠️  No CSV files found (or all contain "作成用")');
    }
  } catch (err) {
    console.log(`❌ Error reading folder: ${err.message}`);
  }
}

console.log('\n============================================================');
console.log('Check completed');
console.log('============================================================');









