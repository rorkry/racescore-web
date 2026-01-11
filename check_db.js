const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== データベース診断開始 ===');

try {
    // 1. テーブル一覧
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('\n【テーブル一覧】: ' + tables.map(t => t.name).join(', '));

    // 2. 出馬表データの確認
    if (tables.some(t => t.name === 'wakujun')) {
        console.log('\n【wakujunテーブル診断】');
        
        // 最新のrace_idを確認
        const rows = db.prepare("SELECT race_id FROM wakujun ORDER BY race_id DESC LIMIT 3").all();
        if (rows.length > 0) {
            rows.forEach(row => {
                console.log('・IDサンプル: ' + row.race_id + ' (型: ' + typeof row.race_id + ', 長さ: ' + String(row.race_id).length + ')');
            });
            
            // 日付抽出テスト
            const dates = db.prepare("SELECT DISTINCT substr(race_id, 1, 8) as d FROM wakujun ORDER BY d DESC LIMIT 5").all();
            console.log('\n【認識されている日付】:');
            console.log(dates.map(x => x.d).join(', '));
        } else {
            console.log('⚠ wakujunテーブルは空です！データが入っていません。');
        }
    } else {
        console.log('\n⚠ wakujunテーブル自体が存在しません。');
    }

} catch (err) {
    console.error('\n❌ エラー:', err.message);
    if (err.message.includes('better-sqlite3')) {
        console.log('  → npm install better-sqlite3 を実行してください。');
    }
}
console.log('\n=== 診断終了 ===');
