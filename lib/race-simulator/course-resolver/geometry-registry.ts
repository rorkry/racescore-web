/**
 * CourseResolver - geometry レジストリ（Step 2）
 *
 * RacecourseGeometry（競馬場×馬場で共通の静的事実）の登録テーブル。
 *
 * 方針:
 *  - direction（回り方向）は公式事実として verified。
 *  - courseWidth は JRA 標準からの近似として derived。
 *  - elevationRange / lapDistance は本テーブルでは未モデル化（provenance=generic）。
 *    lapDistance はデータが無いため未設定（A コースを決め打ちしない）。
 *  - テーブルは deepFreeze し、lookup は structuredClone で複製を返す
 *    （呼び出し側から registry 本体を変更できない）。
 *  - Step 2 では対象 4 place のみ登録する（他は generic 補完）。
 */

import type {
  RacecourseGeometry,
  GeometryProvenance,
} from '@/types/course-resolver';
import { deepFreeze } from './freeze';

interface GeometryRegistryEntry {
  geometry: RacecourseGeometry;
  provenance: GeometryProvenance;
}

/** JRA 標準的なコース幅の近似（derived） */
const STANDARD_COURSE_WIDTH = 25;

/**
 * 登録テーブル。キー = `${place}_${trackType}`。
 * direction は公式事実（右回り=cw / 左回り=ccw）。
 */
const GEOMETRY_TABLE: Readonly<Record<string, GeometryRegistryEntry>> = deepFreeze({
  '函館_turf': {
    geometry: {
      place: '函館', trackType: 'turf', direction: 'cw',
      courseWidth: STANDARD_COURSE_WIDTH,
      // elevationRange / lapDistance: 未モデル化
    },
    provenance: {
      direction: 'verified',
      courseWidth: 'derived',
      elevationRange: 'generic',
      lapDistance: 'generic',
    },
  },
  '東京_dirt': {
    geometry: {
      place: '東京', trackType: 'dirt', direction: 'ccw',
      courseWidth: STANDARD_COURSE_WIDTH,
    },
    provenance: {
      direction: 'verified',
      courseWidth: 'derived',
      elevationRange: 'generic',
      lapDistance: 'generic',
    },
  },
  '福島_turf': {
    geometry: {
      place: '福島', trackType: 'turf', direction: 'cw',
      courseWidth: STANDARD_COURSE_WIDTH,
    },
    provenance: {
      direction: 'verified',
      courseWidth: 'derived',
      elevationRange: 'generic',
      lapDistance: 'generic',
    },
  },
  '新潟_turf': {
    geometry: {
      place: '新潟', trackType: 'turf', direction: 'ccw',
      courseWidth: STANDARD_COURSE_WIDTH,
    },
    provenance: {
      direction: 'verified',
      courseWidth: 'derived',
      elevationRange: 'generic',
      lapDistance: 'generic',
    },
  },
});

/**
 * geometry を検索する。登録が無ければ null。
 * 返り値は複製（registry 本体は不変）。
 */
export function lookupGeometry(
  place: string,
  trackType: 'turf' | 'dirt'
): GeometryRegistryEntry | null {
  const entry = GEOMETRY_TABLE[`${place}_${trackType}`];
  if (!entry) return null;
  return structuredClone(entry);
}
