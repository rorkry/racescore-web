/**
 * legacy / v2 のオフライン比較（読み取り専用）
 *
 * 実行:
 *   npx tsx --env-file=.env.local scripts/evaluate-race-forecast-v2.ts
 *   npx tsx --env-file=.env.local scripts/evaluate-race-forecast-v2.ts --races=200 --year=2025
 *
 * 未来情報の混入防止（データリーク対策）:
 *   1. 各対象レースについて、過去走は「対象レースの日付より前」だけを使う
 *      （同日開催も除外。filterPastRacesBefore）
 *   2. 対象レース自身の umadata 行から使うのは
 *      馬名 / 馬番 / 枠番 / 頭数 / 距離 / 馬場 / 競馬場 だけ。
 *      着順・上がり3F・通過順位・着差・PCI は「答え合わせ」にのみ使い、入力へ渡さない
 *   3. 対象レースの indices 行は使わない（対象レース後に生成される可能性があるため）
 *
 * legacy 側の扱い:
 *   完全な2Dエンジン再生（runRaceSimulation）は wakujun や当日コンテキストを必要とし
 *   過去レースに対して再構成できない。よって legacy は
 *   「実際に着順を決めていた能力値経路」= capability-analyzer の出力を
 *   race-3d-integration と同じ式で ability 化したもの を代理指標として使う。
 *   これは監査で特定した legacy の差別化能力そのものであり、
 *   飽和率（ability が同値へ潰れる割合）も同時に計測する。
 */
import { Pool } from 'pg';
import {
  buildPastRaceSample,
  dedupeAndSortPastRaces,
  filterPastRacesBefore,
  normalizeHorseName,
  parseDistanceField,
  parseFinishPositionV2,
  parseIntInRange,
  type UmadataRowLike,
} from '../lib/race-forecast-v2/sample-builder';
import { computeForecastV2, formatExplanationTable } from '../lib/race-forecast-v2/explain';
import { computeCourseAdjustment, neutralCourseAdjustment, type CourseFeaturesV2 } from '../lib/race-forecast-v2/course-adjustments';
import { frontRatio } from '../lib/race-forecast-v2/normalization';
import { DEFAULT_FORECAST_V2_CONFIG } from '../lib/race-forecast-v2/config/weights';
import type { ForecastHorseInputV2, ForecastRaceInputV2, PastRaceSample } from '../lib/race-forecast-v2/types';
import { analyzeCapabilities } from '../lib/race-simulator/capability-analyzer';
import type { HorseIndices } from '../types/race-simulator';
import { GEOMETRIES_BY_VENUE } from '../lib/racecourse-geometry/registries';
import { getSurfaceProfile } from '../lib/racecourse-geometry/surface-profiles';

// ============================================================
// 引数
// ============================================================
const args = process.argv.slice(2);
function argOf(name: string, def: string): string {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
}
const RACE_LIMIT = parseInt(argOf('races', '60'), 10);
const YEAR_FILTER = argOf('year', '');
const VERBOSE = args.includes('--verbose');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 6,
});

// ============================================================
// 統計ヘルパー
// ============================================================
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
function rankTransform(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k].i] = avg;
    i = j + 1;
  }
  return r;
}
function pearson(a: number[], b: number[]): number {
  if (a.length < 2) return NaN;
  const ma = mean(a);
  const mb = mean(b);
  let n = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    n += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  const d = Math.sqrt(da * db);
  return d === 0 ? 0 : n / d;
}
function spearman(a: number[], b: number[]): number {
  return pearson(rankTransform(a), rankTransform(b));
}

// ============================================================
// legacy 代理指標
// ============================================================
const PLACE_TO_VENUE: Record<string, string> = {
  札幌: 'sapporo', 函館: 'hakodate', 福島: 'fukushima', 新潟: 'niigata',
  東京: 'tokyo', 中山: 'nakayama', 中京: 'chukyo', 京都: 'kyoto',
  阪神: 'hanshin', 小倉: 'kokura',
};

/**
 * PastRaceSample 群 → legacy の HorseIndices。
 *
 * lib/race-simulator/data-fetcher.ts:228-247 の組み立て方をそのまま再現する。
 * `|| null`（0 を null に落とす挙動）や、前走の生 corner_1/corner_2 を使う点も
 * 意図的に同じにしている。legacy の挙動を正しく代理するため。
 */
function toLegacyIndices(
  horseNumber: number,
  horseName: string,
  past: readonly PastRaceSample[]
): HorseIndices {
  const avg = (pick: (s: PastRaceSample) => number | null): number | null => {
    const vs = past.map(pick).filter((v): v is number => v != null);
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  };
  const last = past[0];
  const collect = (pick: (s: PastRaceSample) => number | null): number[] =>
    past.map(pick).filter((v): v is number => v != null);

  return {
    horseNumber,
    horseName,
    // legacy は前走の指数を top-level に置く（`|| null` で 0 は null になる）
    T2F: last?.t2fSeconds || null,
    L4F: last?.l4fSeconds || null,
    potential: last?.potential || null,
    makikaeshi: last?.makikaeshi || null,
    pfs: last?.pfsPast || null,
    revouma: null,
    cushion: last?.cushion || null,
    pastPositions: {
      corner1: collect((s) => s.corners[0]),
      corner2: collect((s) => s.corners[1]),
      corner3: collect((s) => s.corners[2]),
      corner4: collect((s) => s.corners[3]),
    },
    lastRace: {
      T2F: last?.t2fSeconds || null,
      // legacy は生の corner_1 / corner_2 を使う（右詰め格納を考慮していない）
      corner1: last?.corners[0] ?? null,
      corner2: last?.corners[1] ?? null,
      distance: last?.distanceMeters ?? null,
      surface: last?.surface ?? null,
    },
    avgData: {
      T2F: avg((s) => s.t2fSeconds),
      L4F: avg((s) => s.l4fSeconds),
      potential: avg((s) => s.potential),
      makikaeshi: avg((s) => s.makikaeshi),
      pfs: avg((s) => s.pfsPast),
      raceCount: past.length,
    },
  };
}

/** race-3d-integration.ts と同じ ability 合成式 */
function abilityFromCapabilities(cap: {
  cruiseSpeed: number;
  acceleration: number;
  startSpeed: number;
  stamina: number;
}): number {
  const v =
    (cap.cruiseSpeed * 0.4 + cap.acceleration * 0.3 + cap.startSpeed * 0.15 + cap.stamina * 0.15) /
    100;
  return Math.max(0, Math.min(1, v));
}

// ============================================================
// コース特性の解決
// ============================================================
function resolveCourseFeatures(
  place: string,
  surface: '芝' | 'ダ',
  distanceMeters: number,
  courseType: string | null
): CourseFeaturesV2 | null {
  const venue = PLACE_TO_VENUE[place.trim()];
  if (!venue) return null;
  const list = GEOMETRIES_BY_VENUE.get(venue);
  if (!list || list.length === 0) return null;

  const wantSurface = surface === '芝' ? 'turf' : 'dirt';
  let candidates = list.filter((g) => g.surface === wantSurface);
  if (candidates.length === 0) candidates = list;

  // 内・外の指定があれば route で優先
  let geo = candidates[0];
  if (courseType) {
    const wantRoute = courseType.includes('外') ? 'outer' : courseType.includes('内') ? 'inner' : null;
    if (wantRoute) {
      const hit = candidates.find((g) => g.route === wantRoute);
      if (hit) geo = hit;
    }
  }
  const main = candidates.find((g) => g.route === 'main');
  if (!courseType && main) geo = main;

  // 芝スタートダートの芝区間
  let turfInner: number | null = null;
  let turfOuter: number | null = null;
  let turfProv: CourseFeaturesV2['turfLeadProvenance'] = null;
  const profile = getSurfaceProfile(geo.id, distanceMeters);
  if (profile) {
    const turfSeg = profile.find((s) => s.surface === 'turf' && s.fromRaceProgress === 0);
    if (turfSeg) {
      turfInner = turfSeg.toRaceProgress;
      turfOuter = turfSeg.outerToRaceProgress ?? null;
      turfProv = turfSeg.provenance;
    }
  }

  // 発走から初角までの距離（startMarkers があれば利用）
  let firstCornerDistance: number | null = null;
  const marker = geo.startMarkers?.[String(distanceMeters)];
  if (marker && typeof (marker as { distanceToFirstCorner?: number }).distanceToFirstCorner === 'number') {
    firstCornerDistance = (marker as { distanceToFirstCorner?: number }).distanceToFirstCorner ?? null;
  }

  return {
    geometryId: geo.id,
    venue: geo.venue,
    surface,
    route: geo.route,
    direction: geo.direction as CourseFeaturesV2['direction'],
    distanceMeters,
    homeStraightLength: geo.homeStraightLength ?? null,
    elevationRange: geo.elevationRange ?? null,
    trackWidth: geo.trackWidth ?? null,
    firstCornerDistance,
    cornerCount: null,
    turfLeadInnerMeters: turfInner,
    turfLeadOuterMeters: turfOuter,
    turfLeadProvenance: turfProv,
    geometryProvenance: geo.provenance ?? null,
  };
}

// ============================================================
// 1レースの評価
// ============================================================
interface RaceEval {
  raceId: string;
  place: string;
  surface: '芝' | 'ダ';
  distance: number;
  fieldSize: number;
  /** 実着順 */
  actual: Map<number, number>;
  /** 実際の前半通過順位（前半位置再現誤差の答え） */
  actualFirstCorner: Map<number, number>;
  v2Rank: Map<number, number>;
  legacyRank: Map<number, number>;
  v2: ReturnType<typeof computeForecastV2>;
  legacyAbility: Map<number, number>;
  /** v2 の予測根拠が空だった馬の割合 */
  v2MissingReasonRate: number;
  input: ForecastRaceInputV2;
}

async function evaluateRace(raceId: string): Promise<RaceEval | null> {
  const targetDate = parseInt(raceId.substring(0, 8), 10);

  // ---- 対象レースの出走馬（重複除去） ----
  const rowsRes = await pool.query(
    `SELECT DISTINCT ON (umaban)
       race_id, umaban, waku, horse_name, place, course_type, distance, class_name,
       track_condition, field_size, finish_position, last_3f, margin, pci, rpci,
       corner_1, corner_2, corner_3, corner_4, weight_carried
     FROM umadata WHERE race_id = $1 ORDER BY umaban, id`,
    [raceId]
  );
  const rows = rowsRes.rows as UmadataRowLike[];
  if (rows.length < 5) return null;

  const first = rows[0];
  const { surface, distanceMeters } = parseDistanceField(first.distance);
  const place = String(first.place ?? '').trim();
  const fieldSize = parseIntInRange(first.field_size, 2, 30) ?? rows.length;
  if (!surface || !distanceMeters) return null;

  // ---- 実着順（答え。入力には渡さない） ----
  const actual = new Map<number, number>();
  const actualFirstCorner = new Map<number, number>();
  for (const r of rows) {
    const hn = parseIntInRange(r.umaban, 1, 30);
    if (hn == null) continue;
    const f = parseFinishPositionV2(r.finish_position);
    if (f.position != null) actual.set(hn, f.position);
    const c = [r.corner_1, r.corner_2, r.corner_3, r.corner_4]
      .map((x) => parseIntInRange(x, 1, fieldSize))
      .find((x) => x != null);
    if (c != null) actualFirstCorner.set(hn, c);
  }
  if (actual.size < 5) return null;

  // ---- 各馬の過去走（対象レース日より前のみ） ----
  const names = rows.map((r) => normalizeHorseName(r.horse_name)).filter((s) => s !== '');
  if (names.length === 0) return null;

  const pastRes = await pool.query(
    `SELECT race_id, umaban, horse_name, place, course_type, distance, class_name,
            track_condition, field_size, finish_position, last_3f, margin, pci, rpci,
            corner_1, corner_2, corner_3, corner_4
     FROM umadata
     WHERE TRIM(horse_name) = ANY($1::text[])
       AND SUBSTRING(race_id,1,8) < $2
     ORDER BY race_id DESC`,
    [names, String(targetDate)]
  );

  // 過去走の indices を一括取得（過去走のものだけ。対象レースの indices は使わない）
  const indexIds = new Set<string>();
  for (const p of pastRes.rows) {
    const um = String(p.umaban ?? '').trim();
    if (um) indexIds.add(`${String(p.race_id).trim()}${um.padStart(2, '0')}`);
  }
  const indicesMap = new Map<string, Record<string, unknown>>();
  if (indexIds.size > 0) {
    const idxRes = await pool.query(
      `SELECT race_id, "L4F", "T2F", pfs_past, potential, makikaeshi, cushion, corner_lane
       FROM indices WHERE race_id = ANY($1::text[])`,
      [[...indexIds]]
    );
    for (const r of idxRes.rows) indicesMap.set(String(r.race_id), r);
  }

  // 馬名 → 過去走
  const pastByName = new Map<string, PastRaceSample[]>();
  for (const p of pastRes.rows) {
    const name = normalizeHorseName(p.horse_name);
    const um = String(p.umaban ?? '').trim();
    const idx = indicesMap.get(`${String(p.race_id).trim()}${um.padStart(2, '0')}`) ?? null;
    const sample = buildPastRaceSample(p as UmadataRowLike, idx as never);
    if (!pastByName.has(name)) pastByName.set(name, []);
    pastByName.get(name)!.push(sample);
  }

  // ---- v2 入力の組み立て ----
  const horses: ForecastHorseInputV2[] = [];
  for (const r of rows) {
    const hn = parseIntInRange(r.umaban, 1, 30);
    if (hn == null) continue;
    const name = normalizeHorseName(r.horse_name);
    const raw = pastByName.get(name) ?? [];
    // 未来情報の遮断 → 重複除去 → 直近5走
    const past = dedupeAndSortPastRaces(filterPastRacesBefore(raw, targetDate), 5);
    horses.push({
      horseNumber: hn,
      horseName: name,
      gateNumber: parseIntInRange(r.waku, 1, 8),
      weightCarried: parseIntInRange(r.weight_carried, 40, 70),
      pastRaces: past,
    });
  }
  if (horses.length < 5) return null;

  const input: ForecastRaceInputV2 = {
    condition: {
      raceKey: raceId,
      distanceMeters,
      surface,
      place,
      fieldSize,
      trackCondition: first.track_condition != null ? String(first.track_condition).trim() : null,
      route: null,
    },
    horses,
  };

  // ---- コース補正 ----
  const features = resolveCourseFeatures(
    place,
    surface,
    distanceMeters,
    first.course_type != null ? String(first.course_type) : null
  );
  const courseAdj = features ? computeCourseAdjustment(features) : neutralCourseAdjustment();

  // ---- v2 ----
  const v2 = computeForecastV2(input, courseAdj);
  const v2Rank = new Map<number, number>();
  for (const e of v2.explanations) v2Rank.set(e.horseNumber, e.predictedFinishRank);

  // 予測根拠の欠損率（寄与が全部ほぼ0の馬の割合）
  const noReason = v2.explanations.filter(
    (e) => e.factors.every((f) => Math.abs(f.contribution) < 0.005)
  ).length;
  const v2MissingReasonRate = v2.explanations.length ? noReason / v2.explanations.length : 1;

  // ---- legacy 代理 ----
  const legacyAbility = new Map<number, number>();
  for (const h of horses) {
    const indices = toLegacyIndices(h.horseNumber, h.horseName, h.pastRaces);
    const cap = analyzeCapabilities(indices, horses.length);
    legacyAbility.set(h.horseNumber, abilityFromCapabilities(cap));
  }
  const legacySorted = [...legacyAbility.entries()].sort((a, b) =>
    b[1] !== a[1] ? b[1] - a[1] : a[0] - b[0]
  );
  const legacyRank = new Map<number, number>();
  legacySorted.forEach(([hn], i) => legacyRank.set(hn, i + 1));

  return {
    raceId,
    place,
    surface,
    distance: distanceMeters,
    fieldSize,
    actual,
    actualFirstCorner,
    v2Rank,
    legacyRank,
    v2,
    legacyAbility,
    v2MissingReasonRate,
    input,
  };
}

// ============================================================
// 指標集計
// ============================================================
interface Metrics {
  races: number;
  horses: number;
  winHit: number;
  top3Recall: number[];
  spearman: number[];
  rankError: number[];
  /** 予測1着馬のうち、過去走2走以下だった割合 */
  lowInfoWinnerRate: number;
  /** 予測1着馬が実際は下位半分だった割合 */
  badWinnerRate: number;
  /** 前半位置の再現誤差（frontRatio の絶対誤差） */
  earlyPositionError: number[];
  /** 同一スコアへ潰れた割合（飽和率） */
  saturationRate: number[];
  reasonMissingRate: number[];
}

function emptyMetrics(): Metrics {
  return {
    races: 0, horses: 0, winHit: 0, top3Recall: [], spearman: [], rankError: [],
    lowInfoWinnerRate: 0, badWinnerRate: 0, earlyPositionError: [],
    saturationRate: [], reasonMissingRate: [],
  };
}

function accumulate(
  m: Metrics,
  ev: RaceEval,
  predRank: Map<number, number>,
  scores: Map<number, number>,
  pastCountOf: (hn: number) => number
) {
  const shared = [...ev.actual.keys()].filter((hn) => predRank.has(hn));
  if (shared.length < 3) return;

  m.races++;
  m.horses += shared.length;

  // 1着的中
  const actualWinner = shared.find((hn) => ev.actual.get(hn) === 1);
  const predWinner = shared.reduce((best, hn) =>
    (predRank.get(hn) ?? 99) < (predRank.get(best) ?? 99) ? hn : best
  );
  if (actualWinner != null && predWinner === actualWinner) m.winHit++;

  // Top3 recall
  const actualTop3 = shared.filter((hn) => (ev.actual.get(hn) ?? 99) <= 3);
  const predTop3 = shared
    .slice()
    .sort((a, b) => (predRank.get(a) ?? 99) - (predRank.get(b) ?? 99))
    .slice(0, 3);
  if (actualTop3.length > 0) {
    m.top3Recall.push(actualTop3.filter((hn) => predTop3.includes(hn)).length / actualTop3.length);
  }

  // 順位相関・平均順位誤差
  const a = shared.map((hn) => ev.actual.get(hn)!);
  const p = shared.map((hn) => predRank.get(hn)!);
  const sp = spearman(p, a);
  if (Number.isFinite(sp)) m.spearman.push(sp);
  m.rankError.push(mean(shared.map((hn) => Math.abs(predRank.get(hn)! - ev.actual.get(hn)!))));

  // 予測1着馬の情報量・実成績
  if (pastCountOf(predWinner) <= 2) m.lowInfoWinnerRate++;
  const wActual = ev.actual.get(predWinner);
  if (wActual != null && wActual > ev.fieldSize / 2) m.badWinnerRate++;

  // 飽和率: 同一スコアの最大グループが占める割合
  const vals = shared.map((hn) => scores.get(hn) ?? 0);
  const counts = new Map<string, number>();
  for (const v of vals) {
    const k = v.toFixed(6);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  m.saturationRate.push(Math.max(...counts.values()) / vals.length);

  m.reasonMissingRate.push(ev.v2MissingReasonRate);
}

function report(label: string, m: Metrics): Record<string, string> {
  return {
    レース数: String(m.races),
    '1着的中率': m.races ? `${((m.winHit / m.races) * 100).toFixed(1)}%` : '-',
    'Top3 recall': m.top3Recall.length ? `${(mean(m.top3Recall) * 100).toFixed(1)}%` : '-',
    Spearman順位相関: m.spearman.length ? mean(m.spearman).toFixed(4) : '-',
    平均順位誤差: m.rankError.length ? mean(m.rankError).toFixed(3) : '-',
    '低情報馬を1着予想': m.races ? `${((m.lowInfoWinnerRate / m.races) * 100).toFixed(1)}%` : '-',
    '1着予想が実下位半分': m.races ? `${((m.badWinnerRate / m.races) * 100).toFixed(1)}%` : '-',
    スコア飽和率: m.saturationRate.length ? `${(mean(m.saturationRate) * 100).toFixed(1)}%` : '-',
  };
}

// ============================================================
async function main() {
  console.log('='.repeat(100));
  console.log(' legacy / v2 オフライン比較');
  console.log('='.repeat(100));
  console.log(`対象レース数上限: ${RACE_LIMIT}${YEAR_FILTER ? ` / 年: ${YEAR_FILTER}` : ''}`);

  // ---- 対象レースの抽出（条件を散らす） ----
  // indices がある期間（2024-01-06 以降）を主対象にする
  const yearCond = YEAR_FILTER ? `AND SUBSTRING(u.race_id,1,4) = '${YEAR_FILTER}'` : `AND SUBSTRING(u.race_id,1,4) >= '2024'`;
  const pick = await pool.query(
    `WITH r AS (
       SELECT u.race_id,
              MIN(u.place)    AS place,
              MIN(u.distance) AS distance,
              MIN(u.field_size) AS field_size,
              COUNT(DISTINCT u.umaban) AS n
       FROM umadata u
       WHERE u.race_id ~ '^[0-9]{16}$' ${yearCond}
       GROUP BY u.race_id
       HAVING COUNT(DISTINCT u.umaban) >= 8
     )
     SELECT race_id, place, distance, field_size, n FROM r
     ORDER BY MD5(race_id)
     LIMIT $1`,
    [RACE_LIMIT * 2]
  );
  console.log(`候補レース: ${pick.rowCount}`);

  const legacyM = emptyMetrics();
  const v2M = emptyMetrics();
  const byCategory = new Map<string, { legacy: Metrics; v2: Metrics }>();
  let evaluated = 0;
  let skipped = 0;
  let sampleShown = false;

  for (const row of pick.rows) {
    if (evaluated >= RACE_LIMIT) break;
    let ev: RaceEval | null = null;
    try {
      ev = await evaluateRace(String(row.race_id));
    } catch (e) {
      skipped++;
      if (VERBOSE) console.log(`  skip ${row.race_id}: ${(e as Error).message}`);
      continue;
    }
    if (!ev) {
      skipped++;
      continue;
    }

    const pastCountOf = (hn: number) =>
      ev!.input.horses.find((h) => h.horseNumber === hn)?.pastRaces.length ?? 0;

    const v2Scores = new Map<number, number>(ev.v2.explanations.map((e) => [e.horseNumber, e.totalScore]));
    accumulate(v2M, ev, ev.v2Rank, v2Scores, pastCountOf);
    accumulate(legacyM, ev, ev.legacyRank, ev.legacyAbility, pastCountOf);

    // 条件別
    const distCat = ev.distance <= 1400 ? '短距離' : ev.distance <= 1800 ? '中距離' : '長距離';
    const sizeCat = ev.fieldSize >= 16 ? '16頭以上' : ev.fieldSize >= 12 ? '12-15頭' : '11頭以下';
    for (const key of [ev.surface, distCat, sizeCat]) {
      if (!byCategory.has(key)) byCategory.set(key, { legacy: emptyMetrics(), v2: emptyMetrics() });
      const c = byCategory.get(key)!;
      accumulate(c.v2, ev, ev.v2Rank, v2Scores, pastCountOf);
      accumulate(c.legacy, ev, ev.legacyRank, ev.legacyAbility, pastCountOf);
    }

    // 前半位置の再現誤差（v2 のみ。legacy は隊列予測を持たない）
    for (const e of ev.v2.explanations) {
      const actualC = ev.actualFirstCorner.get(e.horseNumber);
      if (actualC == null) continue;
      const actualFr = frontRatio(actualC, ev.fieldSize);
      if (actualFr == null) continue;
      const err = Math.abs(e.expectedFrontRatio - actualFr);
      if (Number.isFinite(err)) v2M.earlyPositionError.push(err);
    }

    evaluated++;

    if (!sampleShown && VERBOSE) {
      sampleShown = true;
      console.log(`\n[サンプル] ${ev.raceId} ${ev.place} ${ev.surface}${ev.distance} ${ev.fieldSize}頭`);
      console.log(formatExplanationTable(ev.v2.explanations.slice(0, 5), { topFactors: 3 }));
      console.log('実着順:', [...ev.actual.entries()].sort((a, b) => a[1] - b[1]).slice(0, 5).map(([hn, p]) => `${p}着=${hn}番`).join(' '));
    }

    if (evaluated % 20 === 0) console.log(`  ...${evaluated} レース評価済み`);
  }

  console.log(`\n評価済み: ${evaluated} レース / スキップ: ${skipped}`);
  if (evaluated === 0) {
    console.log('評価できるレースがありませんでした。');
    await pool.end();
    return;
  }

  // ---- 総合比較 ----
  const lr = report('legacy', legacyM);
  const vr = report('v2', v2M);
  console.log('\n' + '='.repeat(100));
  console.log(' 総合比較');
  console.log('='.repeat(100));
  console.log(`| ${'指標'.padEnd(22)} | ${'legacy'.padStart(10)} | ${'v2'.padStart(10)} |`);
  console.log(`|${'-'.repeat(24)}|${'-'.repeat(12)}|${'-'.repeat(12)}|`);
  for (const k of Object.keys(vr)) {
    console.log(`| ${k.padEnd(22)} | ${lr[k].padStart(10)} | ${vr[k].padStart(10)} |`);
  }
  if (v2M.earlyPositionError.length) {
    console.log(
      `| ${'前半位置再現誤差'.padEnd(22)} | ${'(なし)'.padStart(10)} | ${mean(v2M.earlyPositionError).toFixed(4).padStart(10)} |`
    );
  }
  console.log(
    `| ${'予測根拠欠損率'.padEnd(22)} | ${'-'.padStart(10)} | ${`${(mean(v2M.reasonMissingRate) * 100).toFixed(1)}%`.padStart(10)} |`
  );

  // ---- 条件別 ----
  console.log('\n' + '='.repeat(100));
  console.log(' 条件別 Spearman順位相関 / 1着的中率');
  console.log('='.repeat(100));
  console.log(`| ${'条件'.padEnd(10)} | ${'n'.padStart(4)} | ${'legacy相関'.padStart(10)} | ${'v2相関'.padStart(10)} | ${'legacy1着'.padStart(9)} | ${'v2 1着'.padStart(9)} |`);
  console.log(`|${'-'.repeat(12)}|${'-'.repeat(6)}|${'-'.repeat(12)}|${'-'.repeat(12)}|${'-'.repeat(11)}|${'-'.repeat(11)}|`);
  for (const [key, c] of byCategory) {
    if (c.v2.races === 0) continue;
    console.log(
      `| ${key.padEnd(10)} | ${String(c.v2.races).padStart(4)} | ` +
        `${(c.legacy.spearman.length ? mean(c.legacy.spearman).toFixed(4) : '-').padStart(10)} | ` +
        `${(c.v2.spearman.length ? mean(c.v2.spearman).toFixed(4) : '-').padStart(10)} | ` +
        `${`${((c.legacy.winHit / c.legacy.races) * 100).toFixed(1)}%`.padStart(9)} | ` +
        `${`${((c.v2.winHit / c.v2.races) * 100).toFixed(1)}%`.padStart(9)} |`
    );
  }

  console.log('\n使用した設定:');
  console.log(`  phase blend: early=${DEFAULT_FORECAST_V2_CONFIG.blend.early} mid=${DEFAULT_FORECAST_V2_CONFIG.blend.mid} late=${DEFAULT_FORECAST_V2_CONFIG.blend.late}`);
  console.log(`  L4F direction: ${DEFAULT_FORECAST_V2_CONFIG.lateModel.l4fDirection}`);
  console.log(`  乱数: enabled=${DEFAULT_FORECAST_V2_CONFIG.random.enabled} max=${DEFAULT_FORECAST_V2_CONFIG.random.maxContribution}`);
  console.log('\nデータリーク防止: 過去走は対象レース日より前のみ（同日除外）。対象レースの着順/上がり/通過順位/PCI/indices は入力に使用していない。');

  await pool.end();
}

main().catch(async (e) => {
  console.error('評価失敗:', e?.stack ?? e);
  try {
    await pool.end();
  } catch {
    /* noop */
  }
  process.exit(1);
});
