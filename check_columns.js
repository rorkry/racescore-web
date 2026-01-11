const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== カラム名確認開始 ===');

try {
    // wakujunテーブルのカラム定義（PRAGMA table_info）を取得
    const columns = db.prepare("PRAGMA table_info(wakujun)").all();
    
    console.log('\n【wakujunテーブルにある列名一覧】');
    if (columns.length > 0) {
        columns.forEach(col => {
            console.log(col.cid + ': ' + col.name + ' (型: ' + col.type + ')');
        });
    } else {
        console.log('⚠ カラム情報が取得できませんでした。');
    }

} catch (err) {
    console.error('\n❌ エラー:', err.message);
}
console.log('\n=== 確認終了 ===');
