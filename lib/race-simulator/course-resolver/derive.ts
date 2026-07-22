/**
 * CourseResolver - 推定（derived）形状生成（Step 2）
 *
 * 公式アンカー（startToFirstCorner, straightLength, distance）から
 * 3-4 コーナーの形状を推定する。半径・角度は公式値ではないため provenance=derived。
 *
 * buildPhaseBoundaries の計算式は変更しない。ここで生成するコーナー円弧長が
 * バックストレッチ領域を食い潰さないよう、ターン可能距離の一定割合に収める。
 */

import type { Corner } from '@/types/race-simulator';

const DEG_TO_RAD = Math.PI / 180;

/**
 * 3-4 コーナーの円弧長を「ターン可能距離」の何割に割り当てるか（derived パラメータ）。
 * ターン可能距離 = straightStart - startToFirstCorner。
 * 0 < 比率 < 1 のため、cornerStart > startToFirstCorner が常に成立する。
 */
const DERIVED_CORNER_ARC_RATIO = 0.35;

/**
 * 周回コースの 3-4 コーナーを推定生成する。
 *
 * @returns 3コーナー / 4コーナーの 2 要素。合計円弧長 = ARC_RATIO × ターン可能距離。
 * @throws ターン可能距離が非正（アンカーが不整合）の場合
 */
export function deriveOvalCorners(
  distance: number,
  startToFirstCorner: number,
  straightLength: number
): Corner[] {
  const straightStart = distance - straightLength;
  const turnSpace = straightStart - startToFirstCorner;

  if (!(turnSpace > 0)) {
    throw new Error(
      `[deriveOvalCorners] ターン可能距離が非正です: straightStart=${straightStart}, startToFirstCorner=${startToFirstCorner}`
    );
  }

  const arc = DERIVED_CORNER_ARC_RATIO * turnSpace;
  const angle = 90;
  // arc = 2 × r × (90°→rad) = r × π  ⇒  r = arc / π
  const radius = arc / (2 * (angle * DEG_TO_RAD));
  const cornerStart = straightStart - arc;

  return [
    { name: '3コーナー', position: cornerStart, radius, angle },
    { name: '4コーナー', position: cornerStart + arc / 2, radius, angle },
  ];
}
