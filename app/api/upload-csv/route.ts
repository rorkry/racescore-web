import { NextRequest, NextResponse } from 'next/server';
import { getRawDb } from '../../../lib/db-new';
import Papa from 'papaparse';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });
    }

    const text = await file.text();
    
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
      // wakujunテーブルにインポート
      await importWakujun(db, data.slice(1)); // ヘッダー行をスキップ
      return NextResponse.json({ success: true, count: data.length - 1, table: 'wakujun' });
    } else if (file.name.includes('umadata')) {
      // umadataテーブルにインポート
      await importUmadata(db, data.slice(1)); // ヘッダー行をスキップ
      return NextResponse.json({ success: true, count: data.length - 1, table: 'umadata' });
    } else {
      return NextResponse.json({ error: 'ファイル名がwakujunまたはumadataを含む必要があります' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('CSV upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function importWakujun(db: any, data: any[]) {
  // 既存データを削除
  db.prepare('DELETE FROM wakujun').run();

  const insertStmt = db.prepare(`
    INSERT INTO wakujun (
      date, place, race_number, class_name1, class_name2,
      waku, umaban, kinryo, umamei, sex, age, age_display,
      kishu, column14, track_type, distance, field_size,
      affiliation, trainer, trainer_location, mark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of data) {
    if (Array.isArray(row) && row.length >= 21) {
      insertStmt.run(...row);
    }
  }
}

function importUmadata(db: any, data: any[]) {
  // 既存データを削除
  db.prepare('DELETE FROM umadata').run();

  const insertStmt = db.prepare(`
    INSERT INTO umadata (
      race_id_new_no_horse_num, race_date, place, race_number, horse_number,
      frame_number, horse_name, sex_age, jockey_weight, jockey, trainer,
      horse_weight, horse_weight_change, odds, popularity, finish_position,
      time_value, margin, passing_order, pace, last_3f, corner_positions,
      race_name, number_of_horses, class_name, track_condition, track_type,
      distance, weather, race_grade, index_value, time_index, pace_index,
      ascending_index, position_index, jockey_index, first_passing_time,
      second_passing_time, third_passing_time, fourth_passing_time, prize_money,
      venue_code, race_condition_code, impost_class_code, race_symbol_code,
      track_code, horse_symbol_code, reserved_column, special_mention,
      horse_id, jockey_code
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  for (const row of data) {
    if (Array.isArray(row) && row.length >= 50) {
      insertStmt.run(...row);
    }
  }
}
