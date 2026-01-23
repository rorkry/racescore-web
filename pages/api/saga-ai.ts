/**
 * 俺AI APIエンドポイント (Pages Router版)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db';
import { SagaBrain, HorseAnalysisInput, SagaAnalysis, TimeComparisonRace, PastRaceTimeComparison } from '../../lib/saga-ai/saga-brain';
import { getOpenAISaga, OpenAISagaResult } from '../../lib/saga-ai/openai-saga';
import { analyzeRaceLevel, type NextRaceResult, type RaceLevelResult } from '../../lib/saga-ai/level-analyzer';
import { toHalfWidth, parseFinishPosition, getCornerPositions } from '../../utils/parse-helpers';
import { computeKisoScore } from '../../utils/getClusterData';
import type { RecordRow } from '../../types/record';
import { checkRateLimit, normalRateLimit } from '../../lib/rate-limit';

// PostgreSQL用のDB型（lib/db-new.tsのRawDatabaseWrapper互換）
type DbWrapper = ReturnType<typeof getRawDb>;

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

// ========================================
// DBキャッシュ機能（永続化）
// ========================================

interface DBCachedAnalysis {
  horseNumber: number;
  horseName: string;
  analysis: SagaAnalysis;
}

/**
 * DBからキャッシュされた分析を取得
 */
async function getAnalysisFromDBCache(
  db: DbWrapper,
  year: string,
  date: string,
  place: string,
  raceNumber: string
): Promise<DBCachedAnalysis[] | null> {
  try {
    const rows = await db.prepare(`
      SELECT horse_number, horse_name, analysis_json
      FROM saga_analysis_cache
      WHERE year = ? AND date = ? AND place = ? AND race_number = ?
      ORDER BY horse_number
    `).all(year, date, place, raceNumber) as any[];

    if (!rows || rows.length === 0) return null;

    return rows.map(row => ({
      horseNumber: row.horse_number,
      horseName: row.horse_name,
      analysis: JSON.parse(row.analysis_json) as SagaAnalysis,
    }));
  } catch (error) {
    console.error('[saga-ai] DBキャッシュ読み込みエラー:', error);
    return null;
  }
}

/**
 * 分析結果をDBキャッシュに保存
 */
async function saveAnalysisToDBCache(
  db: DbWrapper,
  year: string,
  date: string,
  place: string,
  raceNumber: string,
  analyses: SagaAnalysis[]
): Promise<void> {
  try {
    // PostgreSQLではINSERT ... ON CONFLICTを使用
    for (const analysis of analyses) {
      await db.query(`
        INSERT INTO saga_analysis_cache 
        (year, date, place, race_number, horse_number, horse_name, analysis_json, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (year, date, place, race_number, horse_number) 
        DO UPDATE SET analysis_json = EXCLUDED.analysis_json, created_at = NOW()
      `, [
        year,
        date,
        place,
        raceNumber,
        analysis.horseNumber,
        analysis.horseName,
        JSON.stringify(analysis)
      ]);
    }
    console.log(`[saga-ai] DBキャッシュ保存: ${year}/${date}/${place}/${raceNumber} (${analyses.length}頭)`);
  } catch (error) {
    console.error('[saga-ai] DBキャッシュ保存エラー:', error);
  }
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

// ========================================
// レースレベルキャッシュ取得
// ========================================

interface CachedRaceLevel {
  race_id: string;
  level: string;
  level_label: string;
  total_horses_run: number;
  good_run_count: number;
  win_count: number;
  ai_comment: string | null;
}

/**
 * 複数のレースIDからレースレベルを一括取得
 */
async function getRaceLevelsFromCache(db: DbWrapper, raceIds: string[]): Promise<Map<string, CachedRaceLevel>> {
  const result = new Map<string, CachedRaceLevel>();
  if (raceIds.length === 0) return result;

  try {
    const uniqueIds = [...new Set(raceIds)];
    const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(',');
    
    const rows = await db.query<CachedRaceLevel>(`
      SELECT race_id, level, level_label, total_horses_run, good_run_count, win_count, ai_comment
      FROM race_levels
      WHERE race_id IN (${placeholders})
        AND (expires_at IS NULL OR expires_at::timestamp > NOW())
    `, uniqueIds);

    for (const row of rows) {
      result.set(row.race_id, row);
    }
  } catch (error) {
    // race_levelsテーブルがなくてもエラーにしない
    console.log('[saga-ai] race_levelsテーブルからの取得スキップ:', error);
  }

  return result;
}

/**
 * レース日付からキャッシュ有効期間を決定
 * - 60日以上前: 30日間（安定期、データ変化少ない）
 * - 30-60日前: 7日間（やや安定）
 * - 30日以内: 1日間（活発期、次走データが増える可能性大）
 */
function getCacheExpiryDays(raceDate: string): number {
  const now = new Date();
  const raceDateObj = parseDateString(raceDate);
  if (!raceDateObj) return 1; // パース失敗時は短期キャッシュ
  
  const daysDiff = Math.floor((now.getTime() - raceDateObj.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff >= 60) return 30; // 60日以上前 → 30日キャッシュ
  if (daysDiff >= 30) return 7;  // 30-60日前 → 7日キャッシュ
  return 1;                       // 30日以内 → 1日キャッシュ
}

/**
 * 日付文字列をDateオブジェクトに変換
 */
function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  // "2024.01.15" または "2024. 1.15" 形式
  const cleaned = dateStr.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return null;
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day);
}

/**
 * レースレベルをキャッシュに保存
 * @param raceDate レース日付（キャッシュ期間を動的に決定するため）
 */
async function saveRaceLevelToCache(db: DbWrapper, raceId: string, result: RaceLevelResult, raceDate?: string): Promise<void> {
  try {
    const cacheDays = raceDate ? getCacheExpiryDays(raceDate) : 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + cacheDays);

    await db.query(`
      INSERT INTO race_levels (
        race_id, level, level_label, total_horses_run, good_run_count,
        first_run_good_count, win_count, good_run_rate, first_run_good_rate,
        has_plus, ai_comment, display_comment, calculated_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
      ON CONFLICT (race_id) DO UPDATE SET
        level = EXCLUDED.level,
        level_label = EXCLUDED.level_label,
        total_horses_run = EXCLUDED.total_horses_run,
        good_run_count = EXCLUDED.good_run_count,
        first_run_good_count = EXCLUDED.first_run_good_count,
        win_count = EXCLUDED.win_count,
        good_run_rate = EXCLUDED.good_run_rate,
        first_run_good_rate = EXCLUDED.first_run_good_rate,
        has_plus = EXCLUDED.has_plus,
        ai_comment = EXCLUDED.ai_comment,
        display_comment = EXCLUDED.display_comment,
        calculated_at = NOW(),
        expires_at = EXCLUDED.expires_at
    `, [
      raceId,
      result.level,
      result.levelLabel,
      result.totalHorsesRun,
      result.goodRunCount,
      result.firstRunGoodCount,
      result.winCount,
      result.goodRunRate,
      result.firstRunGoodRate,
      result.plusCount || 0,
      result.aiComment,
      result.displayComment,
      expiresAt.toISOString()
    ]);
  } catch (err) {
    console.log('[saga-ai] レースレベルキャッシュ保存スキップ:', err);
  }
}

/**
 * 単一レースのレベルを計算（オンデマンド）
 * 
 * 重要: 全出走馬の次走成績を取得して判定する
 * （上位3頭だけでなく、レース全体の出走馬を対象）
 */
async function calculateRaceLevelOnDemand(db: DbWrapper, raceId: string, raceDate: string): Promise<RaceLevelResult | null> {
  try {
    // 対象レースの全出走馬を取得（着順が数値の場合のみ）
    // 全角数字を半角に変換してフィルタ
    const allHorses = await db.query<{ horse_name: string; finish_position: string }>(`
      SELECT horse_name, finish_position
      FROM umadata 
      WHERE race_id = $1
        AND finish_position IS NOT NULL
        AND finish_position != ''
        AND TRANSLATE(finish_position, '０１２３４５６７８９', '0123456789') ~ '^[0-9]+$'
      GROUP BY horse_name, finish_position
      ORDER BY MIN(TRANSLATE(finish_position, '０１２３４５６７８９', '0123456789')::INTEGER)
    `, [raceId]);

    if (allHorses.length === 0) {
      // 出走馬がいない場合はUNKNOWNを返す
      return {
        level: 'UNKNOWN',
        levelLabel: 'UNKNOWN',
        totalHorsesRun: 0,
        totalRuns: 0,
        goodRunCount: 0,
        firstRunGoodCount: 0,
        winCount: 0,
        goodRunRate: 0,
        firstRunGoodRate: 0,
        commentData: { totalHorses: 0, goodRuns: 0, winners: 0, details: [] },
        displayComment: 'データなし',
        aiComment: '',
        plusCount: 0,
        plusLabel: '',
        isUnknownWithPotential: false,
        isDataInsufficient: true,
      };
    }

    // 全出走馬の馬名を取得
    const horseNames = allHorses.map(h => h.horse_name);
    const placeholders = horseNames.map((_, i) => `$${i + 1}`).join(',');

    // race_idの最初の8桁が日付（YYYYMMDD）
    const raceDateNum = parseInt(raceId.substring(0, 8), 10);

    // 各馬の次走以降の成績を取得（race_idの日付部分で比較）
    const nextRaces = await db.query<{
      horse_name: string;
      finish_position: string;
      date: string;
      class_name: string;
    }>(`
      SELECT horse_name, finish_position, date, class_name
      FROM umadata
      WHERE horse_name IN (${placeholders})
        AND SUBSTRING(race_id, 1, 8)::INTEGER > $${horseNames.length + 1}
        AND finish_position IS NOT NULL
        AND finish_position != ''
      ORDER BY horse_name, SUBSTRING(race_id, 1, 8)::INTEGER ASC
    `, [...horseNames, raceDateNum]);

    // NextRaceResult形式に変換
    const horseFirstRunMap = new Map<string, boolean>();
    const nextRaceResults: NextRaceResult[] = nextRaces
      .filter(race => {
        // 全角数字を半角に変換してから数値判定
        const posStr = toHalfWidth(race.finish_position || '');
        const pos = parseInt(posStr, 10);
        return !isNaN(pos) && pos > 0;
      })
      .map(race => {
        const isFirstRun = !horseFirstRunMap.has(race.horse_name);
        if (isFirstRun) {
          horseFirstRunMap.set(race.horse_name, true);
        }
        // 全角数字を半角に変換
        const posStr = toHalfWidth(race.finish_position || '');
        return {
          horseName: race.horse_name,
          finishPosition: parseInt(posStr, 10),
          isFirstRun,
          raceDate: race.date,
          className: race.class_name,
        };
      });

    // レースレベルを判定
    const result = analyzeRaceLevel(nextRaceResults);
    return result;
  } catch (err) {
    console.error('[saga-ai] レースレベル計算エラー:', raceId, err);
    return null;
  }
}

/**
 * 日付文字列をYYYYMMDD形式の数値に変換（比較用）
 * 例: "2024. 1. 5" -> 20240105, "2024.01.05" -> 20240105
 */
function parseDateToNumber(dateStr: string): number {
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

/**
 * 現在のレース日付をYYYYMMDD形式の数値に変換
 * date: "0125" (MMDD形式), year: "2025" -> 20250125
 */
function getCurrentRaceDateNumber(date: string, year: string): number {
  const dateStr = String(date).padStart(4, '0');
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  const currentYear = parseInt(year, 10) || new Date().getFullYear();
  
  return currentYear * 10000 + month * 100 + day;
}

interface RequestBody {
  year: string;
  date: string;
  place: string;
  raceNumber: string;
  useAI?: boolean;
  trackCondition?: '良' | '稍' | '重' | '不';
  bias?: 'none' | 'uchi' | 'soto' | 'mae' | 'ushiro';
  forceRecalculate?: boolean;  // true: キャッシュを無視して再計算
  saveToDB?: boolean;          // true: 計算後にDBに保存（一括生成用）
}

// バイアスに基づくスコア調整
interface BiasAdjustmentResult {
  scoreAdjustment: number;
  comment: string | null;
  tag: string | null;
}

/**
 * バイアスに基づくスコア調整を計算
 * @param horseNumber 馬番
 * @param waku 枠番
 * @param totalHorses 出走頭数
 * @param bias バイアス設定
 * @param t2fPercentile 前半2Fの順位パーセンタイル (0-100, 低いほど前目)
 * @param cornerPositions 近走のコーナー通過順位の平均
 * @param baseScore 元のスコア
 */
function calculateBiasAdjustment(
  horseNumber: number,
  waku: number,
  totalHorses: number,
  bias: 'none' | 'uchi' | 'soto' | 'mae' | 'ushiro',
  t2fPercentile: number | null,
  cornerPositions: number[] | null,
  baseScore: number
): BiasAdjustmentResult {
  if (bias === 'none') {
    return { scoreAdjustment: 0, comment: null, tag: null };
  }

  let scoreAdjustment = 0;
  let comment: string | null = null;
  let tag: string | null = null;

  // 枠の判定（4枠以下が内、5枠以上が外）
  const isInnerWaku = waku <= 4;
  const isOuterWaku = waku >= 5;
  
  // 馬番での判定（補助）
  const innerThreshold = Math.ceil(totalHorses / 3);
  const outerThreshold = totalHorses - Math.ceil(totalHorses / 3);
  const isInnerNumber = horseNumber <= innerThreshold;
  const isOuterNumber = horseNumber > outerThreshold;

  // 脚質の判定
  // 近走平均コーナー位置から判定（低いほど前目）
  let avgCornerPos = 0;
  if (cornerPositions && cornerPositions.length > 0) {
    avgCornerPos = cornerPositions.reduce((a, b) => a + b, 0) / cornerPositions.length;
  }
  
  // T2Fパーセンタイルも考慮（低いほど前半が速い = 前に行ける）
  const isFrontRunner = avgCornerPos > 0 && avgCornerPos <= 4 || (t2fPercentile !== null && t2fPercentile <= 30);
  const isCloser = avgCornerPos >= 8 || (t2fPercentile !== null && t2fPercentile >= 70);

  switch (bias) {
    case 'uchi': // 内有利
      if (isInnerWaku || isInnerNumber) {
        // 内枠：全体得点の2割加算
        scoreAdjustment = baseScore * 0.20;
        comment = `🎯 内有利: ${waku}枠${horseNumber}番は内枠で大幅プラス評価`;
        tag = '🎯内有利◎';
      } else if (isOuterWaku || isOuterNumber) {
        // 外枠：1割減点
        scoreAdjustment = -baseScore * 0.10;
        comment = `⚠️ 内有利レース: ${waku}枠${horseNumber}番は外枠で不利`;
        tag = '外枠▲';
      }
      break;

    case 'soto': // 外有利
      if (isOuterWaku || isOuterNumber) {
        // 外枠：全体得点の2割加算
        scoreAdjustment = baseScore * 0.20;
        comment = `🎯 外有利: ${waku}枠${horseNumber}番は外枠で大幅プラス評価`;
        tag = '🎯外有利◎';
      } else if (isInnerWaku || isInnerNumber) {
        // 内枠：1割減点
        scoreAdjustment = -baseScore * 0.10;
        comment = `⚠️ 外有利レース: ${waku}枠${horseNumber}番は内枠で不利`;
        tag = '内枠▲';
      }
      break;

    case 'mae': // 前有利
      // 前有利要素を集計
      let maeFactors = 0;
      const maeReasons: string[] = [];
      
      if (isFrontRunner) {
        maeFactors += 2;
        maeReasons.push('逃げ先行型');
      }
      if (isInnerWaku || isInnerNumber) {
        maeFactors += 1;
        maeReasons.push('内枠（位置取り有利）');
      }
      if (t2fPercentile !== null && t2fPercentile <= 25) {
        maeFactors += 1;
        maeReasons.push('前半2Fが速い');
      }
      if (avgCornerPos > 0 && avgCornerPos <= 3) {
        maeFactors += 1;
        maeReasons.push('近走通過順が前');
      }
      
      if (maeFactors >= 2) {
        // 前有利要素が2つ以上：2割加算
        scoreAdjustment = baseScore * 0.20;
        comment = `🎯 前有利: ${maeReasons.join('・')}`;
        tag = '🎯前有利◎';
      } else if (maeFactors === 1) {
        // 前有利要素が1つ：1割加算
        scoreAdjustment = baseScore * 0.10;
        comment = `📈 前有利傾向: ${maeReasons.join('・')}`;
        tag = '前有利○';
      } else if (isCloser) {
        // 差し追込み馬：1.5割減点
        scoreAdjustment = -baseScore * 0.15;
        comment = `⚠️ 前有利レース: 差し追込み脚質で厳しい`;
        tag = '差追▲';
      }
      break;

    case 'ushiro': // 後有利
      // 後有利要素を集計
      let ushiroFactors = 0;
      const ushiroReasons: string[] = [];
      
      if (isCloser) {
        ushiroFactors += 2;
        ushiroReasons.push('差し追込み型');
      }
      if (t2fPercentile !== null && t2fPercentile >= 60) {
        ushiroFactors += 1;
        ushiroReasons.push('前半は控える');
      }
      if (avgCornerPos >= 6) {
        ushiroFactors += 1;
        ushiroReasons.push('近走通過順が後ろ');
      }
      
      if (ushiroFactors >= 2) {
        // 後有利要素が2つ以上：2割加算
        scoreAdjustment = baseScore * 0.20;
        comment = `🎯 後有利: ${ushiroReasons.join('・')}`;
        tag = '🎯後有利◎';
      } else if (ushiroFactors === 1) {
        // 後有利要素が1つ：1割加算
        scoreAdjustment = baseScore * 0.10;
        comment = `📈 後有利傾向: ${ushiroReasons.join('・')}`;
        tag = '後有利○';
      } else if (isFrontRunner) {
        // 逃げ先行馬：1.5割減点
        scoreAdjustment = -baseScore * 0.15;
        comment = `⚠️ 後有利レース: 逃げ先行脚質で厳しい`;
        tag = '逃先▲';
      }
      break;
  }

  return {
    scoreAdjustment: Math.round(scoreAdjustment * 10) / 10,
    comment,
    tag
  };
}

/**
 * 時計比較用のレースを取得
 */
async function getTimeComparisonRaces(
  db: DbWrapper,
  pastRaceDate: string,
  pastRacePlace: string,
  pastRaceDistance: string,
): Promise<TimeComparisonRace[]> {
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
        horse_name, age, race_id
      FROM umadata
      WHERE date IN (?, ?, ?, ?, ?, ?)
        AND place LIKE ?
        AND distance = ?
        AND finish_position = '１'
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
    `;

    const rows = await db.query(
      query,
      [dateRange[0], dateRange[1], dateRange[2],
       dateRange[3], dateRange[4], dateRange[5],
       `%${normalizedPlace}%`,
       pastRaceDistance]
    ) as any[];

    if (!rows || rows.length === 0) return [];

    return rows.map(row => {
      const age = parseInt(toHalfWidth(row.age || '0'), 10);
      const className = row.class_name || '';
      const isGradedRace = /G[123]|Ｇ[１２３]|重賞|JG[123]|ＪＧ[１２３]/i.test(className);
      const isYoungHorse = age === 2 || age === 3;

      // race_idからレース番号を抽出（末尾2桁がレース番号と推定）
      const raceId = row.race_id || '';
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

async function getHistoricalLapData(
  db: DbWrapper,
  place: string,
  surface: string,
  distance: number,
  className: string,
  trackCondition: string
): Promise<HistoricalLapRow[]> {
  try {
    const normalizedPlace = place.replace(/^[0-9０-９]+/, '').replace(/[0-9０-９]+$/, '').trim();
    const distanceStr = `${surface}${distance}`;

    // クラス名を正規化
    const normalizedClass = normalizeClassForQuery(className);

    // 年齢カテゴリを判定（2歳新馬 / 2・3歳 / 古馬）
    const ageCategory = getAgeCategoryFromClass(className);
    const ageCondition = getAgeConditionForQuery(ageCategory);
    
    // 馬場状態条件（3グループ：良 / 稍重 / 重+不良）
    const trackConditionGroup = getTrackConditionGroup(trackCondition);
    const trackConditionCondition = getTrackConditionQueryCondition(trackConditionGroup);
    
    const query = `
      SELECT 
        date, place, class_name, track_condition, lap_time, horse_name
      FROM umadata
      WHERE place LIKE ?
        AND distance = ?
        AND finish_position = '１'
        AND lap_time IS NOT NULL
        AND lap_time != ''
        AND SUBSTRING(race_id, 1, 4)::INTEGER >= 2019
        ${ageCondition}
        ${trackConditionCondition}
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
    `;

    const rows = await db.query(
      query,
      [`%${normalizedPlace}%`, distanceStr]
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
      const laps = parseLapTimesFromWorkString(row.lap_time);
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
// クラス名から年齢条件を抽出
function extractAgeCondition(className: string): string {
  if (!className) return '';
  if (className.includes('2歳') || className.includes('新馬')) return '2歳';
  if (className.includes('3歳')) return '3歳';
  if (className.includes('4歳以上') || className.includes('3歳以上')) return '古馬';
  return '';
}

// 年齢カテゴリを判定（歴代比較用）
// - 2歳新馬: class_nameに「2歳」と「新馬」両方を含む
// - 2・3歳戦: class_nameに「2歳」「3歳」「新馬」のいずれかを含む（「3歳以上」は除く）
// - 古馬戦: 上記に該当しない
function getAgeCategoryFromClass(className: string): 'newcomer' | 'young' | 'aged' {
  if (!className) return 'aged';
  const c = className.trim();
  
  // 2歳新馬戦
  if (c.includes('2歳') && c.includes('新馬')) return 'newcomer';
  // 新馬戦
  if (c.includes('新馬')) return 'newcomer';
  // 2歳戦・3歳戦（「3歳以上」「4歳以上」は除く）
  if ((c.includes('2歳') || c.includes('3歳')) && !c.includes('以上')) return 'young';
  // 古馬戦
  return 'aged';
}

// 年齢カテゴリに対応するSQLクエリ条件を生成
function getAgeConditionForQuery(ageCategory: 'newcomer' | 'young' | 'aged'): string {
  switch (ageCategory) {
    case 'newcomer':
      // 2歳新馬戦のみ
      return "AND class_name LIKE '%新馬%'";
    case 'young':
      // 2歳・3歳戦（「3歳以上」「4歳以上」は除く）
      return "AND (class_name LIKE '%2歳%' OR class_name LIKE '%3歳%' OR class_name LIKE '%新馬%') AND class_name NOT LIKE '%以上%'";
    case 'aged':
      // 古馬戦（「2歳」「3歳」を含まない、または「以上」を含む）
      return "AND (class_name NOT LIKE '%2歳%' AND class_name NOT LIKE '%3歳%' AND class_name NOT LIKE '%新馬%' OR class_name LIKE '%以上%')";
  }
}

// 性別を抽出（seibetsu または gender_age から）
function extractGender(horse: any): '牡' | '牝' | 'セ' | undefined {
  const seibetsu = horse.seibetsu || '';
  const genderAge = horse.gender_age || horse.nenrei_display || '';
  
  if (seibetsu.includes('牝') || genderAge.includes('牝')) return '牝';
  if (seibetsu.includes('牡') || genderAge.includes('牡')) return '牡';
  if (seibetsu.includes('セ') || genderAge.includes('セ')) return 'セ';
  return undefined;
}

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

// 馬場状態が歴代比較に適しているか（同じグループのみ比較）
function isTrackConditionComparableForHistorical(cond1: string, cond2: string): boolean {
  return getTrackConditionGroup(cond1) === getTrackConditionGroup(cond2);
}

// 馬場状態グループを取得（クエリ用）
// ダート: 良のみ / 稍重 / 重+不良 の3パターン
// 芝: 良 / 稍重 / 重+不良 の3パターン
function getTrackConditionGroup(trackCondition: string): 'good' | 'slightly_heavy' | 'heavy' {
  if (trackCondition.includes('不') || trackCondition.includes('重') && !trackCondition.includes('稍')) {
    return 'heavy'; // 重・不良
  }
  if (trackCondition.includes('稍')) {
    return 'slightly_heavy'; // 稍重
  }
  return 'good'; // 良
}

// 馬場状態グループに対応するSQLクエリ条件を生成
function getTrackConditionQueryCondition(group: 'good' | 'slightly_heavy' | 'heavy'): string {
  switch (group) {
    case 'good': // 良馬場
      return "AND track_condition = '良'";
    case 'slightly_heavy': // 稍重
      return "AND (track_condition = '稍' OR track_condition = '稍重')";
    case 'heavy': // 重・不良
      return "AND (track_condition = '重' OR track_condition = '不' OR track_condition = '不良')";
    default:
      return "AND track_condition = '良'";
  }
}

// 馬場状態グループの日本語表示
function getTrackConditionGroupLabel(group: 'good' | 'slightly_heavy' | 'heavy'): string {
  switch (group) {
    case 'good': return '良馬場';
    case 'slightly_heavy': return '稍重馬場';
    case 'heavy': return '重・不良馬場';
  }
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
      let comment = `${mark}${aiH.horseNumber}番 ${normalizeHorseName(aiH.horseName)}`;

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
      let comment = `${mark}${ruleH.horseNumber}番 ${normalizeHorseName(ruleH.horseName)}`;

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

  // レートリミットチェック
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const rateLimitResult = checkRateLimit(`saga-ai:${ip}`, normalRateLimit);
  
  if (!rateLimitResult.allowed) {
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime);
    return res.status(429).json({ 
      error: 'Too many requests. Please try again later.',
      resetTime: rateLimitResult.resetTime 
    });
  }

  try {
    const body = req.body as RequestBody;
    const { 
      year, date, place: rawPlace, raceNumber, 
      useAI = false, trackCondition = '良', bias = 'none',
      forceRecalculate = false, saveToDB = false 
    } = body;

    if (!year || !date || !rawPlace || !raceNumber) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const normalizePlace = (p: string): string => {
      if (!p) return '';
      return p.replace(/^[0-9０-９]+/, '').replace(/[0-9０-９]+$/, '').trim();
    };

    const normalizedPlace = normalizePlace(rawPlace);
    const db = getRawDb();

    // ========================================
    // DBキャッシュチェック（バイアスnone & 再計算でない場合）
    // ========================================
    if (!useAI && bias === 'none' && !forceRecalculate) {
      // まずDBキャッシュをチェック
      const dbCached = getAnalysisFromDBCache(db, year, date, rawPlace, raceNumber);
      if (dbCached && dbCached.length > 0) {
        console.log(`[saga-ai] DBキャッシュヒット: ${year}/${date}/${rawPlace}/${raceNumber} (${dbCached.length}頭)`);
        
        // キャッシュされた分析をスコア順にソート
        const analyses = dbCached.map(c => c.analysis);
        analyses.sort((a, b) => (b.score || 0) - (a.score || 0));
        
        const openAISagaChecker = getOpenAISaga();
        const isAIEnabled = openAISagaChecker.isOpenAIEnabled();
        
        const responseData = {
          success: true,
          fromCache: true,
          raceInfo: {
            year,
            date,
            place: normalizedPlace,
            raceNumber,
            horseCount: analyses.length,
          },
          analyses,
          aiAnalyses: null,
          aiEnabled: isAIEnabled,
          summary: generateSummary(analyses.slice(0, 3), null),
        };
        
        return res.status(200).json(responseData);
      }
    }

    // メモリキャッシュチェック（AI使用時およびバイアス指定時はキャッシュしない）
    const cacheKey = getCacheKey(year, date, rawPlace, raceNumber, trackCondition);
    if (!useAI && bias === 'none' && !forceRecalculate) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        console.log(`[saga-ai] メモリキャッシュヒット: ${cacheKey}`);
        return res.status(200).json(cached);
      }
    }

    const brain = new SagaBrain();

    const openAISagaChecker = getOpenAISaga();
    const isAIEnabled = openAISagaChecker.isOpenAIEnabled();
    const openAISaga = useAI && isAIEnabled ? openAISagaChecker : null;

    // デバッグログ: 受け取ったパラメータ
    console.log(`[saga-ai] Query params: date="${date}", place="${rawPlace}", raceNumber="${raceNumber}", year="${year}"`);
    
    const horses = await db.prepare(`
      SELECT * FROM wakujun
      WHERE date = $1 AND place = $2 AND race_number = $3 AND year = $4
      ORDER BY umaban::INTEGER
    `).all(date, rawPlace, raceNumber, year) as any[];  // yearは文字列のまま渡す

    console.log(`[saga-ai] Found ${horses?.length || 0} horses`);

    if (!horses || horses.length === 0) {
      console.log(`[saga-ai] No horses found for: date="${date}", place="${rawPlace}", raceNumber="${raceNumber}", year="${year}"`);
      return res.status(404).json({ error: 'No horses found', params: { date, place: rawPlace, raceNumber, year } });
    }

    const raceInfo = horses[0];
    const surface = raceInfo.track_type?.includes('芝') ? '芝' : 'ダ';
    const distance = parseInt(raceInfo.distance || '0', 10);
    const place = normalizedPlace;
    
    // 牝馬限定戦・年齢条件の判定
    const className = raceInfo.class_name_1 || raceInfo.class_name || '';
    const isFilliesOnlyRace = className.includes('牝') || className.includes('フィリーズ');
    const raceAgeCondition = extractAgeCondition(className);
    const isAgeRestricted = raceAgeCondition === '2歳' || raceAgeCondition === '3歳';

    const memberIndices: { horseNum: number; T2F: number; L4F: number; kisoScore: number; relevantRaceCount?: number; potential?: number; makikaeshi?: number }[] = [];
    const horseDataList: { horse: any; pastRaces: any[]; distanceFilteredRaces?: any[]; indices: any; kisoScore?: number }[] = [];

    for (const horse of horses) {
      const rawHorseName = (horse.umamei || '').trim();
      const horseName = normalizeHorseName(rawHorseName);
      const horseNum = parseInt(horse.umaban || '0', 10);

      // 過去走を取得（race_idの日付部分で降順ソート = 最新が先頭）
      const pastRacesRawWithDuplicates = await db.prepare(`
        SELECT * FROM umadata
        WHERE TRIM(horse_name) = ?
        ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
        LIMIT 100
      `).all(horseName) as any[];

      // ========================================
      // 重要: 現在表示中のレース日付以前のデータのみを使用
      // （当日や未来のデータを含めると、結果を知った上での評価になってしまう）
      // ========================================
      const currentRaceDateNum = getCurrentRaceDateNumber(date, year);
      const filteredPastRaces = pastRacesRawWithDuplicates.filter((race: any) => {
        const pastRaceDateNum = parseDateToNumber(race.date || '');
        return pastRaceDateNum < currentRaceDateNum; // 当日も除外
      });

      const pastRacesRaw = Array.from(
        new Map(
          filteredPastRaces.map((race: any) => [
            race.race_id || `${race.date}_${race.place}_${race.race_name || ''}_${race.distance}`,
            race
          ])
        ).values()
      ).slice(0, 50);

      const pastRacesWithIndices = await Promise.all(pastRacesRaw.map(async (race: any) => {
        const raceIdBase = race.race_id || '';
        // umadataテーブルではカラム名は 'umaban'
        const horseNumStr = String(race.umaban || race.horse_number || '').padStart(2, '0');
        const fullRaceId = `${raceIdBase}${horseNumStr}`;

        let indices: any = null;
        try {
          const indexData = await db.prepare(`
            SELECT "L4F", "T2F", potential, makikaeshi
            FROM indices WHERE race_id = $1
          `).get(fullRaceId);
          if (indexData) {
            indices = indexData;
            console.log(`[saga-ai] Index found for ${fullRaceId}:`, JSON.stringify(indexData));
          }
        } catch (err) {
          console.error(`[saga-ai] Index lookup error for ${fullRaceId}:`, err);
        }

        const pastRawPlace = race.place || '';
        const pastNormalizedPlace = normalizePlace(pastRawPlace);
        const pastSurface = (race.distance || '').includes('芝') ? '芝' as const : 'ダ' as const;
        const pastDistance = parseInt((race.distance || '0').replace(/[^\d]/g, ''), 10);
        const pastFinishPosition = parseFinishPosition(race.finish_position);

        // 1着レースの場合は歴代比較用データを取得
        let historicalLapData: HistoricalLapRow[] | undefined;
        if (pastFinishPosition === 1 && (race.lap_time || race.work_1s)) {
          historicalLapData = await getHistoricalLapData(
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
          // コーナー位置（新旧フォーマット両対応）
          ...(() => {
            const c = getCornerPositions(race);
            return {
              corner2: c.corner2 || undefined,
              corner3: c.corner3 || undefined,
              corner4: c.corner4 || undefined,
            };
          })(),
          T2F: indices?.T2F || 0,
          L4F: indices?.L4F || 0,
          potential: indices?.potential || 0,
          makikaeshi: indices?.makikaeshi || 0,
          finishTime: parseInt(toHalfWidth(race.finish_time || '0'), 10),
          className: race.class_name || '',
          trackCondition: race.track_condition || '良',
          horseAge: parseInt(toHalfWidth(race.age || '0'), 10),
          // ラップ分析用データ
          lapString: race.lap_time || race.work_1s || '',  // ラップタイム（"12.3-10.5-11.8..."）- umadataではlap_time
          corner4Wide: parseInt(race.index_value || '2', 10) || 2,  // 4角位置（内外: 0-4）
          totalHorses: parseInt(race.field_size || race.number_of_horses || '16', 10), // 出走頭数
          ownLast3F: parseFloat(race.last_3f || '0') || 0,          // 自身の上がり3F
          // 歴代比較用データ（1着レースのみ）
          historicalLapData,
          // 牝馬限定戦・世代限定戦判定用
          isMixedGenderRace: !(race.class_name || '').includes('牝') && !(race.class_name || '').includes('フィリーズ'),
          isAgeRestrictedRace: (race.class_name || '').includes('2歳') || (race.class_name || '').includes('3歳') || (race.class_name || '').includes('新馬'),
          raceAgeCondition: extractAgeCondition(race.class_name || ''),
          // レースレベル判定用
          raceId: raceIdBase,  // race_id（馬番なし）
        };
      }));

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

    // ========================================
    // レースレベルを一括取得して各馬のpastRacesに追加
    // ========================================
    try {
      // 全ての過去走からraceIdと日付を収集（最大5走）
      const allRaceData: { raceId: string; date: string }[] = [];
      for (const { pastRaces } of horseDataList) {
        for (const race of pastRaces.slice(0, 5)) {
          if (race.raceId && race.date) {
            allRaceData.push({ raceId: race.raceId, date: race.date });
          }
        }
      }
      const allRaceIds = allRaceData.map(r => r.raceId);

      // レースレベルを一括取得（awaitを追加）
      const raceLevelCache = await getRaceLevelsFromCache(db, allRaceIds);
      
      // キャッシュにないレースはオンデマンドで計算（前走のみ）
      const uncachedRaces = allRaceData.filter(r => !raceLevelCache.has(r.raceId));
      const calculatePromises: Promise<void>[] = [];
      
      // 前走（最新走）だけを対象にオンデマンド計算（全レースだと重すぎる）
      const uniqueUncachedRaces = Array.from(new Map(uncachedRaces.map(r => [r.raceId, r])).values())
        .slice(0, 20); // 最大20レースまで
      
      for (const race of uniqueUncachedRaces) {
        calculatePromises.push(
          (async () => {
            const levelResult = await calculateRaceLevelOnDemand(db, race.raceId, race.date);
            if (levelResult) {
              // キャッシュに保存（レース日付に応じた有効期限を設定）
              await saveRaceLevelToCache(db, race.raceId, levelResult, race.date);
              // 一時キャッシュに追加
              raceLevelCache.set(race.raceId, {
                race_id: race.raceId,
                level: levelResult.level,
                level_label: levelResult.levelLabel,
                total_horses_run: levelResult.totalHorsesRun,
                good_run_count: levelResult.goodRunCount,
                win_count: levelResult.winCount,
                ai_comment: levelResult.aiComment,
              });
            }
          })()
        );
      }
      
      // 並列で計算
      if (calculatePromises.length > 0) {
        console.log(`[saga-ai] Calculating ${calculatePromises.length} race levels on-demand...`);
        await Promise.all(calculatePromises);
        console.log(`[saga-ai] Race level calculation complete. Cache now has ${raceLevelCache.size} entries`);
      }

      // 各馬のpastRacesにレースレベル情報を追加
      for (const horseData of horseDataList) {
        for (const race of horseData.pastRaces) {
          if (race.raceId && raceLevelCache.has(race.raceId)) {
            const cached = raceLevelCache.get(race.raceId)!;
            // plusCountを計算（levelLabelの+の数をカウント）
            const plusCount = (cached.level_label?.match(/\+/g) || []).length;
            race.raceLevel = {
              level: cached.level as any,
              levelLabel: cached.level_label || cached.level,
              totalHorsesRun: cached.total_horses_run,
              goodRunCount: cached.first_run_good_count || cached.good_run_count, // 次1走目の好走数を優先
              firstRunGoodCount: cached.first_run_good_count || 0,
              winCount: cached.win_count,
              plusCount: plusCount,
              aiComment: cached.ai_comment || '',
            };
          }
        }
      }
    } catch (err) {
      console.log('[saga-ai] レースレベル取得スキップ:', err);
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
        horseName: normalizeHorseName(horse.umamei || ''),
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
        // 牝馬限定戦・世代限定戦判定用
        isFilliesOnlyRace,
        gender: extractGender(horse),
        raceAgeCondition,
        isAgeRestricted,
      };

      horseInputs.push(input);

      const analysis = brain.analyzeHorse(input);

      // デバッグログ: コメント生成の確認
      console.log(`[saga-ai] Horse ${horseNum} analysis:`, {
        commentsCount: analysis.comments.length,
        warningsCount: analysis.warnings.length,
        tagsCount: analysis.tags.length,
        hasAbilitySummary: !!analysis.abilitySummary,
        hasTimeEvaluation: !!analysis.timeEvaluation,
        hasLapEvaluation: !!analysis.lapEvaluation,
        hasRaceLevelNote: !!analysis.raceLevelNote,
        pastRacesWithLap: pastRaces.filter(r => r.lapString).length,
        timeComparisonCount: timeComparisonData.length,
      });

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

    // バイアス調整を適用
    if (bias !== 'none') {
      const totalHorses = horses.length;
      console.log(`[saga-ai] バイアス調整適用: ${bias}, 出走頭数: ${totalHorses}`);
      
      for (let i = 0; i < analyses.length; i++) {
        const analysis = analyses[i];
        const horseData = horseDataList.find(hd => parseInt(hd.horse.umaban || '0', 10) === analysis.horseNumber);
        
        if (!horseData) continue;
        
        const waku = parseInt(horseData.horse.waku || '0', 10);
        const t2fPercentile = analysis.debugInfo?.t2f?.percentile ?? null;
        
        // 近走のコーナー通過順を取得（新旧フォーマット両対応）
        const cornerPositions: number[] = [];
        for (const race of horseData.pastRaces.slice(0, 3)) {
          // corner4が最終コーナーの位置
          const corners = getCornerPositions(race);
          const corner4 = corners.corner4 || 0;
          if (corner4 > 0) {
            cornerPositions.push(corner4);
          }
        }
        
        const biasResult = calculateBiasAdjustment(
          analysis.horseNumber,
          waku,
          totalHorses,
          bias,
          t2fPercentile,
          cornerPositions.length > 0 ? cornerPositions : null,
          analysis.score
        );
        
        if (biasResult.scoreAdjustment !== 0) {
          analysis.score += biasResult.scoreAdjustment;
          console.log(`[saga-ai] ${analysis.horseName}: バイアス調整 ${biasResult.scoreAdjustment > 0 ? '+' : ''}${biasResult.scoreAdjustment}pt`);
        }
        
        if (biasResult.comment) {
          analysis.comments.unshift(biasResult.comment);
        }
        
        if (biasResult.tag) {
          analysis.tags.unshift(biasResult.tag);
        }
      }
    }

    analyses.sort((a, b) => {
      return (b.score || 0) - (a.score || 0);
    });

    // シングルトン接続は閉じない

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

    // DBキャッシュに保存（バイアスnone時、または明示的にsaveToDB指定時）
    if (bias === 'none' && (saveToDB || !forceRecalculate)) {
      saveAnalysisToDBCache(db, year, date, rawPlace, raceNumber, analyses);
    }

    // メモリキャッシュに保存（AI使用時およびバイアス指定時はキャッシュしない）
    if (!useAI && bias === 'none') {
      setToCache(cacheKey, responseData);
      console.log(`[saga-ai] メモリキャッシュ保存: ${cacheKey}`);
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
