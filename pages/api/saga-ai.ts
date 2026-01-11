/**
 * 俺AI APIエンドポイント (Pages Router版)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db-new';
import { SagaBrain, HorseAnalysisInput, SagaAnalysis, TimeComparisonRace, PastRaceTimeComparison } from '../../lib/saga-ai/saga-brain';
import { getOpenAISaga, OpenAISagaResult } from '../../lib/saga-ai/openai-saga';
import { toHalfWidth, parseFinishPosition } from '../../utils/parse-helpers';
import { computeKisoScore } from '../../utils/getClusterData';
import type { RecordRow } from '../../types/record';
import type Database from 'better-sqlite3';

// ========================================
// キャッシュ機能（5分間有効）
// ========================================
interface CacheEntry {
  data: any;
  timestamp: number;
}

const analysisCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

function getCacheKey(year: string, date: string, place: string, raceNumber: string, trackCondition: string): string {
  return `${year}_${date}_${place}_${raceNumber}_${trackCondition}`;
}

function getFromCache(key: string): any | null {
  const entry = analysisCache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    analysisCache.delete(key);
    return null;
  }
  
  return entry.data;
}

function setToCache(key: string, data: any): void {
  // キャッシュが大きくなりすぎないよう、100件を超えたら古いものを削除
  if (analysisCache.size > 100) {
    const keysToDelete: string[] = [];
    const now = Date.now();
    for (const [k, v] of analysisCache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MS) {
        keysToDelete.push(k);
      }
    }
    keysToDelete.forEach(k => analysisCache.delete(k));
    
    // それでも100件超えていたら最初の50件を削除
    if (analysisCache.size > 100) {
      const keys = Array.from(analysisCache.keys()).slice(0, 50);
      keys.forEach(k => analysisCache.delete(k));
    }
  }
  
  analysisCache.set(key, { data, timestamp: Date.now() });
}

/**
 * 馬名を正規化（$, *, スペースを除去）
 */
function normalizeHorseName(name: string): string {
  return name
    .replace(/^[\$\*＄＊\s　]+/, '')
    .replace(/[\s　]+$/, '')
    .trim();
}

interface RequestBody {
  year: string;
  date: string;
  place: string;
  raceNumber: string;
  useAI?: boolean;
  trackCondition?: '良' | '稍' | '重' | '不';
}

/**
 * 時計比較用のレースを取得
 */
function getTimeComparisonRaces(
  db: Database.Database,
  pastRaceDate: string,
  pastRacePlace: string,
  pastRaceDistance: string,
): TimeComparisonRace[] {
  if (!pastRaceDate || !pastRacePlace || !pastRaceDistance) {
    return [];
  }

  try {
    const cleanedDate = pastRaceDate.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
    const dateParts = cleanedDate.split('.');
    if (dateParts.length !== 3) return [];

    const [year, month, day] = dateParts.map(Number);
    const raceDate = new Date(year, month - 1, day);

    const prevDate = new Date(raceDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const nextDate = new Date(raceDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const formatDateSpaced = (d: Date) =>
      `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, ' ')}.${String(d.getDate()).padStart(2, ' ')}`;
    const formatDatePadded = (d: Date) =>
      `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

    const dateRange = [
      formatDateSpaced(prevDate),
      formatDateSpaced(raceDate),
      formatDateSpaced(nextDate),
      formatDatePadded(prevDate),
      formatDatePadded(raceDate),
      formatDatePadded(nextDate),
    ];

    const normalizedPlace = pastRacePlace.replace(/^[0-9０-９]+/, '').replace(/[0-9０-９]+$/, '').trim();

    const query = `
      SELECT 
        date, place, distance, class_name, finish_time, track_condition, 
        horse_name, age, race_id_new_no_horse_num
      FROM umadata
      WHERE date IN (?, ?, ?, ?, ?, ?)
        AND place LIKE ?
        AND distance = ?
        AND finish_position = '１'
      ORDER BY date DESC
    `;

    const rows = db.prepare(query).all(
      dateRange[0], dateRange[1], dateRange[2],
      dateRange[3], dateRange[4], dateRange[5],
      `%${normalizedPlace}%`,
      pastRaceDistance
    ) as any[];

    if (!rows || rows.length === 0) return [];

    return rows.map(row => {
      const age = parseInt(toHalfWidth(row.age || '0'), 10);
      const className = row.class_name || '';
      const isGradedRace = /G[123]|Ｇ[１２３]|重賞|JG[123]|ＪＧ[１２３]/i.test(className);
      const isYoungHorse = age === 2 || age === 3;

      // race_id_new_no_horse_numからレース番号を抽出（末尾2桁がレース番号と推定）
      const raceId = row.race_id_new_no_horse_num || '';
      const raceNumber = raceId ? raceId.slice(-2).replace(/^0/, '') : '';

      return {
        date: row.date || '',
        place: row.place || '',
        distance: row.distance || '',
        className: row.class_name || '',
        finishTime: parseInt(toHalfWidth(row.finish_time || '0'), 10),
        trackCondition: row.track_condition || '良',
        horseName: row.horse_name || '',
        horseAge: age,
        isAgeRestricted: isGradedRace && isYoungHorse,
        raceNumber,
      };
    });
  } catch (e) {
    console.error('[saga-ai] Error getting time comparison races:', e);
    return [];
  }
}

// 歴代ラップデータ取得（同条件の過去勝ち馬のラップを取得）
interface HistoricalLapRow {
  date: string;
  place: string;
  className: string;
  trackCondition: string;
  last4F: number;
  last5F: number;
  winnerName?: string;
}

function getHistoricalLapData(
  db: Database.Database,
  place: string,
  surface: string,
  distance: number,
  className: string,
  trackCondition: string
): HistoricalLapRow[] {
  try {
    const normalizedPlace = place.replace(/^[0-9０-９]+/, '').replace(/[0-9０-９]+$/, '').trim();
    const distanceStr = `${surface}${distance}`;

    // クラス名を正規化
    const normalizedClass = normalizeClassForQuery(className);

    const query = `
      SELECT 
        date, place, class_name, track_condition, work_1s, horse_name
      FROM umadata
      WHERE place LIKE ?
        AND distance = ?
        AND finish_position = '１'
        AND work_1s IS NOT NULL
        AND work_1s != ''
      ORDER BY date DESC
      LIMIT 200
    `;

    const rows = db.prepare(query).all(
      `%${normalizedPlace}%`,
      distanceStr
    ) as any[];

    if (!rows || rows.length === 0) return [];

    const results: HistoricalLapRow[] = [];

    for (const row of rows) {
      // クラスフィルタリング（同じクラスレベルのみ）
      const rowClassNormalized = normalizeClassForQuery(row.class_name || '');
      if (!isSameClassLevel(normalizedClass, rowClassNormalized)) continue;

      // 馬場状態フィルタリング（比較可能なもののみ）
      if (!isTrackConditionComparableForHistorical(trackCondition, row.track_condition)) continue;

      // ラップ解析
      const laps = parseLapTimesFromWorkString(row.work_1s);
      if (laps.length < 4) continue;

      const last4F = sumLastNLaps(laps, 4);
      const last5F = laps.length >= 5 ? sumLastNLaps(laps, 5) : 0;

      if (last4F <= 0) continue;

      results.push({
        date: row.date || '',
        place: row.place || '',
        className: row.class_name || '',
        trackCondition: row.track_condition || '',
        last4F,
        last5F,
        winnerName: row.horse_name || '',
      });
    }

    return results;
  } catch (e) {
    console.error('[saga-ai] Error getting historical lap data:', e);
    return [];
  }
}

// クラス名をクエリ用に正規化
function normalizeClassForQuery(className: string): string {
  if (!className) return 'unknown';
  const c = className.trim();
  
  if (c.includes('新馬')) return 'newcomer';
  if (c.includes('未勝利')) return 'maiden';
  if (c.includes('1勝') || c.includes('1勝') || c.includes('500万')) return '1win';
  if (c.includes('2勝') || c.includes('2勝') || c.includes('1000万')) return '2win';
  if (c.includes('3勝') || c.includes('3勝') || c.includes('1600万')) return '3win';
  if (/G1|Ｇ１|JG1|ＪＧ１/i.test(c)) return 'g1';
  if (/G2|Ｇ２|JG2|ＪＧ２/i.test(c)) return 'g2';
  if (/G3|Ｇ３|JG3|ＪＧ３/i.test(c)) return 'g3';
  if (c.includes('OP') || c.includes('オープン') || c.includes('ｵｰﾌﾟﾝ') || c.includes('重賞')) return 'open';
  
  return 'unknown';
}

// 同じクラスレベルかどうか
function isSameClassLevel(class1: string, class2: string): boolean {
  return class1 === class2;
}

// 馬場状態が歴代比較に適しているか
function isTrackConditionComparableForHistorical(cond1: string, cond2: string): boolean {
  const levels: Record<string, number> = { '良': 1, '稍': 2, '稍重': 2, '重': 3, '不': 4, '不良': 4 };
  const getLevel = (c: string) => {
    for (const [key, val] of Object.entries(levels)) {
      if (c.includes(key)) return val;
    }
    return 1;
  };
  // 同じ馬場状態のみ比較（厳密に）
  return getLevel(cond1) === getLevel(cond2);
}

// ワーク文字列からラップを解析
function parseLapTimesFromWorkString(workStr: string): number[] {
  if (!workStr) return [];
  // "12.3-11.5-11.8-12.0" -> [12.3, 11.5, 11.8, 12.0]
  const parts = workStr.split('-').map(s => s.trim());
  return parts
    .map(p => parseFloat(p))
    .filter(n => !isNaN(n) && n > 0);
}

// 後半N個のラップ合計
function sumLastNLaps(laps: number[], n: number): number {
  if (laps.length < n) return 0;
  const lastN = laps.slice(-n);
  return lastN.reduce((sum, v) => sum + v, 0);
}

// umadataの行をRecordRow形式に変換
function mapUmadataToRecordRow(dbRow: any, indices: any = null): RecordRow {
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

  if (indices) {
    result['indices'] = indices;
    result['巻き返し指数'] = indices.makikaeshi !== null && indices.makikaeshi !== undefined ? String(indices.makikaeshi) : '';
    result['ポテンシャル指数'] = indices.potential !== null && indices.potential !== undefined ? String(indices.potential) : '';
    result['L4F指数'] = indices.L4F !== null && indices.L4F !== undefined ? String(indices.L4F) : '';
    result['T2F指数'] = indices.T2F !== null && indices.T2F !== undefined ? String(indices.T2F) : '';
  }
  return result as RecordRow;
}

// wakujunの行をRecordRow形式に変換
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

function generateSummary(topHorses: SagaAnalysis[], aiResults?: OpenAISagaResult[] | null): string {
  if (topHorses.length === 0) return '';

  const lines: string[] = [];

  lines.push('【俺AIの見解】');

  const useAIResults = aiResults && aiResults.length > 0;
  const displayHorses = useAIResults
    ? aiResults.slice(0, 3)
    : topHorses;

  for (let i = 0; i < displayHorses.length; i++) {
    const h = displayHorses[i];
    const mark = i === 0 ? '◎' : i === 1 ? '○' : '▲';

    if (useAIResults) {
      const aiH = h as OpenAISagaResult;
      let comment = `${mark}${aiH.horseNumber}番 ${aiH.horseName}`;

      if (aiH.tags.length > 0) {
        comment += `（${aiH.tags.slice(0, 3).join('、')}）`;
      }

      lines.push(comment);

      if (aiH.aiComment) {
        const shortComment = aiH.aiComment.split('。').slice(0, 2).join('。');
        if (shortComment) {
          lines.push(`  ${shortComment}。`);
        }
      }

      if (aiH.ruleBasedAnalysis.warnings.length > 0) {
        lines.push(`  ⚠️ ${aiH.ruleBasedAnalysis.warnings[0]}`);
      }
    } else {
      const ruleH = h as SagaAnalysis;
      let comment = `${mark}${ruleH.horseNumber}番 ${ruleH.horseName}`;

      if (ruleH.tags.length > 0) {
        comment += `（${ruleH.tags.slice(0, 3).join('、')}）`;
      }

      lines.push(comment);

      if (ruleH.comments.length > 0) {
        lines.push(`  ${ruleH.comments[0]}`);
      }

      if (ruleH.warnings.length > 0) {
        lines.push(`  ⚠️ ${ruleH.warnings[0]}`);
      }
    }
  }

  return lines.join('\n');
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body as RequestBody;
    const { year, date, place: rawPlace, raceNumber, useAI = false, trackCondition = '良' } = body;

    if (!year || !date || !rawPlace || !raceNumber) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // キャッシュチェック（AI使用時はキャッシュしない）
    const cacheKey = getCacheKey(year, date, rawPlace, raceNumber, trackCondition);
    if (!useAI) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        console.log(`[saga-ai] キャッシュヒット: ${cacheKey}`);
        return res.status(200).json(cached);
      }
    }

    const normalizePlace = (p: string): string => {
      if (!p) return '';
      return p.replace(/^[0-9０-９]+/, '').replace(/[0-9０-９]+$/, '').trim();
    };

    const normalizedPlace = normalizePlace(rawPlace);

    const db = getRawDb();
    const brain = new SagaBrain();

    const openAISagaChecker = getOpenAISaga();
    const isAIEnabled = openAISagaChecker.isOpenAIEnabled();
    const openAISaga = useAI && isAIEnabled ? openAISagaChecker : null;

    const horses = db.prepare(`
      SELECT * FROM wakujun
      WHERE date = ? AND place = ? AND race_number = ?
      ORDER BY CAST(umaban AS INTEGER)
    `).all(date, rawPlace, raceNumber) as any[];

    if (!horses || horses.length === 0) {
      db.close();
      return res.status(404).json({ error: 'No horses found' });
    }

    const raceInfo = horses[0];
    const surface = raceInfo.track_type?.includes('芝') ? '芝' : 'ダ';
    const distance = parseInt(raceInfo.distance || '0', 10);
    const place = normalizedPlace;

    const memberIndices: { horseNum: number; T2F: number; L4F: number; kisoScore: number; relevantRaceCount?: number; potential?: number; makikaeshi?: number }[] = [];
    const horseDataList: { horse: any; pastRaces: any[]; distanceFilteredRaces?: any[]; indices: any; kisoScore?: number }[] = [];

    for (const horse of horses) {
      const rawHorseName = (horse.umamei || '').trim();
      const horseName = normalizeHorseName(rawHorseName);
      const horseNum = parseInt(horse.umaban || '0', 10);

      const pastRacesRawWithDuplicates = db.prepare(`
        SELECT * FROM umadata
        WHERE TRIM(horse_name) = ?
        ORDER BY date DESC
        LIMIT 100
      `).all(horseName) as any[];

      const pastRacesRaw = Array.from(
        new Map(
          pastRacesRawWithDuplicates.map(race => [
            race.race_id_new_no_horse_num || `${race.date}_${race.place}_${race.race_name || ''}_${race.distance}`,
            race
          ])
        ).values()
      ).slice(0, 50);

      const pastRacesWithIndices = pastRacesRaw.map((race: any) => {
        const raceIdBase = race.race_id_new_no_horse_num || '';
        const horseNumStr = String(race.horse_number || '').padStart(2, '0');
        const fullRaceId = `${raceIdBase}${horseNumStr}`;

        let indices: any = null;
        try {
          const indexData = db.prepare(`
            SELECT L4F, T2F, potential, makikaeshi
            FROM indices WHERE race_id = ?
          `).get(fullRaceId);
          if (indexData) indices = indexData;
        } catch {
          // 指数データがない場合は無視
        }

        const pastRawPlace = race.place || '';
        const pastNormalizedPlace = normalizePlace(pastRawPlace);
        const pastSurface = (race.distance || '').includes('芝') ? '芝' as const : 'ダ' as const;
        const pastDistance = parseInt((race.distance || '0').replace(/[^\d]/g, ''), 10);
        const pastFinishPosition = parseFinishPosition(race.finish_position);

        // 1着レースの場合は歴代比較用データを取得
        let historicalLapData: HistoricalLapRow[] | undefined;
        if (pastFinishPosition === 1 && race.work_1s) {
          historicalLapData = getHistoricalLapData(
            db,
            pastNormalizedPlace,
            pastSurface,
            pastDistance,
            race.class_name || '',
            race.track_condition || '良'
          );
        }

        return {
          ...race,
          indices,
          date: race.date || '',
          place: pastNormalizedPlace,
          rawPlace: pastRawPlace,
          rawDistance: race.distance || '',
          surface: pastSurface,
          distance: pastDistance,
          finishPosition: pastFinishPosition,
          popularity: parseFinishPosition(race.popularity),
          margin: race.margin || '',
          corner2: parseInt(toHalfWidth(race.corner_2 || '0'), 10) || undefined,
          corner3: parseInt(toHalfWidth(race.corner_3 || '0'), 10) || undefined,
          corner4: parseInt(toHalfWidth(race.corner_4 || '0'), 10) || undefined,
          T2F: indices?.T2F || 0,
          L4F: indices?.L4F || 0,
          potential: indices?.potential || 0,
          makikaeshi: indices?.makikaeshi || 0,
          finishTime: parseInt(toHalfWidth(race.finish_time || '0'), 10),
          className: race.class_name || '',
          trackCondition: race.track_condition || '良',
          horseAge: parseInt(toHalfWidth(race.age || '0'), 10),
          // ラップ分析用データ
          lapString: race.work_1s || '',              // ラップタイム（"12.3-10.5-11.8..."）
          corner4Wide: parseInt(race.index_value || '2', 10) || 2,  // 4角位置（内外: 0-4）
          totalHorses: parseInt(race.number_of_horses || '16', 10), // 出走頭数
          ownLast3F: parseFloat(race.last_3f || '0') || 0,          // 自身の上がり3F
          // 歴代比較用データ（1着レースのみ）
          historicalLapData,
        };
      });

      const distanceFilteredRaces = pastRacesWithIndices.filter(r => {
        const distDiff = Math.abs(r.distance - distance);
        return distDiff <= 200 && r.surface === surface;
      });

      const t2fValues = distanceFilteredRaces.slice(0, 5).map(r => r.T2F).filter(v => v > 0);
      const l4fValues = distanceFilteredRaces.slice(0, 5).map(r => r.L4F).filter(v => v > 0);
      const potentialValues = distanceFilteredRaces.slice(0, 5).map(r => r.potential).filter(v => v > 0);
      const makikaeshiValues = distanceFilteredRaces.slice(0, 5).map(r => r.makikaeshi).filter(v => v > 0);

      const avgT2F = t2fValues.length > 0 ? t2fValues.reduce((a, b) => a + b, 0) / t2fValues.length : 0;
      const avgL4F = l4fValues.length > 0 ? l4fValues.reduce((a, b) => a + b, 0) / l4fValues.length : 0;
      const avgPotential = potentialValues.length > 0 ? potentialValues.reduce((a, b) => a + b, 0) / potentialValues.length : 0;
      const avgMakikaeshi = makikaeshiValues.length > 0 ? makikaeshiValues.reduce((a, b) => a + b, 0) / makikaeshiValues.length : 0;

      const relevantRaceCount = distanceFilteredRaces.length;

      const pastRecordRows = pastRacesWithIndices.map(r => mapUmadataToRecordRow(r, r.indices));
      const entryRecordRow = mapWakujunToRecordRow(horse);

      let calculatedKisoScore = 0;
      try {
        calculatedKisoScore = computeKisoScore({ past: pastRecordRows, entry: entryRecordRow });
      } catch (e) {
        console.error(`[saga-ai] Error calculating kisoScore for ${horseName}:`, e);
        calculatedKisoScore = 0;
      }

      memberIndices.push({
        horseNum,
        T2F: avgT2F,
        L4F: avgL4F,
        kisoScore: calculatedKisoScore,
        relevantRaceCount,
        potential: avgPotential,
        makikaeshi: avgMakikaeshi,
      });

      horseDataList.push({
        horse,
        pastRaces: pastRacesWithIndices,
        distanceFilteredRaces,
        indices: { T2F: avgT2F, L4F: avgL4F, relevantRaceCount, potential: avgPotential, makikaeshi: avgMakikaeshi },
        kisoScore: calculatedKisoScore,
      });
    }

    const t2fWithData = memberIndices.filter(m => m.T2F > 0 && (m.relevantRaceCount || 0) > 0);
    const l4fWithData = memberIndices.filter(m => m.L4F > 0 && (m.relevantRaceCount || 0) > 0);

    const t2fSorted = [...t2fWithData].sort((a, b) => a.T2F - b.T2F);
    const l4fSorted = [...l4fWithData].sort((a, b) => b.L4F - a.L4F);
    const kisoSorted = [...memberIndices].sort((a, b) => b.kisoScore - a.kisoScore);

    const getRankAndPercentile = (arr: typeof memberIndices, horseNum: number, totalWithData: number) => {
      const idx = arr.findIndex(x => x.horseNum === horseNum);
      if (idx < 0 || totalWithData === 0) return { rank: 99, percentile: 100 };
      const rank = idx + 1;
      const percentile = Math.round((rank / totalWithData) * 100);
      return { rank, percentile };
    };

    const getRank = (arr: typeof memberIndices, horseNum: number) => {
      const idx = arr.findIndex(x => x.horseNum === horseNum);
      return idx >= 0 ? idx + 1 : 99;
    };

    const analyses: SagaAnalysis[] = [];
    const horseInputs: HorseAnalysisInput[] = [];

    for (const { horse, pastRaces, indices, kisoScore } of horseDataList) {
      const horseNum = parseInt(horse.umaban || '0', 10);

      const t2fStats = getRankAndPercentile(t2fSorted, horseNum, t2fWithData.length);
      const l4fStats = getRankAndPercentile(l4fSorted, horseNum, l4fWithData.length);

      const timeComparisonData: PastRaceTimeComparison[] = [];
      const maxComparisonRaces = Math.min(5, pastRaces.length);

      for (let i = 0; i < maxComparisonRaces; i++) {
        const race = pastRaces[i];

        if (race.date && race.rawPlace && race.rawDistance && race.finishTime) {
          const comparisonRaces = getTimeComparisonRaces(
            db,
            race.date,
            race.rawPlace,
            race.rawDistance
          );

          if (comparisonRaces.length > 0) {
            timeComparisonData.push({
              pastRaceIndex: i,
              pastRaceDate: race.date,
              pastRaceClass: race.className || '',
              pastRaceTime: race.finishTime,
              pastRaceCondition: race.trackCondition || '良',
              comparisonRaces,
            });
          }
        }
      }

      const input: HorseAnalysisInput = {
        horseName: (horse.umamei || '').trim(),
        horseNumber: horseNum,
        waku: parseInt(horse.waku || '0', 10),
        raceDate: date,
        place,
        surface,
        distance,
        trackCondition,
        pastRaces,
        indices: {
          T2F: indices.T2F,
          L4F: indices.L4F,
          potential: indices.potential || 0,
          makikaeshi: indices.makikaeshi || 0,
        },
        memberRanks: {
          T2F: t2fStats.rank,
          L4F: l4fStats.rank,
          kisoScore: getRank(kisoSorted, horseNum),
        },
        memberPercentiles: {
          T2F: t2fStats.percentile,
          L4F: l4fStats.percentile,
          T2FDataCount: t2fWithData.length,
          L4FDataCount: l4fWithData.length,
        },
        relevantRaceCount: indices.relevantRaceCount || 0,
        kisoScore: kisoScore || 0,
        scoreDeviation: horse.score_deviation || 50,
        timeComparisonData,
      };

      horseInputs.push(input);

      const analysis = brain.analyzeHorse(input);

      analysis.debugInfo = {
        t2f: {
          value: indices.T2F || 0,
          rank: t2fStats.rank,
          total: t2fWithData.length,
          percentile: t2fStats.percentile,
        },
        l4f: {
          value: indices.L4F || 0,
          rank: l4fStats.rank,
          total: l4fWithData.length,
          percentile: l4fStats.percentile,
        },
        relevantRaceCount: indices.relevantRaceCount || 0,
      };

      if (indices.relevantRaceCount === 0) {
        analysis.tags.push('距離データなし');
        analysis.score -= 15;
        analysis.warnings.push('今回距離帯のデータがないため評価困難');
      } else if (indices.relevantRaceCount === 1) {
        analysis.tags.push('距離データ少');
        analysis.score -= 5;
      }

      analyses.push(analysis);
    }

    analyses.sort((a, b) => {
      return (b.score || 0) - (a.score || 0);
    });

    db.close();

    let aiResults: OpenAISagaResult[] | null = null;
    if (openAISaga && openAISaga.isOpenAIEnabled()) {
      try {
        aiResults = await openAISaga.analyzeRace(horseInputs, {
          place,
          distance,
          surface,
          raceDate: date,
        });
      } catch (error) {
        console.error('OpenAI API error:', error);
      }
    }

    const responseData = {
      success: true,
      raceInfo: {
        year,
        date,
        place,
        raceNumber,
        surface,
        distance,
        horseCount: horses.length,
      },
      analyses,
      aiAnalyses: aiResults,
      aiEnabled: isAIEnabled,
      summary: generateSummary(analyses.slice(0, 3), aiResults),
    };

    // キャッシュに保存（AI使用時はキャッシュしない）
    if (!useAI) {
      setToCache(cacheKey, responseData);
      console.log(`[saga-ai] キャッシュ保存: ${cacheKey}`);
    }

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('SAGA AI error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
