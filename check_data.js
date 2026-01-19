const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== データ中身の確認 ===');

try {
    // 存在する列（date, place, race_numberなど）の中身を見る
    const rows = db.prepare("SELECT id, date, place, race_number, umamei FROM wakujun LIMIT 5").all();
    
    if (rows.length > 0) {
        console.log(rows);
    } else {
        console.log('データが1件も入っていません。');
    }

} catch (err) {
    console.error('エラー:', err.message);
}
