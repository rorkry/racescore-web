import type { RacecourseGeometry } from '../types';
import { makeStadium } from './_helpers';

/**
 * 京都: 右回り。芝内1782.8m / 内直線328.4m / 内高低差3.1m。芝外1894.3m / 外直線403.7m / 外高低差4.3m。
 * ダート1607.6m / 直線329.1m / 高低差3.0m。内外回りは route network（近似）。
 * 特徴: 3コーナー周辺の坂（外回り「淀の坂」）。
 */
export const kyotoGeometries: RacecourseGeometry[] = [
  makeStadium({
    venue: 'kyoto',
    surface: 'turf',
    route: 'inner',
    direction: 'clockwise',
    loopLength: 1782.8,
    homeStraightLength: 328.4,
    trackWidth: 32.5,
    trackWidthMinMeters: 27,
    trackWidthMaxMeters: 38,
    trackWidthSourceNote: 'JRA公式Aコース幅員27〜38m(内回り)の中央値',
    elevationRange: 3.1,
    // 3角付近（向正面〜3角=frac 0.5〜0.65あたり）に上り
    elevationFracs: [[0, 0], [0.3, 0.5], [0.55, 3.1], [0.7, 1.5], [0.9, 0.3], [1, 0]],
    distances: [1200, 2000],
    warnings: ['内外回りは route network の近似（独立centerline）'],
  }),
  makeStadium({
    venue: 'kyoto',
    surface: 'turf',
    route: 'outer',
    direction: 'clockwise',
    loopLength: 1894.3,
    homeStraightLength: 403.7,
    trackWidth: 31,
    trackWidthMinMeters: 24,
    trackWidthMaxMeters: 38,
    trackWidthSourceNote: 'JRA公式Aコース幅員24〜38m(外回り)の中央値',
    elevationRange: 4.3,
    elevationFracs: [[0, 0], [0.3, 0.5], [0.55, 4.3], [0.72, 1.5], [0.9, 0.3], [1, 0]],
    distances: [1400, 1600, 1800, 2200, 2400, 3000, 3200],
    warnings: ['内外回りは route network の近似（独立centerline）'],
  }),
  makeStadium({
    venue: 'kyoto',
    surface: 'dirt',
    route: 'main',
    direction: 'clockwise',
    loopLength: 1607.6,
    homeStraightLength: 329.1,
    trackWidth: 25,
    trackWidthSourceNote: 'JRA公式ダートコース幅員25m',
    elevationRange: 3.0,
    elevationFracs: [[0, 0], [0.3, 0.5], [0.55, 3.0], [0.7, 1.5], [1, 0]],
    distances: [1200, 1400, 1800, 1900],
  }),
];
