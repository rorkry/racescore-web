/**
 * CourseResolver - layout レジストリ（Step 2）
 *
 * RaceLayout の「検証済みプリミティブ（アンカー）」を解決する。
 *
 * 方針:
 *  - 既存 course-data を主たる読み取り元にする（データを大量コピーしない）。
 *      startToFirstCorner = distanceToFirstCorner（verified）
 *      straightLength     = straightDistance（verified）
 *      hasSlope           = hasSlope（坂の provenance 判定に使用）
 *  - course-data に無い実在コースのみ、明示テーブルに登録する
 *    （例: 新潟芝1000 千直。テスト用の偽データではなく公式事実）。
 *  - コーナー形状・坂位置はここでは持たない（resolver 側で derive / generic）。
 *  - 明示テーブルは deepFreeze、返り値は複製。
 */

import { getCourseData } from '@/lib/course-data';
import { deepFreeze } from './freeze';

/** layout の検証済みプリミティブ（コーナー/坂の詳細形状は含まない） */
export interface LayoutPrimitives {
  isStraightCourse: boolean;   // verified
  startToFirstCorner: number;  // verified（直線競走では便宜上 distance を入れる）
  straightLength: number;      // verified
  hasSlope: boolean;           // 坂の有無（位置は不明）
  /** どこから解決したか（デバッグ用） */
  source: 'course-data' | 'explicit';
}

/**
 * course-data に存在しない実在コースの明示登録。
 * キー = `${place}_${trackType}_${distance}`。
 *
 * 新潟芝1000（千直）:
 *  - 直線競走（isStraightCourse=true）。コーナー無し。
 *  - 全区間が直線 ≈ 1000m。1コーナーは存在しないため startToFirstCorner は distance を便宜値とする。
 */
const EXPLICIT_LAYOUTS: Readonly<Record<string, Omit<LayoutPrimitives, 'source'>>> =
  deepFreeze({
    '新潟_turf_1000': {
      isStraightCourse: true,
      startToFirstCorner: 1000, // 便宜値（コーナー不在）
      straightLength: 1000,     // 全区間直線
      hasSlope: false,
    },
  });

/**
 * layout プリミティブを検索する。
 *  1. 明示テーブル
 *  2. 既存 course-data（straightDistance が判明しているもののみ verified 扱い）
 *  3. どちらも無ければ null（resolver 側で generic 補完）
 *
 * 返り値は複製（registry 本体は不変）。
 */
export function lookupLayoutPrimitives(
  place: string,
  trackType: 'turf' | 'dirt',
  distance: number
): LayoutPrimitives | null {
  // 1. 明示テーブル
  const explicit = EXPLICIT_LAYOUTS[`${place}_${trackType}_${distance}`];
  if (explicit) {
    return { ...structuredClone(explicit), source: 'explicit' };
  }

  // 2. 既存 course-data
  const surface = trackType === 'turf' ? '芝' : 'ダート';
  const data = getCourseData(place, surface, distance);
  if (
    data &&
    typeof data.straightDistance === 'number' &&
    typeof data.distanceToFirstCorner === 'number'
  ) {
    return {
      isStraightCourse: false,
      startToFirstCorner: data.distanceToFirstCorner,
      straightLength: data.straightDistance,
      hasSlope: !!data.hasSlope,
      source: 'course-data',
    };
  }

  // 3. 未登録
  return null;
}
