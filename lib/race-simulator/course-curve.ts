/**
 * VisualCourseCurve（Visual Step 1A / 描画専用）
 *
 * 目的:
 *  - simulation の currentDistance を一切変更せず、周回コース上の安定した
 *    position / tangent / heading / normal へ変換する基盤を作る。
 *
 * 重要な設計:
 *  - 「競馬場の閉じた周回コース(loopLength)」と「そのうち走る raceDistance」を分離する。
 *    raceDistance を閉曲線の総長として扱わない。
 *  - 座標計算の正本は corePose()（解析的・弧長基準）に一本化する。
 *    sampleLoopPose / sampleRacePose / centerline(THREE.Curve) はすべて corePose を経由し、
 *    THREE.Curve.getPointAt の弧長 LUT 近似で二重化しない。
 *  - 基準 centerline は常に反時計回り(CCW)で構築する。clockwise は距離進行方向
 *    dir = -1 にのみ反映し、centerline 自体は反転しない。
 *    outwardNormal = normalize(up × baseTangent) は CCW 基準を前提に「外側」を返す。
 *  - 公式の周回長・正確なコーナー半径・スタート位置は保持していないため provenance='generic'。
 *    描画用の近似値であり simulation へ逆流しない（別モデル・参照のみ）。
 *
 * 初期対象: 函館芝1200（clockwise=true, straightLength=262, courseWidth は CourseInfo 由来）。
 * 実在函館の完全再現ではなく、連続した簡易周回（対称スタジアム）を生成する。
 */

import * as THREE from 'three';
import type { CourseInfo } from '@/types/race-simulator';

// ===================================
// 公開型
// ===================================

export interface VisualCourseCurve {
  /** レースで走る距離（m）。閉曲線総長ではない。 */
  raceDistance: number;
  /** 周回コース1周の総延長（m）。常に raceDistance より長い。 */
  loopLength: number;
  /** レースのスタート地点を周回路上の弧長 offset として保持（0..loopLength）。 */
  startOffset: number;
  /** 周回方向。true=時計回り(右回り)。centerline は反転せず、進行方向のみ反転。 */
  clockwise: boolean;
  /** コース幅（m）。laneOffset の範囲目安。 */
  trackWidth: number;

  /** ホームストレート長（m, CourseInfo 由来）。 */
  homeStraight: number;
  /** ターン半径（m, 視覚用 generic）。 */
  turnRadius: number;

  /** 補助表現の閉曲線（Step 1B のメッシュ生成用）。座標正本は corePose。 */
  centerline: THREE.Curve<THREE.Vector3>;

  provenance: 'derived' | 'generic';
  warnings: string[];
}

/** 周回路上の1点の姿勢（loop 空間／基準CCW方向） */
export interface LoopPose {
  position: THREE.Vector3;
  tangent: THREE.Vector3;  // 基準CCW方向の単位接線
  normal: THREE.Vector3;   // 水平・外向き単位法線（up × tangent）
  heading: number;         // atan2(tangent.x, tangent.z)
}

/** レース進行上の1点の姿勢（race 空間／進行方向反映） */
export interface TrackPose {
  position: THREE.Vector3;
  tangent: THREE.Vector3;  // レース進行方向の単位接線（clockwise で反転）
  normal: THREE.Vector3;   // 水平・外向き単位法線（進行方向に依存しない）
  heading: number;         // atan2(tangent.x, tangent.z)
  elevation: number;       // Step 1A は 0（根拠のない高低差を作らない）
  progress: number;        // 0..1 （raceDistanceFromStart / raceDistance）
}

// ===================================
// 定数
// ===================================

/** ターン半径を homeStraight から見積もる際の generic 係数 */
const GENERIC_TURN_RADIUS_RATIO = 0.65;
/** loopLength を raceDistance より確実に長くするための安全係数 */
const LOOP_SAFETY_FACTOR = 1.1;
/** courseWidth 欠損時の generic 値 */
const GENERIC_TRACK_WIDTH = 25;

const UP = new THREE.Vector3(0, 1, 0);

// ===================================
// 内部ユーティリティ
// ===================================

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/**
 * 座標計算の正本（解析的・弧長基準）。
 *
 * 対称スタジアム（両直線 = homeStraight、両ターン = 半径 turnRadius の半円）を
 * 反時計回り(CCW)に構築する。s は弧長 [0, loopLength) 相当（範囲外は modulo）。
 *
 * セグメント順（CCW）:
 *  1. ホーム直線 : 右側 x=+R, z:0→L, 接線(0,0,+1)
 *  2. 上ターン   : 中心(0,L), 右上→左上（+z側を回る）
 *  3. バック直線 : 左側 x=−R, z:L→0, 接線(0,0,−1)
 *  4. 下ターン   : 中心(0,0), 左下→右下（−z側を回る）→ ホーム直線始点へ閉じる
 */
function corePose(
  homeStraight: number,
  turnRadius: number,
  arcLength: number
): { position: THREE.Vector3; tangent: THREE.Vector3 } {
  const L = homeStraight;
  const R = turnRadius;
  const piR = Math.PI * R;
  const loopLength = 2 * L + 2 * piR;

  const s = mod(arcLength, loopLength);

  let x = 0;
  const y = 0;
  let z = 0;
  let tx = 0;
  const ty = 0;
  let tz = 0;

  if (s <= L) {
    // 1. ホーム直線
    x = R; z = s;
    tx = 0; tz = 1;
  } else if (s <= L + piR) {
    // 2. 上ターン（中心(0,L)）
    const phi = (s - L) / R;
    x = R * Math.cos(phi);
    z = L + R * Math.sin(phi);
    tx = -Math.sin(phi); tz = Math.cos(phi);
  } else if (s <= 2 * L + piR) {
    // 3. バック直線
    const u = s - (L + piR);
    x = -R; z = L - u;
    tx = 0; tz = -1;
  } else {
    // 4. 下ターン（中心(0,0)）
    const psi = (s - (2 * L + piR)) / R;
    x = -R * Math.cos(psi);
    z = -R * Math.sin(psi);
    tx = Math.sin(psi); tz = -Math.cos(psi);
  }

  const tangent = new THREE.Vector3(tx, ty, tz);
  // 数値誤差対策で正規化（各セグメントの接線は本来単位長）
  if (tangent.lengthSq() > 0) tangent.normalize();

  return { position: new THREE.Vector3(x, y, z), tangent };
}

/** 補助表現の閉曲線。getPoint も corePose を正本として使う（二重化しない）。 */
class StadiumCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly homeStraight: number,
    private readonly turnRadius: number,
    private readonly loopLength: number
  ) {
    super();
  }

  getPoint(t: number, optionalTarget: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    const s = mod(t, 1) * this.loopLength;
    const { position } = corePose(this.homeStraight, this.turnRadius, s);
    return optionalTarget.copy(position);
  }
}

// ===================================
// 公開 API
// ===================================

/**
 * CourseInfo（描画用に参照のみ）から VisualCourseCurve を構築する。
 * finish 固定型: finish をホーム直線のレース方向下流端に固定し、
 * startOffset を raceDistance からレース方向へ逆算する。
 */
export function buildVisualCourseCurve(courseInfo: CourseInfo): VisualCourseCurve {
  const warnings: string[] = [];

  const raceDistance = courseInfo.distance;
  if (!Number.isFinite(raceDistance) || raceDistance <= 0) {
    throw new RangeError(`buildVisualCourseCurve: 不正な raceDistance: ${raceDistance}`);
  }

  // homeStraight（CourseInfo 由来 = derived）。欠損時のみ generic 補完。
  let homeStraight = courseInfo.straightLength;
  if (!Number.isFinite(homeStraight) || homeStraight <= 0) {
    homeStraight = raceDistance * 0.2;
    warnings.push('HOME_STRAIGHT_GENERIC: straightLength 欠損のため generic 値を使用');
  }

  const clockwise = !!courseInfo.clockwise;

  let trackWidth = courseInfo.courseWidth ?? 0;
  if (!Number.isFinite(trackWidth) || trackWidth <= 0) {
    trackWidth = GENERIC_TRACK_WIDTH;
    warnings.push('TRACK_WIDTH_GENERIC: courseWidth 欠損のため generic 値を使用');
  }

  // ターン半径（視覚用 generic）。loopLength > raceDistance を保証する。
  //  - 基本は homeStraight 比の generic 値
  //  - それでも周回が短い場合は raceDistance*安全係数 を満たす半径へ引き上げる
  const minRadiusForLoop = (raceDistance * LOOP_SAFETY_FACTOR - 2 * homeStraight) / (2 * Math.PI);
  const turnRadius = Math.max(GENERIC_TURN_RADIUS_RATIO * homeStraight, minRadiusForLoop, 1);
  warnings.push('TURN_RADIUS_GENERIC: ターン半径は視覚用の汎用値（simulation の半径とは独立）');

  const loopLength = 2 * homeStraight + 2 * Math.PI * turnRadius;
  warnings.push('LOOP_LENGTH_GENERIC: 周回長は簡易スタジアムによる推定値');

  // finish 固定型:
  //  - ccw(dir=+1): ホーム直線は base 弧長 [0, L]。finish は下流端 = L。
  //  - cw (dir=-1): レースは弧長を減少方向へ進むため、finish はホーム直線の
  //                 下流端 = base 弧長 0。
  const dir = clockwise ? -1 : 1;
  const finishBaseS = clockwise ? 0 : homeStraight;
  const startOffset = mod(finishBaseS - dir * raceDistance, loopLength);
  warnings.push('START_OFFSET_DERIVED: スタート位置は finish 固定＋raceDistance からの逆算');

  const centerline = new StadiumCurve(homeStraight, turnRadius, loopLength);

  return {
    raceDistance,
    loopLength,
    startOffset,
    clockwise,
    trackWidth,
    homeStraight,
    turnRadius,
    centerline,
    provenance: 'generic',
    warnings,
  };
}

/**
 * 周回路上の loop 弧長から姿勢を返す（座標正本／基準CCW方向）。
 * position/tangent/normal/heading すべて corePose 経由で計算する。
 * loopDistance は周回境界を安全に modulo する。
 */
export function sampleLoopPose(curve: VisualCourseCurve, loopDistance: number): LoopPose {
  if (Number.isNaN(loopDistance)) {
    throw new RangeError('sampleLoopPose: loopDistance is NaN');
  }
  // ±Infinity は modulo で NaN になるため事前に有限化（周回上なので端点の概念はない）
  const finiteLoop = Number.isFinite(loopDistance)
    ? loopDistance
    : (loopDistance > 0 ? curve.loopLength : 0);

  const s = mod(finiteLoop, curve.loopLength);
  const { position, tangent } = corePose(curve.homeStraight, curve.turnRadius, s);

  // 外向き水平法線（基準CCWを前提に up × tangent = 外側）
  const normal = new THREE.Vector3().copy(UP).cross(tangent);
  if (normal.lengthSq() > 0) normal.normalize();

  const heading = Math.atan2(tangent.x, tangent.z);

  return { position, tangent, normal, heading };
}

/**
 * レース開始からの距離（0..raceDistance）を姿勢へ変換する。
 * loopDistance へ変換した後 sampleLoopPose を呼ぶ（座標を二重計算しない）。
 *
 * clamp:
 *  - raceDistanceFromStart < 0 → 0
 *  - raceDistanceFromStart > raceDistance → raceDistance
 *  - +Infinity → raceDistance / -Infinity → 0
 *  - NaN → RangeError（黙って不定座標にしない）
 *
 * laneOffset:
 *  - 外向き法線方向へのオフセット（>0=外側, <0=内側）。進行方向に依存しない。
 *  - 進行方向(distance)へはずらさない。NaN/非有限は 0 として扱う。
 */
export function sampleRacePose(
  curve: VisualCourseCurve,
  raceDistanceFromStart: number,
  laneOffset: number = 0
): TrackPose {
  if (Number.isNaN(raceDistanceFromStart)) {
    throw new RangeError('sampleRacePose: raceDistanceFromStart is NaN');
  }

  // clamp（+Infinity→raceDistance, -Infinity→0 も同時に処理）
  let d = raceDistanceFromStart;
  if (d < 0) d = 0;
  else if (d > curve.raceDistance) d = curve.raceDistance;

  const lane = Number.isFinite(laneOffset) ? laneOffset : 0;

  const dir = curve.clockwise ? -1 : 1;
  const loopDistance = curve.startOffset + dir * d;

  const loopPose = sampleLoopPose(curve, loopDistance);

  // レース進行方向の接線（clockwise で反転）
  const tangent = dir === -1 ? loopPose.tangent.clone().negate() : loopPose.tangent.clone();
  const heading = Math.atan2(tangent.x, tangent.z);

  // 位置 = centerline + 外向き法線 × laneOffset（法線は進行方向非依存）
  const position = loopPose.position.clone().addScaledVector(loopPose.normal, lane);

  return {
    position,
    tangent,
    normal: loopPose.normal.clone(),
    heading,
    elevation: 0,
    progress: d / curve.raceDistance,
  };
}

// テスト用途（内部表現の確認）にエクスポート
export { StadiumCurve };
