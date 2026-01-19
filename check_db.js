// check_db.js
// データベースの中身を診断するスクリプト

const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log("=== データベース診断開始 ===");

try {
    // 1. テーブル一覧の確認
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log("\n【存在するテーブル】");
    console.log(tables.map(t => t.name).join(", "));

    // 2. 出馬表データ（wakujun）の確認
    // 日付選択に使われるのは通常このテーブルです
    if (tables.some(t => t.name === 'wakujun')) {
        console.log("\n【wakujunテーブル: 直近のデータ確認】");
        
        // 最新のrace_idを5件取得
        const rows = db.prepare("SELECT race_id FROM wakujun ORDER BY race_id DESC LIMIT 5").all();
        
        if (rows.length > 0) {
            console.log("保存されている最新のrace_id（5件）:");
            rows.forEach(row => {
                const id = row.race_id;
                const type = typeof id;
                const len = String(id).length;
                console.log(`- ID: ${id} (型: ${type}, 文字数: ${len}桁)`);
            });

            // 3. 日付データの抽出テスト
            console.log("\n【日付の抽出テスト】");
            const dates = db.prepare("SELECT DISTINCT substr(race_id, 1, 8) as dateStr FROM wakujun ORDER BY dateStr DESC LIMIT 5").all();
            console.log("認識されている日付一覧:");
            console.log(dates);
        } else {
            console.log("⚠ wakujunテーブルは空です。データがインポートされていません。");
        }
    } else {
        console.log("\n⚠ wakujunテーブルが見つかりません。");
    }

} catch (err) {
    console.error("\n❌ エラーが発生しました:", err.message);
    if (err.message.includes("better-sqlite3")) {
        console.log("  ヒント: npm install better-sqlite3 を実行する必要があるかもしれません。");
    }
}

console.log("\n=== 診断終了 ===");