/**
 * CourseResolver - generic（汎用）モデル生成（Step 1）
 *
 * 未登録だが有効な入力に対して、provenance='generic' の汎用コースモデルを生成する。
 *
 * 方針（確定済み）:
 *  - generic は本番利用を許容するが、provenance='generic' と警告を必ず伴わせる。
 *  - ここで使う比率は「汎用モデルの定義」であり、buildPhaseBoundaries の境界計算式ではない。
 *    buildPhaseBoundaries 自体は一切変更しない。
 *  - スケール不変（距離に対する比率）で定義し、任意の distance>0 で
 *    buildPhaseBoundaries の成立条件を必ず満たすようにする:
 *      straightStart = distance - straightLength > startToFirstCorner
 *      cornerStart   = straightStart - finalCornerArc > startToFirstCorner
 *  - 回り方向など「不明な事実」は決め打ちで verified にせず generic とする。
 *  - データが無い場合に A コース（1周距離）を決め打ちしない → lapDistance は未設定。
 */

import type { Corner, Slope } from '@/types/race-simulator';
import type {
  GenericGeometryResult,
  GenericLayoutResult,
} from '@/types/course-resolver';

// ---- 汎用モデルのパラメータ（generic の定義。境界計算式ではない）----

/** 直線長 = 距離 × この比率 */
const GENERIC_STRAIGHT_RATIO = 0.25;
/** スタート→1コーナー = 距離 × この比率 */
const GENERIC_OPENING_RATIO = 0.15;
/** 最終コーナー群（3-4角）の円弧長合計 = 距離 × この比率 */
const GENERIC_FINAL_CORNER_ARC_RATIO = 0.18;

/** 汎用コース幅（m） */
const GENERIC_COURSE_WIDTH = 25;
/** 汎用の回り方向（不明時の暫定。provenance=generic で明示） */
const GENERIC_DIRECTION = 'ccw' as const;

const DEG_TO_RAD = Math.PI / 180;

/**
 * 汎用の RacecourseGeometry を生成する（全項目 generic）。
 *
 * 回り方向・コース幅・高低差・1周距離はいずれも「不明」であり、
 * 暫定値を入れる場合でも provenance は generic とする。
 * lapDistance はデータが無いため未設定（A コースを決め打ちしない）。
 */
export function buildGenericGeometry(
  place: string,
  trackType: 'turf' | 'dirt'
): GenericGeometryResult {
  return {
    geometry: {
      place,
      trackType,
      direction: GENERIC_DIRECTION,
      courseWidth: GENERIC_COURSE_WIDTH,
      elevationRange: 0,
      // lapDistance: 未設定（不明。A コースを決め打ちしない）
    },
    provenance: {
      direction: 'generic',
      lapDistance: 'generic',
      courseWidth: 'generic',
      elevationRange: 'generic',
    },
  };
}

/**
 * 汎用の RaceLayout を生成する（全項目 generic）。
 *
 * distance>0 のとき、buildPhaseBoundaries の成立条件を必ず満たす。
 * corners は 3-4 角の 2 つを弧長比率から生成する（合計 = distance × ARC_RATIO）。
 */
export function buildGenericLayout(
  place: string,
  trackType: 'turf' | 'dirt',
  distance: number
): GenericLayoutResult {
  const straightLength = distance * GENERIC_STRAIGHT_RATIO;
  const startToFirstCorner = distance * GENERIC_OPENING_RATIO;

  const straightStart = distance - straightLength; // = distance × 0.75
  const finalCornerArc = distance * GENERIC_FINAL_CORNER_ARC_RATIO;
  const cornerStart = straightStart - finalCornerArc; // = distance × 0.57

  // 3-4 角を 90 度ずつ、合計弧長 = finalCornerArc になる半径で生成する。
  //   arc = 2 × r × (90°→rad) = 2 × r × (π/2) = r × π
  //   ⇒ r = finalCornerArc / π
  const angle = 90;
  const radius = finalCornerArc / (2 * (angle * DEG_TO_RAD)); // = finalCornerArc / π
  const corners: Corner[] = [
    { name: '3コーナー', position: cornerStart, radius, angle },
    { name: '4コーナー', position: cornerStart + finalCornerArc / 2, radius, angle },
  ];

  // 汎用モデルでは坂は不明 → 空
  const slopes: Slope[] = [];

  return {
    layout: {
      place,
      trackType,
      distance,
      trackSize: 'standard',
      isStraightCourse: false,
      startToFirstCorner,
      straightLength,
      corners,
      slopes,
    },
    provenance: {
      startToFirstCorner: 'generic',
      straightLength: 'generic',
      corners: 'generic',
      slopes: 'generic',
      isStraightCourse: 'generic',
    },
  };
}
