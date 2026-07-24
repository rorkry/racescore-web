import type { RacecourseGeometry } from '../types';
import { makeStadium } from './_helpers';

/**
 * 中山: 右回り。芝内1667.1m / 芝外1839.7m / 直線310m / 高低差5.3m。独立ダート周回路。
 * 内外回りは本来 route network（共有区間・分岐）。現状は route ごとに独立 centerline で近似。
 * 特徴: 最大級の高低差、ゴール前の急坂。
 */
const goalHillFracs: Array<[number, number]> = [
  [0, 5.3],    // ゴール（坂の頂上付近）
  [0.1, 3.0],
  [0.3, 1.0],
  [0.55, 2.5],
  [0.8, 4.0],
  [1, 5.3],
];

export const nakayamaGeometries: RacecourseGeometry[] = [
  makeStadium({
    venue: 'nakayama',
    surface: 'turf',
    route: 'inner',
    direction: 'clockwise',
    loopLength: 1667.1,
    homeStraightLength: 310,
    trackWidth: 26,
    trackWidthMinMeters: 20,
    trackWidthMaxMeters: 32,
    trackWidthSourceNote: 'JRA公式Aコース幅員20〜32m(内回り)の中央値',
    elevationRange: 5.3,
    elevationFracs: goalHillFracs,
    distances: [1800, 2000, 2500],
    warnings: ['内外回りは route network の近似（独立centerline）'],
  }),
  makeStadium({
    venue: 'nakayama',
    surface: 'turf',
    route: 'outer',
    direction: 'clockwise',
    loopLength: 1839.7,
    homeStraightLength: 310,
    trackWidth: 28,
    trackWidthMinMeters: 24,
    trackWidthMaxMeters: 32,
    trackWidthSourceNote: 'JRA公式Aコース幅員24〜32m(外回り)の中央値',
    elevationRange: 5.3,
    elevationFracs: goalHillFracs,
    distances: [1200, 1600, 2200, 3600],
    warnings: ['内外回りは route network の近似（独立centerline）'],
  }),
  makeStadium({
    venue: 'nakayama',
    surface: 'dirt',
    route: 'main',
    direction: 'clockwise',
    // 周回長・直線・高低差は今回の幅員調査範囲外のため既存値(estimated-fallback)を維持。
    // 幅員のみJRA公式ページで確認できたため反映（値自体は既存の1,493m/308m/4.5mと一致）。
    loopLength: 1493,
    homeStraightLength: 308,
    trackWidth: 22.5,
    trackWidthMinMeters: 20,
    trackWidthMaxMeters: 25,
    trackWidthSourceNote: 'JRA公式ダートコース幅員20〜25mの中央値',
    elevationRange: 4.5,
    elevationFracs: [[0, 4.5], [0.3, 1.0], [0.7, 3.0], [1, 4.5]],
    distances: [1200, 1800, 2400, 2500],
    provenance: 'estimated-fallback',
    warnings: ['ダートの周回長・直線・高低差はユーザー提供外の推定値（幅員のみ公式値を反映）'],
  }),
];
