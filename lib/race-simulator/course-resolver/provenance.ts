/**
 * CourseResolver - provenance（データ由来）判定（Step 1）
 *
 * 方針（確定済み）:
 *  - provenance は全体値だけでなく項目別にも保持する。
 *  - 公式値(verified) と 推定値(derived) と 汎用(generic) を区別する。
 *  - ResolvedCourse.provenance は全項目のうち最も弱い由来を代表値として返す。
 *      強さ: verified > derived > generic
 */

import type {
  DataProvenance,
  GeometryProvenance,
  LayoutProvenance,
} from '@/types/course-resolver';

/** provenance の強さランク（大きいほど信頼度が高い） */
export const PROVENANCE_RANK: Record<DataProvenance, number> = {
  verified: 2,
  derived: 1,
  generic: 0,
};

/**
 * 複数の provenance のうち最も弱いものを返す。
 * 空配列の場合は 'generic' を返す（最も弱い＝安全側）。
 */
export function weakestProvenance(values: DataProvenance[]): DataProvenance {
  if (values.length === 0) return 'generic';
  return values.reduce((weakest, current) =>
    PROVENANCE_RANK[current] < PROVENANCE_RANK[weakest] ? current : weakest
  );
}

/**
 * 複数の provenance のうち最も強いものを返す（補助的に使用）。
 * 空配列の場合は 'generic' を返す。
 */
export function strongestProvenance(values: DataProvenance[]): DataProvenance {
  if (values.length === 0) return 'generic';
  return values.reduce((strongest, current) =>
    PROVENANCE_RANK[current] > PROVENANCE_RANK[strongest] ? current : strongest
  );
}

/**
 * geometry と layout の項目別 provenance から、全体の代表値（最弱値）を算出する。
 */
export function overallProvenance(
  geometry: GeometryProvenance,
  layout: LayoutProvenance
): DataProvenance {
  const all: DataProvenance[] = [
    ...Object.values(geometry),
    ...Object.values(layout),
  ];
  return weakestProvenance(all);
}
