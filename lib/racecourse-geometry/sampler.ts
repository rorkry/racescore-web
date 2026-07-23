/**
 * racecourse-geometry / sampler
 *
 * centerlinePoints（ポリライン）を弧長でサンプリングし、
 * position / tangent / normal / heading を返す純粋関数。
 *
 * - closed-loop: pathDistance を pathLength で wrap
 * - open-path  : pathDistance を [0, pathLength] にクランプ
 * - normal は「進行方向に依存しない外向き水平法線」= normalize(UP × tangent)
 *   （centerlinePoints は CCW 巻きで構築する前提。builder が保証する）
 * - laneOffset は normal 方向（正=外側）へずらす
 * - elevation は elevationProfile を反映して position.y に載せる
 */

import type { RacecourseGeometry, PathPose, Vec3 } from './types';
import { add, addScaled, cross, normalize, sub, UP, length } from './vec';
import { sampleElevation } from './elevation';

interface ArcLut {
  /** 各点までの累積弧長（点数 = centerlinePoints.length (+1 for closed) ） */
  cumulative: number[];
  /** 総弧長 */
  total: number;
  /** 実質的な点列（closed-loop の場合は末尾に先頭を複製した閉ループ） */
  points: Vec3[];
  closed: boolean;
}

const lutCache = new Map<string, ArcLut>();

/** 弧長 LUT を構築（水平距離ベース。y は elevation で別途決定するため無視） */
export function buildArcLut(geometry: RacecourseGeometry): ArcLut {
  const cached = lutCache.get(geometry.id);
  if (cached) return cached;

  const closed = geometry.pathKind === 'closed-loop';
  const base = geometry.centerlinePoints;
  const points = closed ? [...base, base[0]] : [...base];

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    // XZ 平面上の距離で弧長を測る（elevation を弧長に含めない：距離の正本は水平投影）
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    const seg = Math.sqrt(dx * dx + dz * dz);
    cumulative.push(cumulative[i - 1] + seg);
  }
  const total = cumulative[cumulative.length - 1];

  const lut: ArcLut = { cumulative, total, points, closed };
  lutCache.set(geometry.id, lut);
  return lut;
}

/** テスト等でキャッシュをクリアしたい場合 */
export function clearArcLutCache(): void {
  lutCache.clear();
}

/** pathDistance を有効範囲へ正規化（closed=wrap, open=clamp） */
export function normalizePathDistance(
  pathDistance: number,
  pathLength: number,
  closed: boolean
): number {
  if (!Number.isFinite(pathDistance)) return 0;
  if (pathLength <= 0) return 0;
  if (closed) {
    return ((pathDistance % pathLength) + pathLength) % pathLength;
  }
  return pathDistance < 0 ? 0 : pathDistance > pathLength ? pathLength : pathDistance;
}

/**
 * centerline 上の geometric pose（弧長 = 増加方向の接線）を返す。
 * レース進行方向（clockwise/ccw）はここでは適用しない。
 */
export function samplePathPose(
  geometry: RacecourseGeometry,
  pathDistance: number,
  laneOffset: number
): PathPose {
  const lut = buildArcLut(geometry);
  const closed = lut.closed;
  const d = normalizePathDistance(pathDistance, lut.total, closed);

  // 弧長 d を含む区間を二分探索
  const { i0, i1, t } = locateSegment(lut, d);
  const p0 = lut.points[i0];
  const p1 = lut.points[i1];

  // 位置（XZ は線形補間）
  const centerX = p0.x + (p1.x - p0.x) * t;
  const centerZ = p0.z + (p1.z - p0.z) * t;

  // 接線（区間方向を単位化）。区間が退化していれば前後区間で補う。
  let tangent = normalize({ x: p1.x - p0.x, y: 0, z: p1.z - p0.z });
  if (length(tangent) < 1e-6) {
    tangent = fallbackTangent(lut, i0);
  }

  // 外向き水平法線 = UP × tangent（CCW centerline 前提で外側）
  const normal = normalize(cross(UP, tangent));

  // laneOffset を外向き法線方向へ適用
  const posXZ: Vec3 = { x: centerX, y: 0, z: centerZ };
  const shifted = addScaled(posXZ, normal, laneOffset);

  // elevation を反映（wrap は closed のみ）
  const elevation = sampleElevation(geometry.elevationProfile, d, lut.total, closed);

  const position: Vec3 = { x: shifted.x, y: elevation, z: shifted.z };
  const heading = Math.atan2(tangent.x, tangent.z);

  return { position, tangent, normal, heading };
}

/** 弧長 d を含む区間 [i0,i1] と補間係数 t を求める */
function locateSegment(lut: ArcLut, d: number): { i0: number; i1: number; t: number } {
  const cum = lut.cumulative;
  const n = cum.length; // points.length
  // 二分探索: cum[i] <= d < cum[i+1]
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const i0 = lo;
  const i1 = Math.min(lo + 1, n - 1);
  const span = cum[i1] - cum[i0];
  const t = span > 1e-9 ? (d - cum[i0]) / span : 0;
  return { i0, i1, t };
}

/** 退化区間のときの接線フォールバック（前後の非退化区間を探す） */
function fallbackTangent(lut: ArcLut, i0: number): Vec3 {
  const pts = lut.points;
  for (let step = 1; step < pts.length; step++) {
    const a = pts[Math.max(0, i0 - step)];
    const b = pts[Math.min(pts.length - 1, i0 + step)];
    const t = normalize({ x: b.x - a.x, y: 0, z: b.z - a.z });
    if (length(t) > 1e-6) return t;
  }
  return { x: 0, y: 0, z: 1 };
}
