import type { RacecourseGeometry } from '../types';
import { makeStadium } from './_helpers';

/** 札幌: 右回り。芝A 1640.9m / 直線266.1m / 高低差0.7m。ダート1487m / 直線264.3m / 高低差0.9m。ほぼ平坦。 */
export const sapporoGeometries: RacecourseGeometry[] = [
  makeStadium({
    venue: 'sapporo',
    surface: 'turf',
    route: 'main',
    direction: 'clockwise',
    loopLength: 1640.9,
    homeStraightLength: 266.1,
    elevationRange: 0.7,
    elevationFracs: [[0, 0], [0.5, 0.7], [1, 0]],
    distances: [1000, 1200, 1500, 1800, 2000, 2600],
  }),
  makeStadium({
    venue: 'sapporo',
    surface: 'dirt',
    route: 'main',
    direction: 'clockwise',
    loopLength: 1487,
    homeStraightLength: 264.3,
    elevationRange: 0.9,
    elevationFracs: [[0, 0], [0.5, 0.9], [1, 0]],
    distances: [1000, 1700, 2400],
  }),
];
