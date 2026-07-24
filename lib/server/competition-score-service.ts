/**
 * 競うスコア（正本 kisoScore）サーバー専用共有サービス
 *
 * 目的:
 *  - pages/api/race-card-with-score.ts に埋め込まれていた
 *    「過去走データ取得 → RecordRow 生成 → computeKisoScore」を 1 か所へ集約する。
 *  - /api/race-card-with-score と /api/simulator の両方が、同じ取得・同じ式で
 *    同じ「競うスコア」を得る（正本を二重実装しない）。
 *
 * 重要:
 *  - 計算式は複製しない。utils/getClusterData.ts の computeKisoScore をそのまま使う。
 *  - サーバー専用。React client component から import してはならない（下記ランタイムガード）。
 *  - 3D 内の「ローカル能力集約値（cruiseSpeed/acceleration/stamina 由来）」とは別物。
 *    こちらは正本の競うスコア（0〜100, 高いほど高評価）。
 *
 * 提供:
 *  - fetchScoreSourceData: STEP2-3（過去走 + 指数の取得）。race-card の表示用取得と共有。
 *  - computeScoresFromSource: STEP4（RecordRow 生成 + computeKisoScore）。DB 非依存の純処理。
 *  - loadCompetitionScoresForRace: raceKey から一括で競うスコアを返す（simulator 用・キャッシュ付）。
 */

// --- サーバー専用ガード（client bundle 混入を実行時に検知） ---
//
// 意図的に `import 'server-only'` は使用していない（検証済み・採用不可）。
// 理由: `server-only` パッケージは package.json の exports 条件が
//   { "react-server": "./empty.js", "default": "./index.js" }
// であり、"react-server" 条件が付かないコンパイル経路では常に index.js
// （require 時に即 throw）へ解決される。本サービスは Pages Router API
// （pages/api/race-card-with-score.ts）からも import されるが、Pages Router の
// API Routes はこの "react-server" 条件が付与されないため、`import 'server-only'`
// を追加すると *毎リクエスト* race-card-with-score が
// "This module cannot be imported from a Client Component module." で
// 500 crash する（`next start` での実機検証で確認済み。App Router の
// /api/simulator route.ts 側は問題なし＝react-server 条件が付くため）。
// → 既存の本番 API を壊すため採用しない。代わりに以下の実行時ガードのみで
//   client bundle への混入を検知する。
if (typeof window !== 'undefined') {
  throw new Error(
    '[competition-score-service] これはサーバー専用モジュールです。client component から import しないでください。'
  );
}

import { getRawDb } from '../db';
import { computeKisoScore, KisoScoreBreakdown } from '../../utils/getClusterData';
import type { RecordRow } from '../../types/record';
import { INDICES_SELECT_SQL, mapIndicesRow } from '../indices-columns';
import { getCornerPositions } from '../../utils/parse-helpers';

// ============================================================
// レース識別（正本 identity は horseNumber）
// ============================================================
export interface RaceScoreKeyParts {
  /** wakujun.year は TEXT。null 可（year フィルタなし） */
  year: string | null;
  /** MMDD */
  date: string;
  place: string;
  raceNumber: string;
}

/** simulator 側へ返す最終形（欠損は 0 へ丸めず undefined のまま） */
export interface CompetitionScoreResult {
  horseNumber: number;
  /** 正本の競うスコア（0〜100, 高いほど高評価）。欠損時は undefined */
  competitionScore?: number;
  /** レース内偏差値（平均50/SD10）。欠損時 undefined。位置補正では未使用だが将来用に提供 */
  scoreDeviation?: number;
  provenance: 'computed' | 'missing';
  missingReason?: string;
}

/** race-card が既存レスポンスを組み立てるための生の内部形（0=欠損も保持） */
export interface RawHorseScore {
  horseNumber: number;
  /** computeKisoScore の生値（過去走なしは 0）。race-card 既存挙動を保つため 0 を保持 */
  score: number;
  hasData: boolean;
  breakdown: KisoScoreBreakdown | null;
}

// ============================================================
// RecordRow マッパー（race-card から移設・唯一の正本）
// ============================================================

/** row の複数キー候補から最初の非空値を文字列で返す（race-card の GET と同一） */
export function getField(row: any, ...keys: string[]): string {
  for (const k of keys) {
    if (row && row[k] !== undefined && row[k] !== null) {
      return String(row[k]);
    }
  }
  return '';
}

/** 馬名正規化（先頭 $*・前後空白を除去。race-card と同一） */
export function normalizeHorseName(name: string): string {
  return name
    .replace(/^[\$\*＄＊\s　]+/, '')
    .replace(/[\s　]+$/, '')
    .trim();
}

/**
 * 日付文字列を YYYYMMDD 数値へ（比較用・race-card と同一）
 * 例: "2024. 1. 5" -> 20240105
 */
export function parseDateToNumber(dateStr: string): number {
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

/** 現在レース日付を YYYYMMDD 数値へ（race-card と同一） */
export function getCurrentRaceDateNumber(date: string, year: number | null): number {
  const dateStr = String(date).padStart(4, '0');
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  const currentYear = year || new Date().getFullYear();
  return currentYear * 10000 + month * 100 + day;
}

/** 今回レースの指数 race_id を生成（race-card と同一） */
export function generateIndexRaceId(
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

/** umadata 行 → RecordRow（race-card から移設・同一） */
export function mapUmadataToRecordRow(dbRow: any): RecordRow {
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

/** wakujun 行 → RecordRow（race-card から移設・同一） */
export function mapWakujunToRecordRow(dbRow: any): RecordRow {
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

// ============================================================
// STEP2-3: 過去走 + 指数の取得（race-card 表示用取得と共有）
// ============================================================

export interface ScoreSourceData {
  uniqueHorseNames: string[];
  /** 馬名(trim) → 過去走生行（日付フィルタ済・重複排除前） */
  pastRacesByHorse: Map<string, any[]>;
  /** 馬名(正規化) → 過去走（重複排除 + 最大50走） */
  processedPastRacesByHorse: Map<string, any[]>;
  /** fullRaceId(race_id+umaban) → 指数 */
  indicesMap: Map<string, any>;
  /** horses と同順の今回レース指数 race_id */
  currentRaceIndexIds: string[];
  currentRaceDateNum: number;
}

/**
 * STEP2-3 を実行し、スコア算出（および race-card の past_races 表示）に必要な生データを返す。
 * race-card はこの結果を「表示 past_races」と「スコア計算」の両方に使う（単一取得）。
 */
export async function fetchScoreSourceData(
  db: any,
  horses: any[],
  ctx: { date: string; place: string; raceNumber: string; year: string | null }
): Promise<ScoreSourceData> {
  const horseNames = horses.map((h) => normalizeHorseName(getField(h, 'umamei')));
  const uniqueHorseNames = Array.from(new Set(horseNames));

  const currentRaceDateNum = getCurrentRaceDateNumber(
    String(ctx.date),
    ctx.year ? parseInt(ctx.year, 10) : null
  );

  // STEP2: 全馬の過去走を一括取得
  const pastRacesByHorse = new Map<string, any[]>();
  if (uniqueHorseNames.length > 0) {
    const placeholders = uniqueHorseNames.map((_, i) => `$${i + 1}`).join(',');
    const allPastRacesRaw = (await db
      .prepare(
        `SELECT * FROM umadata
         WHERE TRIM(horse_name) IN (${placeholders})
         ORDER BY horse_name, SUBSTRING(race_id, 1, 8)::INTEGER DESC`
      )
      .all(...uniqueHorseNames)) as any[];

    for (const race of allPastRacesRaw) {
      const horseName = (race.horse_name || '').trim();
      const pastRaceDateNum = parseDateToNumber(race.date || '');
      if (pastRaceDateNum >= currentRaceDateNum) continue; // 当日以降は除外
      if (!pastRacesByHorse.has(horseName)) pastRacesByHorse.set(horseName, []);
      pastRacesByHorse.get(horseName)!.push(race);
    }
  }

  // STEP3: 過去走の重複排除（最大50走） + 指数ID収集
  const processedPastRacesByHorse = new Map<string, any[]>();
  const allPastRaceIndexIds: string[] = [];
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

  // 今回レースの指数ID
  const currentRaceIndexIds: string[] = [];
  for (const horse of horses) {
    currentRaceIndexIds.push(
      generateIndexRaceId(
        String(ctx.date),
        String(ctx.place),
        String(ctx.raceNumber),
        getField(horse, 'umaban'),
        ctx.year ? parseInt(ctx.year, 10) : undefined
      )
    );
  }

  // 指数を一括取得
  const indicesMap = new Map<string, any>();
  const allIndexIds = [...allPastRaceIndexIds, ...currentRaceIndexIds];
  if (allIndexIds.length > 0) {
    const indexPlaceholders = allIndexIds.map((_, i) => `$${i + 1}`).join(',');
    const allIndices = (await db
      .prepare(
        `SELECT race_id, ${INDICES_SELECT_SQL} FROM indices WHERE race_id IN (${indexPlaceholders})`
      )
      .all(...allIndexIds)) as any[];
    for (const idx of allIndices) {
      indicesMap.set(idx.race_id, mapIndicesRow(idx));
    }
  }

  return {
    uniqueHorseNames,
    pastRacesByHorse,
    processedPastRacesByHorse,
    indicesMap,
    currentRaceIndexIds,
    currentRaceDateNum,
  };
}

// ============================================================
// STEP4: RecordRow 生成 + computeKisoScore（DB 非依存の純処理）
// ============================================================

/**
 * 過去走に指数を紐づけた表示用オブジェクトを組み立てる（race-card の past_races 相当）。
 * raceLevel は含めない（表示専用のため race-card 側で付与する）。
 */
export function buildPastRacesWithIndices(
  uniqueRaces: any[],
  indicesMap: Map<string, any>
): any[] {
  return uniqueRaces.map((race: any) => {
    const raceIdBase = race.race_id || '';
    const horseNum = String(race.umaban || race.horse_number || '').padStart(2, '0');
    const fullRaceId = `${raceIdBase}${horseNum}`;
    const raceIndices = indicesMap.get(fullRaceId) || null;
    const raceNumber = raceIdBase.length >= 2 ? String(parseInt(raceIdBase.slice(-2), 10)) : '';
    return {
      ...race,
      race_number: raceNumber,
      indices: raceIndices,
      indexRaceId: fullRaceId,
    };
  });
}

/**
 * horses（wakujun 行）と取得済みソースから、馬番 → 生スコア（+内訳）を計算する。
 * - allHorseData（全馬の past/entry）を computeKisoScore に渡し、展開連動スコアを既存と一致させる。
 * - 計算式は computeKisoScore をそのまま使用（複製しない）。
 * - 重複 horseNumber は検知して warnings に記録（最初の 1 頭を採用）。
 */
export function computeScoresFromSource(
  horses: any[],
  source: ScoreSourceData,
  _ctx: { date: string; place: string; raceNumber: string; year: string | null }
): { perHorse: RawHorseScore[]; scores: Map<number, RawHorseScore>; warnings: string[] } {
  const warnings: string[] = [];

  // 全馬の RecordRow を先に構築（allHorseData）
  const built = horses.map((horse) => {
    const horseName = normalizeHorseName(getField(horse, 'umamei'));
    const uniquePastRaces = source.processedPastRacesByHorse.get(horseName) || [];
    const pastRacesWithIndices = buildPastRacesWithIndices(uniquePastRaces, source.indicesMap);
    const pastRecordRows = pastRacesWithIndices.map(mapUmadataToRecordRow);
    const entryRow = mapWakujunToRecordRow(horse);
    return { horse, pastRecordRows, entryRow };
  });

  const allHorseData = built.map((b) => ({ past: b.pastRecordRows, entry: b.entryRow }));

  // perHorse は horses と同順（race-card が index で結合し既存挙動を保つ）。
  const perHorse: RawHorseScore[] = built.map((b) => {
    const umabanStr = getField(b.horse, 'umaban');
    const horseNumber = parseInt(umabanStr, 10);

    let score = 0;
    let breakdown: KisoScoreBreakdown | null = null;
    try {
      // debug=true でも total（=score）は debug=false と同一。内訳を得るため常に true。
      const result = computeKisoScore(
        { past: b.pastRecordRows, entry: b.entryRow },
        allHorseData,
        true
      );
      if (typeof result === 'number') {
        score = result;
      } else {
        breakdown = result;
        score = result.total;
      }
    } catch (e: any) {
      warnings.push(`score計算失敗 umaban=${umabanStr}: ${e?.message ?? e}`);
      score = 0;
    }

    return {
      horseNumber,
      score,
      hasData: b.pastRecordRows.length > 0,
      breakdown,
    };
  });

  // horseNumber を正本 identity とする Map（simulator 用）。NaN/重複は検知して除外。
  const scores = new Map<number, RawHorseScore>();
  for (const h of perHorse) {
    if (Number.isNaN(h.horseNumber)) {
      warnings.push('umaban が数値でない馬を検知（Map からは除外）');
      continue;
    }
    if (scores.has(h.horseNumber)) {
      warnings.push(`重複 horseNumber=${h.horseNumber} を検知（最初の1頭を採用）`);
      continue;
    }
    scores.set(h.horseNumber, h);
  }

  return { perHorse, scores, warnings };
}

// ============================================================
// simulator 用: raceKey から競うスコアを一括取得（キャッシュ付）
// ============================================================

interface CacheEntry {
  promise: Promise<Map<number, CompetitionScoreResult>>;
  timestamp: number;
}

declare global {
  // eslint-disable-next-line no-var
  var _competitionScoreCache: Map<string, CacheEntry> | undefined;
}

// HMR 安全: globalThis に保持
const CACHE: Map<string, CacheEntry> =
  globalThis._competitionScoreCache ?? (globalThis._competitionScoreCache = new Map());

const CACHE_TTL_MS = 60_000; // 60秒（race-card と simulator の近接呼び出しをまとめる）
const CACHE_MAX = 100;

function cacheKey(parts: RaceScoreKeyParts): string {
  return `${parts.year ?? 'null'}_${parts.date}_${parts.place}_${parts.raceNumber}`;
}

function pruneCache(): void {
  const now = Date.now();
  for (const [k, v] of CACHE) {
    if (now - v.timestamp > CACHE_TTL_MS) CACHE.delete(k);
  }
  while (CACHE.size > CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
}

/** レース内偏差値（平均50/SD10）。全馬同点や1頭では undefined。 */
function computeDeviations(scores: number[]): (number | undefined)[] {
  const n = scores.length;
  if (n < 2) return scores.map(() => undefined);
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (sd < 1e-9) return scores.map(() => undefined);
  return scores.map((s) => 50 + ((s - mean) / sd) * 10);
}

/**
 * raceKey から全馬の競うスコアを取得する（simulator 用）。
 *
 * - 欠損（過去走なし）は competitionScore=undefined / provenance='missing'。0 へ丸めない。
 * - 取得失敗時は空 Map を返し、raceKey と原因をサーバーログへ 1 回出力（3D 全体は止めない）。
 * - raceKey 単位で短時間キャッシュ（Promise キャッシュ＝同時呼び出しを 1 回へ集約）。reject は永続化しない。
 */
export function loadCompetitionScoresForRace(
  parts: RaceScoreKeyParts,
  dbOverride?: any
): Promise<Map<number, CompetitionScoreResult>> {
  pruneCache();
  const key = cacheKey(parts);
  const now = Date.now();
  const cached = CACHE.get(key);
  if (cached && now - cached.timestamp <= CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = computeCompetitionScores(parts, dbOverride).catch((err) => {
    // reject を永続キャッシュしない
    CACHE.delete(key);
    console.error(
      `[competition-score-service] 競うスコア取得失敗 raceKey=${key}: ${err?.message ?? err}`
    );
    return new Map<number, CompetitionScoreResult>();
  });

  CACHE.set(key, { promise, timestamp: now });
  return promise;
}

async function computeCompetitionScores(
  parts: RaceScoreKeyParts,
  dbOverride?: any
): Promise<Map<number, CompetitionScoreResult>> {
  const db = dbOverride ?? getRawDb();

  // STEP1: 出走馬を解決（race-card メイン経路と同じ主クエリ。fallback/fastMode は表示専用のため対象外）
  const yearFilter = parts.year ? String(parts.year) : null;
  const horses = (await db
    .prepare(
      `SELECT * FROM wakujun
       WHERE date = $1 AND place = $2 AND race_number = $3 ${yearFilter ? 'AND year = $4' : ''}
       ORDER BY CASE WHEN umaban ~ '^[0-9]+$' THEN umaban::INTEGER ELSE 9999 END, umamei`
    )
    .all(
      ...(yearFilter
        ? [parts.date, parts.place, parts.raceNumber, yearFilter]
        : [parts.date, parts.place, parts.raceNumber])
    )) as any[];

  const out = new Map<number, CompetitionScoreResult>();
  if (!horses || horses.length === 0) return out;

  const ctx = {
    date: String(parts.date),
    place: String(parts.place),
    raceNumber: String(parts.raceNumber),
    year: yearFilter,
  };

  const source = await fetchScoreSourceData(db, horses, ctx);
  const { scores } = computeScoresFromSource(horses, source, ctx);

  // 偏差値はデータのある馬の score だけで算出
  const withData = [...scores.values()].filter((s) => s.hasData);
  const devs = computeDeviations(withData.map((s) => s.score));
  const devByHn = new Map<number, number | undefined>();
  withData.forEach((s, i) => devByHn.set(s.horseNumber, devs[i]));

  for (const raw of scores.values()) {
    if (raw.hasData) {
      out.set(raw.horseNumber, {
        horseNumber: raw.horseNumber,
        competitionScore: raw.score,
        scoreDeviation: devByHn.get(raw.horseNumber),
        provenance: 'computed',
      });
    } else {
      out.set(raw.horseNumber, {
        horseNumber: raw.horseNumber,
        competitionScore: undefined,
        scoreDeviation: undefined,
        provenance: 'missing',
        missingReason: 'no_past_races',
      });
    }
  }

  return out;
}

/** テスト専用: キャッシュをクリア */
export function __clearCompetitionScoreCacheForTest(): void {
  CACHE.clear();
}
