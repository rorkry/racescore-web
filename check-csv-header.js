const fs = require('fs');
const iconv = require('iconv-lite');
const path = require('path');

const csvPath = 'C:\\競馬データ\\umadata.csv';

try {
  // ファイルが存在するか確認
  if (!fs.existsSync(csvPath)) {
    console.log('File not found:', csvPath);
    process.exit(1);
  }
  
  // ファイルを読み込み（Shift-JIS対応）
  const buffer = fs.readFileSync(csvPath);
  const content = iconv.decode(buffer, 'Shift_JIS');
  
  // 最初の3行を取得
  const lines = content.split('\n').slice(0, 3);
  
  console.log('=== CSV Header Analysis ===\n');
  
  // ヘッダー行
  const header = lines[0].split(',');
  console.log('Total columns:', header.length);
  console.log('\nHeader row:');
  header.forEach((col, i) => {
    console.log(`  ${i}: ${col.trim()}`);
  });
  
  // 2行目（データ例）
  if (lines[1]) {
    const data = lines[1].split(',');
    console.log('\nFirst data row (sample):');
    data.slice(0, 15).forEach((val, i) => {
      console.log(`  ${i}: ${val.trim()}`);
    });
    console.log('  ...');
  }
  
} catch (error) {
  console.error('Error:', error.message);
}
