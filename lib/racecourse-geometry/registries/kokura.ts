import type { RacecourseGeometry } from '../types';
import { makeStadium } from './_helpers';

/** 小倉: 右回り。芝A 1615.1m / 直線293m / 高低差3.0m。ダート1445.4m / 直線291.3m / 高低差2.9m。2コーナー付近の丘。 */
export const kokuraGeometries: RacecourseGeometry[] = [
  makeStadium({
    venue: 'kokura',
    surface: 'turf',
    route: 'main',
    direction: 'clockwise',
    loopLength: 1615.1,
    homeStraightLength: 293,
    elevationRange: 3.0,
    // 2コーナー付近（back手前）の丘（概略）
    elevationFracs: [[0, 0], [0.35, 3.0], [0.5, 2.5], [0.75, 0.8], [1, 0]],
    distances: [1200, 1800, 2000, 2600],
  }),
  makeStadium({
    venue: 'kokura',
    surface: 'dirt',
    route: 'main',
    direction: 'clockwise',
    loopLength: 1445.4,
    homeStraightLength: 291.3,
    elevationRange: 2.9,
    elevationFracs: [[0, 0], [0.35, 2.9], [0.5, 2.4], [0.75, 0.8], [1, 0]],
    distances: [1000, 1700, 2400],
  }),
];
