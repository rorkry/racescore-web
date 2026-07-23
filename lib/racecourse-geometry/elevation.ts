/**
 * racecourse-geometry / elevation
 *
 * 高低差プロファイルの純粋サンプラー。
 * 馬・走路・柵・カメラが同じ elevation を共有するための正本。
 */

import type { ElevationKeyframe } from './types';

/**
 * pathDistance における標高を線形補間で返す。
 *
 * - profile が空なら 0（平坦）
 * - closed-loop の場合は pathLength で wrap して端点をつなぐ
 * - open-path の場合は端点でクランプ（pathLength を渡しても両端が同一標高でなければ wrap しない方が安全だが、
 *   ここでは wrap 指定を任意にする）
 */
export function sampleElevation(
  profile: ElevationKeyframe[],
  pathDistance: number,
  pathLength: number,
  wrap: boolean
): number {
  if (!profile || profile.length === 0) return 0;
  if (profile.length === 1) return profile[0].elevation;

  // ソート済み前提だが、防御的にコピーしてソート
  const kfs = [...profile].sort((a, b) => a.pathDistance - b.pathDistance);

  let d = pathDistance;
  if (wrap && pathLength > 0) {
    d = ((d % pathLength) + pathLength) % pathLength;
  }

  // 端の外側はクランプ（wrap の場合は端点間を線形につなぐ）
  if (d <= kfs[0].pathDistance) {
    if (wrap && pathLength > 0) {
      // 最終KF → 先頭KF（周回のつなぎ）
      const last = kfs[kfs.length - 1];
      const first = kfs[0];
      const span = (first.pathDistance + pathLength) - last.pathDistance;
      if (span <= 1e-9) return first.elevation;
      const t = ((d + pathLength) - last.pathDistance) / span;
      return last.elevation + (first.elevation - last.elevation) * clamp01(t);
    }
    return kfs[0].elevation;
  }
  if (d >= kfs[kfs.length - 1].pathDistance) {
    if (wrap && pathLength > 0) {
      const last = kfs[kfs.length - 1];
      const first = kfs[0];
      const span = (first.pathDistance + pathLength) - last.pathDistance;
      if (span <= 1e-9) return last.elevation;
      const t = (d - last.pathDistance) / span;
      return last.elevation + (first.elevation - last.elevation) * clamp01(t);
    }
    return kfs[kfs.length - 1].elevation;
  }

  // 内部区間を線形補間
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (d >= a.pathDistance && d <= b.pathDistance) {
      const span = b.pathDistance - a.pathDistance;
      if (span <= 1e-9) return a.elevation;
      const t = (d - a.pathDistance) / span;
      return a.elevation + (b.elevation - a.elevation) * t;
    }
  }
  return kfs[kfs.length - 1].elevation;
}

/** プロファイルの高低差レンジ（最大-最小） */
export function elevationRangeOf(profile: ElevationKeyframe[]): number {
  if (!profile || profile.length === 0) return 0;
  let min = Infinity, max = -Infinity;
  for (const kf of profile) {
    min = Math.min(min, kf.elevation);
    max = Math.max(max, kf.elevation);
  }
  return max - min;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
