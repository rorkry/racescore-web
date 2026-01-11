import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import iconv from 'iconv-lite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// データベース接続
const dbPath = path.join(__dirname, '..', 'races.db');
const db = new Database(dbPath);

// CSVファイルパス（Shift-JISエンコーディング）
const csvPath = path.join(__dirname, '..', 'wakujun1227.csv');

console.log('wakujun.csvをインポートしています...');
console.log(`CSVファイル: ${csvPath}`);

// CSVファイルを読み込み（Shift-JIS → UTF-8変換）
let csvContent;
try {
  // ファイルをBufferとして読み込み
  const buffer = fs.readFileSync(csvPath);
  // Shift_JIS (CP932) からUTF-8に変換
  csvContent = iconv.decode(buffer, 'Shift_JIS');
  console.log('Shift-JISからUTF-8に変換しました');
} catch (err) {
  console.error('Shift-JIS変換エラー:', err.message);
  // 失敗した場合はUTF-8として読み込む
  csvContent = fs.readFileSync(csvPath, 'utf-8');
  console.log('UTF-8として読み込みました');
}

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
  // カンマで分割（23カラム）
  const columns = line.split(',');
  
  // 実際のCSV列順序（wakujun1227.csvより）:
  // 0: 1227 (日付短縮形)
  // 1: 202512270605070101 (レースID)
  // 2: 2025.12.27 (日付)
  // 3: 中山 (場所)
  // 4: 1 (レース番号)
  // 5: 未勝利 (クラス名1)
  // 6: 未勝利・牝* (クラス名2)
  // 7: 1 (枠番)
  // 8: 1 (馬番)
  // 9:  55  (斤量)
  // 10:  ドレドレ (馬名)
  // 11: 牝 (性別)
  // 12: 2 (年齢)
  // 13: 二歳 (年齢表示)
  // 14: 津村明秀 (騎手)
  // 15: (空欄)
  // 16: 芝 (トラック種別)
  // 17: 1200 (距離)
  // 18: 15 (頭数)
  // 19: (美) (所属)
  // 20: 矢嶋大樹 (調教師)
  // 21: 美浦 (所属地)
  // 22: (空欄) (馬印)
  
  return [
    (columns[0] || '').trim(),  // date: 1227 (日付短縮形)
    (columns[3] || '').trim(),  // place: 中山
    (columns[4] || '').trim(),  // race_number: 1
    (columns[5] || '').trim(),  // class_name_1: 未勝利
    (columns[6] || '').trim(),  // class_name_2: 未勝利・牝*
    (columns[7] || '').trim(),  // waku: 1
    (columns[8] || '').trim(),  // umaban: 1
    (columns[9] || '').trim(),  // kinryo:  55 
    (columns[10] || '').trim(), // umamei:  ドレドレ
    (columns[11] || '').trim(), // seibetsu: 牝
    (columns[12] || '').trim(), // nenrei: 2
    (columns[13] || '').trim(), // nenrei_display: 二歳
    (columns[14] || '').trim(), // kishu: 津村明秀
    (columns[15] || '').trim(), // blank_field: (空欄)
    (columns[16] || '').trim(), // track_type: 芝
    (columns[17] || '').trim(), // distance: 1200
    (columns[18] || '').trim(), // tosu: 15
    (columns[19] || '').trim(), // shozoku: (美)
    (columns[20] || '').trim(), // chokyoshi: 矢嶋大樹
    (columns[21] || '').trim(), // shozoku_chi: 美浦
    (columns[22] || '').trim(), // umajirushi: (空欄)
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
