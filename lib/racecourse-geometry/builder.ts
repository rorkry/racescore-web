/**
 * racecourse-geometry / builder
 *
 * 公式の数値（周回長・ホームストレッチ長・進行方向・高低差）から
 * centerlinePoints をパラメトリックに生成する。
 *
 * 重要な正直さ:
 *  - ここで作る形状は「公式数値に合わせて補正した近似 stadium」であり、
 *    公式コース図をピクセル単位でトレースしたものではない。
 *  - したがって長さ（loopLength / homeStraight）は official-adjusted、
 *    輪郭形状は estimated-fallback として provenance/warnings に正直に記録する。
 *
 * stadium モデル（CCW 巻き・外向き法線 = UP×tangent が外側になる）:
 *  - bottom 直線 = home（ゴール）ストレッチ, pathDistance [0, Hs]
 *  - right 半円ターン
 *  - top 直線（back straight, 近似的に home と同長）
 *  - left 半円ターン
 *  ターン半径 r は loopLength から解く: L = 2*Hs + 2*pi*r → r = (L - 2*Hs) / (2*pi)
 */

import type {
  RacecourseGeometry,
  RacecourseDirection,
  RacecourseRoute,
  RacecourseSurface,
  GeometrySource,
  ElevationKeyframe,
  StartMarker,
  Vec3,
} from './types';

export interface StadiumConfig {
  id: string;
  venue: string;
  surface: RacecourseSurface;
  route: RacecourseRoute;
  direction: Exclude<RacecourseDirection, 'straight'>;
  /** 公式周回長(m) */
  loopLength: number;
  /** 公式ホームストレッチ長(m) */
  homeStraightLength: number;
  /** 走路幅(m)。距離ごとには分けない代表値 */
  trackWidth: number;
  trackWidthMinMeters?: number;
  trackWidthMaxMeters?: number;
  trackWidthSourceNote?: string;
  /** 公式高低差(m) */
  elevationRange: number;
  elevationProfile?: ElevationKeyframe[];
  startMarkers?: Record<string, StartMarker>;
  sourceUrls: string[];
  provenance: GeometrySource;
  warnings?: string[];
}

export interface StraightConfig {
  id: string;
  venue: string;
  surface: RacecourseSurface;
  route: RacecourseRoute;
  /** 直線コースの全長(m) */
  pathLength: number;
  trackWidth: number;
  trackWidthMinMeters?: number;
  trackWidthMaxMeters?: number;
  trackWidthSourceNote?: string;
  elevationRange: number;
  elevationProfile?: ElevationKeyframe[];
  startMarkers?: Record<string, StartMarker>;
  sourceUrls: string[];
  provenance: GeometrySource;
  warnings?: string[];
}

const TURN_ANGLE_STEP = Math.PI / 96; // 半円あたり約96分割
const STRAIGHT_STEP = 5; // 直線を約5mごとにサンプル

/** stadium（周回路）ジオメトリを構築する */
export function buildStadiumGeometry(cfg: StadiumConfig): RacecourseGeometry {
  const warnings = [...(cfg.warnings ?? [])];
  const Hs = cfg.homeStraightLength;
  const L = cfg.loopLength;

  // ターン半径を周回長から解く
  let r = (L - 2 * Hs) / (2 * Math.PI);
  if (!(r > 0)) {
    warnings.push(
      `turnRadius <= 0 (L=${L}, Hs=${Hs}) → 最小半径にフォールバック。形状はestimated`
    );
    r = Math.max(20, L / (2 * Math.PI) * 0.25);
  }

  const hs2 = Hs / 2;
  const points: Vec3[] = [];
  const pushPt = (x: number, z: number) => {
    const last = points[points.length - 1];
    if (last && Math.abs(last.x - x) < 1e-6 && Math.abs(last.z - z) < 1e-6) return;
    points.push({ x, y: 0, z });
  };

  // 1. bottom 直線（home / goal ストレッチ）: (-hs2,-r) → (+hs2,-r), +X 方向
  {
    const n = Math.max(2, Math.ceil(Hs / STRAIGHT_STEP));
    for (let i = 0; i <= n; i++) {
      const x = -hs2 + (Hs * i) / n;
      pushPt(x, -r);
    }
  }
  // 2. right 半円ターン: center (hs2,0), θ=-90°→+90°（CCW）
  {
    const start = -Math.PI / 2;
    const end = Math.PI / 2;
    for (let a = start; a <= end + 1e-9; a += TURN_ANGLE_STEP) {
      pushPt(hs2 + r * Math.cos(a), r * Math.sin(a));
    }
  }
  // 3. top 直線（back straight）: (+hs2,+r) → (-hs2,+r), -X 方向
  {
    const n = Math.max(2, Math.ceil(Hs / STRAIGHT_STEP));
    for (let i = 0; i <= n; i++) {
      const x = hs2 - (Hs * i) / n;
      pushPt(x, r);
    }
  }
  // 4. left 半円ターン: center (-hs2,0), θ=+90°→+270°（CCW）
  {
    const start = Math.PI / 2;
    const end = (3 * Math.PI) / 2;
    for (let a = start; a <= end + 1e-9; a += TURN_ANGLE_STEP) {
      pushPt(-hs2 + r * Math.cos(a), r * Math.sin(a));
    }
  }
  // 末尾が先頭と重複していたら除去（closed-loop は sampler 側で先頭を複製）
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.z - last.z) < 1e-6) {
      points.pop();
    }
  }

  // ゴール位置: home 直線（bottom 直線 [0,Hs]）の「進行方向の終端」。
  // directionSign（俯瞰CW=右回り=+pathDistance方向）に整合させる:
  //  - clockwise(右回り, sign=+1): home 直線を +X（pathDistance 増加）で走る → 終端 = Hs
  //  - counterclockwise(左回り, sign=-1): home 直線を pathDistance 減少方向で走る → 終端 = 0
  const finishPathDistance = cfg.direction === 'clockwise' ? Hs : 0;

  return {
    id: cfg.id,
    venue: cfg.venue,
    surface: cfg.surface,
    route: cfg.route,
    pathKind: 'closed-loop',
    direction: cfg.direction,
    centerlinePoints: points,
    loopLength: L,
    pathLength: L,
    finishPathDistance,
    trackWidth: cfg.trackWidth,
    trackWidthMinMeters: cfg.trackWidthMinMeters,
    trackWidthMaxMeters: cfg.trackWidthMaxMeters,
    trackWidthSourceNote: cfg.trackWidthSourceNote,
    homeStraightLength: Hs,
    elevationRange: cfg.elevationRange,
    elevationProfile: cfg.elevationProfile ?? [],
    startMarkers: cfg.startMarkers ?? {},
    sourceUrls: cfg.sourceUrls,
    provenance: cfg.provenance,
    warnings,
  };
}

/** open-path（直線コース）ジオメトリを構築する（新潟芝直線1000等） */
export function buildStraightGeometry(cfg: StraightConfig): RacecourseGeometry {
  const warnings = [...(cfg.warnings ?? [])];
  const len = cfg.pathLength;
  const points: Vec3[] = [];
  const n = Math.max(2, Math.ceil(len / STRAIGHT_STEP));
  for (let i = 0; i <= n; i++) {
    points.push({ x: 0, y: 0, z: -len / 2 + (len * i) / n });
  }

  return {
    id: cfg.id,
    venue: cfg.venue,
    surface: cfg.surface,
    route: cfg.route,
    pathKind: 'open-path',
    direction: 'straight',
    centerlinePoints: points,
    loopLength: undefined,
    pathLength: len,
    finishPathDistance: len, // 終端がゴール
    trackWidth: cfg.trackWidth,
    trackWidthMinMeters: cfg.trackWidthMinMeters,
    trackWidthMaxMeters: cfg.trackWidthMaxMeters,
    trackWidthSourceNote: cfg.trackWidthSourceNote,
    homeStraightLength: len,
    elevationRange: cfg.elevationRange,
    elevationProfile: cfg.elevationProfile ?? [],
    startMarkers: cfg.startMarkers ?? {},
    sourceUrls: cfg.sourceUrls,
    provenance: cfg.provenance,
    warnings,
  };
}
