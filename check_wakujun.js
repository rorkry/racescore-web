const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== wakujunテーブル診断 ===\n');

try {
    // テーブル構造を確認
    const schema = db.prepare("PRAGMA table_info(wakujun)").all();
    console.log('【テーブル構造】');
    schema.forEach(col => {
        console.log(`  ${col.cid}: ${col.name} (${col.type})`);
    });
    
    console.log('\n【サンプルデータ（最初の3件）】');
    const samples = db.prepare('SELECT * FROM wakujun LIMIT 3').all();
    samples.forEach((row, idx) => {
        console.log(`\n--- レコード ${idx + 1} ---`);
        Object.keys(row).forEach(key => {
            console.log(`  ${key}: ${row[key]}`);
        });
    });
    
    // 特定のレースのデータを確認
    console.log('\n【特定レースのデータ（date=1220, place=中山, race_number=1）】');
    const raceData = db.prepare(`
        SELECT * FROM wakujun 
        WHERE date = '1220' AND place = '中山' AND race_number = '1'
        LIMIT 3
    `).all();
    
    if (raceData.length > 0) {
        raceData.forEach((row, idx) => {
            console.log(`\n--- 馬 ${idx + 1} ---`);
            console.log(`  枠番 (waku): ${row.waku}`);
            console.log(`  馬番 (umaban): ${row.umaban}`);
            console.log(`  馬名 (umamei): ${row.umamei}`);
            console.log(`  騎手 (kishu): ${row.kishu}`);
            console.log(`  斤量 (kinryo): ${row.kinryo}`);
        });
    } else {
        console.log('  データが見つかりませんでした');
    }
    
} catch (err) {
    console.error('❌ エラー:', err.message);
}

db.close();
console.log('\n=== 診断終了 ===');













