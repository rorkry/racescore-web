import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db';
import { computeKisoScore, KisoScoreBreakdown } from '../../utils/getClusterData';
import type { RecordRow } from '../../types/record';
import { parseFinishPosition, getCornerPositions } from '../../utils/parse-helpers';

// ========================================
// サーバーサイドメモリキャッシュ（高速化）
// ========================================
interface CacheEntry {
  data: any;
  timestamp: number;
}

// globalThisを使ってサーバーサイドでキャッシュを永続化
declare global {
  var _raceCardCache: Map<string, CacheEntry> | undefined;
}

if (!globalThis._raceCardCache) {
  globalThis._raceCardCache = new Map();
}

const CACHE_TTL = 5 * 60 * 1000; // 5分間キャッシュ有効
const MAX_CACHE_SIZE = 200; // 最大200レース分

function getCacheKey(year: string | number | null, date: string, place: string, raceNumber: string): string {
  return `${year || 'null'}_${date}_${place}_${raceNumber}`;
}

function getFromCache(key: string): any | null {
  const entry = globalThis._raceCardCache?.get(key);
  if (!entry) return null;
  
  // TTL超過チェック
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    globalThis._raceCardCache?.delete(key);
    return null;
  }
  
  return entry.data;
}

function setToCache(key: string, data: any): void {
  // キャッシュサイズ上限チェック（LRU的に古いものから削除）
  if (globalThis._raceCardCache && globalThis._raceCardCache.size >= MAX_CACHE_SIZE) {
    const firstKey = globalThis._raceCardCache.keys().next().value;
    if (firstKey) globalThis._raceCardCache.delete(firstKey);
  }
  
  globalThis._raceCardCache?.set(key, {
    data,
    timestamp: Date.now()
  });
}

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
    .replace(/^[\$\*＄＊\s　]+/, '')  // 半角・全角の$*とスペースを先頭から除去
    .replace(/[\s　]+$/, '')           // 末尾のスペースを除去
    .trim();
}

/**
 * 日付文字列をYYYYMMDD形式の数値に変換（比較用）
 * 例: "2024. 1. 5" -> 20240105, "2024.01.05" -> 20240105
 */
function parseDateToNumber(dateStr: string): number {
  if (!dateStr) return 0;
  
  // 空白を除去し、区切り文字を統一
  const cleaned = dateStr.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  
  if (parts.length !== 3) return 0;
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;
  
  return year * 10000 + month * 100 + day;
}

/**
 * 現在のレース日付をYYYYMMDD形式の数値に変換
 * date: "0125" (MMDD形式), year: 2025 -> 20250125
 */
function getCurrentRaceDateNumber(date: string, year: number | null): number {
  const dateStr = String(date).padStart(4, '0');
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  const currentYear = year || new Date().getFullYear();
  
  return currentYear * 10000 + month * 100 + day;
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
  // コーナー位置（新旧フォーマット両対応）
  const corners = getCornerPositions(dbRow);
  result['corner2'] = result['corner_2'] || (corners.corner2 ? String(corners.corner2) : '');
  result['corner3'] = result['corner_3'] || (corners.corner3 ? String(corners.corner3) : '');
  result['corner4'] = result['corner_4'] || result['corner_4_position'] || (corners.corner4 ? String(corners.corner4) : '');
  // 頭数（新旧フォーマット両対応）
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
  
  // レースIDからレース番号を抽出（最後の2桁）
  // 形式: 20260112060501 → 01 (1R)
  const raceId = result['race_id'] || '';
  if (raceId.length >= 2) {
    const raceNumberStr = raceId.slice(-2);
    result['race_number'] = String(parseInt(raceNumberStr, 10)); // "01" → "1"
  } else {
    result['race_number'] = '';
  }
  
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
  const { date, place, raceNumber, year, mode } = req.query;
  const fastMode = mode === 'fast'; // 高速モード（スコア計算なし）

  if (!date || !place || !raceNumber) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // ========================================
  // キャッシュチェック（ヒットすればDB問い合わせをスキップ）
  // ========================================
  // yearFilterを文字列として扱う（wakujunテーブルのyearはTEXT型）
  const yearFilter = year ? String(year) : null;
  const cacheKey = getCacheKey(yearFilter, String(date), String(place), String(raceNumber));
  
  const cachedData = getFromCache(cacheKey);
  if (cachedData) {
    console.log(`[race-card-with-score] キャッシュヒット: ${cacheKey}`);
    // HTTPキャッシュヘッダーを設定（ブラウザ側でも5分間キャッシュ）
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cachedData);
  }

  try {
    const db = getRawDb();
    const startTime = Date.now();

    // ========================================
    // STEP 1: 出走馬を取得（1クエリ）
    // ========================================
    const horses = await db.prepare(`
      SELECT * FROM wakujun
      WHERE date = $1 AND place = $2 AND race_number = $3 ${yearFilter ? 'AND year = $4' : ''}
      ORDER BY umaban::INTEGER
    `).all(...(yearFilter ? [date, place, raceNumber, yearFilter] : [date, place, raceNumber])) as any[];

    // デバッグ：取得された馬の数を確認
    console.log(`[race-card-with-score] date=${date}, place=${place}, race_number=${raceNumber}, year=${yearFilter}`);
    console.log(`[race-card-with-score] 取得馬数: ${horses.length}頭`);
    if (horses.length > 0) {
      console.log(`[race-card-with-score] 馬番範囲: ${horses[0].umaban} - ${horses[horses.length - 1].umaban}`);
    }

    if (!horses || horses.length === 0) {
      // yearフィルタなしでも試行
      const horsesWithoutYear = await db.prepare(`
        SELECT * FROM wakujun
        WHERE date = $1 AND place = $2 AND race_number = $3
        ORDER BY umaban::INTEGER
      `).all(date, place, raceNumber) as any[];
      console.log(`[race-card-with-score] yearフィルタなしでの馬数: ${horsesWithoutYear.length}頭`);
      
      return res.status(404).json({ error: 'No horses found for this race' });
    }

    // 馬名リストを作成（正規化済み）
    const horseNames = horses.map((h: any) => normalizeHorseName(GET(h, 'umamei')));
    const horseNameSet = new Set(horseNames);
    const uniqueHorseNames = Array.from(horseNameSet);

    // ========================================
    // 高速モード: スコア計算なしで基本情報のみを返す
    // ========================================
    if (fastMode) {
      const firstHorse = horses[0];
      const fastResult = {
        raceInfo: {
          date: String(date),
          place: String(place),
          raceNumber: String(raceNumber),
          raceName: GET(firstHorse, 'race_name', 'race_name_1') || `${raceNumber}R`,
          distance: GET(firstHorse, 'distance'),
          track: GET(firstHorse, 'track'),
          condition: GET(firstHorse, 'baba', 'condition') || '良',
          classCode: GET(firstHorse, 'class_name_1', 'class_name'),
          weather: GET(firstHorse, 'weather') || '晴',
          fieldSize: horses.length,
        },
        horses: horses.map((h: any) => ({
          umaban: GET(h, 'umaban'),
          waku: GET(h, 'waku'),
          horseName: GET(h, 'umamei'),
          jockey: GET(h, 'kishu'),
          weight: GET(h, 'kinryo'),
          hasData: false, // スコアなし
          score: null,
          potential: null,
          comeback: null,
        })),
        fastMode: true,
      };
      
      console.log(`[race-card-with-score] 高速モード: ${Date.now() - startTime}ms`);
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).json(fastResult);
    }

    // ========================================
    // STEP 2: 全馬の過去走データを一括取得（1クエリ）
    // ========================================
    // プレースホルダーを動的に生成
    const placeholders = uniqueHorseNames.map((_, i) => `$${i + 1}`).join(',');
    // race_idの最初の8桁がYYYYMMDD形式なので、それでソート（確実な日付順）
    const allPastRacesRaw = await db.prepare(`
      SELECT * FROM umadata
      WHERE TRIM(horse_name) IN (${placeholders})
      ORDER BY horse_name, SUBSTRING(race_id, 1, 8)::INTEGER DESC
    `).all(...uniqueHorseNames) as any[];

    // ========================================
    // 重要: 現在表示中のレース日付以前のデータのみを使用
    // （当日や未来のデータを含めると、結果を知った上での評価になってしまう）
    // ========================================
    const currentRaceDateNum = getCurrentRaceDateNumber(String(date), yearFilter ? parseInt(yearFilter, 10) : null);
    console.log(`[race-card-with-score] 現在のレース日付: ${currentRaceDateNum} - この日付より前のデータのみ使用`);

    // 馬名をキーにしてMapに振り分け（日付フィルタリング適用）
    const pastRacesByHorse = new Map<string, any[]>();
    let filteredOutCount = 0;
    
    for (const race of allPastRacesRaw) {
      const horseName = (race.horse_name || '').trim();
      
      // 過去走の日付を数値に変換して比較
      const pastRaceDateNum = parseDateToNumber(race.date || '');
      
      // 現在のレース日付以降のデータは除外（当日も除外）
      if (pastRaceDateNum >= currentRaceDateNum) {
        filteredOutCount++;
        continue;
      }
      
      if (!pastRacesByHorse.has(horseName)) {
        pastRacesByHorse.set(horseName, []);
      }
      pastRacesByHorse.get(horseName)!.push(race);
    }
    
    if (filteredOutCount > 0) {
      console.log(`[race-card-with-score] ${filteredOutCount}件の未来データを除外しました`);
    }

    // ========================================
    // STEP 3: 過去走の指数IDを収集し、一括取得（1クエリ）
    // ========================================
    const allPastRaceIndexIds: string[] = [];
    const pastRaceIndexIdMap = new Map<string, any>(); // 後でマッピング用

    // 各馬の過去走を重複排除（全走取得 - コース適性・鉄砲巧者分析用）
    const processedPastRacesByHorse = new Map<string, any[]>();
    
    for (const horseName of uniqueHorseNames) {
      const rawRaces = pastRacesByHorse.get(horseName) || [];
      
      // 重複排除（race_idで）- 全走取得（最大50走）
      const uniqueRaces = Array.from(
        new Map(
          rawRaces.map((race: any) => [
            race.race_id || `${race.date}_${race.place}_${race.race_name || ''}_${race.distance}`,
            race
          ])
        ).values()
      ).slice(0, 50) as any[]; // 50走まで（コース適性・休み明け分析用）
      
      processedPastRacesByHorse.set(horseName, uniqueRaces);
      
      // 指数IDを収集（直近10走分のみ - パフォーマンス最適化）
      const racesForIndices = uniqueRaces.slice(0, 10);
      for (const race of racesForIndices) {
        const raceIdBase = race.race_id || '';
        // umadataテーブルではカラム名は 'umaban'
        const horseNum = String(race.umaban || race.horse_number || '').padStart(2, '0');
        const fullRaceId = `${raceIdBase}${horseNum}`;
        if (fullRaceId && fullRaceId.length > 2) {
          allPastRaceIndexIds.push(fullRaceId);
        }
      }
    }

    // 今回レースの指数IDも収集
    const currentRaceIndexIds: string[] = [];
    for (const horse of horses) {
      const indexRaceId = generateIndexRaceId(
        String(date), String(place), String(raceNumber), GET(horse, 'umaban'), yearFilter || undefined
      );
      currentRaceIndexIds.push(indexRaceId);
    }

    // 全ての指数IDを結合
    const allIndexIds = [...allPastRaceIndexIds, ...currentRaceIndexIds];
    
    // 指数を一括取得（1クエリ）
    const indicesMap = new Map<string, any>();
    if (allIndexIds.length > 0) {
      const indexPlaceholders = allIndexIds.map((_, i) => `$${i + 1}`).join(',');
      const allIndices = await db.prepare(`
        SELECT race_id, "L4F", "T2F", potential, revouma, makikaeshi, cushion
        FROM indices
        WHERE race_id IN (${indexPlaceholders})
      `).all(...allIndexIds) as any[];
      
      for (const idx of allIndices) {
        indicesMap.set(idx.race_id, {
          L4F: idx.L4F,
          T2F: idx.T2F,
          potential: idx.potential,
          revouma: idx.revouma,
          makikaeshi: idx.makikaeshi,
          cushion: idx.cushion
        });
      }
    }

    // ========================================
    // STEP 3.5: レースレベルを一括取得
    // ========================================
    const raceLevelMap = new Map<string, any>();
    
    // 過去走のrace_id（馬番なしの16桁）を収集
    const allPastRaceIds: string[] = [];
    for (const [, races] of processedPastRacesByHorse) {
      for (const race of races) {
        const raceId = race.race_id;
        if (raceId && raceId.length >= 16) {
          allPastRaceIds.push(raceId);
        }
      }
    }
    
    // 重複排除
    const uniqueRaceIds = [...new Set(allPastRaceIds)];
    
    if (uniqueRaceIds.length > 0) {
      try {
        const levelPlaceholders = uniqueRaceIds.map((_, i) => `$${i + 1}`).join(',');
        const allLevels = await db.prepare(`
          SELECT race_id, level, level_label, total_horses_run, first_run_good_count, win_count, ai_comment
          FROM race_levels
          WHERE race_id IN (${levelPlaceholders})
        `).all(...uniqueRaceIds) as any[];
        
        for (const lv of allLevels) {
          const plusCount = (lv.level_label?.match(/\+/g) || []).length;
          raceLevelMap.set(lv.race_id, {
            level: lv.level,
            levelLabel: lv.level_label || lv.level,
            totalHorsesRun: lv.total_horses_run || 0,
            firstRunGoodCount: lv.first_run_good_count || 0,
            winCount: lv.win_count || 0,
            plusCount: plusCount,
            aiComment: lv.ai_comment || '',
          });
        }
        console.log(`[race-card-with-score] レースレベル取得: ${allLevels.length}件`);
      } catch (err) {
        console.log('[race-card-with-score] レースレベル取得スキップ:', err);
      }
    }

    // ========================================
    // STEP 4: メモリ上でデータを組み立て（ループ内DBアクセスなし）
    // ========================================
    
    // まず全馬のデータを収集（展開連動スコア計算用）
    const allHorseData: { past: any[]; entry: any }[] = [];
    const horsesBaseData: any[] = [];
    
    horses.forEach((horse: any, horseIndex: number) => {
      const horseName = normalizeHorseName(GET(horse, 'umamei'));
      const uniquePastRaces = processedPastRacesByHorse.get(horseName) || [];

      // 過去走データに指数とレースレベルを紐づけ（メモリ上のMapから取得）
      const pastRacesWithIndices = uniquePastRaces.map((race: any) => {
        const raceIdBase = race.race_id || '';
        const horseNum = String(race.umaban || race.horse_number || '').padStart(2, '0');
        const fullRaceId = `${raceIdBase}${horseNum}`;
        
        const raceIndices = indicesMap.get(fullRaceId) || null;
        const raceLevel = raceLevelMap.get(raceIdBase) || null;
        
        return {
          ...race,
          indices: raceIndices,
          indexRaceId: fullRaceId,
          raceLevel: raceLevel,
        };
      });

      const pastRaces = pastRacesWithIndices.map(mapUmadataToRecordRow);
      const entryRow = mapWakujunToRecordRow(horse);
      
      allHorseData.push({ past: pastRaces, entry: entryRow });
      horsesBaseData.push({ horse, pastRacesWithIndices, pastRaces, entryRow, horseIndex });
    });
    
    // 全馬のデータを使ってスコアを計算
    const horsesWithScore = horsesBaseData.map(({ horse, pastRacesWithIndices, pastRaces, entryRow, horseIndex }) => {
      // スコア計算（全馬データを渡して展開連動スコアも計算）
      let score = 0;
      try {
        // デバッグモード: 最初の1頭のみ詳細ログ出力（Railwayレート制限対策）
        const isDebugSample = horseIndex === 0;
        const scoreResult = computeKisoScore({ past: pastRaces, entry: entryRow }, allHorseData, isDebugSample);
        
        if (isDebugSample && typeof scoreResult !== 'number') {
          // デバッグ情報がある場合のみログ出力（簡略版）
          const breakdown = scoreResult;
          const horseName = GET(horse, 'umamei');
          const hasNewLogic = breakdown.positionImprovement > 0 || breakdown.paceSync > 0 || breakdown.courseFit > 0;
          
          // 新ロジックが加点されている場合のみログ出力
          if (hasNewLogic) {
            console.log(`[kiso-score] ${horseName}: total=${breakdown.total.toFixed(1)}, ` +
              `pos=${breakdown.positionImprovement.toFixed(1)}, ` +
              `pace=${breakdown.paceSync.toFixed(1)}, ` +
              `course=${breakdown.courseFit.toFixed(1)}`);
          }
          score = breakdown.total;
        } else {
          score = typeof scoreResult === 'number' ? scoreResult : scoreResult.total;
        }
      } catch (scoreError: any) {
        console.error('Score calculation error for', GET(horse, 'umamei'), ':', scoreError.message);
        score = 0;
      }

      // 今回レースの指数を取得（メモリ上のMapから）
      const indexRaceId = currentRaceIndexIds[horseIndex];
      const indices = indicesMap.get(indexRaceId) || null;

      // 返り値は完全に互換性を維持
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

    // スコアでソート（ロジック変更なし）
    horsesWithScore.sort((a: any, b: any) => b.score - a.score);

    const raceInfo = {
      date, place, raceNumber,
      className: GET(horses[0], 'class_name_1'),
      trackType: GET(horses[0], 'track_type'),
      distance: GET(horses[0], 'distance'),
      fieldSize: horses.length
    };

    // ========================================
    // デバッグ用ログ（確認後に削除可能）
    // ========================================
    const endTime = Date.now();
    console.log(`[race-card-with-score] 最適化版: ${horses.length}頭, 処理時間=${endTime - startTime}ms`);
    console.log(`[race-card-with-score] クエリ数: 3回 (wakujun=1, umadata=1, indices=1)`);
    if (horsesWithScore.length > 0) {
      const firstHorse = horsesWithScore[0];
      console.log(`[race-card-with-score] 検証: 馬名=${firstHorse.umamei}, 過去走数=${firstHorse.past?.length || 0}, スコア=${firstHorse.score}`);
    }

    // レスポンスをキャッシュに保存
    const responseData = { raceInfo, horses: horsesWithScore };
    setToCache(cacheKey, responseData);
    console.log(`[race-card-with-score] キャッシュ保存: ${cacheKey} (現在${globalThis._raceCardCache?.size || 0}件)`);
    
    // HTTPキャッシュヘッダーを設定（ブラウザ側でも5分間キャッシュ）
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(responseData);
  } catch (error: any) {
    console.error('Error fetching race card:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
