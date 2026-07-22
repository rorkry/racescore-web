/**
 * Visual Step 1A テスト: course-curve（描画専用の純粋モジュール）
 *
 * 実行方法:
 *   npx tsx lib/race-simulator/course-curve.test.ts
 *
 * A. 基本      : 閉曲線 / loopLength > raceDistance / raceDistance=1200 / startOffset 範囲
 * B. clamp     : <0→0 / >1200→1200 / NaN→throw / ±Infinity
 * C. 決定性    : 同一入力→同一 pose / 内部状態不変
 * D. 連続性    : 細分 sample で座標ジャンプ無し / |tangent|≈1 / NaN 無し
 * E. start/goal: 0m と 1200m は別座標 / goal 一定 / goal 直前と連続
 * F. clockwise : 進行方向反転 / tangent 一致 / 180度反転無し
 * G. laneOffset: 0=中心線 / 正負で左右 / distance 方向へずれない
 * H. 追加(統一/CCW):
 *    - sampleLoopPose と sampleRacePose が同じ loopDistance で同じ中心座標
 *    - 基準 centerline が反時計回り
 *    - home/back 両直線で正の laneOffset が外側
 *    - clockwise 切替で外側方向が反転しない
 *    - 直線↔カーブ接続で position/tangent/normal 連続
 */

import * as THREE from 'three';
import {
  buildVisualCourseCurve,
  sampleLoopPose,
  sampleRacePose,
  type VisualCourseCurve,
} from './course-curve';
import { resolveCourseLayout } from './course-resolver';
import type { CourseInfo } from '@/types/race-simulator';

let passCount = 0;
let failCount = 0;

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passCount++;
    console.log(`  \u2713 ${label}`);
  } else {
    failCount++;
    console.log(`  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ''}`);
  }
}

// 函館芝1200 の CourseInfo（登録データ・clockwise=true）
const hakodateInfo: CourseInfo = resolveCourseLayout({
  place: '函館',
  trackType: '芝',
  distance: 1200,
}).courseInfo;

// 反時計回り版（描画向きの反転確認用に clockwise だけ差し替え）
const ccwInfo: CourseInfo = { ...hakodateInfo, clockwise: false };

function dist2D(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

// ===================================
// A. 基本
// ===================================
function testBasic() {
  console.log('\n[A] 基本');
  const curve = buildVisualCourseCurve(hakodateInfo);

  check('raceDistance=1200', curve.raceDistance === 1200);
  check('loopLength > raceDistance', curve.loopLength > curve.raceDistance,
    `loop=${curve.loopLength.toFixed(1)}`);
  check('startOffset が 0..loopLength', curve.startOffset >= 0 && curve.startOffset < curve.loopLength,
    `startOffset=${curve.startOffset.toFixed(1)}`);
  check('clockwise=true（函館）', curve.clockwise === true);
  check('provenance=generic', curve.provenance === 'generic');
  check('centerline は閉曲線（getPoint(0)≈getPoint(1)）',
    dist2D(curve.centerline.getPoint(0), curve.centerline.getPoint(1)) < 1e-6);
  check('homeStraight=262（CourseInfo 由来）', Math.abs(curve.homeStraight - 262) < 1e-6);
  check('warnings に generic 系が含まれる', curve.warnings.some((w) => w.includes('GENERIC')));

  console.log(`    loopLength=${curve.loopLength.toFixed(1)}m turnRadius=${curve.turnRadius.toFixed(1)}m startOffset=${curve.startOffset.toFixed(1)}m`);
}

// ===================================
// B. clamp / NaN / Infinity
// ===================================
function testClamp() {
  console.log('\n[B] clamp / NaN / Infinity');
  const curve = buildVisualCourseCurve(hakodateInfo);

  const p0 = sampleRacePose(curve, 0);
  const pNeg = sampleRacePose(curve, -500);
  check('distance<0 は 0 と同座標', dist2D(p0.position, pNeg.position) < 1e-9);

  const pEnd = sampleRacePose(curve, 1200);
  const pOver = sampleRacePose(curve, 5000);
  check('distance>1200 は 1200 と同座標', dist2D(pEnd.position, pOver.position) < 1e-9);

  const pPosInf = sampleRacePose(curve, Infinity);
  check('+Infinity は 1200 と同座標', dist2D(pEnd.position, pPosInf.position) < 1e-9);
  const pNegInf = sampleRacePose(curve, -Infinity);
  check('-Infinity は 0 と同座標', dist2D(p0.position, pNegInf.position) < 1e-9);

  let threw = false;
  try { sampleRacePose(curve, NaN); } catch (e) { threw = e instanceof RangeError; }
  check('NaN は RangeError（不定座標にしない）', threw);

  let loopThrew = false;
  try { sampleLoopPose(curve, NaN); } catch (e) { loopThrew = e instanceof RangeError; }
  check('sampleLoopPose(NaN) も RangeError', loopThrew);

  // laneOffset 非有限は 0 扱い（中心線）
  const pLaneNaN = sampleRacePose(curve, 600, NaN);
  const pLane0 = sampleRacePose(curve, 600, 0);
  check('laneOffset=NaN は 0 扱い', dist2D(pLaneNaN.position, pLane0.position) < 1e-9);
}

// ===================================
// C. 決定性
// ===================================
function testDeterminism() {
  console.log('\n[C] 決定性');
  const curve = buildVisualCourseCurve(hakodateInfo);

  for (const d of [0, 137, 600, 999.5, 1200]) {
    const a = sampleRacePose(curve, d);
    const b = sampleRacePose(curve, d);
    check(`d=${d} で同一 position/tangent/heading`,
      dist2D(a.position, b.position) < 1e-12 &&
      a.tangent.distanceTo(b.tangent) < 1e-12 &&
      a.heading === b.heading);
  }

  // 複数回呼んでも curve 内部状態が変わらない（loopLength など不変）
  const before = curve.loopLength;
  sampleRacePose(curve, 300, 10);
  sampleLoopPose(curve, 123);
  check('呼び出し後も loopLength 不変', curve.loopLength === before);
}

// ===================================
// D. 連続性
// ===================================
function testContinuity() {
  console.log('\n[D] 連続性');
  const curve = buildVisualCourseCurve(hakodateInfo);

  const step = 1; // 1m 刻み
  let maxJump = 0;
  let minTan = Infinity;
  let maxTan = 0;
  let anyNaN = false;
  let prev: THREE.Vector3 | null = null;

  for (let d = 0; d <= 1200; d += step) {
    const p = sampleRacePose(curve, d);
    if (Number.isNaN(p.position.x) || Number.isNaN(p.position.z) ||
        Number.isNaN(p.tangent.x) || Number.isNaN(p.tangent.z)) {
      anyNaN = true;
    }
    const tl = p.tangent.length();
    minTan = Math.min(minTan, tl);
    maxTan = Math.max(maxTan, tl);
    if (prev) maxJump = Math.max(maxJump, dist2D(prev, p.position));
    prev = p.position;
  }

  // 1m 進んで座標ジャンプは概ね 1m 前後（大きな巻き戻りが無い）
  check('1m 刻みで座標ジャンプ < 1.5m（巻き戻り無し）', maxJump < 1.5, `maxJump=${maxJump.toFixed(3)}`);
  check('|tangent|≈1（全域）', minTan > 0.999 && maxTan < 1.001, `[${minTan.toFixed(4)}, ${maxTan.toFixed(4)}]`);
  check('position/tangent に NaN 無し', !anyNaN);
}

// ===================================
// E. start / goal
// ===================================
function testStartGoal() {
  console.log('\n[E] start / goal');
  const curve = buildVisualCourseCurve(hakodateInfo);

  const start = sampleRacePose(curve, 0);
  const goal = sampleRacePose(curve, 1200);
  check('0m と 1200m は別座標', dist2D(start.position, goal.position) > 1,
    `d=${dist2D(start.position, goal.position).toFixed(1)}`);

  const goal2 = sampleRacePose(curve, 1200);
  check('goal は毎回同じ座標', dist2D(goal.position, goal2.position) < 1e-12);

  const nearGoal = sampleRacePose(curve, 1199.5);
  check('goal 直前と goal が連続', dist2D(nearGoal.position, goal.position) < 1.0,
    `d=${dist2D(nearGoal.position, goal.position).toFixed(3)}`);
}

// ===================================
// F. clockwise
// ===================================
function testClockwise() {
  console.log('\n[F] clockwise');
  const cw = buildVisualCourseCurve(hakodateInfo);   // clockwise=true
  const ccw = buildVisualCourseCurve(ccwInfo);       // clockwise=false

  // 同じ d 区間の進行で tangent が概ね逆向き
  const cwT = sampleRacePose(cw, 600).tangent;
  const ccwT = sampleRacePose(ccw, 600).tangent;
  check('clockwise 反転で進行方向が変化', cwT.dot(ccwT) < 0.99);

  // heading と tangent が一致（heading=atan2(tx,tz)）
  const p = sampleRacePose(cw, 300);
  const expectedHeading = Math.atan2(p.tangent.x, p.tangent.z);
  check('heading と tangent が一致', Math.abs(p.heading - expectedHeading) < 1e-9);

  // 連続する 2 点の実移動方向と tangent が同じ向き（進行方向一致）
  let dirOk = true;
  for (const d of [50, 300, 650, 1000]) {
    const a = sampleRacePose(cw, d);
    const b = sampleRacePose(cw, d + 2);
    const move = new THREE.Vector3().subVectors(b.position, a.position);
    if (move.length() > 1e-6) {
      move.normalize();
      if (move.dot(a.tangent) < 0.9) dirOk = false;
    }
  }
  check('tangent が実際の進行方向と一致（cw）', dirOk);

  // 隣接点で 180度反転が起きない
  let noFlip = true;
  let prevT: THREE.Vector3 | null = null;
  for (let d = 0; d <= 1200; d += 5) {
    const t = sampleRacePose(cw, d).tangent;
    if (prevT && prevT.dot(t) < 0) noFlip = false;
    prevT = t;
  }
  check('隣接点で tangent の 180度反転が無い', noFlip);
}

// ===================================
// G. laneOffset
// ===================================
function testLaneOffset() {
  console.log('\n[G] laneOffset');
  const curve = buildVisualCourseCurve(hakodateInfo);

  const center = sampleRacePose(curve, 400, 0);
  // laneOffset=0 は中心線（= 同じ d の loop 中心座標）と一致
  const dir = curve.clockwise ? -1 : 1;
  const loopCenter = sampleLoopPose(curve, curve.startOffset + dir * 400).position;
  check('laneOffset=0 は中心線上', dist2D(center.position, loopCenter) < 1e-9);

  const outer = sampleRacePose(curve, 400, 5);
  const inner = sampleRacePose(curve, 400, -5);
  // 中心・外・内が同一 normal 軸上で左右に分かれる
  check('正 laneOffset と負 laneOffset は中心線の反対側',
    dist2D(outer.position, center.position) > 4.9 &&
    dist2D(inner.position, center.position) > 4.9 &&
    dist2D(outer.position, inner.position) > 9.9);

  // laneOffset で進行方向(distance)へずれない: 中心線への最近接は同じ弧長付近
  // → progress は同一（laneOffset は distance を変えない）
  check('laneOffset は progress を変えない',
    outer.progress === center.progress && inner.progress === center.progress);
}

// ===================================
// H. 統一サンプラー / 基準CCW / 外側定義
// ===================================
function testUnifiedAndCCW() {
  console.log('\n[H] 統一サンプラー・基準CCW・外側定義');
  const curve = buildVisualCourseCurve(hakodateInfo);
  const centroid = new THREE.Vector3(0, 0, curve.homeStraight / 2);

  // H-1: sampleLoopPose と sampleRacePose が同じ loopDistance で同じ中心座標
  {
    let ok = true;
    for (const d of [0, 137, 600, 1000, 1200]) {
      const dir = curve.clockwise ? -1 : 1;
      const loopDistance = curve.startOffset + dir * d;
      const loopPos = sampleLoopPose(curve, loopDistance).position;
      const racePos = sampleRacePose(curve, d, 0).position;
      if (dist2D(loopPos, racePos) > 1e-9) ok = false;
    }
    check('H-1: 同じ loopDistance で sampleLoopPose と sampleRacePose の中心座標が一致', ok);
  }

  // H-2: 基準 centerline が反時計回り（シューレース符号 & 外向き法線が外側）
  {
    // シューレース（(x,z) 標準向きで正=CCW）
    let area2 = 0;
    const N = 720;
    let prev = curve.centerline.getPoint(0);
    for (let i = 1; i <= N; i++) {
      const cur = curve.centerline.getPoint(i / N);
      area2 += prev.x * cur.z - cur.x * prev.z;
      prev = cur;
    }
    check('H-2a: centerline シューレース符号が CCW（正）', area2 > 0, `area2=${area2.toFixed(1)}`);

    // 外向き法線が実際に centroid から外を向く
    let outwardOk = true;
    for (let s = 0; s < curve.loopLength; s += curve.loopLength / 24) {
      const lp = sampleLoopPose(curve, s);
      const radial = new THREE.Vector3().subVectors(lp.position, centroid);
      if (radial.length() > 1e-6 && lp.normal.dot(radial) <= 0) outwardOk = false;
    }
    check('H-2b: up×tangent が全周で外向き（CCW 前提が成立）', outwardOk);
  }

  // H-3: home / back 両直線で正の laneOffset が外側
  {
    // home 直線: base 弧長 [0, L] の中間, back 直線: [L+πR, 2L+πR] の中間
    const L = curve.homeStraight;
    const R = curve.turnRadius;
    const homeS = L / 2;
    const backS = L + Math.PI * R + L / 2;

    const homeCenter = sampleLoopPose(curve, homeS).position;
    const homeNormal = sampleLoopPose(curve, homeS).normal;
    const homeOuter = homeCenter.clone().addScaledVector(homeNormal, 5);
    const homeOk = dist2D(homeOuter, centroid) > dist2D(homeCenter, centroid);

    const backCenter = sampleLoopPose(curve, backS).position;
    const backNormal = sampleLoopPose(curve, backS).normal;
    const backOuter = backCenter.clone().addScaledVector(backNormal, 5);
    const backOk = dist2D(backOuter, centroid) > dist2D(backCenter, centroid);

    check('H-3: home 直線で正の laneOffset が外側', homeOk);
    check('H-3: back 直線で正の laneOffset が外側', backOk);
  }

  // H-4: clockwise 切替で同じ地点の外側方向が反転しない
  {
    const ccw = buildVisualCourseCurve(ccwInfo);
    let sameOuter = true;
    for (let s = 0; s < curve.loopLength; s += curve.loopLength / 12) {
      const nCw = sampleLoopPose(curve, s).normal;
      const nCcw = sampleLoopPose(ccw, s).normal;
      if (nCw.dot(nCcw) < 0.999) sameOuter = false;
    }
    check('H-4: clockwise 切替でも外側方向は不変', sameOuter);
  }

  // H-5: 直線↔カーブ接続で position/tangent/normal が連続
  {
    const L = curve.homeStraight;
    const R = curve.turnRadius;
    const junctions = [0, L, L + Math.PI * R, 2 * L + Math.PI * R]; // 各接続の base 弧長
    let cont = true;
    const eps = 0.25;
    for (const j of junctions) {
      const before = sampleLoopPose(curve, j - eps);
      const after = sampleLoopPose(curve, j + eps);
      const dp = dist2D(before.position, after.position);
      const dt = before.tangent.distanceTo(after.tangent);
      const dn = before.normal.distanceTo(after.normal);
      if (dp > 2 * eps + 1e-3 || dt > 0.05 || dn > 0.05) cont = false;
    }
    check('H-5: 直線↔カーブ接続で position/tangent/normal 連続', cont);
  }
}

function main() {
  console.log('======================================================');
  console.log(' Visual Step 1A course-curve テスト');
  console.log('======================================================');

  testBasic();
  testClamp();
  testDeterminism();
  testContinuity();
  testStartGoal();
  testClockwise();
  testLaneOffset();
  testUnifiedAndCCW();

  console.log('\n======================================================');
  console.log(` 結果: 成功 ${passCount}件 / 失敗 ${failCount}件`);
  console.log('======================================================');

  if (failCount > 0) process.exitCode = 1;
}

main();
