import { NextRequest, NextResponse } from 'next/server';
import { getRawDb } from '../../../lib/db-new';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { auth } from '@/lib/auth';
import { checkRateLimit, getRateLimitIdentifier, strictRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // 管理者認証チェック
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }
    
    // 管理者権限チェック（roleがadminかどうか）
    const userRole = (session.user as { role?: string }).role;
    if (userRole !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // Rate Limiting（厳格：1分に10回まで）
    const identifier = getRateLimitIdentifier(request);
    const rateLimit = checkRateLimit(`upload-csv:${identifier}`, strictRateLimit);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' },
        { status: 429 }
      );
    }

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
      // 注意: CSVにはヘッダー行がないため、data.slice(1)ではなくdataをそのまま渡す
      const result = importWakujun(db, data);
      return NextResponse.json({ 
        success: true, 
        count: result.count, 
        table: 'wakujun',
        date: result.date,
        message: `${result.date}のデータを${result.isUpdate ? '更新' : '追加'}しました`
      });
    } else if (file.name.includes('umadata')) {
      // umadataテーブルにインポート（レースID+馬番でUPSERT）
      const result = importUmadata(db, data.slice(1)); // ヘッダー行をスキップ
      return NextResponse.json({ 
        success: true, 
        count: result.count, 
        table: 'umadata',
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        message: `新規${result.inserted}件、更新${result.updated}件、変更なし${result.skipped}件`
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
  if (!Array.isArray(firstRow) || firstRow.length < 3) {
    throw new Error('CSVデータが不正です');
  }
  // 実際のCSV: row[0]=1227 (日付短縮形), row[2]=2025.12.27 (完全な日付)
  const date = (firstRow[0] || '').trim();
  const fullDateStr = (firstRow[2] || '').trim(); // "2025.12.27"
  
  // 年を抽出
  let year: number | null = null;
  const yearMatch = fullDateStr.match(/^(\d{4})/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // 同じ年・日付のデータが既に存在するか確認
  const existingData = db.prepare('SELECT COUNT(*) as count FROM wakujun WHERE date = ? AND year = ?').get(date, year);
  const isUpdate = existingData && existingData.count > 0;

  // 同じ年・日付のデータのみ削除（他の年・日付のデータは保持）
  if (isUpdate) {
    db.prepare('DELETE FROM wakujun WHERE date = ? AND year = ?').run(date, year);
  }

  // wakujunテーブルのカラム（year列を追加）
  const insertStmt = db.prepare(`
    INSERT INTO wakujun (
      year, date, place, race_number, class_name_1, class_name_2,
      waku, umaban, kinryo, umamei, seibetsu, nenrei, nenrei_display,
      kishu, blank_field, track_type, distance, tosu,
      shozoku, chokyoshi, shozoku_chi, umajirushi
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const row of data) {
    if (Array.isArray(row) && row.length >= 23) {
      try {
        // 実際のCSV列順序（wakujun1227.csvより）:
        // 0: 1227 (日付短縮形)
        // 1: 202512270605070101 (レースID)
        // 2: 2025.12.27 (完全な日付)
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
        
        // 各行から年を抽出
        const rowFullDate = (row[2] || '').trim();
        const rowYearMatch = rowFullDate.match(/^(\d{4})/);
        const rowYear = rowYearMatch ? parseInt(rowYearMatch[1], 10) : year;
        
        insertStmt.run(
          rowYear,                    // year: 2025
          (row[0] || '').trim(),      // date: 1227 (日付短縮形)
          (row[3] || '').trim(),      // place: 中山
          (row[4] || '').trim(),      // race_number: 1
          (row[5] || '').trim(),      // class_name_1: 未勝利
          (row[6] || '').trim(),      // class_name_2: 未勝利・牝*
          (row[7] || '').trim(),      // waku: 1
          (row[8] || '').trim(),      // umaban: 1
          (row[9] || '').trim(),      // kinryo:  55 
          (row[10] || '').trim(),     // umamei:  ドレドレ
          (row[11] || '').trim(),     // seibetsu: 牝
          (row[12] || '').trim(),     // nenrei: 2
          (row[13] || '').trim(),     // nenrei_display: 二歳
          (row[14] || '').trim(),     // kishu: 津村明秀
          (row[15] || '').trim(),     // blank_field: (空欄)
          (row[16] || '').trim(),     // track_type: 芝
          (row[17] || '').trim(),     // distance: 1200
          (row[18] || '').trim(),     // tosu: 15
          (row[19] || '').trim(),     // shozoku: (美)
          (row[20] || '').trim(),     // chokyoshi: 矢嶋大樹
          (row[21] || '').trim(),     // shozoku_chi: 美浦
          (row[22] || '').trim()      // umajirushi: (空欄)
        );
        count++;
      } catch (err: any) {
        console.error('Error inserting wakujun row:', err.message, 'Row:', row);
      }
    }
  }
  return { count, date, isUpdate };
}

function importUmadata(db: any, data: any[]): { count: number; updated: number; inserted: number; skipped: number } {
  // umadataテーブルにデータを追加/更新
  // 高速化: UNIQUEインデックス + INSERT OR REPLACE + トランザクション
  // 新CSV形式: 43列（馬印2-8削除、ワーク1にラップタイム格納）

  console.log(`[importUmadata] 開始: ${data.length}行`);
  const startTime = Date.now();

  // UNIQUEインデックスを作成（存在しなければ）
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_umadata_race_horse 
             ON umadata(race_id_new_no_horse_num, horse_number)`);
  } catch (e) {
    // インデックス作成エラーは無視（既存データに重複がある場合）
    console.log('[importUmadata] インデックス作成スキップ（重複データの可能性）');
  }

  // INSERT OR REPLACE で高速UPSERT
  const upsertStmt = db.prepare(`
    INSERT OR REPLACE INTO umadata (
      race_id_new_no_horse_num, date, distance, horse_number, horse_name, index_value,
      class_name, track_condition, finish_position, last_3f, finish_time, standard_time,
      rpci, pci, good_run, pci3, horse_mark, corner_2, corner_3, corner_4, gender, age,
      horse_weight, weight_change, jockey_weight, jockey, multiple_entries, affiliation,
      trainer, place, number_of_horses, popularity, sire, dam, track_condition_2, place_2,
      margin, corner_1, corner_2_2, corner_3_2, corner_4_2, work_1s
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?
    )
  `);

  let count = 0;
  let inserted = 0;
  
  // トランザクションで一括処理（大幅に高速化）
  const insertMany = db.transaction((rows: any[]) => {
    for (const row of rows) {
      if (Array.isArray(row) && row.length >= 42) {
        try {
          upsertStmt.run(
            row[0],  // race_id_new_no_horse_num
            row[1],  // date
            row[2],  // distance
            row[3],  // horse_number
            row[4],  // horse_name
            row[5],  // index_value (4角位置: 0=最内, 4=大外)
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
            row[41]  // work_1s (ラップタイム)
          );
          inserted++;
        } catch (e) {
          console.error('Error processing umadata row:', e);
        }
        count++;
      }
    }
  });

  // バッチ処理（10000行ずつ）
  const batchSize = 10000;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    insertMany(batch);
    console.log(`[importUmadata] 進捗: ${Math.min(i + batchSize, data.length)}/${data.length}行`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[importUmadata] 完了: ${inserted}件処理 (${elapsed}秒)`);

  return { count, updated: 0, inserted, skipped: 0 };
}
