import type { RacecourseGeometry } from '../types';
import { makeStadium } from './_helpers';

/** 福島: 右回り。芝A 1600m / 直線292m / 高低差1.9m。ダート1444.6m / 直線295.7m / 高低差2.1m。複数回の起伏。 */
export const fukushimaGeometries: RacecourseGeometry[] = [
  makeStadium({
    venue: 'fukushima',
    surface: 'turf',
    route: 'main',
    direction: 'clockwise',
    loopLength: 1600,
    homeStraightLength: 292,
    trackWidth: 26,
    trackWidthMinMeters: 25,
    trackWidthMaxMeters: 27,
    trackWidthSourceNote: 'JRA公式Aコース幅員25〜27mの中央値',
    elevationRange: 1.9,
    // 複数回の起伏（概略）
    elevationFracs: [[0, 0], [0.2, 1.9], [0.4, 0.6], [0.6, 1.5], [0.8, 0.3], [1, 0]],
    distances: [1200, 1800, 2000, 2600],
  }),
  makeStadium({
    venue: 'fukushima',
    surface: 'dirt',
    route: 'main',
    direction: 'clockwise',
    loopLength: 1444.6,
    homeStraightLength: 295.7,
    trackWidth: 22.5,
    trackWidthMinMeters: 20,
    trackWidthMaxMeters: 25,
    trackWidthSourceNote: 'JRA公式ダートコース幅員20〜25mの中央値',
    elevationRange: 2.1,
    elevationFracs: [[0, 0], [0.2, 2.1], [0.4, 0.7], [0.6, 1.6], [0.8, 0.3], [1, 0]],
    distances: [1150, 1700, 2400],
  }),
];
