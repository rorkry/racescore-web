/**
 * racecourse-geometry / validation
 *
 * ジオメトリの静的検証（純粋関数）。
 * NaN/Infinity、長さ整合、seam連続、tangent/normal健全性、
 * 巻き方向（外向き法線が実際に外側を向くか）を検査する。
 */

import type { RacecourseGeometry } from './types';
import { buildArcLut, samplePathPose } from './sampler';
import { isFiniteVec, length as vlen, dot, sub, normalize } from './vec';

export interface GeometryValidationResult {
  id: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    arcLength: number;
    declaredPathLength: number;
    pathLengthErrorMeters: number;
    pointCount: number;
    maxTangentDeviation: number; // |tangent|-1 の最大
    seamGapMeters: number;
  };
}

export function validateGeometry(
  geometry: RacecourseGeometry,
  opts?: { pathLengthTolerance?: number }
): GeometryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [...geometry.warnings];
  const tol = opts?.pathLengthTolerance ?? 5;

  const pts = geometry.centerlinePoints;
  if (!pts || pts.length < 8) {
    errors.push(`centerlinePoints が少なすぎる (${pts?.length ?? 0})`);
  }
  for (let i = 0; i < (pts?.length ?? 0); i++) {
    if (!isFiniteVec(pts[i])) {
      errors.push(`centerlinePoints[${i}] が非有限`);
      break;
    }
  }
  if (!(geometry.pathLength > 0)) errors.push('pathLength <= 0');
  if (!(geometry.trackWidth > 0)) errors.push('trackWidth <= 0');
  if (!Number.isFinite(geometry.finishPathDistance)) errors.push('finishPathDistance 非有限');

  const lut = buildArcLut(geometry);
  const arcLength = lut.total;
  const pathLengthError = Math.abs(arcLength - geometry.pathLength);
  if (pathLengthError > tol) {
    warnings.push(
      `弧長(${arcLength.toFixed(1)}m) が declared pathLength(${geometry.pathLength}m) と ${pathLengthError.toFixed(1)}m 乖離`
    );
  }

  // サンプルして tangent/normal/position の健全性を検査
  let maxTangentDev = 0;
  const N = 240;
  const closed = geometry.pathKind === 'closed-loop';
  for (let i = 0; i < N; i++) {
    const d = (arcLength * i) / N;
    const pose = samplePathPose(geometry, d, 0);
    if (!isFiniteVec(pose.position) || !isFiniteVec(pose.tangent) || !isFiniteVec(pose.normal)) {
      errors.push(`sample@${d.toFixed(1)}m で非有限な pose`);
      break;
    }
    maxTangentDev = Math.max(maxTangentDev, Math.abs(vlen(pose.tangent) - 1));
    if (!Number.isFinite(pose.heading)) {
      errors.push(`sample@${d.toFixed(1)}m で heading 非有限`);
      break;
    }
  }
  if (maxTangentDev > 0.05) {
    warnings.push(`tangent の単位長ずれが大きい (max ${maxTangentDev.toFixed(3)})`);
  }

  // seam 連続（closed-loop のみ）: 始点と終点の距離
  let seamGap = 0;
  if (closed && pts && pts.length > 1) {
    seamGap = vlen(sub(pts[0], pts[pts.length - 1]));
    // 末尾は先頭を複製しない設計なので、1区間分（数m）の gap は許容
  }

  // 外向き法線の向き検証: 重心から見て normal が外側を向くか（closed のみ）
  if (closed && pts && pts.length >= 8 && errors.length === 0) {
    const centroid = pts.reduce(
      (acc, p) => ({ x: acc.x + p.x / pts.length, y: 0, z: acc.z + p.z / pts.length }),
      { x: 0, y: 0, z: 0 }
    );
    let outwardOk = 0;
    const samples = 8;
    for (let i = 0; i < samples; i++) {
      const d = (arcLength * i) / samples;
      const pose = samplePathPose(geometry, d, 0);
      const toOut = normalize(sub(pose.position, centroid));
      if (dot(toOut, pose.normal) > 0) outwardOk++;
    }
    if (outwardOk < samples) {
      warnings.push(`外向き法線が内側を向くサンプルあり (${outwardOk}/${samples})`);
    }
  }

  return {
    id: geometry.id,
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: {
      arcLength,
      declaredPathLength: geometry.pathLength,
      pathLengthErrorMeters: pathLengthError,
      pointCount: pts?.length ?? 0,
      maxTangentDeviation: maxTangentDev,
      seamGapMeters: seamGap,
    },
  };
}
