/**
 * Check Index Folders and Files
 * フォルダ名・カラム名は tools/upload-indices.ts / lib/indices-columns.ts と揃える
 */

const fs = require('fs');
const path = require('path');

const INDEX_BASE_FOLDERS = [
  { name: 'L4F', basePath: 'C:\\keiba_data\\L4F' },
  { name: 'T2F', basePath: 'C:\\keiba_data\\T2F' },
  { name: 'potential', basePath: 'C:\\keiba_data\\ポテンシャル指数' },
  { name: 'revouma', basePath: 'C:\\keiba_data\\レボウマ' },
  { name: 'makikaeshi', basePath: 'C:\\keiba_data\\巻き返し指数' },
  { name: 'cushion', basePath: 'C:\\keiba_data\\クッション値' },
  { name: 'pfs_past', basePath: 'C:\\keiba_data\\PFS過去' },
  { name: 'corner_lane', basePath: 'C:\\keiba_data\\4角位置' },
  { name: 'revouma2', basePath: 'C:\\keiba_data\\レボウマ2' },
];

const MIN_YEAR = 2024;

console.log('============================================================');
console.log('Index Folders Check');
console.log('============================================================\n');

for (const folder of INDEX_BASE_FOLDERS) {
  console.log(`\n[${folder.name}]`);
  console.log(`Base: ${folder.basePath}`);

  if (!fs.existsSync(folder.basePath)) {
    console.log('❌ BASE FOLDER NOT FOUND');
    continue;
  }

  console.log('✅ Base folder exists');

  try {
    const yearDirs = fs.readdirSync(folder.basePath, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^\d{4}$/.test(e.name))
      .filter(e => parseInt(e.name, 10) >= MIN_YEAR)
      .map(e => e.name)
      .sort();

    console.log(`Year folders (>=${MIN_YEAR}): ${yearDirs.join(', ') || '(none)'}`);

    for (const year of yearDirs.slice(-2)) {
      const yearPath = path.join(folder.basePath, year);
      const files = fs.readdirSync(yearPath);
      const csvFiles = files.filter(f =>
        f.endsWith('.csv') && !f.includes('作成用')
      );

      console.log(`  [${year}] CSV: ${csvFiles.length}`);
      if (csvFiles.length > 0) {
        const firstCsv = path.join(yearPath, csvFiles[0]);
        const content = fs.readFileSync(firstCsv, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim() !== '');
        console.log(`    Sample ${csvFiles[0]} (${lines.length} lines):`);
        lines.slice(0, 2).forEach(line => console.log(`      ${line}`));
      }
    }
  } catch (err) {
    console.log(`❌ Error reading folder: ${err.message}`);
  }
}

console.log('\n============================================================');
console.log('Check completed');
console.log('============================================================');
