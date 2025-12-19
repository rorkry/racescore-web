import fs from 'fs';
import Papa from 'papaparse';
import Database from 'better-sqlite3';

const dbPath = process.env.DB_PATH ?? 'races.db';
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

// umadata.csvをインポート
async function importUmadata() {
  const csvPath = '/home/ubuntu/upload/umadata_utf8.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  console.log('📊 umadata.csvを読み込み中...');
  
  const result = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });
  
  console.log(`✅ ${result.data.length}行のデータを解析しました`);
  
  // データベースに挿入（英語カラム名を使用）
  const insertStmt = sqlite.prepare(`
    INSERT OR REPLACE INTO umadata (
      race_id_new_no_horse_num, date, distance, horse_number, horse_name, 
      index_value, class_name, track_condition, finish_position, last_3f,
      finish_time, standard_time, rpci, pci, good_run, pci3, horse_mark, 
      corner_2, corner_3, corner_4, gender, age, horse_weight, weight_change, 
      jockey_weight, jockey, multiple_entries, affiliation, trainer, place,
      number_of_horses, popularity, sire, dam, track_condition_2, place_2, 
      margin, corner_1, corner_2_2, corner_3_2, corner_4_2, work_1s, 
      horse_mark_2, horse_mark_3, horse_mark_4, horse_mark_5, horse_mark_6, 
      horse_mark_7, horse_mark_7_2, horse_mark_8
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  
  const insertMany = sqlite.transaction((rows) => {
    let count = 0;
    for (const row of rows) {
      insertStmt.run(
        row['レースID(新/馬番無)'] || null,
        row['日付(yyyy.mm.dd)'] || null,
        row['距離'] || null,
        row['馬番'] || null,
        row['馬名'] || null,
        row['指数'] || null,
        row['クラス名'] || null,
        row['馬場状態'] || null,
        row['着順'] || null,
        row['上り3F'] || null,
        row['走破タイム'] || null,
        row['基準タイム'] || null,
        row['RPCI'] || null,
        row['PCI'] || null,
        row['好走'] || null,
        row['PCI3'] || null,
        row['馬印'] || null,
        row['2角'] || null,
        row['3角'] || null,
        row['4角'] || null,
        row['性別'] || null,
        row['年齢'] || null,
        row['馬体重'] || null,
        row['馬体重増減'] || null,
        row['斤量'] || null,
        row['騎手'] || null,
        row['多頭出し'] || null,
        row['所属'] || null,
        row['調教師'] || null,
        row['場所'] || null,
        row['頭数'] || null,
        row['人気'] || null,
        row['種牡馬'] || null,
        row['母馬'] || null,
        row['馬場状態'] || null,  // 馬場状態2
        row['場所'] || null,      // 場所2
        row['着差'] || null,
        row['1角'] || null,
        row['2角'] || null,       // 角2_2
        row['3角'] || null,       // 角3_2
        row['4角'] || null,       // 角4_2
        row['ワーク1S'] || null,
        row['馬印2'] || null,
        row['馬印3'] || null,
        row['馬印4'] || null,
        row['馬印5'] || null,
        row['馬印6'] || null,
        row['馬印7'] || null,
        row['馬印7'] || null,     // 馬印7_2
        row['馬印8'] || null
      );
      count++;
      if (count % 1000 === 0) {
        console.log(`  ${count}行処理済み...`);
      }
    }
  });
  
  console.log('💾 データベースに挿入中...');
  insertMany(result.data);
  console.log('✅ インポート完了！');
  
  // 件数確認
  const count = sqlite.prepare('SELECT COUNT(*) as count FROM umadata').get();
  console.log(`📊 データベース内のレコード数: ${count.count}`);
}

// 実行
importUmadata()
  .then(() => {
    console.log('🎉 すべて完了しました');
    sqlite.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ エラー:', err);
    sqlite.close();
    process.exit(1);
  });
