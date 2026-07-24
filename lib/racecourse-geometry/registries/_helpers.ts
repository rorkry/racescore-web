/**
 * registries / _helpers
 *
 * 各競馬場 registry の記述を圧縮するための共通ビルダー。
 * 公式数値（周回長・直線長・進行方向・高低差）から stadium/straight を組み立て、
 * 高低差プロファイルと逆算スタートマーカーを付与する。
 *
 * 形状は公式図トレースではなくパラメトリック近似のため、
 * provenance は既定で 'official-adjusted'（長さは公式準拠）とし、
 * startMarker は逆算 = 'estimated-fallback' とする（正直な出所表記）。
 */

import type {
  RacecourseGeometry,
  RacecourseSurface,
  RacecourseRoute,
  RacecourseDirection,
  GeometrySource,
  ElevationKeyframe,
} from '../types';
import { buildStadiumGeometry, buildStraightGeometry } from '../builder';
import { buildBackCalculatedMarkers } from '../start-marker-resolver';

/** JRA 公式コースページ URL */
export const JRA_COURSE_URL: Record<string, string> = {
  sapporo: 'https://www.jra.go.jp/facilities/race/sapporo/course/index.html',
  hakodate: 'https://www.jra.go.jp/facilities/race/hakodate/course/index.html',
  fukushima: 'https://www.jra.go.jp/facilities/race/fukushima/course/index.html',
  niigata: 'https://www.jra.go.jp/facilities/race/niigata/course/index.html',
  tokyo: 'https://www.jra.go.jp/facilities/race/tokyo/course/',
  nakayama: 'https://jra.jp/facilities/race/nakayama/course/index.html',
  chukyo: 'https://www.jra.go.jp/facilities/race/chukyo/course/index.html',
  kyoto: 'https://www.jra.go.jp/facilities/race/kyoto/course/index.html',
  hanshin: 'https://www.jra.go.jp/facilities/race/hanshin/course/',
  kokura: 'https://www.jra.go.jp/facilities/race/kokura/course/',
};

/** [frac(0..1), elevation(m)] の配列を pathLength 上のキーフレームへ変換 */
export function fracProfile(
  pathLength: number,
  fracs: Array<[number, number]>
): ElevationKeyframe[] {
  return fracs.map(([f, e]) => ({ pathDistance: f * pathLength, elevation: e }));
}

export interface StadiumSpec {
  venue: string;
  surface: RacecourseSurface;
  route: RacecourseRoute;
  direction: Exclude<RacecourseDirection, 'straight'>;
  loopLength: number;
  homeStraightLength: number;
  /** 走路幅(m)の代表値。競馬場・芝ダート・内外区分ごとの基本属性（距離ごとには分けない） */
  trackWidth?: number;
  /** 公式資料の幅員レンジ最小値(m) */
  trackWidthMinMeters?: number;
  /** 公式資料の幅員レンジ最大値(m) */
  trackWidthMaxMeters?: number;
  /** 幅員の採用根拠 */
  trackWidthSourceNote?: string;
  elevationRange: number;
  /** [frac, elevation] のプロファイル（省略時は elevationRange から簡易生成） */
  elevationFracs?: Array<[number, number]>;
  /** 登録するレース距離 */
  distances: number[];
  provenance?: GeometrySource;
  warnings?: string[];
}

export function makeStadium(spec: StadiumSpec): RacecourseGeometry {
  const id = `${spec.venue}:${spec.surface}:${spec.route}`;
  const sourceUrl = JRA_COURSE_URL[spec.venue] ?? '';
  const trackWidth = spec.trackWidth ?? (spec.surface === 'turf' ? 27 : 24);
  const trackWidthSourceNote =
    spec.trackWidthSourceNote ??
    (spec.trackWidth != null
      ? undefined
      : '公式幅員未反映のため既定値(芝27m/ダート24m)を継続使用（estimated）');
  const provenance = spec.provenance ?? 'official-adjusted';

  const elevationFracs =
    spec.elevationFracs ??
    // 簡易フォールバック: home 直線を最低、向正面付近を最高にした緩い起伏
    ([
      [0.0, 0],
      [0.25, spec.elevationRange * 0.3],
      [0.5, spec.elevationRange],
      [0.75, spec.elevationRange * 0.3],
    ] as Array<[number, number]>);

  const warnings = [...(spec.warnings ?? [])];
  warnings.push('形状はパラメトリック近似（公式図トレース未実施）');
  warnings.push('startMarker は逆算値（estimated-fallback）');

  const geometry = buildStadiumGeometry({
    id,
    venue: spec.venue,
    surface: spec.surface,
    route: spec.route,
    direction: spec.direction,
    loopLength: spec.loopLength,
    homeStraightLength: spec.homeStraightLength,
    trackWidth,
    trackWidthMinMeters: spec.trackWidthMinMeters,
    trackWidthMaxMeters: spec.trackWidthMaxMeters,
    trackWidthSourceNote,
    elevationRange: spec.elevationRange,
    elevationProfile: fracProfile(spec.loopLength, elevationFracs),
    sourceUrls: [sourceUrl],
    provenance,
    warnings,
  });

  geometry.startMarkers = buildBackCalculatedMarkers(geometry, spec.distances, sourceUrl);
  return geometry;
}

export interface StraightSpec {
  venue: string;
  surface: RacecourseSurface;
  pathLength: number;
  trackWidth?: number;
  trackWidthMinMeters?: number;
  trackWidthMaxMeters?: number;
  trackWidthSourceNote?: string;
  elevationRange: number;
  elevationFracs?: Array<[number, number]>;
  distances: number[];
  provenance?: GeometrySource;
  warnings?: string[];
}

export function makeStraight(spec: StraightSpec): RacecourseGeometry {
  const id = `${spec.venue}:${spec.surface}:straight`;
  const sourceUrl = JRA_COURSE_URL[spec.venue] ?? '';
  const trackWidth = spec.trackWidth ?? 25;
  const trackWidthSourceNote =
    spec.trackWidthSourceNote ??
    (spec.trackWidth != null ? undefined : '公式幅員未反映のため既定値(25m)を継続使用（estimated）');
  const provenance = spec.provenance ?? 'official-adjusted';

  const elevationFracs =
    spec.elevationFracs ?? ([[0, 0], [1, spec.elevationRange]] as Array<[number, number]>);

  const warnings = [...(spec.warnings ?? [])];
  warnings.push('直線コース（open-path）。形状はパラメトリック近似');
  warnings.push('startMarker は逆算値（estimated-fallback）');

  const geometry = buildStraightGeometry({
    id,
    venue: spec.venue,
    surface: spec.surface,
    route: 'straight',
    pathLength: spec.pathLength,
    trackWidth,
    trackWidthMinMeters: spec.trackWidthMinMeters,
    trackWidthMaxMeters: spec.trackWidthMaxMeters,
    trackWidthSourceNote,
    elevationRange: spec.elevationRange,
    elevationProfile: fracProfile(spec.pathLength, elevationFracs),
    sourceUrls: [sourceUrl],
    provenance,
    warnings,
  });

  geometry.startMarkers = buildBackCalculatedMarkers(geometry, spec.distances, sourceUrl);
  return geometry;
}
