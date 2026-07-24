import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db';
import type { KisoScoreBreakdown } from '../../utils/getClusterData';
import {
  revisionFromWakujunRows,
  revisionFromUmadataFallbackRows,
} from '../../lib/race-card-cache-revision';
// 競うスコア（正本 kisoScore）の取得・生成・計算はサーバー専用共有サービスへ集約。
// race-card と /api/simulator が同じ取得・同じ式で同じ競うスコアを得る（正本を二重実装しない）。
import {
  getField as GET,
  normalizeHorseName,
  fetchScoreSourceData,
  computeScoresFromSource,
} from '../../lib/server/competition-score-service';

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

// GET / normalizeHorseName / parseDateToNumber / getCurrentRaceDateNumber /
// generateIndexRaceId / mapUmadataToRecordRow / mapWakujunToRecordRow /
// 過去走取得(STEP2-3)・RecordRow生成・competeKisoScore は
// lib/server/competition-score-service.ts へ集約（正本を二重実装しない）。

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { date, place, raceNumber, year, mode } = req.query;
  const fastMode = mode === 'fast'; // 高速モード（スコア計算なし）

  if (!date || !place || !raceNumber) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // yearFilterを文字列として扱う（wakujunテーブルのyearはTEXT型）
  const yearFilter = year ? String(year) : null;

  try {
    const db = getRawDb();
    const startTime = Date.now();
    const baseCacheKey = getCacheKey(yearFilter, String(date), String(place), String(raceNumber));

    // ========================================
    // STEP 1: 出走馬を取得（1クエリ）
    // ========================================
    // 枠番が空のCSVでも ORDER BY で失敗しないよう安全なキャストを使用
    let horses = await db.prepare(`
      SELECT * FROM wakujun
      WHERE date = $1 AND place = $2 AND race_number = $3 ${yearFilter ? 'AND year = $4' : ''}
      ORDER BY CASE WHEN umaban ~ '^[0-9]+$' THEN umaban::INTEGER ELSE 9999 END, umamei
    `).all(...(yearFilter ? [date, place, raceNumber, yearFilter] : [date, place, raceNumber])) as any[];

    // 枠番が未設定かどうか検出（waku が全て空・"0" の場合は枠順未確定）
    let hasWaku = horses.length > 0 && horses.some((h: any) => h.waku && h.waku !== '' && h.waku !== '0');
    if (!hasWaku && horses.length > 0) {
      // 枠番なし → 馬名五十音順に並べ直し
      horses.sort((a: any, b: any) => (a.umamei || '').localeCompare(b.umamei || '', 'ja'));
    }

    if (!horses || horses.length === 0) {
      // yearフィルタなしでも試行
      const horsesWithoutYear = await db.prepare(`
        SELECT * FROM wakujun
        WHERE date = $1 AND place = $2 AND race_number = $3
        ORDER BY CASE WHEN umaban ~ '^[0-9]+$' THEN umaban::INTEGER ELSE 9999 END, umamei
      `).all(date, place, raceNumber) as any[];

      if (horsesWithoutYear.length === 0) {
        // ======================================================
        // umadata フォールバック（枠順データなし・出走馬表のみ）
        // ======================================================
        const currentYear = yearFilter ? parseInt(yearFilter, 10) : new Date().getFullYear();
        const dateStr = String(date).padStart(4, '0');
        const yyyymmdd = `${currentYear}${dateStr}`;
        const raceNumPadded = String(raceNumber).padStart(2, '0');

        const umadataHorses = await db.prepare(`
          SELECT DISTINCT ON (horse_name)
            horse_name, waku, umaban, weight_carried as kinryo, jockey as kishu,
            distance, class_name, race_name, course_type as track_type, field_size
          FROM umadata
          WHERE SUBSTRING(race_id, 1, 8) = $1
            AND place = $2
            AND RIGHT(race_id, 2) = $3
          ORDER BY horse_name ASC
        `).all(yyyymmdd, place, raceNumPadded) as any[];

        if (!umadataHorses || umadataHorses.length === 0) {
          return res.status(404).json({ error: 'No horses found for this race' });
        }

        const fbRevision = revisionFromUmadataFallbackRows(umadataHorses);
        const fullFbKey = `${baseCacheKey}::${fbRevision}`;
        const cachedFb = getFromCache(fullFbKey);
        if (cachedFb) {
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Cache', 'HIT');
          return res.status(200).json(cachedFb);
        }

        const firstHorse = umadataHorses[0];
        const fallbackResult = {
          isUmadataFallback: true,
          cacheRevision: fbRevision,
          raceInfo: {
            date: String(date),
            place: String(place),
            raceNumber: String(raceNumber),
            raceName: firstHorse.race_name || firstHorse.class_name || `${raceNumber}R`,
            distance: firstHorse.distance || '',
            track: firstHorse.track_type || '',
            condition: '良',
            classCode: firstHorse.class_name || '',
            weather: '晴',
            fieldSize: umadataHorses.length,
          },
          horses: umadataHorses.map((h: any, idx: number) => ({
            umaban: String(idx + 1),  // 仮の馬番（あいうえお順）
            waku: '',                 // 枠番未確定
            umamei: h.horse_name || '',
            horseName: h.horse_name || '',
            kishu: h.kishu || '',
            jockey: h.kishu || '',
            kinryo: h.kinryo || '',
            weight: h.kinryo || '',
            hasData: false,
            score: null,
            potential: null,
            comeback: null,
          })),
        };

        setToCache(fullFbKey, fallbackResult);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Cache', 'MISS');
        return res.status(200).json(fallbackResult);
      }
      horses = horsesWithoutYear;
      hasWaku = horses.length > 0 && horses.some((h: any) => h.waku && h.waku !== '' && h.waku !== '0');
      if (!hasWaku && horses.length > 0) {
        horses.sort((a: any, b: any) => (a.umamei || '').localeCompare(b.umamei || '', 'ja'));
      }
    }

    // メイン経路: 枠・馬番・馬名の集合が変われば別キー（正式枠順アップロードで自動反映）
    const sourceRevision = revisionFromWakujunRows(horses);
    const fullCacheKey = `${baseCacheKey}::${sourceRevision}`;
    const cachedFull = getFromCache(fullCacheKey);
    if (cachedFull && !fastMode) {
      res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=30');
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cachedFull);
    }

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
        isWakuUnconfirmed: !hasWaku,
        cacheRevision: sourceRevision,
      };
      
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).json(fastResult);
    }

    // ========================================
    // STEP 2-3: 過去走 + 指数の取得（サーバー専用共有サービス）
    //   - 過去走取得・日付フィルタ・重複排除(最大50走)・指数取得は
    //     lib/server/competition-score-service.ts へ集約（simulator と同一処理）。
    // ========================================
    const scoreSource = await fetchScoreSourceData(db, horses, {
      date: String(date),
      place: String(place),
      raceNumber: String(raceNumber),
      year: yearFilter,
    });
    const processedPastRacesByHorse = scoreSource.processedPastRacesByHorse;
    const indicesMap = scoreSource.indicesMap;
    const currentRaceIndexIds = scoreSource.currentRaceIndexIds;

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
      } catch {
        // レースレベル取得失敗は無視（任意データ）
      }
    }

    // ========================================
    // STEP 4: 表示用データ組み立て + 競うスコア（共有サービスで計算）
    // ========================================
    // 競うスコアは共有サービスで計算（正本 computeKisoScore を1か所で使用）。
    // perHorse は horses と同順のため、既存挙動（index 結合）を完全に保つ。
    const { perHorse: scorePerHorse } = computeScoresFromSource(horses, scoreSource, {
      date: String(date),
      place: String(place),
      raceNumber: String(raceNumber),
      year: yearFilter,
    });

    const horsesWithScore = horses.map((horse: any, horseIndex: number) => {
      const horseName = normalizeHorseName(GET(horse, 'umamei'));
      const uniquePastRaces = processedPastRacesByHorse.get(horseName) || [];

      // 過去走データに指数とレースレベルを紐づけ（表示用 past_races）
      const pastRacesWithIndices = uniquePastRaces.map((race: any) => {
        const raceIdBase = race.race_id || '';
        const horseNum = String(race.umaban || race.horse_number || '').padStart(2, '0');
        const fullRaceId = `${raceIdBase}${horseNum}`;

        const raceIndices = indicesMap.get(fullRaceId) || null;
        const raceLevel = raceLevelMap.get(raceIdBase) || null;

        // umadataにrace_numberカラムが存在しないため race_id 末尾2桁から導出
        // deriveHorseRaceMemoKey がこれを使うため必須（なければメモ表示不可）
        const raceNumber = raceIdBase.length >= 2
          ? String(parseInt(raceIdBase.slice(-2), 10))
          : '';

        return {
          ...race,
          race_number: raceNumber,
          indices: raceIndices,
          indexRaceId: fullRaceId,
          raceLevel: raceLevel,
        };
      });

      // 競うスコア（共有サービス・正本 computeKisoScore）。index で結合（既存挙動と一致）。
      const raw = scorePerHorse[horseIndex];
      const score = raw ? raw.score : 0;
      // スコア内訳は既存挙動どおり先頭3頭のみ返す
      const scoreBreakdown: KisoScoreBreakdown | null =
        horseIndex < 3 ? (raw?.breakdown ?? null) : null;

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
        past_races_count: pastRacesWithIndices.length,
        past: pastRacesWithIndices,
        hasData: pastRacesWithIndices.length > 0,
        score: score,
        indices: indices,
        indexRaceId: indexRaceId,
        // デバッグ用: 最初の3頭のみスコア内訳を含める
        scoreBreakdown: scoreBreakdown ? {
          pos: scoreBreakdown.positionImprovement,
          pace: scoreBreakdown.paceSync,
          course: scoreBreakdown.courseFit,
          penalty: scoreBreakdown.penalty,
          lastPos: scoreBreakdown.details.lastPosition,
          avgPos: scoreBreakdown.details.avgPastPosition,
          fwdRate: scoreBreakdown.details.forwardRate,
        } : null
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
    // レスポンスをキャッシュに保存
    const responseData = {
      raceInfo,
      horses: horsesWithScore,
      isWakuUnconfirmed: !hasWaku,  // 枠番未確定フラグ
      cacheRevision: sourceRevision,
    };
    setToCache(fullCacheKey, responseData);
    
    // HTTPキャッシュヘッダーを設定（ブラウザ側でも5分間キャッシュ）
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(responseData);
  } catch (error: any) {
    console.error('Error fetching race card:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
