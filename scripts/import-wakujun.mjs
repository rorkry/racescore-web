import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// データベース接続
const dbPath = path.join(__dirname, '..', 'races.db');
const db = new Database(dbPath);

// CSVファイルパス
const csvPath = '/home/ubuntu/upload/wakujun_utf8.csv';

console.log('wakujun.csvをインポートしています...');

// CSVファイルを読み込み
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.trim().split('\n');

console.log(`総行数: ${lines.length}`);

// 既存データを削除
db.prepare('DELETE FROM wakujun').run();
console.log('既存データを削除しました');

// INSERT文を準備
const insertStmt = db.prepare(`
  INSERT INTO wakujun (
    date, place, race_number, class_name_1, class_name_2,
    waku, umaban, kinryo, umamei, seibetsu,
    nenrei, nenrei_display, kishu, blank_field, track_type,
    distance, tosu, shozoku, chokyoshi, shozoku_chi, umajirushi,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);

// トランザクションで一括挿入
const insertMany = db.transaction((rows) => {
  for (const row of rows) {
    insertStmt.run(...row);
  }
});

// CSVデータをパース
const rows = lines.map(line => {
  // カンマで分割（21カラム）
  const columns = line.split(',');
  
  return [
    columns[0] || null,  // date: 日付
    columns[1] || null,  // place: 場所
    columns[2] || null,  // race_number: レース番号
    columns[3] || null,  // class_name_1: クラス名1
    columns[4] || null,  // class_name_2: クラス名2
    columns[5] || null,  // waku: 枠番
    columns[6] || null,  // umaban: 馬番
    columns[7] || null,  // kinryo: 斤量
    columns[8] || null,  // umamei: 馬名
    columns[9] || null,  // seibetsu: 性別
    columns[10] || null, // nenrei: 年齢
    columns[11] || null, // nenrei_display: 年齢表示
    columns[12] || null, // kishu: 騎手
    columns[13] || null, // blank_field: 空欄
    columns[14] || null, // track_type: トラック種別
    columns[15] || null, // distance: 距離
    columns[16] || null, // tosu: 頭数
    columns[17] || null, // shozoku: 所属
    columns[18] || null, // chokyoshi: 調教師
    columns[19] || null, // shozoku_chi: 所属地
    columns[20] || null, // umajirushi: 馬印
  ];
});

// 一括挿入を実行
insertMany(rows);

console.log(`✅ ${rows.length}件のデータをインポートしました`);

// 確認クエリ
const count = db.prepare('SELECT COUNT(*) as count FROM wakujun').get();
console.log(`wakujunテーブルのレコード数: ${count.count}`);

// サンプルデータを表示
const samples = db.prepare('SELECT * FROM wakujun LIMIT 3').all();
console.log('\nサンプルデータ:');
console.log(JSON.stringify(samples, null, 2));

db.close();
