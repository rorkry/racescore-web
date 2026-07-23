/**
 * registries / index
 *
 * 全10競馬場のジオメトリを集約する。
 */

import type { RacecourseGeometry } from '../types';
import { sapporoGeometries } from './sapporo';
import { hakodateGeometries } from './hakodate';
import { fukushimaGeometries } from './fukushima';
import { niigataGeometries } from './niigata';
import { tokyoGeometries } from './tokyo';
import { nakayamaGeometries } from './nakayama';
import { chukyoGeometries } from './chukyo';
import { kyotoGeometries } from './kyoto';
import { hanshinGeometries } from './hanshin';
import { kokuraGeometries } from './kokura';

export const ALL_GEOMETRIES: RacecourseGeometry[] = [
  ...sapporoGeometries,
  ...hakodateGeometries,
  ...fukushimaGeometries,
  ...niigataGeometries,
  ...tokyoGeometries,
  ...nakayamaGeometries,
  ...chukyoGeometries,
  ...kyotoGeometries,
  ...hanshinGeometries,
  ...kokuraGeometries,
];

/** id → geometry */
export const GEOMETRY_BY_ID: Map<string, RacecourseGeometry> = new Map(
  ALL_GEOMETRIES.map((g) => [g.id, g])
);

/** venue → geometry[] */
export const GEOMETRIES_BY_VENUE: Map<string, RacecourseGeometry[]> = (() => {
  const m = new Map<string, RacecourseGeometry[]>();
  for (const g of ALL_GEOMETRIES) {
    const arr = m.get(g.venue) ?? [];
    arr.push(g);
    m.set(g.venue, arr);
  }
  return m;
})();

export const VENUE_IDS: string[] = [
  'sapporo',
  'hakodate',
  'fukushima',
  'niigata',
  'tokyo',
  'nakayama',
  'chukyo',
  'kyoto',
  'hanshin',
  'kokura',
];
