/**
 * racecourse-geometry: 公式コースジオメトリ基盤の公開API。
 */

export * from './types';
export * from './vec';
export { sampleElevation, elevationRangeOf } from './elevation';
export {
  buildArcLut,
  clearArcLutCache,
  normalizePathDistance,
  samplePathPose,
} from './sampler';
export { buildStadiumGeometry, buildStraightGeometry } from './builder';
export {
  directionSign,
  raceProgressToPathDistance,
  resolveStartMarker,
  backCalculateStartMarker,
  buildBackCalculatedMarkers,
  sampleRaceProgressPose,
  pathDistanceAtRemaining,
  verifyStartFinish,
} from './start-marker-resolver';
export { validateGeometry, type GeometryValidationResult } from './validation';
export {
  resolveRoute,
  normalizeVenue,
  normalizeSurface,
  normalizeRoute,
  getGeometryById,
  type ResolveRouteInput,
  type ResolveRouteResult,
} from './route-resolver';
export {
  ALL_GEOMETRIES,
  GEOMETRY_BY_ID,
  GEOMETRIES_BY_VENUE,
  VENUE_IDS,
} from './registries';
export {
  getSurfaceProfile,
  hasMixedSurface,
  resolveSurfaceAtRaceProgress,
  type SurfaceType,
  type SurfaceSegment,
  type SurfaceSegmentProvenance,
  type SurfaceProfileByDistance,
  type ResolveSurfaceInput,
  type SurfaceResolution,
} from './surface-profiles';
