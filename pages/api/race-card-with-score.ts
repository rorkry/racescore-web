import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db-new';
import { computeKisoScore } from '../../utils/getClusterData';
import type { RecordRow } from '../../types/record';

// ヘルパー関数: フィールド取得
function GET(row: any, ...keys: string[]): string {
  for (const k of keys) {
    if (row && row[k] !== undefined && row[k] !== null) {
      return String(row[k]);
    }
  }
  return '';
}

/**
 * 馬名を正規化する（$、*、その他の記号を除去）
 * 外国産馬マーク($)、地方競馬マーク(*)などを除去
 */
function normalizeHorseName(name: string): string {
  return name
    .replace(/^[\$\*\s]+/, '')  // 先頭の$, *, スペースを除去
    .replace(/[\s]+$/, '')       // 末尾のスペースを除去
    .trim();
}

/**
 * umadataテーブルのカラム名をcomputeKisoScoreが期待する形式に変換
 * DBカラム名 → 期待されるキー名
 */
function mapUmadataToRecordRow(dbRow: any): RecordRow {
  const result: any = {};
  
  // 全フィールドを文字列として追加（元のキーも保持）
  for (const key in dbRow) {
    result[key] = dbRow[key] !== null && dbRow[key] !== undefined ? String(dbRow[key]) : '';
  }
  
  // 追加のマッピング（computeKisoScoreが期待するキー名）
  // 巻き返し指数
  result['指数'] = result['index_value'] || '';
  result['comeback'] = result['index_value'] || '';
  
  // 着順
  result['着順'] = result['finish_position'] || '';
  result['finish'] = result['finish_position'] || '';
  
  // 着差
  result['着差'] = result['margin'] || '';
  
  // 通過順
  result['corner2'] = result['corner_2'] || '';
  result['corner3'] = result['corner_3'] || '';
  result['corner4'] = result['corner_4'] || '';
  
  // 頭数
  result['頭数'] = result['number_of_horses'] || '';
  result['fieldSize'] = result['number_of_horses'] || '';
  
  // 距離（芝/ダ + 距離）
  result['距離'] = result['distance'] || '';
  result['surface'] = result['distance'] || '';
  
  // PCI
  result['PCI'] = result['pci'] || '';
  
  // 日付
  result['日付'] = result['date'] || '';
  result['日付(yyyy.mm.dd)'] = result['date'] || '';
  
  // 場所
  result['場所'] = result['place'] || '';
  result['場所_1'] = result['place'] || '';
  
  // 走破タイム
  result['走破タイム'] = result['finish_time'] || '';
  result['time'] = result['finish_time'] || '';
  
  // クラス名
  result['クラス名'] = result['class_name'] || '';
  
  // レースID
  result['レースID'] = result['race_id_new_no_horse_num'] || '';
  result['レースID(新/馬番無)'] = result['race_id_new_no_horse_num'] || '';
  result['raceId'] = result['race_id_new_no_horse_num'] || '';
  
  return result as RecordRow;
}

/**
 * wakujunテーブルのカラム名をRecordRow形式に変換
 */
function mapWakujunToRecordRow(dbRow: any): RecordRow {
  const result: any = {};
  
  // 全フィールドを文字列として追加
  for (const key in dbRow) {
    result[key] = dbRow[key] !== null && dbRow[key] !== undefined ? String(dbRow[key]) : '';
  }
  
  // 追加のマッピング
  result['馬番'] = result['umaban'] || '';
  result['horse_number'] = result['umaban'] || '';
  result['馬名'] = result['umamei'] || '';
  result['horse_name'] = result['umamei'] || '';
  result['枠番'] = result['waku'] || '';
  result['騎手'] = result['kishu'] || '';
  result['斤量'] = result['kinryo'] || '';
  result['距離'] = result['distance'] || '';
  result['頭数'] = result['tosu'] || '';
  result['クラス名'] = result['class_name_1'] || '';
  
  return result as RecordRow;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { date, place, raceNumber } = req.query;

  if (!date || !place || !raceNumber) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const db = getRawDb();

    // wakujunテーブルから当日の出走馬リストを取得
    const horses = db.prepare(`
      SELECT * FROM wakujun
      WHERE date = ? AND place = ? AND race_number = ?
      ORDER BY CAST(umaban AS INTEGER)
    `).all(date, place, raceNumber);

    if (!horses || horses.length === 0) {
      return res.status(404).json({ error: 'No horses found for this race' });
    }

    // 各馬の過去走データを取得してスコアを計算
    const horsesWithScore = horses.map((horse: any) => {
      // 馬名を取得（$、*マークとスペースを除去）
      const horseName = normalizeHorseName(GET(horse, 'umamei'));

      // umadataテーブルから過去走データを取得（最新5走）
      const pastRacesRaw = db.prepare(`
        SELECT * FROM umadata
        WHERE TRIM(horse_name) = ?
        ORDER BY date DESC
        LIMIT 5
      `).all(horseName);

      // 過去走データをRecordRow形式に変換
      const pastRaces = pastRacesRaw.map(mapUmadataToRecordRow);

      // 出走情報をRecordRow形式に変換
      const entryRow = mapWakujunToRecordRow(horse);

      // computeKisoScore関数を使用してスコアを計算
      let score = 0;
      try {
        score = computeKisoScore({
          past: pastRaces,
          entry: entryRow
        });
      } catch (scoreError: any) {
        console.error('Score calculation error for', horseName, ':', scoreError.message);
        score = 0;
      }

      return {
        // 元のDBデータ
        id: horse.id,
        date: horse.date,
        place: horse.place,
        race_number: horse.race_number,
        waku: horse.waku,
        umaban: horse.umaban,
        umamei: horse.umamei,
        kishu: horse.kishu,
        kinryo: horse.kinryo,
        track_type: horse.track_type,
        distance: horse.distance,
        class_name_1: horse.class_name_1,
        class_name_2: horse.class_name_2,
        tosu: horse.tosu,
        shozoku: horse.shozoku,
        chokyoshi: horse.chokyoshi,
        shozoku_chi: horse.shozoku_chi,
        umajirushi: horse.umajirushi,
        seibetsu: horse.seibetsu,
        nenrei: horse.nenrei,
        nenrei_display: horse.nenrei_display,
        // 過去走データ
        past_races: pastRacesRaw,
        past_races_count: pastRaces.length,
        past: pastRacesRaw,
        hasData: pastRaces.length > 0,
        // スコア
        score: score
      };
    });

    // スコアでソート（降順）
    horsesWithScore.sort((a: any, b: any) => b.score - a.score);

    // レース情報を取得
    const raceInfo = {
      date,
      place,
      raceNumber,
      className: GET(horses[0], 'class_name_1'),
      trackType: GET(horses[0], 'track_type'),
      distance: GET(horses[0], 'distance'),
      fieldSize: horses.length
    };

    res.status(200).json({
      raceInfo: raceInfo,
      horses: horsesWithScore
    });
  } catch (error: any) {
    console.error('Error fetching race card:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    });
  }
}
