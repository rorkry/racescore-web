const Database = require('better-sqlite3');
const db = new Database('races.db');

const emailToReset = 'emuniki01@gmail.com'; // リセットしたいメールアドレス

console.log(`=== ユーザーリセット: ${emailToReset} ===\n`);

try {
    // ユーザーを検索
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(emailToReset);
    
    if (user) {
        console.log(`ユーザーID: ${user.id}`);
        
        // ユーザーを削除（シンプルに）
        db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
        
        console.log('✅ ユーザーを削除しました');
        console.log('新規登録画面から再度登録してください');
    } else {
        console.log('❌ ユーザーが見つかりませんでした');
    }
    
} catch (err) {
    console.error('❌ エラー:', err.message);
}

db.close();
console.log('\n=== 完了 ===');
