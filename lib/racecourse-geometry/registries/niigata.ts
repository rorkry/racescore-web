import type { RacecourseGeometry } from '../types';
import { makeStadium, makeStraight } from './_helpers';

/**
 * 新潟: 左回り。
 * 芝内1623m / 内直線358.7m / 内高低差0.8m
 * 芝外2223m / 外直線658.7m / 外高低差2.2m
 * 芝直線1000m は open-path
 * ダート1472.5m / 直線353.9m / 高低差0.6m
 * 芝とダート、内・外・直線は必ず別 centerline。
 */
export const niigataGeometries: RacecourseGeometry[] = [
  makeStadium({
    venue: 'niigata',
    surface: 'turf',
    route: 'inner',
    direction: 'counterclockwise',
    loopLength: 1623,
    homeStraightLength: 358.7,
    trackWidth: 25,
    trackWidthSourceNote: 'JRA公式Aコース幅員25m（内回り・外回り共通表記）',
    elevationRange: 0.8,
    elevationFracs: [[0, 0], [0.5, 0.8], [1, 0]],
    distances: [1200, 1400, 2000, 2200, 2400],
  }),
  makeStadium({
    venue: 'niigata',
    surface: 'turf',
    route: 'outer',
    direction: 'counterclockwise',
    loopLength: 2223,
    homeStraightLength: 658.7,
    trackWidth: 25,
    trackWidthSourceNote: 'JRA公式Aコース幅員25m（内回り・外回り共通表記）',
    elevationRange: 2.2,
    elevationFracs: [[0, 0], [0.35, 2.2], [0.7, 1.0], [1, 0]],
    distances: [1400, 1600, 1800, 2000],
  }),
  makeStraight({
    venue: 'niigata',
    surface: 'turf',
    pathLength: 1000,
    trackWidth: 25,
    trackWidthSourceNote: '直線コース単独の公式幅員表記なし。芝Aコース幅員25mを継続使用（estimated）',
    elevationRange: 1.0,
    // 直線1000は残り約200mからの緩い上り（概略）
    elevationFracs: [[0, 0], [0.8, 0.2], [1, 1.0]],
    distances: [1000],
  }),
  makeStadium({
    venue: 'niigata',
    surface: 'dirt',
    route: 'main',
    direction: 'counterclockwise',
    loopLength: 1472.5,
    homeStraightLength: 353.9,
    trackWidth: 20,
    trackWidthSourceNote: 'JRA公式ダートコース幅員20m',
    elevationRange: 0.6,
    elevationFracs: [[0, 0], [0.5, 0.6], [1, 0]],
    distances: [1200, 1800, 2500],
  }),
];
