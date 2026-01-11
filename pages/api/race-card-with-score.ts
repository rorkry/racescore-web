import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db-new';
import { computeKisoScore } from '../../utils/getClusterData';
import type { RecordRow } from '../../types/record';
import { parseFinishPosition } from '../../utils/parse-helpers';

function GET(row: any, ...keys: string[]): string {
  for (const k of keys) {
    if (row && row[k] !== undefined && row[k] !== null) {
      return String(row[k]);
    }
  }
  return '';
}

function normalizeHorseName(name: string): string {
  return name
    .replace(/^[\$\*\s]+/, '')
    .replace(/[\s]+$/, '')
    .trim();
}

function generateIndexRaceId(date: string, place: string, raceNumber: string, umaban: string, year?: number): string {
  const yearStr = year ? String(year) : '2025';
  const dateStr = date.padStart(4, '0');
  const month = dateStr.substring(0, 2);
  const day = dateStr.substring(2, 4);
  const fullDate = `${yearStr}${month}${day}`;
  
  const placeCode: { [key: string]: string } = {
    '札幌': '01', '函館': '02', '福島': '03', '新潟': '04',
    '東京': '05', '中山': '06', '中京': '07', '京都': '08',
    '阪神': '09', '小倉': '10'
  };
  const placeCodeStr = placeCode[place] || '00';
  const kaisai = '05';
  const kaisaiDay = '01';
  const raceNum = raceNumber.padStart(2, '0');
  const umabanStr = umaban.padStart(2, '0');
  
  return `${fullDate}${placeCodeStr}${kaisai}${kaisaiDay}${raceNum}${umabanStr}`;
}

function mapUmadataToRecordRow(dbRow: any): RecordRow {
  const result: any = {};
  for (const key in dbRow) {
    result[key] = dbRow[key] !== null && dbRow[key] !== undefined ? String(dbRow[key]) : '';
  }
  result['4角位置'] = result['index_value'] || '';  // 4コーナーを回った位置（0=最内, 4=大外）
  result['着順'] = result['finish_position'] || '';
  result['finish'] = result['finish_position'] || '';
  result['着差'] = result['margin'] || '';
  result['corner2'] = result['corner_2'] || '';
  result['corner3'] = result['corner_3'] || '';
  result['corner4'] = result['corner_4'] || '';
  result['頭数'] = result['number_of_horses'] || '';
  result['fieldSize'] = result['number_of_horses'] || '';
  result['距離'] = result['distance'] || '';
  result['surface'] = result['distance'] || '';
  result['PCI'] = result['pci'] || '';
  result['日付'] = result['date'] || '';
  result['日付(yyyy.mm.dd)'] = result['date'] || '';
  result['場所'] = result['place'] || '';
  result['場所_1'] = result['place'] || '';
  result['走破タイム'] = result['finish_time'] || '';
  result['time'] = result['finish_time'] || '';
  result['クラス名'] = result['class_name'] || '';
  result['レースID'] = result['race_id_new_no_horse_num'] || '';
  result['レースID(新/馬番無)'] = result['race_id_new_no_horse_num'] || '';
  result['raceId'] = result['race_id_new_no_horse_num'] || '';
  // indicesオブジェクトを保持（computeKisoScoreで使用）
  if (dbRow.indices) {
    result['indices'] = dbRow.indices;
    // indicesから各指数をマッピング（表示用）
    result['巻き返し指数'] = dbRow.indices.makikaeshi !== null && dbRow.indices.makikaeshi !== undefined ? String(dbRow.indices.makikaeshi) : '';
    result['ポテンシャル指数'] = dbRow.indices.potential !== null && dbRow.indices.potential !== undefined ? String(dbRow.indices.potential) : '';
    result['L4F指数'] = dbRow.indices.L4F !== null && dbRow.indices.L4F !== undefined ? String(dbRow.indices.L4F) : '';
    result['T2F指数'] = dbRow.indices.T2F !== null && dbRow.indices.T2F !== undefined ? String(dbRow.indices.T2F) : '';
  }
  return result as RecordRow;
}

function mapWakujunToRecordRow(dbRow: any): RecordRow {
  const result: any = {};
  for (const key in dbRow) {
    result[key] = dbRow[key] !== null && dbRow[key] !== undefined ? String(dbRow[key]) : '';
  }
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
  const { date, place, raceNumber, year } = req.query;

  if (!date || !place || !raceNumber) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const db = getRawDb();
    const yearFilter = year ? parseInt(year as string, 10) : null;

    const horses = db.prepare(`
      SELECT * FROM wakujun
      WHERE date = ? AND place = ? AND race_number = ? ${yearFilter ? 'AND year = ?' : ''}
      ORDER BY CAST(umaban AS INTEGER)
    `).all(...(yearFilter ? [date, place, raceNumber, yearFilter] : [date, place, raceNumber]));

    if (!horses || horses.length === 0) {
      return res.status(404).json({ error: 'No horses found for this race' });
    }

    const horsesWithScore = horses.map((horse: any) => {
      const horseName = normalizeHorseName(GET(horse, 'umamei'));

      const pastRacesRawAll = db.prepare(`
        SELECT * FROM umadata
        WHERE TRIM(horse_name) = ?
        ORDER BY date DESC
        LIMIT 100
      `).all(horseName);

      // race_id_new_no_horse_numで重複排除（同一レースの重複を除去）
      const uniquePastRaces = Array.from(
        new Map(
          pastRacesRawAll.map((race: any) => [
            race.race_id_new_no_horse_num || `${race.date}_${race.place}_${race.race_name || ''}_${race.distance}`,
            race
          ])
        ).values()
      ).slice(0, 5) as any[]; // 5走まで

      // 過去走データに指数を紐づけ
      const pastRacesWithIndices = uniquePastRaces.map((race: any) => {
        const raceIdBase = race.race_id_new_no_horse_num || '';
        const horseNum = String(race.horse_number || '').padStart(2, '0');
        const fullRaceId = `${raceIdBase}${horseNum}`;
        
        let raceIndices = null;
        try {
          const indexData = db.prepare(`
            SELECT L4F, T2F, potential, revouma, makikaeshi, cushion
            FROM indices WHERE race_id = ?
          `).get(fullRaceId);
          if (indexData) raceIndices = indexData;
        } catch {
          // 指数データがない場合は無視
        }
        
        return {
          ...race,
          indices: raceIndices,
          indexRaceId: fullRaceId
        };
      });

      const pastRaces = pastRacesWithIndices.map(mapUmadataToRecordRow);
      const entryRow = mapWakujunToRecordRow(horse);

      let score = 0;
      try {
        score = computeKisoScore({ past: pastRaces, entry: entryRow });
      } catch (scoreError: any) {
        console.error('Score calculation error for', horseName, ':', scoreError.message);
        score = 0;
      }

      const indexRaceId = generateIndexRaceId(
        String(date), String(place), String(raceNumber), GET(horse, 'umaban'), yearFilter || undefined
      );
      
      let indices = null;
      try {
        const indexData = db.prepare(`
          SELECT L4F, T2F, potential, revouma, makikaeshi, cushion
          FROM indices WHERE race_id = ?
        `).get(indexRaceId);
        if (indexData) indices = indexData;
      } catch (indexError: any) {
        console.error('Index fetch error:', indexError.message);
      }

      return {
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
        past_races: pastRacesWithIndices,
        past_races_count: pastRaces.length,
        past: pastRacesWithIndices,
        hasData: pastRaces.length > 0,
        score: score,
        indices: indices,
        indexRaceId: indexRaceId
      };
    });

    horsesWithScore.sort((a: any, b: any) => b.score - a.score);

    const raceInfo = {
      date, place, raceNumber,
      className: GET(horses[0], 'class_name_1'),
      trackType: GET(horses[0], 'track_type'),
      distance: GET(horses[0], 'distance'),
      fieldSize: horses.length
    };

    res.status(200).json({ raceInfo, horses: horsesWithScore });
  } catch (error: any) {
    console.error('Error fetching race card:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
