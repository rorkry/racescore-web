import type { RacecourseGeometry } from '../types';
import { makeStadium } from './_helpers';

/** 中京: 左回り。芝A 1705.9m / 直線412.5m / 高低差3.5m。ダート1530m / 直線410.7m / 高低差3.4m。直線に坂。 */
export const chukyoGeometries: RacecourseGeometry[] = [
  makeStadium({
    venue: 'chukyo',
    surface: 'turf',
    route: 'main',
    direction: 'counterclockwise',
    loopLength: 1705.9,
    homeStraightLength: 412.5,
    elevationRange: 3.5,
    // 最終直線に急坂（home 中盤で上り）
    elevationFracs: [[0, 0], [0.1, 3.5], [0.24, 2.0], [0.6, 1.0], [1, 0]],
    distances: [1200, 1400, 1600, 2000, 2200],
  }),
  makeStadium({
    venue: 'chukyo',
    surface: 'dirt',
    route: 'main',
    direction: 'counterclockwise',
    loopLength: 1530,
    homeStraightLength: 410.7,
    elevationRange: 3.4,
    elevationFracs: [[0, 0], [0.11, 3.4], [0.27, 2.0], [0.6, 1.0], [1, 0]],
    distances: [1200, 1400, 1800, 1900],
  }),
];
