/**
 * CourseResolver - 単一入口（Step 2）
 *
 * 入力の正規化 → 登録済み geometry/layout の解決（無ければ generic 補完）
 * → CourseInfo 合成 → PhaseBoundaries 生成（1回だけ）→ ResolvedCourse を返す。
 *
 * 重要:
 *  - 不正入力（空 place / 不正 trackType / 不正 distance）は CourseInputError。
 *  - 有効だが未登録なら generic（黙ってエラーにしない）。
 *  - buildPhaseBoundaries の計算式は変更しない。直線競走など境界が成立しない場合は
 *    無理に正常化せず CourseBoundariesError を投げる（設計上の制約）。
 */

import type {
  CourseResolveInput,
  ResolvedCourse,
  ResolvedCourseParts,
  RacecourseGeometry,
  RaceLayout,
  GeometryProvenance,
  LayoutProvenance,
  DataProvenance,
  ResolutionSource,
} from '@/types/course-resolver';
import { normalizeCourseKey } from './normalize';
import { lookupGeometry } from './geometry-registry';
import { lookupLayoutPrimitives } from './layout-registry';
import { deriveOvalCorners } from './derive';
import { buildGenericGeometry, buildGenericLayout } from './generic-model';
import { toCourseInfo } from './to-course-info';
import { weakestProvenance } from './provenance';
import { WarningCollector } from './warnings';
import { buildPhaseBoundaries } from '../phase-boundaries';

export { CourseInputError } from './normalize';

/**
 * フェーズ境界を生成できない場合のエラー（入力不正とは区別する）。
 */
export class CourseBoundariesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseBoundariesError';
  }
}

/**
 * 境界生成前までの解決を行う（buildPhaseBoundaries は呼ばない）。
 *
 * 直線競走など境界が成立しないケースでも、ここまでは必ず生成できる。
 * @throws CourseInputError 不正入力の場合
 */
export function resolveCourseParts(input: CourseResolveInput): ResolvedCourseParts {
  // 1. 正規化・検証（不正入力はここで CourseInputError）
  const key = normalizeCourseKey(input);
  const warnings = new WarningCollector();

  if (!key.placeRecognized) {
    warnings.add('PLACE_UNRECOGNIZED');
  }

  // 2. geometry 解決
  const geoEntry = lookupGeometry(key.place, key.trackType);
  let geometry: RacecourseGeometry;
  let geometryProvenance: GeometryProvenance;
  const geometryRegistered = geoEntry !== null;

  if (geoEntry) {
    geometry = geoEntry.geometry;
    geometryProvenance = geoEntry.provenance;
  } else {
    const g = buildGenericGeometry(key.place, key.trackType);
    geometry = g.geometry;
    geometryProvenance = g.provenance;
    warnings.add('DIRECTION_GENERIC');
  }

  // 3. layout 解決
  const layoutPrim = lookupLayoutPrimitives(key.place, key.trackType, key.distance);
  let layout: RaceLayout;
  let layoutProvenance: LayoutProvenance;
  const layoutRegistered = layoutPrim !== null;

  if (layoutPrim) {
    if (layoutPrim.isStraightCourse) {
      // 直線競走: コーナー無し（正しく空。偽コーナーを足さない）
      layout = {
        place: key.place,
        trackType: key.trackType,
        distance: key.distance,
        trackSize: 'standard',
        isStraightCourse: true,
        startToFirstCorner: layoutPrim.startToFirstCorner,
        straightLength: layoutPrim.straightLength,
        corners: [],
        slopes: [],
      };
      layoutProvenance = {
        startToFirstCorner: 'verified',
        straightLength: 'verified',
        corners: 'verified', // 直線競走にコーナーが無いのは公式事実
        slopes: layoutPrim.hasSlope ? 'generic' : 'verified',
        isStraightCourse: 'verified',
      };
      if (layoutPrim.hasSlope) warnings.add('SLOPES_MISSING');
    } else {
      // 周回コース: コーナーはアンカーから推定（derived）
      const corners = deriveOvalCorners(
        key.distance,
        layoutPrim.startToFirstCorner,
        layoutPrim.straightLength
      );
      layout = {
        place: key.place,
        trackType: key.trackType,
        distance: key.distance,
        trackSize: 'standard',
        isStraightCourse: false,
        startToFirstCorner: layoutPrim.startToFirstCorner,
        straightLength: layoutPrim.straightLength,
        corners,
        slopes: [],
      };
      layoutProvenance = {
        startToFirstCorner: 'verified',
        straightLength: 'verified',
        corners: 'derived',
        slopes: layoutPrim.hasSlope ? 'generic' : 'verified',
        isStraightCourse: 'verified',
      };
      warnings.add('CORNERS_DERIVED');
      if (layoutPrim.hasSlope) warnings.add('SLOPES_MISSING');
    }
  } else {
    // 未登録: generic レイアウト（コーナーは汎用推定）
    const l = buildGenericLayout(key.place, key.trackType, key.distance);
    layout = l.layout;
    layoutProvenance = l.provenance;
    warnings.add('CORNERS_DERIVED');
  }

  // 4. 1 周距離は常に未モデル化
  warnings.add('RAIL_UNKNOWN');

  // 5. resolutionSource
  let resolutionSource: ResolutionSource;
  if (geometryRegistered && layoutRegistered) {
    resolutionSource = 'registry';
  } else if (!geometryRegistered && !layoutRegistered) {
    resolutionSource = 'generic';
    warnings.add('GENERIC_MODEL_USED');
  } else {
    resolutionSource = 'registry-partial';
    warnings.add('PARTIAL_REGISTRY_MATCH');
  }

  // 6. 代表 provenance（最弱値）
  //    lapDistance / elevationRange は未設定なら計算から除外する
  //    （常に generic になり全体を無意味に generic へ落とすのを避ける）。
  const provList: DataProvenance[] = [
    geometryProvenance.direction,
    ...(geometry.courseWidth != null ? [geometryProvenance.courseWidth] : []),
    ...(geometry.elevationRange != null ? [geometryProvenance.elevationRange] : []),
    ...(geometry.lapDistance != null ? [geometryProvenance.lapDistance] : []),
    layoutProvenance.startToFirstCorner,
    layoutProvenance.straightLength,
    layoutProvenance.corners,
    layoutProvenance.slopes,
    layoutProvenance.isStraightCourse,
  ];
  const provenance = weakestProvenance(provList);

  return {
    place: key.place,
    trackType: key.trackType,
    distance: key.distance,
    geometry,
    layout,
    geometryProvenance,
    layoutProvenance,
    provenance,
    resolutionSource,
    warnings: warnings.list(),
  };
}

/**
 * コースを解決し、CourseInfo と PhaseBoundaries を含む ResolvedCourse を返す（単一入口）。
 *
 * @throws CourseInputError    不正入力の場合
 * @throws CourseBoundariesError 境界が成立しない場合（例: 直線競走。計算式は変更しない）
 */
export function resolveCourseLayout(input: CourseResolveInput): ResolvedCourse {
  const parts = resolveCourseParts(input);

  const courseInfo = toCourseInfo(parts.geometry, parts.layout);

  // buildPhaseBoundaries はここで 1 回だけ呼ぶ
  let boundaries;
  try {
    boundaries = buildPhaseBoundaries(parts.distance, courseInfo);
  } catch (e) {
    const reason = parts.layout.isStraightCourse
      ? '直線競走は現行 buildPhaseBoundaries が非対応です（計算式は変更しません）'
      : (e as Error).message;
    throw new CourseBoundariesError(
      `[resolveCourseLayout] フェーズ境界を生成できません（${reason}）: ${courseInfo.id}`
    );
  }

  return {
    ...parts,
    courseInfo,
    boundaries,
  };
}
