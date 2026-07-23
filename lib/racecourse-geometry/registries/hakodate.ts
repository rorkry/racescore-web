import type { RacecourseGeometry } from '../types';
import { makeStadium } from './_helpers';

/**
 * 函館: 右回り。芝A 1626.6m / 直線262.1m / 高低差3.5m。ダート1475.8m / 直線260.3m / 高低差3.5m。
 * 特徴: 2コーナー以降〜4コーナーまで上り（形状はパラメトリック近似のため起伏は概略）。
 */
export const hakodateGeometries: RacecourseGeometry[] = [
  makeStadium({
    venue: 'hakodate',
    surface: 'turf',
    route: 'main',
    direction: 'clockwise',
    loopLength: 1626.6,
    homeStraightLength: 262.1,
    elevationRange: 3.5,
    // home(0) 低 → 向正面〜4角にかけて上り → home 手前で下り、の概略
    elevationFracs: [[0, 0], [0.25, 3.5], [0.5, 3.2], [0.7, 2.0], [0.9, 0.5], [1, 0]],
    distances: [1000, 1200, 1800, 2000, 2600],
  }),
  makeStadium({
    venue: 'hakodate',
    surface: 'dirt',
    route: 'main',
    direction: 'clockwise',
    loopLength: 1475.8,
    homeStraightLength: 260.3,
    elevationRange: 3.5,
    elevationFracs: [[0, 0], [0.25, 3.5], [0.5, 3.2], [0.7, 2.0], [0.9, 0.5], [1, 0]],
    distances: [1000, 1700, 2400],
  }),
];
