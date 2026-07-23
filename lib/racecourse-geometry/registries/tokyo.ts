import type { RacecourseGeometry } from '../types';
import { makeStadium } from './_helpers';

/**
 * 東京: 左回り。芝A 2083.1m / 直線525.9m / 高低差2.7m。ダート1899m / 直線501.6m / 高低差2.5m。
 * 特徴: 向正面および最終直線に坂（直線半ばの上り）。
 */
export const tokyoGeometries: RacecourseGeometry[] = [
  makeStadium({
    venue: 'tokyo',
    surface: 'turf',
    route: 'main',
    direction: 'counterclockwise',
    loopLength: 2083.1,
    homeStraightLength: 525.9,
    elevationRange: 2.7,
    // home直線の中盤に上り（frac 0〜Hs/L 付近が home）。向正面にも起伏（概略）
    elevationFracs: [[0, 0.5], [0.12, 2.7], [0.2, 2.2], [0.5, 1.5], [0.75, 2.0], [1, 0]],
    distances: [1400, 1600, 1800, 2000, 2300, 2400, 2500, 3400],
  }),
  makeStadium({
    venue: 'tokyo',
    surface: 'dirt',
    route: 'main',
    direction: 'counterclockwise',
    loopLength: 1899,
    homeStraightLength: 501.6,
    elevationRange: 2.5,
    elevationFracs: [[0, 0.4], [0.13, 2.5], [0.22, 2.0], [0.6, 1.2], [1, 0]],
    distances: [1300, 1400, 1600, 2100, 2400],
  }),
];
