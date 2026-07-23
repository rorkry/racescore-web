/**
 * racecourse-geometry / route-resolver
 *
 * (venue, surface, route?, distance) から適切な RacecourseGeometry を選ぶ。
 * 日本語競馬場名・トラック種別も正規化して受け付ける。
 * 実在しない組み合わせは null を返す（推測で捏造しない）。
 */

import type {
  RacecourseGeometry,
  RacecourseSurface,
  RacecourseRoute,
} from './types';
import { GEOMETRY_BY_ID, GEOMETRIES_BY_VENUE } from './registries';

/** 日本語/別名 → venue id */
const VENUE_ALIASES: Record<string, string> = {
  札幌: 'sapporo', さっぽろ: 'sapporo', sapporo: 'sapporo',
  函館: 'hakodate', はこだて: 'hakodate', hakodate: 'hakodate',
  福島: 'fukushima', ふくしま: 'fukushima', fukushima: 'fukushima',
  新潟: 'niigata', にいがた: 'niigata', niigata: 'niigata',
  東京: 'tokyo', とうきょう: 'tokyo', tokyo: 'tokyo',
  中山: 'nakayama', なかやま: 'nakayama', nakayama: 'nakayama',
  中京: 'chukyo', ちゅうきょう: 'chukyo', chukyo: 'chukyo',
  京都: 'kyoto', きょうと: 'kyoto', kyoto: 'kyoto',
  阪神: 'hanshin', はんしん: 'hanshin', hanshin: 'hanshin',
  小倉: 'kokura', こくら: 'kokura', kokura: 'kokura',
};

const SURFACE_ALIASES: Record<string, RacecourseSurface> = {
  芝: 'turf', turf: 'turf', ターフ: 'turf',
  ダート: 'dirt', ダ: 'dirt', dirt: 'dirt',
};

const ROUTE_ALIASES: Record<string, RacecourseRoute> = {
  内: 'inner', 内回り: 'inner', inner: 'inner',
  外: 'outer', 外回り: 'outer', outer: 'outer',
  直線: 'straight', straight: 'straight',
  main: 'main', A: 'main',
};

export function normalizeVenue(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (VENUE_ALIASES[trimmed]) return VENUE_ALIASES[trimmed];
  // 「函館競馬場」等の部分一致
  for (const key of Object.keys(VENUE_ALIASES)) {
    if (trimmed.includes(key)) return VENUE_ALIASES[key];
  }
  return null;
}

export function normalizeSurface(input: string): RacecourseSurface | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (SURFACE_ALIASES[trimmed]) return SURFACE_ALIASES[trimmed];
  for (const key of Object.keys(SURFACE_ALIASES)) {
    if (trimmed.includes(key)) return SURFACE_ALIASES[key];
  }
  return null;
}

export function normalizeRoute(input: string | undefined): RacecourseRoute | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (ROUTE_ALIASES[trimmed]) return ROUTE_ALIASES[trimmed];
  for (const key of Object.keys(ROUTE_ALIASES)) {
    if (trimmed.includes(key)) return ROUTE_ALIASES[key];
  }
  return null;
}

export interface ResolveRouteInput {
  venue: string;
  surface: string;
  route?: string;
  raceDistance?: number;
}

export interface ResolveRouteResult {
  geometry: RacecourseGeometry;
  routeSelected: RacecourseRoute;
  /** 指定距離の StartMarker が登録済みか */
  hasStartMarker: boolean;
  warnings: string[];
}

/**
 * 経路解決。優先順位:
 *  1. venue+surface+route が明示され一致するもの
 *  2. route 未指定なら、距離の startMarker を持つ候補
 *  3. main → outer → inner → straight のフォールバック
 */
export function resolveRoute(input: ResolveRouteInput): ResolveRouteResult | null {
  const warnings: string[] = [];
  const venue = normalizeVenue(input.venue);
  const surface = normalizeSurface(input.surface);
  if (!venue || !surface) return null;

  const candidates = (GEOMETRIES_BY_VENUE.get(venue) ?? []).filter(
    (g) => g.surface === surface
  );
  if (candidates.length === 0) return null;

  const requestedRoute = normalizeRoute(input.route);
  const dist = input.raceDistance;

  // 1. route 明示一致
  if (requestedRoute) {
    const exact = candidates.find((g) => g.route === requestedRoute);
    if (exact) {
      return finalize(exact, requestedRoute, dist, warnings);
    }
    warnings.push(`route=${requestedRoute} が ${venue}:${surface} に無いためフォールバック`);
  }

  // 2. 距離の startMarker を持つ候補（route 未指定/不一致時）
  if (dist != null) {
    const byDistance = candidates.filter((g) => g.startMarkers[String(dist)]);
    if (byDistance.length === 1) {
      return finalize(byDistance[0], byDistance[0].route, dist, warnings);
    }
    if (byDistance.length > 1) {
      // 複数該当 → main/outer 優先
      const pref = pickPreferred(byDistance);
      warnings.push(`距離${dist}が複数routeに該当。${pref.route}を選択`);
      return finalize(pref, pref.route, dist, warnings);
    }
  }

  // 3. 既定フォールバック
  const fallback = pickPreferred(candidates);
  warnings.push(`既定routeへフォールバック: ${fallback.route}`);
  return finalize(fallback, fallback.route, dist, warnings);
}

function pickPreferred(list: RacecourseGeometry[]): RacecourseGeometry {
  const order: RacecourseRoute[] = ['main', 'outer', 'inner', 'straight'];
  for (const r of order) {
    const found = list.find((g) => g.route === r);
    if (found) return found;
  }
  return list[0];
}

function finalize(
  geometry: RacecourseGeometry,
  routeSelected: RacecourseRoute,
  dist: number | undefined,
  warnings: string[]
): ResolveRouteResult {
  const hasStartMarker = dist != null && !!geometry.startMarkers[String(dist)];
  if (dist != null && !hasStartMarker) {
    warnings.push(`距離${dist}のstartMarker未登録（逆算が必要）`);
  }
  return { geometry, routeSelected, hasStartMarker, warnings };
}

export function getGeometryById(id: string): RacecourseGeometry | null {
  return GEOMETRY_BY_ID.get(id) ?? null;
}
