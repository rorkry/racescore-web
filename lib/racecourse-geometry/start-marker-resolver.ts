/**
 * racecourse-geometry / start-marker-resolver
 *
 * - raceProgress(0..raceDistance) → centerline 上の pathDistance へ変換
 * - スタート地点の解決（登録済み StartMarker or 逆算フォールバック）
 * - レース進行方向を反映した pose 取得（samplePathPose の tangent を direction で反転）
 *
 * 逆算(back-calculation)は「検算・微調整」用であり、正本ではない。
 * 逆算で作った StartMarker は必ず provenance='estimated-fallback', confidence='fallback' とする。
 */

import type { RacecourseGeometry, StartMarker, PathPose } from './types';
import { samplePathPose, normalizePathDistance, buildArcLut } from './sampler';

/**
 * レース進行方向の符号（centerline は builder が「math+Z上=CCW」で構築する）。
 *
 * 【重要（方向契約）】Three.js は右手系で、地面(XZ)を上空(+Y)から見下ろすと
 * +X が右・+Z が「下」に見える。したがって "math+Z上でCCW" の巻きは
 * 俯瞰画面では時計回り(CW)に見える。回転向きの正本は「俯瞰＝上空から見た向き」。
 *
 * 俯瞰(from +Y)での回転は sumCross=Σ(a×b).y で測れ、右手則により
 *   sumCross<0 = CW(=JRA 右回り),  sumCross>0 = CCW(=JRA 左回り)。
 *
 * centerline を +pathDistance 方向へ辿ると sumCross<0(俯瞰CW=右回り)になるため:
 *   - clockwise(右回り) は +pathDistance 方向へ進む → sign=+1
 *   - counterclockwise(左回り) は -pathDistance 方向へ進む → sign=-1
 * （open/straight は +1）
 *
 * 旧実装は「+Z=画面上(北)」という誤前提で符号を逆に定義しており、
 * 全 closed-loop の進行方向が公式と逆に描画されていた（本番目視で確認）。
 */
export function directionSign(geometry: RacecourseGeometry): 1 | -1 {
  return geometry.direction === 'counterclockwise' ? -1 : 1;
}

/**
 * raceProgress を centerline の pathDistance へ変換する。
 *  closed-loop: normalize(startPathDistance + sign * raceProgress, loopLength)
 *  open-path  : clamp(startPathDistance + raceProgress, 0, pathLength)
 */
export function raceProgressToPathDistance(
  geometry: RacecourseGeometry,
  startPathDistance: number,
  raceProgress: number
): number {
  const closed = geometry.pathKind === 'closed-loop';
  if (closed) {
    const sign = directionSign(geometry);
    return normalizePathDistance(
      startPathDistance + sign * raceProgress,
      geometry.pathLength,
      true
    );
  }
  return normalizePathDistance(startPathDistance + raceProgress, geometry.pathLength, false);
}

/** raceDistance に対応する StartMarker を返す（無ければ null） */
export function resolveStartMarker(
  geometry: RacecourseGeometry,
  raceDistance: number
): StartMarker | null {
  const key = String(raceDistance);
  return geometry.startMarkers[key] ?? null;
}

/**
 * StartMarker を逆算で生成する（フォールバック専用）。
 *  start + sign*raceDistance ≡ finish (mod L)  → start = finish - sign*raceDistance
 */
export function backCalculateStartMarker(
  geometry: RacecourseGeometry,
  raceDistance: number,
  sourceUrl: string
): StartMarker {
  const closed = geometry.pathKind === 'closed-loop';
  let pathDistance: number;
  if (closed) {
    const sign = directionSign(geometry);
    pathDistance = normalizePathDistance(
      geometry.finishPathDistance - sign * raceDistance,
      geometry.pathLength,
      true
    );
  } else {
    pathDistance = normalizePathDistance(
      geometry.finishPathDistance - raceDistance,
      geometry.pathLength,
      false
    );
  }
  return {
    raceDistance,
    pathDistance,
    routeId: geometry.id,
    source: 'estimated-fallback',
    sourceUrl,
    confidence: 'fallback',
  };
}

/**
 * レース進行方向を反映した pose を返す。
 * samplePathPose は「pathDistance 増加方向の接線」を返すため、
 * clockwise（sign=-1）では tangent/heading を反転する。normal は不変（外向き）。
 */
export function sampleRaceProgressPose(
  geometry: RacecourseGeometry,
  startPathDistance: number,
  raceProgress: number,
  laneOffset: number
): PathPose {
  const pathDistance = raceProgressToPathDistance(geometry, startPathDistance, raceProgress);
  const pose = samplePathPose(geometry, pathDistance, laneOffset);
  const sign = directionSign(geometry);
  if (sign === -1) {
    const tangent = { x: -pose.tangent.x, y: -pose.tangent.y, z: -pose.tangent.z };
    return {
      position: pose.position,
      tangent,
      normal: pose.normal,
      heading: Math.atan2(tangent.x, tangent.z),
    };
  }
  return pose;
}

/**
 * 指定距離群について逆算 StartMarker を一括生成する（フォールバック専用）。
 * 公式図トレース未実施の距離はこれで暫定登録し、provenance を正直に fallback とする。
 */
export function buildBackCalculatedMarkers(
  geometry: RacecourseGeometry,
  raceDistances: number[],
  sourceUrl: string
): Record<string, StartMarker> {
  const markers: Record<string, StartMarker> = {};
  for (const d of raceDistances) {
    markers[String(d)] = backCalculateStartMarker(geometry, d, sourceUrl);
  }
  return markers;
}

/**
 * 検算: start(raceProgress=0) と finish(raceProgress=raceDistance) の
 * pathDistance が期待どおりかを測る。closed-loop は「実際に走る弧長」も返す。
 */
export function verifyStartFinish(
  geometry: RacecourseGeometry,
  startMarker: StartMarker
): {
  startPathDistance: number;
  finishPathDistanceComputed: number;
  expectedFinish: number;
  finishErrorMeters: number;
  traveledDistance: number;
} {
  buildArcLut(geometry);
  const startPathDistance = raceProgressToPathDistance(geometry, startMarker.pathDistance, 0);
  const finishComputed = raceProgressToPathDistance(
    geometry,
    startMarker.pathDistance,
    startMarker.raceDistance
  );
  const expectedFinish = geometry.finishPathDistance;

  // closed-loop は円環距離で誤差を測る
  let finishError: number;
  if (geometry.pathKind === 'closed-loop') {
    const L = geometry.pathLength;
    const diff = Math.abs(finishComputed - expectedFinish) % L;
    finishError = Math.min(diff, L - diff);
  } else {
    finishError = Math.abs(finishComputed - expectedFinish);
  }

  return {
    startPathDistance,
    finishPathDistanceComputed: finishComputed,
    expectedFinish,
    finishErrorMeters: finishError,
    traveledDistance: startMarker.raceDistance,
  };
}
