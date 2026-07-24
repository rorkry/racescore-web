/**
 * DB行 → v2 入力型への変換（純粋関数のみ・DBアクセスを含まない）
 *
 * ここで DB の実データ仕様を全部吸収する。
 * 実測で判明した罠（docs/RACE_FORECAST_V2_DATA_FINDINGS.md）:
 *
 *  1. finish_position は 1〜9着が全角数字（`１`〜`９`）、10〜18着が半角。
 *     `parseInt('１')` は NaN。`~ '^[0-9]+$'` は10着以上だけに一致する。
 *     → 全角変換を必ず通す。
 *
 *  2. 中止(止)・除外(外)・取消(消) は着順ではない。
 *     → finishPosition = null / abnormalFinish = true。99 を着順として使わない。
 *
 *  3. corner_1..4 は「最後のN個のコーナー」を右詰め格納（`--34` が最多）。
 *     → 前半位置は「最初に埋まっているコーナー」、直線入口は corner_4。
 *
 *  4. umadata は (race_id, umaban) に最大30行の重複がある。
 *     → race_id で重複除去する。
 *
 *  5. margin は勝ち馬が負値。`----` は欠損。
 */
import { isValidNumber } from './normalization';
import type { PastRaceSample, Surface } from './types';

// ============================================================
// 基本パーサ
// ============================================================

/** 全角数字 → 半角。丸数字（①〜⑳）も数字へ */
export function toHalfWidthDigits(input: string): string {
  return input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[①-⑳]/g, (c) => String(c.charCodeAt(0) - 0x2460 + 1));
}

/**
 * 着順として使えない状態を表す文字。
 *
 * 実データの出現数: 止 3,468 / 外 1,794 / 消 1,166。
 * utils/parse-helpers.ts の parseFinishPosition は「消」を含んでいないため、
 * 取消の行が数字なしとして 99 になる。legacy は修正しないが v2 では「消」も扱う。
 */
const ABNORMAL_FINISH_PATTERN = /[外止除取消中失降競落再]/;

export interface ParsedFinish {
  position: number | null;
  abnormal: boolean;
}

/**
 * 着順をパース。
 * - 全角数字に対応（1〜9着は全角で格納されている）
 * - 中止・除外・取消は position = null / abnormal = true
 * - utils/parse-helpers.ts の parseFinishPosition と違い、99 を返さない
 */
export function parseFinishPositionV2(raw: unknown): ParsedFinish {
  if (raw == null) return { position: null, abnormal: false };
  const s = String(raw).trim();
  if (s === '' || s === '----') return { position: null, abnormal: false };
  if (ABNORMAL_FINISH_PATTERN.test(s)) return { position: null, abnormal: true };
  const digits = toHalfWidthDigits(s).replace(/[^\d]/g, '');
  if (digits === '') return { position: null, abnormal: false };
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 1 || n > 30) return { position: null, abnormal: false };
  return { position: n, abnormal: false };
}

/** 数値パース（全角対応）。空・`----`・パース不能は null。0 は有効 */
export function parseNumberV2(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = toHalfWidthDigits(String(raw).trim());
  if (s === '' || /^-+$/.test(s)) return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** 整数パース（通過順位・頭数用）。範囲外は null */
export function parseIntInRange(raw: unknown, min: number, max: number): number | null {
  const n = parseNumberV2(raw);
  if (n == null) return null;
  const i = Math.round(n);
  return i >= min && i <= max ? i : null;
}

/** 「芝1600」→ { surface: '芝', distanceMeters: 1600 } */
export function parseDistanceField(raw: unknown): {
  surface: Surface | null;
  distanceMeters: number | null;
} {
  if (raw == null) return { surface: null, distanceMeters: null };
  const s = String(raw).trim();
  let surface: Surface | null = null;
  if (s.includes('芝')) surface = '芝';
  else if (s.includes('ダ')) surface = 'ダ';
  const m = s.match(/(\d{3,4})/);
  const distanceMeters = m ? parseInt(m[1], 10) : null;
  return { surface, distanceMeters };
}

/** race_id の先頭8桁を YYYYMMDD として取り出す */
export function dateNumberFromRaceId(raceId: unknown): number {
  const s = String(raceId ?? '').trim();
  const m = s.match(/^(\d{8})/);
  return m ? parseInt(m[1], 10) : 0;
}

export interface ParsedCorners {
  corners: [number | null, number | null, number | null, number | null];
  firstCornerPosition: number | null;
  lastCornerPosition: number | null;
}

/**
 * corner_1..4 をパースする。
 * DB は「最後のN個のコーナー」を右詰め格納するため、
 * 配列先頭が1角とは限らない（2コーナーのレースは corner_3/corner_4 のみ）。
 */
export function parseCorners(
  c1: unknown,
  c2: unknown,
  c3: unknown,
  c4: unknown,
  fieldSize: number | null
): ParsedCorners {
  const max = isValidNumber(fieldSize) && fieldSize > 0 ? fieldSize : 30;
  const corners: [number | null, number | null, number | null, number | null] = [
    parseIntInRange(c1, 1, max),
    parseIntInRange(c2, 1, max),
    parseIntInRange(c3, 1, max),
    parseIntInRange(c4, 1, max),
  ];
  const firstCornerPosition = corners.find((v) => v != null) ?? null;
  let lastCornerPosition: number | null = null;
  for (let i = 3; i >= 0; i--) {
    if (corners[i] != null) {
      lastCornerPosition = corners[i];
      break;
    }
  }
  return { corners, firstCornerPosition, lastCornerPosition };
}

// ============================================================
// 行 → PastRaceSample
// ============================================================

/** umadata の1行（必要な列だけ。text 型で来る前提） */
export interface UmadataRowLike {
  race_id?: unknown;
  umaban?: unknown;
  waku?: unknown;
  horse_name?: unknown;
  place?: unknown;
  course_type?: unknown;
  distance?: unknown;
  class_name?: unknown;
  track_condition?: unknown;
  field_size?: unknown;
  finish_position?: unknown;
  margin?: unknown;
  last_3f?: unknown;
  pci?: unknown;
  rpci?: unknown;
  corner_1?: unknown;
  corner_2?: unknown;
  corner_3?: unknown;
  corner_4?: unknown;
  weight_carried?: unknown;
}

/** indices の1行（real 型で来る前提） */
export interface IndicesRowLike {
  L4F?: unknown;
  T2F?: unknown;
  pfs_past?: unknown;
  potential?: unknown;
  makikaeshi?: unknown;
  cushion?: unknown;
  corner_lane?: unknown;
}

/**
 * umadata 1行 + 対応する indices 1行 → PastRaceSample
 *
 * indices は「同一レース・同一馬」の行だけを渡すこと。
 * （legacy は配列 index で横結合していたため別レースの指数が混入しうる構造だった）
 */
export function buildPastRaceSample(
  row: UmadataRowLike,
  indices: IndicesRowLike | null | undefined
): PastRaceSample {
  const fieldSize = parseIntInRange(row.field_size, 2, 30);
  const { surface, distanceMeters } = parseDistanceField(row.distance);
  const finish = parseFinishPositionV2(row.finish_position);
  const c = parseCorners(row.corner_1, row.corner_2, row.corner_3, row.corner_4, fieldSize);

  return {
    raceId: String(row.race_id ?? '').trim(),
    dateNumber: dateNumberFromRaceId(row.race_id),
    fieldSize,
    distanceMeters,
    surface,
    place: row.place != null && String(row.place).trim() !== '' ? String(row.place).trim() : null,
    trackCondition:
      row.track_condition != null && String(row.track_condition).trim() !== ''
        ? String(row.track_condition).trim()
        : null,
    className:
      row.class_name != null && String(row.class_name).trim() !== ''
        ? String(row.class_name).trim()
        : null,
    courseType:
      row.course_type != null && String(row.course_type).trim() !== ''
        ? String(row.course_type).trim()
        : null,
    finishPosition: finish.position,
    abnormalFinish: finish.abnormal,
    marginSeconds: parseNumberV2(row.margin),
    last3fSeconds: parseNumberV2(row.last_3f),
    pci: parseNumberV2(row.pci),
    rpci: parseNumberV2(row.rpci),
    corners: c.corners,
    firstCornerPosition: c.firstCornerPosition,
    lastCornerPosition: c.lastCornerPosition,
    l4fSeconds: parseNumberV2(indices?.L4F),
    t2fSeconds: parseNumberV2(indices?.T2F),
    pfsPast: parseNumberV2(indices?.pfs_past),
    potential: parseNumberV2(indices?.potential),
    makikaeshi: parseNumberV2(indices?.makikaeshi),
    cushion: parseNumberV2(indices?.cushion),
    cornerLane: parseNumberV2(indices?.corner_lane),
  };
}

/**
 * 重複除去 + 日付降順ソート + 上限件数。
 *
 * umadata は (race_id, umaban) に最大30行の重複があるため必須。
 * 重複が残ると recency weight（前走1.00 / 2走前0.75 …）が1レースに占有される。
 */
export function dedupeAndSortPastRaces(
  samples: readonly PastRaceSample[],
  maxCount = 5
): PastRaceSample[] {
  const seen = new Set<string>();
  const unique: PastRaceSample[] = [];
  for (const s of samples) {
    if (!s.raceId || seen.has(s.raceId)) continue;
    seen.add(s.raceId);
    unique.push(s);
  }
  unique.sort((a, b) => {
    if (b.dateNumber !== a.dateNumber) return b.dateNumber - a.dateNumber;
    // 同日開催は raceId で決定論的に
    return a.raceId < b.raceId ? 1 : a.raceId > b.raceId ? -1 : 0;
  });
  return unique.slice(0, Math.max(0, maxCount));
}

/**
 * 未来情報の混入防止: 対象レースの日付より前の過去走だけを残す。
 * 同日（同じ dateNumber）は除外する（同日の別レース結果も使わない）。
 */
export function filterPastRacesBefore(
  samples: readonly PastRaceSample[],
  targetDateNumber: number
): PastRaceSample[] {
  if (!isValidNumber(targetDateNumber) || targetDateNumber <= 0) return [];
  return samples.filter((s) => s.dateNumber > 0 && s.dateNumber < targetDateNumber);
}

/** 馬名の正規化（DB は末尾に空白が入っている） */
export function normalizeHorseName(raw: unknown): string {
  return String(raw ?? '').trim();
}
