/**
 * CourseResolver - CourseInfo 合成（Step 1）
 *
 * RacecourseGeometry + RaceLayout から、既存エンジン互換の CourseInfo を合成する。
 *
 * 方針（確定済み）:
 *  - CourseInfo は当面「互換合成型」として維持する（今回は廃止しない）。
 *  - buildPhaseBoundaries や各フェーズエンジンは CourseInfo を入力に取るため、
 *    それらを変更せずに新データ構造を橋渡しする役割を担う。
 *  - clockwise は direction から導出する（cw=true, ccw=false）。
 */

import type { CourseInfo } from '@/types/race-simulator';
import type { RacecourseGeometry, RaceLayout } from '@/types/course-resolver';

/** CourseInfo 合成時の補助オプション（傾向値など。未指定時は中立値） */
export interface ToCourseInfoOptions {
  innerAdvantage?: number;
  outerAdvantage?: number;
  paceTendency?: 'slow' | 'middle' | 'high';
  innerRailSafetyMargin?: number;
  outerRailSafetyMargin?: number;
}

/**
 * RacecourseGeometry + RaceLayout から CourseInfo を合成する。
 *
 * 傾向値（inner/outerAdvantage, paceTendency）は幾何情報からは決まらないため、
 * options で与えられなければ中立値（0 / 0 / 'middle'）を用いる。
 */
export function toCourseInfo(
  geometry: RacecourseGeometry,
  layout: RaceLayout,
  options: ToCourseInfoOptions = {}
): CourseInfo {
  if (geometry.place !== layout.place) {
    throw new Error(
      `[toCourseInfo] geometry.place(${geometry.place}) と layout.place(${layout.place}) が不一致です`
    );
  }
  if (geometry.trackType !== layout.trackType) {
    throw new Error(
      `[toCourseInfo] geometry.trackType(${geometry.trackType}) と layout.trackType(${layout.trackType}) が不一致です`
    );
  }

  return {
    id: `${layout.place}_${layout.distance}_${layout.trackType}`,
    place: layout.place,
    distance: layout.distance,
    trackType: layout.trackType,

    // コース形状（RaceLayout 由来）
    straightLength: layout.straightLength,
    startToFirstCorner: layout.startToFirstCorner,
    corners: layout.corners,
    slopes: layout.slopes,

    // ジオメトリ（RacecourseGeometry 由来）
    courseWidth: geometry.courseWidth,
    clockwise: geometry.direction === 'cw',
    innerRailSafetyMargin: options.innerRailSafetyMargin ?? 1.5,
    outerRailSafetyMargin: options.outerRailSafetyMargin ?? 1.0,

    // 傾向（幾何からは決まらない。未指定は中立値）
    innerAdvantage: options.innerAdvantage ?? 0,
    outerAdvantage: options.outerAdvantage ?? 0,
    paceTendency: options.paceTendency ?? 'middle',
  };
}
