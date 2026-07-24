/**
 * race-card-with-score.ts 共有サービス化の回帰テスト
 * 実行: npx tsx pages/api/race-card-with-score.regression.test.ts
 *
 * 目的:
 *  - STEP2-4（過去走取得・指数結合・competeKisoScore）を
 *    lib/server/competition-score-service.ts へ集約した refactor（19783fc）前後で
 *    horsesWithScore（API 応答の中核データ）が deep-equal であることを確認する。
 *  - 「computeKisoScore 単体の一致」だけでなく、past_races・past_races_count・hasData・
 *    scoreBreakdown・indices・indexRaceId を含む最終加工後の形まで比較する。
 *
 * 手法:
 *  - REFERENCE（旧実装）: refactor 前の pages/api/race-card-with-score.ts の
 *    STEP2-4 ロジックを本ファイル内にそのまま複製（参照実装）。
 *  - CURRENT（新実装）: 実際の lib/server/competition-score-service.ts
 *    （fetchScoreSourceData + computeScoresFromSource）を呼び出し、
 *    現行 pages/api/race-card-with-score.ts と同じ組み立てロジックで
 *    horsesWithScore 相当の配列を構築する。
 *  - 同一 fixture DB に対して両方を実行し、horsesWithScore を deep-equal で比較する。
 *
 * 注記:
 *  - Next.js の NextApiRequest/NextApiResponse を介した HTTP レベルのテストは
 *    本リポジトリに jest/supertest 等のテスト基盤がなく、大規模な基盤追加を避けるため
 *    見送った。代わりに、応答本体を構築する STEP2-4 の計算ロジックを両実装で
 *    同一 fixture に対して実行し、結果 JSON を深く比較する形で回帰を検証する。
 *  - キャッシュ（globalThis._raceCardCache）・fastMode・umadata フォールバックなど
 *    STEP2-4 より前後の分岐は refactor で変更されていない（diff 未変更）ため対象外。
 */
import {
  fetchScoreSourceData,
  computeScoresFromSource,
  getField as GET_NEW,
  normalizeHorseName as normalizeHorseName_NEW,
} from '../../lib/server/competition-score-service';
import { computeKisoScore, KisoScoreBreakdown } from '../../utils/getClusterData';
import type { RecordRow } from '../../types/record';
import { getCornerPositions } from '../../utils/parse-helpers';
import { INDICES_SELECT_SQL, mapIndicesRow } from '../../lib/indices-columns';

let pass = 0,
  fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  \u2717 ${label} ${detail}`);
  }
}

console.log('=== race-card-with-score regression (旧実装 vs 共有サービス化後) ===');

// ============================================================
// REFERENCE: refactor 前（19783fc^）の STEP2-4 ロジックをそのまま複製
// ============================================================
function GET_OLD(row: any, ...keys: string[]): string {
  for (const k of keys) {
    if (row && row[k] !== undefined && row[k] !== null) {
      return String(row[k]);
    }
  }
  return '';
}

function normalizeHorseName_OLD(name: string): string {
  return name
    .replace(/^[\$\*＄＊\s　]+/, '')
    .replace(/[\s　]+$/, '')
    .trim();
}

function parseDateToNumber_OLD(dateStr: string): number {
  if (!dateStr) return 0;
  const cleaned = dateStr.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return 0;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;
  return year * 10000 + month * 100 + day;
}

function getCurrentRaceDateNumber_OLD(date: string, year: number | null): number {
  const dateStr = String(date).padStart(4, '0');
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  const currentYear = year || new Date().getFullYear();
  return currentYear * 10000 + month * 100 + day;
}

function generateIndexRaceId_OLD(
  date: string,
  place: string,
  raceNumber: string,
  umaban: string,
  year?: number
): string {
  const yearStr = year ? String(year) : '2025';
  const dateStr = date.padStart(4, '0');
  const month = dateStr.substring(0, 2);
  const day = dateStr.substring(2, 4);
  const fullDate = `${yearStr}${month}${day}`;
  const placeCode: { [key: string]: string } = {
    '札幌': '01', '函館': '02', '福島': '03', '新潟': '04',
    '東京': '05', '中山': '06', '中京': '07', '京都': '08',
    '阪神': '09', '小倉': '10',
  };
  const placeCodeStr = placeCode[place] || '00';
  const kaisai = '05';
  const kaisaiDay = '01';
  const raceNum = raceNumber.padStart(2, '0');
  const umabanStr = umaban.padStart(2, '0');
  return `${fullDate}${placeCodeStr}${kaisai}${kaisaiDay}${raceNum}${umabanStr}`;
}

function mapUmadataToRecordRow_OLD(dbRow: any): RecordRow {
  const result: any = {};
  for (const key in dbRow) {
    result[key] = dbRow[key] !== null && dbRow[key] !== undefined ? String(dbRow[key]) : '';
  }
  result['4角位置'] = result['index_value'] || '';
  result['着順'] = result['finish_position'] || '';
  result['finish'] = result['finish_position'] || '';
  result['着差'] = result['margin'] || '';
  const corners = getCornerPositions(dbRow);
  result['corner2'] = result['corner_2'] || (corners.corner2 ? String(corners.corner2) : '');
  result['corner3'] = result['corner_3'] || (corners.corner3 ? String(corners.corner3) : '');
  result['corner4'] = result['corner_4'] || result['corner_4_position'] || (corners.corner4 ? String(corners.corner4) : '');
  result['頭数'] = result['field_size'] || result['number_of_horses'] || '';
  result['fieldSize'] = result['field_size'] || result['number_of_horses'] || '';
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
  result['レースID'] = result['race_id'] || '';
  result['レースID(新/馬番無)'] = result['race_id'] || '';
  result['raceId'] = result['race_id'] || '';
  const raceId = result['race_id'] || '';
  if (raceId.length >= 2) {
    const raceNumberStr = raceId.slice(-2);
    result['race_number'] = String(parseInt(raceNumberStr, 10));
  } else {
    result['race_number'] = '';
  }
  if (dbRow.indices) {
    result['indices'] = dbRow.indices;
    result['巻き返し指数'] = dbRow.indices.makikaeshi !== null && dbRow.indices.makikaeshi !== undefined ? String(dbRow.indices.makikaeshi) : '';
    result['ポテンシャル指数'] = dbRow.indices.potential !== null && dbRow.indices.potential !== undefined ? String(dbRow.indices.potential) : '';
    result['L4F指数'] = dbRow.indices.L4F !== null && dbRow.indices.L4F !== undefined ? String(dbRow.indices.L4F) : '';
    result['T2F指数'] = dbRow.indices.T2F !== null && dbRow.indices.T2F !== undefined ? String(dbRow.indices.T2F) : '';
  }
  return result as RecordRow;
}

function mapWakujunToRecordRow_OLD(dbRow: any): RecordRow {
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

/** 旧実装 STEP2-4 をそのまま複製し、horsesWithScore を返す */
async function computeOldHorsesWithScore(
  db: any,
  horses: any[],
  ctx: { date: string; place: string; raceNumber: string; yearFilter: string | null }
) {
  const { date, place, raceNumber, yearFilter } = ctx;

  const horseNames = horses.map((h: any) => normalizeHorseName_OLD(GET_OLD(h, 'umamei')));
  const horseNameSet = new Set(horseNames);
  const uniqueHorseNames = Array.from(horseNameSet);

  const placeholders = uniqueHorseNames.map((_, i) => `$${i + 1}`).join(',');
  const allPastRacesRaw = (await db
    .prepare(
      `SELECT * FROM umadata WHERE TRIM(horse_name) IN (${placeholders}) ORDER BY horse_name, SUBSTRING(race_id, 1, 8)::INTEGER DESC`
    )
    .all(...uniqueHorseNames)) as any[];

  const currentRaceDateNum = getCurrentRaceDateNumber_OLD(String(date), yearFilter ? parseInt(yearFilter, 10) : null);
  const pastRacesByHorse = new Map<string, any[]>();
  for (const race of allPastRacesRaw) {
    const horseName = (race.horse_name || '').trim();
    const pastRaceDateNum = parseDateToNumber_OLD(race.date || '');
    if (pastRaceDateNum >= currentRaceDateNum) continue;
    if (!pastRacesByHorse.has(horseName)) pastRacesByHorse.set(horseName, []);
    pastRacesByHorse.get(horseName)!.push(race);
  }

  const allPastRaceIndexIds: string[] = [];
  const processedPastRacesByHorse = new Map<string, any[]>();
  for (const horseName of uniqueHorseNames) {
    const rawRaces = pastRacesByHorse.get(horseName) || [];
    const uniqueRaces = Array.from(
      new Map(
        rawRaces.map((race: any) => [
          race.race_id || `${race.date}_${race.place}_${race.race_name || ''}_${race.distance}`,
          race,
        ])
      ).values()
    ).slice(0, 50) as any[];
    processedPastRacesByHorse.set(horseName, uniqueRaces);
    const racesForIndices = uniqueRaces.slice(0, 10);
    for (const race of racesForIndices) {
      const raceIdBase = race.race_id || '';
      const horseNum = String(race.umaban || race.horse_number || '').padStart(2, '0');
      const fullRaceId = `${raceIdBase}${horseNum}`;
      if (fullRaceId && fullRaceId.length > 2) allPastRaceIndexIds.push(fullRaceId);
    }
  }

  const currentRaceIndexIds: string[] = [];
  for (const horse of horses) {
    currentRaceIndexIds.push(
      generateIndexRaceId_OLD(String(date), String(place), String(raceNumber), GET_OLD(horse, 'umaban'), yearFilter ? parseInt(yearFilter, 10) : undefined)
    );
  }

  const allIndexIds = [...allPastRaceIndexIds, ...currentRaceIndexIds];
  const indicesMap = new Map<string, any>();
  if (allIndexIds.length > 0) {
    const indexPlaceholders = allIndexIds.map((_, i) => `$${i + 1}`).join(',');
    const allIndices = (await db
      .prepare(`SELECT race_id, ${INDICES_SELECT_SQL} FROM indices WHERE race_id IN (${indexPlaceholders})`)
      .all(...allIndexIds)) as any[];
    for (const idx of allIndices) indicesMap.set(idx.race_id, mapIndicesRow(idx));
  }

  // STEP 3.5: レースレベル
  const raceLevelMap = new Map<string, any>();
  const allPastRaceIds: string[] = [];
  for (const [, races] of processedPastRacesByHorse) {
    for (const race of races) {
      const raceId = race.race_id;
      if (raceId && raceId.length >= 16) allPastRaceIds.push(raceId);
    }
  }
  const uniqueRaceIds = [...new Set(allPastRaceIds)];
  if (uniqueRaceIds.length > 0) {
    const levelPlaceholders = uniqueRaceIds.map((_, i) => `$${i + 1}`).join(',');
    const allLevels = (await db
      .prepare(
        `SELECT race_id, level, level_label, total_horses_run, first_run_good_count, win_count, ai_comment FROM race_levels WHERE race_id IN (${levelPlaceholders})`
      )
      .all(...uniqueRaceIds)) as any[];
    for (const lv of allLevels) {
      const plusCount = (lv.level_label?.match(/\+/g) || []).length;
      raceLevelMap.set(lv.race_id, {
        level: lv.level,
        levelLabel: lv.level_label || lv.level,
        totalHorsesRun: lv.total_horses_run || 0,
        firstRunGoodCount: lv.first_run_good_count || 0,
        winCount: lv.win_count || 0,
        plusCount,
        aiComment: lv.ai_comment || '',
      });
    }
  }

  // STEP4
  const allHorseData: { past: any[]; entry: any }[] = [];
  const horsesBaseData: any[] = [];
  horses.forEach((horse: any, horseIndex: number) => {
    const horseName = normalizeHorseName_OLD(GET_OLD(horse, 'umamei'));
    const uniquePastRaces = processedPastRacesByHorse.get(horseName) || [];
    const pastRacesWithIndices = uniquePastRaces.map((race: any) => {
      const raceIdBase = race.race_id || '';
      const horseNum = String(race.umaban || race.horse_number || '').padStart(2, '0');
      const fullRaceId = `${raceIdBase}${horseNum}`;
      const raceIndices = indicesMap.get(fullRaceId) || null;
      const raceLevel = raceLevelMap.get(raceIdBase) || null;
      const raceNumberDerived = raceIdBase.length >= 2 ? String(parseInt(raceIdBase.slice(-2), 10)) : '';
      return { ...race, race_number: raceNumberDerived, indices: raceIndices, indexRaceId: fullRaceId, raceLevel };
    });
    const pastRaces = pastRacesWithIndices.map(mapUmadataToRecordRow_OLD);
    const entryRow = mapWakujunToRecordRow_OLD(horse);
    allHorseData.push({ past: pastRaces, entry: entryRow });
    horsesBaseData.push({ horse, pastRacesWithIndices, pastRaces, entryRow, horseIndex });
  });

  const horsesWithScore = horsesBaseData.map(({ horse, pastRacesWithIndices, pastRaces, entryRow, horseIndex }) => {
    let score = 0;
    let scoreBreakdown: KisoScoreBreakdown | null = null;
    const isDebugSample = horseIndex < 3;
    const scoreResult = computeKisoScore({ past: pastRaces, entry: entryRow }, allHorseData, isDebugSample);
    if (isDebugSample && typeof scoreResult !== 'number') {
      scoreBreakdown = scoreResult;
      score = scoreResult.total;
    } else {
      score = typeof scoreResult === 'number' ? scoreResult : scoreResult.total;
    }

    const indexRaceId = currentRaceIndexIds[horseIndex];
    const indices = indicesMap.get(indexRaceId) || null;

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
      score,
      indices,
      indexRaceId,
      scoreBreakdown: scoreBreakdown
        ? {
            pos: scoreBreakdown.positionImprovement,
            pace: scoreBreakdown.paceSync,
            course: scoreBreakdown.courseFit,
            penalty: scoreBreakdown.penalty,
            lastPos: scoreBreakdown.details.lastPosition,
            avgPos: scoreBreakdown.details.avgPastPosition,
            fwdRate: scoreBreakdown.details.forwardRate,
          }
        : null,
    };
  });

  horsesWithScore.sort((a: any, b: any) => b.score - a.score);
  return horsesWithScore;
}

/** 新実装（共有サービス）で同じ horsesWithScore を構築（現行 handler.ts のロジックを再現） */
async function computeNewHorsesWithScore(
  db: any,
  horses: any[],
  ctx: { date: string; place: string; raceNumber: string; yearFilter: string | null }
) {
  const { date, place, raceNumber, yearFilter } = ctx;
  const scoreSource = await fetchScoreSourceData(db, horses, {
    date: String(date),
    place: String(place),
    raceNumber: String(raceNumber),
    year: yearFilter,
  });
  const processedPastRacesByHorse = scoreSource.processedPastRacesByHorse;
  const indicesMap = scoreSource.indicesMap;
  const currentRaceIndexIds = scoreSource.currentRaceIndexIds;

  // STEP3.5（refactor 対象外・現行 handler.ts と同一）
  const raceLevelMap = new Map<string, any>();
  const allPastRaceIds: string[] = [];
  for (const [, races] of processedPastRacesByHorse) {
    for (const race of races) {
      const raceId = race.race_id;
      if (raceId && raceId.length >= 16) allPastRaceIds.push(raceId);
    }
  }
  const uniqueRaceIds = [...new Set(allPastRaceIds)];
  if (uniqueRaceIds.length > 0) {
    const levelPlaceholders = uniqueRaceIds.map((_, i) => `$${i + 1}`).join(',');
    const allLevels = (await db
      .prepare(
        `SELECT race_id, level, level_label, total_horses_run, first_run_good_count, win_count, ai_comment FROM race_levels WHERE race_id IN (${levelPlaceholders})`
      )
      .all(...uniqueRaceIds)) as any[];
    for (const lv of allLevels) {
      const plusCount = (lv.level_label?.match(/\+/g) || []).length;
      raceLevelMap.set(lv.race_id, {
        level: lv.level,
        levelLabel: lv.level_label || lv.level,
        totalHorsesRun: lv.total_horses_run || 0,
        firstRunGoodCount: lv.first_run_good_count || 0,
        winCount: lv.win_count || 0,
        plusCount,
        aiComment: lv.ai_comment || '',
      });
    }
  }

  const { perHorse: scorePerHorse } = computeScoresFromSource(horses, scoreSource, {
    date: String(date),
    place: String(place),
    raceNumber: String(raceNumber),
    year: yearFilter,
  });

  const horsesWithScore = horses.map((horse: any, horseIndex: number) => {
    const horseName = normalizeHorseName_NEW(GET_NEW(horse, 'umamei'));
    const uniquePastRaces = processedPastRacesByHorse.get(horseName) || [];
    const pastRacesWithIndices = uniquePastRaces.map((race: any) => {
      const raceIdBase = race.race_id || '';
      const horseNum = String(race.umaban || race.horse_number || '').padStart(2, '0');
      const fullRaceId = `${raceIdBase}${horseNum}`;
      const raceIndices = indicesMap.get(fullRaceId) || null;
      const raceLevel = raceLevelMap.get(raceIdBase) || null;
      const raceNumberDerived = raceIdBase.length >= 2 ? String(parseInt(raceIdBase.slice(-2), 10)) : '';
      return { ...race, race_number: raceNumberDerived, indices: raceIndices, indexRaceId: fullRaceId, raceLevel };
    });

    const raw = scorePerHorse[horseIndex];
    const score = raw ? raw.score : 0;
    const scoreBreakdown: KisoScoreBreakdown | null = horseIndex < 3 ? (raw?.breakdown ?? null) : null;

    const indexRaceId = currentRaceIndexIds[horseIndex];
    const indices = indicesMap.get(indexRaceId) || null;

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
      past_races_count: pastRacesWithIndices.length,
      past: pastRacesWithIndices,
      hasData: pastRacesWithIndices.length > 0,
      score,
      indices,
      indexRaceId,
      scoreBreakdown: scoreBreakdown
        ? {
            pos: scoreBreakdown.positionImprovement,
            pace: scoreBreakdown.paceSync,
            course: scoreBreakdown.courseFit,
            penalty: scoreBreakdown.penalty,
            lastPos: scoreBreakdown.details.lastPosition,
            avgPos: scoreBreakdown.details.avgPastPosition,
            fwdRate: scoreBreakdown.details.forwardRate,
          }
        : null,
    };
  });

  horsesWithScore.sort((a: any, b: any) => b.score - a.score);
  return horsesWithScore;
}

function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ============================================================
// Fixture: 6頭（過去走豊富・凡走・過去走なし・4頭目以降で内訳truncate確認）
// ============================================================
const RACE = { year: '2025', date: '0208', place: '中山', raceNumber: '9' };

const WAKUJUN = [
  { id: 1, date: '0208', place: '中山', race_number: '9', year: '2025', waku: '1', umaban: '1', umamei: 'ホースA', kishu: '騎手A', kinryo: '55', distance: '芝2000', tosu: '6', class_name_1: '3勝', track_type: '芝', nenrei: '4', seibetsu: '牡' },
  { id: 2, date: '0208', place: '中山', race_number: '9', year: '2025', waku: '2', umaban: '2', umamei: 'ホースB', kishu: '騎手B', kinryo: '56', distance: '芝2000', tosu: '6', class_name_1: '3勝', track_type: '芝', nenrei: '5', seibetsu: '牡' },
  { id: 3, date: '0208', place: '中山', race_number: '9', year: '2025', waku: '3', umaban: '3', umamei: 'ホースC', kishu: '騎手C', kinryo: '54', distance: '芝2000', tosu: '6', class_name_1: '3勝', track_type: '芝', nenrei: '3', seibetsu: '牝' },
  { id: 4, date: '0208', place: '中山', race_number: '9', year: '2025', waku: '4', umaban: '4', umamei: 'ホースD', kishu: '騎手D', kinryo: '55', distance: '芝2000', tosu: '6', class_name_1: '3勝', track_type: '芝', nenrei: '4', seibetsu: '牡' },
  { id: 5, date: '0208', place: '中山', race_number: '9', year: '2025', waku: '5', umaban: '5', umamei: 'ホースE', kishu: '騎手E', kinryo: '57', distance: '芝2000', tosu: '6', class_name_1: '3勝', track_type: '芝', nenrei: '6', seibetsu: '牡' },
  { id: 6, date: '0208', place: '中山', race_number: '9', year: '2025', waku: '6', umaban: '6', umamei: 'ホースF', kishu: '騎手F', kinryo: '54', distance: '芝2000', tosu: '6', class_name_1: '3勝', track_type: '芝', nenrei: '3', seibetsu: '牝' },
];

function pastRow(horse_name: string, race_id: string, umaban: string, date: string, finish: string, corner: string) {
  return {
    horse_name,
    race_id,
    umaban,
    date,
    distance: '芝2000',
    finish_position: finish,
    margin: finish === '1' ? '-0.2' : '0.5',
    corner_2: corner,
    corner_3: corner,
    corner_4: corner,
    field_size: '14',
    pci: '50',
    class_name: '3勝',
    place: '中山',
    finish_time: '2:00.5',
  };
}

const UMADATA: Record<string, any[]> = {
  ホースA: [
    pastRow('ホースA', '2024120106090111', '01', '2024.12.01', '1', '2'),
    pastRow('ホースA', '2024110206090111', '01', '2024.11.02', '2', '3'),
    pastRow('ホースA', '2024100506090111', '01', '2024.10.05', '1', '1'),
  ],
  ホースB: [pastRow('ホースB', '2024120106090212', '02', '2024.12.01', '9', '10')],
  ホースC: [], // 過去走なし
  ホースD: [pastRow('ホースD', '2024120106090414', '04', '2024.12.01', '5', '6')],
  ホースE: [pastRow('ホースE', '2024120106090515', '05', '2024.12.01', '3', '4')],
  ホースF: [pastRow('ホースF', '2024120106090616', '06', '2024.12.01', '7', '8')],
};

const INDICES: Record<string, any> = {
  '202412010609011101': { race_id: '202412010609011101', L4F: 48, T2F: 46, potential: 7.5, revouma: 55, makikaeshi: 8.0, cushion: 9, pfs_past: 6.0, corner_lane: 1, revouma2: 55 },
  '202411020609011101': { race_id: '202411020609011101', L4F: 47, T2F: 45, potential: 6.5, revouma: 54, makikaeshi: 7.0, cushion: 9, pfs_past: 5.8, corner_lane: 1, revouma2: 54 },
  '202410050609011101': { race_id: '202410050609011101', L4F: 49, T2F: 47, potential: 8.0, revouma: 56, makikaeshi: 8.5, cushion: 9, pfs_past: 6.2, corner_lane: 1, revouma2: 56 },
  '202412010609021202': { race_id: '202412010609021202', L4F: 39, T2F: 37, potential: 1.5, revouma: 38, makikaeshi: 1.5, cushion: 9, pfs_past: 1.8, corner_lane: 5, revouma2: 38 },
  '202412010609041404': { race_id: '202412010609041404', L4F: 43, T2F: 41, potential: 4.0, revouma: 46, makikaeshi: 4.0, cushion: 9, pfs_past: 3.5, corner_lane: 3, revouma2: 46 },
  '202412010609051505': { race_id: '202412010609051505', L4F: 45, T2F: 43, potential: 5.5, revouma: 50, makikaeshi: 5.5, cushion: 9, pfs_past: 4.5, corner_lane: 2, revouma2: 50 },
  '202412010609061606': { race_id: '202412010609061606', L4F: 41, T2F: 39, potential: 3.0, revouma: 42, makikaeshi: 3.0, cushion: 9, pfs_past: 2.8, corner_lane: 4, revouma2: 42 },
};

const RACE_LEVELS: Record<string, any> = {
  '2024120106090111': { race_id: '2024120106090111', level: 'A', level_label: 'A++', total_horses_run: 14, first_run_good_count: 3, win_count: 1, ai_comment: '好レース' },
};

function makeDb() {
  return {
    prepare(sql: string) {
      return {
        all: async (...params: any[]) => {
          if (sql.includes('FROM wakujun')) return WAKUJUN.map((h) => ({ ...h }));
          if (sql.includes('FROM umadata')) {
            const names = new Set(params.map((p) => String(p)));
            const out: any[] = [];
            for (const n of names) for (const r of UMADATA[n] ?? []) out.push({ ...r });
            return out;
          }
          if (sql.includes('FROM indices')) return params.map((id) => INDICES[String(id)]).filter(Boolean);
          if (sql.includes('FROM race_levels')) return params.map((id) => RACE_LEVELS[String(id)]).filter(Boolean);
          return [];
        },
      };
    },
  };
}

async function main() {
  const dbOld = makeDb();
  const dbNew = makeDb();
  const ctx = { date: RACE.date, place: RACE.place, raceNumber: RACE.raceNumber, yearFilter: RACE.year };

  const oldResult = await computeOldHorsesWithScore(dbOld, WAKUJUN, ctx);
  const newResult = await computeNewHorsesWithScore(dbNew, WAKUJUN, ctx);

  check('件数一致', oldResult.length === newResult.length, `old=${oldResult.length} new=${newResult.length}`);
  check(
    '馬の並び順一致（score降順ソート後のumaban列）',
    JSON.stringify(oldResult.map((h: any) => h.umaban)) === JSON.stringify(newResult.map((h: any) => h.umaban)),
    `old=${oldResult.map((h: any) => h.umaban)} new=${newResult.map((h: any) => h.umaban)}`
  );

  for (let i = 0; i < oldResult.length; i++) {
    const o = oldResult[i];
    const n = newResult.find((h: any) => h.umaban === o.umaban);
    check(`umaban=${o.umaban}: score一致`, o.score === n.score, `old=${o.score} new=${n.score}`);
    check(`umaban=${o.umaban}: hasData一致`, o.hasData === n.hasData);
    check(`umaban=${o.umaban}: past_races_count一致`, o.past_races_count === n.past_races_count);
    check(`umaban=${o.umaban}: past_races deep-equal`, deepEqual(o.past_races, n.past_races));
    check(`umaban=${o.umaban}: indices deep-equal`, deepEqual(o.indices, n.indices));
    check(`umaban=${o.umaban}: indexRaceId一致`, o.indexRaceId === n.indexRaceId);
    check(`umaban=${o.umaban}: scoreBreakdown deep-equal`, deepEqual(o.scoreBreakdown, n.scoreBreakdown), `old=${JSON.stringify(o.scoreBreakdown)} new=${JSON.stringify(n.scoreBreakdown)}`);
    check(`umaban=${o.umaban}: 全体deep-equal`, deepEqual(o, n));
  }

  // 過去走なし馬（ホースC）は score=0 のまま（0へ丸め動作が refactor 後も一致）
  const cOld = oldResult.find((h: any) => h.umaban === '3');
  const cNew = newResult.find((h: any) => h.umaban === '3');
  check('過去走なし: 旧score===0', cOld.score === 0, `score=${cOld.score}`);
  check('過去走なし: 新score===0', cNew.score === 0, `score=${cNew.score}`);
  check('過去走なし: hasData===false（旧新一致）', cOld.hasData === false && cNew.hasData === false);

  // 4頭目以降は scoreBreakdown が null であること（既存の「先頭3頭のみ」挙動を維持）
  const sortedByIndexInInput = ['4', '5', '6']; // horseIndex 3..5 は元 WAKUJUN 順で umaban 4..6
  for (const um of sortedByIndexInInput) {
    const n = newResult.find((h: any) => h.umaban === um);
    check(`umaban=${um}: scoreBreakdown null（4頭目以降）`, n.scoreBreakdown === null);
  }

  // レスポンス全体（配列そのもの）を deep-equal で最終確認
  check('horsesWithScore 配列 全体deep-equal', deepEqual(oldResult, newResult));

  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} : ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
