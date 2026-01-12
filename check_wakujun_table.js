const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== wakujunテーブル確認 ===\n');

try {
    // 1. テーブルに何件データがあるか
    const countResult = db.prepare('SELECT COUNT(*) as count FROM wakujun').get();
    console.log(`【1. データ件数】`);
    console.log(`   ${countResult.count}件\n`);
    
    // 2. どんな日付（date）のデータがあるか
    const datesResult = db.prepare(`
        SELECT date, COUNT(*) as count
        FROM wakujun
        GROUP BY date
        ORDER BY date DESC
    `).all();
    
    console.log(`【2. 日付（date）一覧】`);
    console.log(`   見つかった日付数: ${datesResult.length}`);
    datesResult.forEach((row, idx) => {
        const dateStr = row.date;
        const length = dateStr ? dateStr.length : 0;
        const format = length === 4 ? '4桁形式' : length === 18 ? '18桁形式(レースID)' : `${length}桁形式`;
        console.log(`   ${idx + 1}. date="${dateStr}" (${format}, ${row.count}件)`);
    });
    
    // 3. 最初の3件のデータを表示
    console.log(`\n【3. 最初の3件のデータ】`);
    const samples = db.prepare('SELECT * FROM wakujun LIMIT 3').all();
    samples.forEach((row, idx) => {
        console.log(`\n   レコード ${idx + 1}:`);
        Object.keys(row).forEach(key => {
            const value = row[key];
            const displayValue = value !== null && value !== undefined ? String(value) : '(NULL)';
            // 長い値は切り詰める
            const truncatedValue = displayValue.length > 50 ? displayValue.substring(0, 50) + '...' : displayValue;
            console.log(`     ${key}: ${truncatedValue}`);
        });
    });
    
} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 確認完了 ===');
















