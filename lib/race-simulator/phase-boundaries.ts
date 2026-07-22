/**
 * PhaseBoundaries ビルダー
 *
 * raceDistance と CourseInfo（実コース幾何）から、全フェーズの距離境界を一元生成する。
 *
 * 設計方針（重要）:
 *  - +150 / +400 / 600 / distance*0.8 のような固定加算・固定開始距離は一切使わない。
 *  - 信頼できる幾何アンカーは次の2つ:
 *      1. startToFirstCorner（ゲート → 1コーナー）  → start フェーズの終端
 *      2. raceDistance - straightLength（ホームストレート開始） → straight フェーズの始端
 *  - corner(3-4) の終端は「ホームストレート開始地点」で物理的に確定する。
 *    corner の長さは最終コーナー群（末尾最大2つ）の円弧長 Σ(radius × angle) から求める。
 *    コーナーデータが無い（スプリント等）場合、corner は長さ0になる（corner.start === straight.start）。
 *  - formation / pace は残りのバックストレッチを二等分する（唯一の設計パラメータ = 0.5）。
 *    これはスケール不変な分割であり、固定メートル定数の移植ではない。
 *  - 境界が成立しない場合は「黙って補正せず」Error を投げる。
 */

import type { CourseInfo, PhaseBoundaries } from '@/types/race-simulator';

/** 90度=π/2 のように、度→ラジアン */
const DEG_TO_RAD = Math.PI / 180;

/** formation / pace のバックストレッチ二等分比（設計パラメータ、スケール不変） */
const BACKSTRETCH_SPLIT = 0.5;

/** 浮動小数比較の許容誤差 */
const EPS = 1e-6;

/**
 * 最終コーナー群（末尾最大2つ）の円弧長の合計を求める。
 * コーナーが無ければ 0。
 */
function computeFinalCornerArcLength(courseInfo: CourseInfo): number {
  const corners = courseInfo.corners ?? [];
  if (corners.length === 0) return 0;

  // position 昇順に並べ、末尾（＝ゴールに近い側）から最大2つ（＝3-4コーナー）を採用
  const sorted = [...corners].sort((a, b) => a.position - b.position);
  const finalCorners = sorted.slice(Math.max(0, sorted.length - 2));

  let arc = 0;
  for (const c of finalCorners) {
    const radius = Number.isFinite(c.radius) ? c.radius : 0;
    const angleRad = (Number.isFinite(c.angle) ? c.angle : 0) * DEG_TO_RAD;
    const segment = radius * angleRad;
    if (segment > 0) arc += segment;
  }
  return arc;
}

/**
 * フェーズ境界を生成する。
 *
 * @param raceDistance レース距離（m）
 * @param courseInfo   コース情報（実幾何）。null は不可（幾何から計算できないため）。
 * @throws 境界が成立しない場合（順序・連続・範囲のいずれかを満たさない場合）
 */
export function buildPhaseBoundaries(
  raceDistance: number,
  courseInfo: CourseInfo | null
): PhaseBoundaries {
  // ---- 入力検証（補正せずエラー） ----
  if (!Number.isFinite(raceDistance) || raceDistance <= 0) {
    throw new Error(`[buildPhaseBoundaries] 不正な raceDistance: ${raceDistance}`);
  }
  if (!courseInfo) {
    throw new Error(
      `[buildPhaseBoundaries] courseInfo が null です。フェーズ境界は幾何から計算するため courseInfo が必須です（raceDistance=${raceDistance}）`
    );
  }

  const startToFirstCorner = courseInfo.startToFirstCorner;
  const straightLength = courseInfo.straightLength;

  if (!Number.isFinite(startToFirstCorner) || startToFirstCorner <= 0) {
    throw new Error(
      `[buildPhaseBoundaries] 不正な startToFirstCorner: ${startToFirstCorner}（${courseInfo.id}）`
    );
  }
  if (!Number.isFinite(straightLength) || straightLength <= 0) {
    throw new Error(
      `[buildPhaseBoundaries] 不正な straightLength: ${straightLength}（${courseInfo.id}）`
    );
  }

  // ---- 幾何アンカー ----
  const openingEnd = startToFirstCorner;              // start フェーズ終端（ゲート→1コーナー）
  const straightStart = raceDistance - straightLength; // straight フェーズ始端（ホームストレート開始）

  if (straightStart <= openingEnd) {
    throw new Error(
      `[buildPhaseBoundaries] ホームストレート開始(${straightStart.toFixed(1)}m)が` +
        `1コーナー地点(${openingEnd.toFixed(1)}m)以下です。` +
        `raceDistance=${raceDistance}, straightLength=${straightLength}, startToFirstCorner=${startToFirstCorner}（${courseInfo.id}）`
    );
  }

  // ---- corner(3-4): 終端は straightStart で確定、長さは最終コーナーの円弧長 ----
  const cornerArc = computeFinalCornerArcLength(courseInfo);
  const cornerEnd = straightStart;
  const cornerStart = straightStart - cornerArc;

  // corner が openingEnd より手前に食い込む（＝バックストレッチが負）なら成立しない
  if (cornerStart <= openingEnd + EPS) {
    throw new Error(
      `[buildPhaseBoundaries] 最終コーナー円弧長(${cornerArc.toFixed(1)}m)が長すぎ、` +
        `formation/pace の領域が確保できません。` +
        `openingEnd=${openingEnd.toFixed(1)}m, cornerStart=${cornerStart.toFixed(1)}m（${courseInfo.id}）`
    );
  }

  // ---- formation / pace: バックストレッチ [openingEnd, cornerStart] を二等分 ----
  const backstretchStart = openingEnd;
  const backstretchEnd = cornerStart;
  const backstretchMid =
    backstretchStart + (backstretchEnd - backstretchStart) * BACKSTRETCH_SPLIT;

  // ---- 境界を組み立て ----
  const boundaries: PhaseBoundaries = {
    raceDistance,
    start: { start: 0, end: openingEnd },
    formation: { start: openingEnd, end: backstretchMid },
    pace: { start: backstretchMid, end: cornerStart },
    corner: { start: cornerStart, end: cornerEnd },
    straight: { start: straightStart, end: raceDistance },
    goal: { start: raceDistance, end: raceDistance },
  };

  // ---- 出力検証（補正せずエラー） ----
  assertValidBoundaries(boundaries);

  return boundaries;
}

/**
 * 生成された境界が「連続」かつ「単調」かつ「範囲」を満たすことを検証する。
 * 満たさない場合は Error を投げる（黙って補正しない）。
 */
export function assertValidBoundaries(b: PhaseBoundaries): void {
  const ordered: Array<[string, { start: number; end: number }]> = [
    ['start', b.start],
    ['formation', b.formation],
    ['pace', b.pace],
    ['corner', b.corner],
    ['straight', b.straight],
    ['goal', b.goal],
  ];

  // 1. start は 0 から
  if (Math.abs(b.start.start) > EPS) {
    throw new Error(`[assertValidBoundaries] start.start は 0 であるべき: ${b.start.start}`);
  }

  // 2. 連続性: 前.end === 次.start
  for (let i = 1; i < ordered.length; i++) {
    const [prevName, prev] = ordered[i - 1];
    const [currName, curr] = ordered[i];
    if (Math.abs(prev.end - curr.start) > EPS) {
      throw new Error(
        `[assertValidBoundaries] 不連続: ${prevName}.end(${prev.end.toFixed(3)}) !== ${currName}.start(${curr.start.toFixed(3)})`
      );
    }
  }

  // 3. 各フェーズ内で start <= end（corner/goal はゼロ長を許容）
  for (const [name, seg] of ordered) {
    if (seg.end < seg.start - EPS) {
      throw new Error(
        `[assertValidBoundaries] ${name}: end(${seg.end.toFixed(3)}) < start(${seg.start.toFixed(3)})`
      );
    }
  }

  // 4. フェーズ開始距離の単調性:
  //    start < formation < pace < corner <= straight < goal
  const strictlyIncreasing: Array<[string, number, string, number]> = [
    ['start', b.start.start, 'formation', b.formation.start],
    ['formation', b.formation.start, 'pace', b.pace.start],
    ['pace', b.pace.start, 'corner', b.corner.start],
    ['straight', b.straight.start, 'goal', b.goal.start],
  ];
  for (const [aName, a, bName, bb] of strictlyIncreasing) {
    if (!(a < bb - EPS)) {
      throw new Error(
        `[assertValidBoundaries] 単調増加違反: ${aName}.start(${a.toFixed(3)}) < ${bName}.start(${bb.toFixed(3)}) を満たさない`
      );
    }
  }
  // corner.start <= straight.start（corner ゼロ長を許容）
  if (!(b.corner.start <= b.straight.start + EPS)) {
    throw new Error(
      `[assertValidBoundaries] corner.start(${b.corner.start.toFixed(3)}) <= straight.start(${b.straight.start.toFixed(3)}) を満たさない`
    );
  }

  // 5. goal.end === raceDistance
  if (Math.abs(b.goal.end - b.raceDistance) > EPS) {
    throw new Error(
      `[assertValidBoundaries] goal.end(${b.goal.end.toFixed(3)}) !== raceDistance(${b.raceDistance})`
    );
  }
}
