const Database = require('better-sqlite3');
const db = new Database('races.db');

console.log('=== ユーザーテーブル診断 ===\n');

try {
    // usersテーブルの全ユーザーを確認
    const users = db.prepare('SELECT id, email, password_hash, name, role, created_at FROM users').all();
    
    console.log(`登録ユーザー数: ${users.length}\n`);
    
    users.forEach((user, idx) => {
        console.log(`--- ユーザー ${idx + 1} ---`);
        console.log(`  ID: ${user.id}`);
        console.log(`  Email: ${user.email}`);
        console.log(`  パスワードハッシュ: ${user.password_hash ? user.password_hash.substring(0, 20) + '...' : 'NULL'}`);
        console.log(`  パスワードハッシュ長: ${user.password_hash ? user.password_hash.length : 0}`);
        console.log(`  名前: ${user.name}`);
        console.log(`  ロール: ${user.role}`);
        console.log(`  作成日: ${user.created_at}`);
        console.log('');
    });

    // パスワードハッシュがbcrypt形式かチェック
    users.forEach(user => {
        if (user.password_hash) {
            const isBcrypt = user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$');
            console.log(`${user.email}: bcrypt形式 = ${isBcrypt}`);
        }
    });
    
} catch (err) {
    console.error('❌ エラー:', err.message);
}

db.close();
console.log('\n=== 診断終了 ===');
