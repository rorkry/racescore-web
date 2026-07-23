import type { RacecourseGeometry } from '../types';
import { makeStadium } from './_helpers';

/**
 * 阪神: 右回り。芝内1689m / 内直線356.5m / 内高低差1.9m。芝外2089m / 外直線473.6m / 外高低差2.4m。
 * 独立ダート周回路。内外回りは route network（近似）。
 */
export const hanshinGeometries: RacecourseGeometry[] = [
  makeStadium({
    venue: 'hanshin',
    surface: 'turf',
    route: 'inner',
    direction: 'clockwise',
    loopLength: 1689,
    homeStraightLength: 356.5,
    elevationRange: 1.9,
    elevationFracs: [[0, 1.9], [0.15, 0.5], [0.5, 1.2], [0.85, 0.3], [1, 1.9]],
    distances: [1200, 1400, 2000, 2200],
    warnings: ['内外回りは route network の近似（独立centerline）'],
  }),
  makeStadium({
    venue: 'hanshin',
    surface: 'turf',
    route: 'outer',
    direction: 'clockwise',
    loopLength: 2089,
    homeStraightLength: 473.6,
    elevationRange: 2.4,
    // 外回り最終直線の坂（ゴール前上り）
    elevationFracs: [[0, 2.4], [0.12, 0.8], [0.5, 1.2], [0.85, 0.4], [1, 2.4]],
    distances: [1600, 1800, 2400, 3000],
    warnings: ['内外回りは route network の近似（独立centerline）'],
  }),
  makeStadium({
    venue: 'hanshin',
    surface: 'dirt',
    route: 'main',
    direction: 'clockwise',
    loopLength: 1518,
    homeStraightLength: 303,
    elevationRange: 1.6,
    elevationFracs: [[0, 0], [0.5, 1.6], [1, 0]],
    distances: [1200, 1400, 1800, 2000],
    provenance: 'estimated-fallback',
    warnings: ['ダートの周回長・直線・高低差はユーザー提供外の推定値'],
  }),
];
