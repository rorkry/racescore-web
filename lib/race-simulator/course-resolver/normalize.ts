/**
 * CourseResolver - 正規化・入力検証（Step 1）
 *
 * place / trackType / distance を正規化する単一の場所。
 *
 * 方針（確定済み）:
 *  - place: 日本語の正式競馬場名へ正規化する。「東京競馬場」→「東京」のような
 *    明確な別名のみ対応する。未知の place は推測で別競馬場へ変換せず、そのまま返す
 *    （＝未登録として generic 経路へ）。空 place は明示エラー。
 *  - trackType: 芝/turf→turf、ダート/ダ/dirt→dirt。未知の値は明示エラー
 *    （＝不正入力。generic では救わない）。
 *  - distance: 数値 or 数値文字列を受け付ける。<=0 / NaN / Infinity / 数値抽出不可 は明示エラー。
 *
 * 「不正入力（エラー）」と「未登録コース（generic）」を区別するのが要点。
 */

import type {
  CourseResolveInput,
  NormalizedCourseKey,
} from '@/types/course-resolver';

/**
 * 入力検証エラー（未登録コースとは区別する）。
 */
export class CourseInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseInputError';
  }
}

// ===================================
// 競馬場名
// ===================================

/** JRA 正式競馬場名（正規化のターゲット） */
export const CANONICAL_PLACES: readonly string[] = [
  '札幌', '函館', '福島', '新潟', '東京',
  '中山', '中京', '京都', '阪神', '小倉',
] as const;

/**
 * 明確な別名 → 正式名 の対応表。
 * 推測を避けるため、確実に同一競馬場だと言えるものだけを載せる。
 */
const PLACE_ALIASES: Record<string, string> = {
  '東京競馬場': '東京',
  '中山競馬場': '中山',
  '京都競馬場': '京都',
  '阪神競馬場': '阪神',
  '中京競馬場': '中京',
  '新潟競馬場': '新潟',
  '福島競馬場': '福島',
  '小倉競馬場': '小倉',
  '札幌競馬場': '札幌',
  '函館競馬場': '函館',
};

/**
 * place を正規化する。
 *
 * @returns { place, recognized } recognized=既知の正式名/別名にマッチしたか
 * @throws CourseInputError 空 place の場合
 */
export function normalizePlace(raw: string | null | undefined): {
  place: string;
  recognized: boolean;
} {
  if (raw == null) {
    throw new CourseInputError('place が指定されていません（null/undefined）');
  }
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) {
    throw new CourseInputError('place が空です');
  }

  // 別名 → 正式名
  if (PLACE_ALIASES[trimmed]) {
    return { place: PLACE_ALIASES[trimmed], recognized: true };
  }

  // すでに正式名
  if (CANONICAL_PLACES.includes(trimmed)) {
    return { place: trimmed, recognized: true };
  }

  // 未知：推測せずそのまま返す（未登録として generic 経路へ）
  return { place: trimmed, recognized: false };
}

// ===================================
// 馬場（trackType）
// ===================================

/**
 * trackType を 'turf' | 'dirt' に正規化する。
 * 未知の値は不正入力として明示エラーにする（generic では救わない）。
 *
 * @throws CourseInputError 未対応の trackType の場合
 */
export function normalizeTrackType(raw: string | null | undefined): 'turf' | 'dirt' {
  if (raw == null) {
    throw new CourseInputError('trackType が指定されていません（null/undefined）');
  }
  const trimmed = String(raw).trim();
  if (trimmed === '芝' || trimmed === 'turf') return 'turf';
  if (trimmed === 'ダート' || trimmed === 'ダ' || trimmed === 'dirt') return 'dirt';
  throw new CourseInputError(`未対応の trackType: "${raw}"`);
}

// ===================================
// 距離（distance）
// ===================================

/**
 * distance を正の有限数に正規化する。
 * 数値または数値を含む文字列を受け付ける。
 *
 * @throws CourseInputError <=0 / NaN / Infinity / 数値抽出不可 の場合
 */
export function normalizeDistance(raw: number | string | null | undefined): number {
  if (raw == null) {
    throw new CourseInputError('distance が指定されていません（null/undefined）');
  }

  let value: number;
  if (typeof raw === 'number') {
    value = raw;
  } else {
    const match = String(raw).match(/(\d+(?:\.\d+)?)/);
    if (!match) {
      throw new CourseInputError(`distance から数値を抽出できません: "${raw}"`);
    }
    value = parseFloat(match[1]);
  }

  if (Number.isNaN(value)) {
    throw new CourseInputError(`distance が NaN です: "${raw}"`);
  }
  if (!Number.isFinite(value)) {
    throw new CourseInputError(`distance が有限数ではありません（Infinity）: "${raw}"`);
  }
  if (value <= 0) {
    throw new CourseInputError(`distance は正の数である必要があります: ${value}`);
  }

  return value;
}

// ===================================
// まとめて正規化・検証
// ===================================

/**
 * 入力を正規化・検証してコースキーを返す。
 * 不正入力（空 place / 未対応 trackType / 不正 distance）は例外を投げる。
 * place が未知でも（未登録コースとして）例外にはしない。
 *
 * @throws CourseInputError 不正入力の場合
 */
export function normalizeCourseKey(input: CourseResolveInput): NormalizedCourseKey {
  const { place, recognized } = normalizePlace(input.place);
  const trackType = normalizeTrackType(input.trackType);
  const distance = normalizeDistance(input.distance);

  return {
    place,
    trackType,
    distance,
    placeRecognized: recognized,
  };
}
