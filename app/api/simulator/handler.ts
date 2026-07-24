/**
 * /api/simulator の中核ロジック（Next 依存なしの純粋関数）
 *
 * ここに切り出す目的:
 *  - resolveCourseLayout を「1 リクエストにつき 1 回だけ」呼び、
 *    同じ ResolvedCourse を orchestrator（注入）と API レスポンス（courseInfo）で共有する。
 *  - next/server・auth・db に依存しないため単体テストしやすい。
 *
 * route.ts は本モジュールを呼ぶだけの薄いラッパにする。
 */

import { runRaceSimulation } from '@/lib/race-simulator/simulation-orchestrator';
import { generateTimeline } from '@/lib/race-simulator/timeline-generator';
import {
  resolveCourseLayout,
  CourseInputError,
  CourseBoundariesError,
} from '@/lib/race-simulator/course-resolver';
import { loadCompetitionScoresForRace } from '@/lib/server/competition-score-service';
import type { TrackBias } from '@/types/race-simulator';

/** buildSimulatorResponse への入力（route.ts で DB から取得した生値） */
export interface SimulatorRequestParams {
  year: string;
  date: string;
  place: string;
  raceNumber: string;
  distance: number;      // 解析済みレース距離（m）
  rawTrackType: string;  // DB 生値（'芝' / 'ダート' / 'ダ' 等）
  trackBias?: TrackBias;
}

/**
 * コース解決 → シミュレーション → タイムライン生成 → レスポンス payload を構築する。
 *
 * resolveCourseLayout はこの関数内で 1 回だけ実行し、その ResolvedCourse を
 *  - orchestrator へ resolvedCourse として注入（orchestrator 内部の解決は 0 回）
 *  - API レスポンスの courseInfo / courseResolution
 * に共有する。これにより courseInfo・boundaries・3D へ渡す形状の由来が完全に一致する。
 *
 * @throws CourseInputError     入力不正（空 place / 不正 trackType / 不正 distance）
 * @throws CourseBoundariesError 有効だが現行 buildPhaseBoundaries で境界生成不可（例: 新潟芝1000 直線）
 */
export async function buildSimulatorResponse(
  db: unknown,
  params: SimulatorRequestParams
) {
  const { year, date, place, raceNumber, distance, rawTrackType, trackBias } = params;

  // 1. コース解決（このリクエストで唯一の resolveCourseLayout 呼び出し）
  const resolvedCourse = resolveCourseLayout({
    place,
    trackType: rawTrackType,
    distance,
  });

  console.log(
    `[API] コース解決: ${resolvedCourse.place} ${resolvedCourse.distance}m ${resolvedCourse.trackType}` +
      ` / source=${resolvedCourse.resolutionSource}` +
      ` / provenance=${resolvedCourse.provenance}` +
      ` / warnings=[${resolvedCourse.warnings.map((w) => w.code).join(', ') || 'なし'}]`
  );

  // 2. シミュレーション（同じ ResolvedCourse を注入 → orchestrator 内部の resolver 呼び出しは 0 回）
  const result = await runRaceSimulation(db, {
    year,
    date,
    place,
    raceNumber,
    distance,
    trackBias,
    enableDetailedLog: true,
    resolvedCourse,
  });

  // 2.5. 競うスコア（正本 kisoScore）を join する（サーバー専用共有サービス経由）
  //   - race-card-with-score と同じ取得・同じ式（computeKisoScore）で算出。
  //   - horseNumber を正本 identity として結合（配列 index / 馬名では対応しない）。
  //   - 欠損は undefined のまま（0 へ丸めない）。取得失敗時は空 Map（3D は止めない）。
  //   - simulation ロジック（着順・速度・finish）には一切影響しない。表示隊列の位置補正のみで使用。
  try {
    const scoreMap = await loadCompetitionScoresForRace(
      { year: String(year), date: String(date), place: String(place), raceNumber: String(raceNumber) },
      db
    );
    const stamp = (h: { horseNumber: number; competitionScore?: number }) => {
      const s = scoreMap.get(h.horseNumber);
      // provenance='missing' の場合は competitionScore=undefined のまま（上書きしない）
      if (s && s.competitionScore != null) h.competitionScore = s.competitionScore;
    };
    result.finalStandings.forEach(stamp);
    if (result.phases?.start?.horses) result.phases.start.horses.forEach(stamp);
  } catch (e) {
    // 競うスコア join 失敗はシミュレーション本体を止めない（位置補正は自然に無効化される）
    console.warn(
      `[API] 競うスコア join に失敗（3D はスコアなしで継続）: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // 3. タイムライン生成
  const timeline = generateTimeline(result);

  // 4. レスポンス payload
  return {
    success: true,
    raceKey: result.raceKey,
    courseName: `${place} ${distance}m ${rawTrackType}`,
    distance,
    finalStandings: result.finalStandings.slice(0, 10).map((h) => ({
      position: h.position,
      horseNumber: h.horseNumber,
      horseName: h.horseName,
      waku: h.waku,
    })),
    timeline: {
      raceKey: timeline.raceKey,
      totalDuration: timeline.totalDuration,
      courseDistance: timeline.courseDistance,
      keyframes: timeline.keyframes.map((f) => ({
        time: parseFloat(f.time.toFixed(2)),
        phase: f.phase,
        horses: f.horses.map((h) => ({
          horseNumber: h.horseNumber,
          horseName: h.horseName,
          currentDistance: parseFloat(h.currentDistance.toFixed(1)),
          currentVelocity: parseFloat(h.currentVelocity.toFixed(1)),
          acceleration: parseFloat(h.acceleration.toFixed(2)),
          lateralPosition: parseFloat(h.lateralPosition.toFixed(2)),
          position: h.position,
          distanceFromLeader: parseFloat(h.distanceFromLeader.toFixed(1)),
          staminaRemaining: parseFloat(h.staminaRemaining.toFixed(1)),
          blocked: h.blocked,
          outerPath: h.outerPath,
        })),
      })),
    },
    phaseEvents: {
      start: result.phases.start.events,
      formation: result.phases.formation.events,
      straight: result.phases.straight.events,
    },
    // Phase 4.2 プロトタイプ用
    simulation: result,
    // 同一 ResolvedCourse 由来の courseInfo（orchestrator が使用したものと同一）
    courseInfo: resolvedCourse.courseInfo,
    // 診断情報（オプショナル・既存クライアント非破壊）
    courseResolution: {
      resolutionSource: resolvedCourse.resolutionSource,
      provenance: resolvedCourse.provenance,
      warnings: resolvedCourse.warnings, // { code, message }[]
    },
  };
}

/** エラー→HTTP 対応の結果 */
export interface SimulatorErrorMapping {
  status: number;
  body: Record<string, unknown>;
}

/**
 * エラー種別を HTTP ステータスとレスポンス body に対応付ける。
 *  - CourseInputError:     400（入力不正）
 *  - CourseBoundariesError: 422（有効だが現行では境界生成不可。原因は隠さず message を返す）
 *  - その他:               500（message のみ。内部スタックや機密情報は返さない）
 *
 * 新潟芝1000 のような直線競走は generic 周回へ変換されず、CourseBoundariesError として扱う。
 */
export function mapSimulatorError(error: unknown): SimulatorErrorMapping {
  if (error instanceof CourseInputError) {
    return {
      status: 400,
      body: {
        error: 'Invalid course input',
        code: 'INVALID_COURSE_INPUT',
        details: error.message,
      },
    };
  }
  if (error instanceof CourseBoundariesError) {
    return {
      status: 422,
      body: {
        error: 'Course boundaries could not be generated',
        code: 'COURSE_BOUNDARIES_UNSUPPORTED',
        details: error.message,
      },
    };
  }
  return {
    status: 500,
    body: {
      error: 'Simulation failed',
      details: error instanceof Error ? error.message : String(error),
    },
  };
}
