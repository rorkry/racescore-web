// 馬名がDBに存在するか確認するスクリプト
const { getDb } = require('./lib/db');

const horseNames = process.argv.slice(2);
if (horseNames.length === 0) {
  console.log('使用方法: node check-horse-exists.js 馬名1 馬名2 ...');
  process.exit(1);
}

async function main() {
  const db = getDb();
  
  for (const name of horseNames) {
    console.log('\n========== ' + name + ' ==========');
    
    // wakujunテーブル
    const wakujun = await db.prepare(
      'SELECT COUNT(*) as count FROM wakujun WHERE umamei LIKE $1'
    ).get('%' + name + '%');
    
    console.log('【wakujun】' + (wakujun?.count > 0 ? wakujun.count + '件' : 'なし(検索に出ない原因)'));
    
    // umadataテーブル
    const umadata = await db.prepare(
      'SELECT COUNT(*) as count FROM umadata WHERE horse_name LIKE $1'
    ).get('%' + name + '%');
    
    console.log('【umadata】' + (umadata?.count > 0 ? umadata.count + '件' : 'なし'));
  }
}

main().catch(console.error);
