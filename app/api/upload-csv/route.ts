import { NextRequest, NextResponse } from 'next/server';
import { getRawDb } from '../../../lib/db-new';
import Papa from 'papaparse';
import iconv from 'iconv-lite';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });
    }

    // ファイルをArrayBufferとして読み込み
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Shift_JIS (CP932) からUTF-8に変換
    // 日本語CSVファイルは通常Shift_JISでエンコードされている
    let text: string;
    try {
      // まずShift_JISとしてデコードを試みる
      text = iconv.decode(buffer, 'Shift_JIS');
    } catch {
      // 失敗した場合はUTF-8として読み込む
      text = buffer.toString('utf-8');
    }
    
    // CSVをパース（ヘッダーなし）
    const { data } = Papa.parse(text, {
      header: false,
      skipEmptyLines: true,
    });

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'CSVデータが空です' }, { status: 400 });
    }

    const db = getRawDb();

    // ファイル名でテーブルを判定
    if (file.name.includes('wakujun')) {
      // wakujunテーブルにインポート（日付ごとに保持）
      const result = importWakujun(db, data.slice(1)); // ヘッダー行をスキップ
      return NextResponse.json({ 
        success: true, 
        count: result.count, 
        table: 'wakujun',
        date: result.date,
        message: `${result.date}のデータを${result.isUpdate ? '更新' : '追加'}しました`
      });
    } else if (file.name.includes('umadata')) {
      // umadataテーブルにインポート（馬名ごとに更新）
      const result = importUmadata(db, data.slice(1)); // ヘッダー行をスキップ
      return NextResponse.json({ 
        success: true, 
        count: result.count, 
        table: 'umadata',
        updated: result.updated,
        inserted: result.inserted
      });
    } else {
      return NextResponse.json({ error: 'ファイル名がwakujunまたはumadataを含む必要があります' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('CSV upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function importWakujun(db: any, data: any[]): { count: number; date: string; isUpdate: boolean } {
  // CSVから日付を取得（最初の行の日付を使用）
  const firstRow = data[0];
  if (!Array.isArray(firstRow) || firstRow.length < 1) {
    throw new Error('CSVデータが不正です');
  }
  const date = firstRow[0]; // 日付は最初のカラム

  // 同じ日付のデータが既に存在するか確認
  const existingData = db.prepare('SELECT COUNT(*) as count FROM wakujun WHERE date = ?').get(date);
  const isUpdate = existingData && existingData.count > 0;

  // 同じ日付のデータのみ削除（他の日付のデータは保持）
  if (isUpdate) {
    db.prepare('DELETE FROM wakujun WHERE date = ?').run(date);
  }

  // wakujunテーブルのカラム（idとcreated_at以外）
  const insertStmt = db.prepare(`
    INSERT INTO wakujun (
      date, place, race_number, class_name_1, class_name_2,
      waku, umaban, kinryo, umamei, seibetsu, nenrei, nenrei_display,
      kishu, blank_field, track_type, distance, tosu,
      shozoku, chokyoshi, shozoku_chi, umajirushi
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const row of data) {
    if (Array.isArray(row) && row.length >= 21) {
      try {
        insertStmt.run(
          row[0],  // date
          row[1],  // place
          row[2],  // race_number
          row[3],  // class_name_1
          row[4],  // class_name_2
          row[5],  // waku
          row[6],  // umaban
          row[7],  // kinryo
          row[8],  // umamei
          row[9],  // seibetsu
          row[10], // nenrei
          row[11], // nenrei_display
          row[12], // kishu
          row[13], // blank_field
          row[14], // track_type
          row[15], // distance
          row[16], // tosu
          row[17], // shozoku
          row[18], // chokyoshi
          row[19], // shozoku_chi
          row[20]  // umajirushi
        );
        count++;
      } catch {
        console.error('Error inserting wakujun row');
      }
    }
  }
  return { count, date, isUpdate };
}

function importUmadata(db: any, data: any[]): { count: number; updated: number; inserted: number } {
  // 既存データを削除せず、馬名ごとに更新または挿入
  // umadataは過去走データなので、全削除して入れ替える方式を維持
  // （毎回最新の過去走データを取得するため）
  db.prepare('DELETE FROM umadata').run();

  // umadataテーブルのカラム（idとcreated_at以外）
  const insertStmt = db.prepare(`
    INSERT INTO umadata (
      race_id_new_no_horse_num, date, distance, horse_number, horse_name, index_value,
      class_name, track_condition, finish_position, last_3f, finish_time, standard_time,
      rpci, pci, good_run, pci3, horse_mark, corner_2, corner_3, corner_4, gender, age,
      horse_weight, weight_change, jockey_weight, jockey, multiple_entries, affiliation,
      trainer, place, number_of_horses, popularity, sire, dam, track_condition_2, place_2,
      margin, corner_1, corner_2_2, corner_3_2, corner_4_2, work_1s, horse_mark_2,
      horse_mark_3, horse_mark_4, horse_mark_5, horse_mark_6, horse_mark_7, horse_mark_7_2, horse_mark_8
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  let count = 0;
  const updated = 0;
  let inserted = 0;
  
  for (const row of data) {
    if (Array.isArray(row) && row.length >= 50) {
      try {
        insertStmt.run(
          row[0],  // race_id_new_no_horse_num
          row[1],  // date
          row[2],  // distance
          row[3],  // horse_number
          row[4],  // horse_name
          row[5],  // index_value
          row[6],  // class_name
          row[7],  // track_condition
          row[8],  // finish_position
          row[9],  // last_3f
          row[10], // finish_time
          row[11], // standard_time
          row[12], // rpci
          row[13], // pci
          row[14], // good_run
          row[15], // pci3
          row[16], // horse_mark
          row[17], // corner_2
          row[18], // corner_3
          row[19], // corner_4
          row[20], // gender
          row[21], // age
          row[22], // horse_weight
          row[23], // weight_change
          row[24], // jockey_weight
          row[25], // jockey
          row[26], // multiple_entries
          row[27], // affiliation
          row[28], // trainer
          row[29], // place
          row[30], // number_of_horses
          row[31], // popularity
          row[32], // sire
          row[33], // dam
          row[34], // track_condition_2
          row[35], // place_2
          row[36], // margin
          row[37], // corner_1
          row[38], // corner_2_2
          row[39], // corner_3_2
          row[40], // corner_4_2
          row[41], // work_1s
          row[42], // horse_mark_2
          row[43], // horse_mark_3
          row[44], // horse_mark_4
          row[45], // horse_mark_5
          row[46], // horse_mark_6
          row[47], // horse_mark_7
          row[48], // horse_mark_7_2
          row[49]  // horse_mark_8
        );
        count++;
        inserted++;
      } catch {
        console.error('Error inserting umadata row');
      }
    }
  }
  return { count, updated, inserted };
}
