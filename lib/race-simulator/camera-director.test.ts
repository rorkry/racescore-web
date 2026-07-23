/**
 * camera-director & hud-visibility テスト
 * 実行: npx tsx lib/race-simulator/camera-director.test.ts
 *
 * E. Camera:
 *  - ゴール前カメラ位置が有限 / 地下や走路内へ入らない
 *  - clockwise/ccw で破綻しない（normal 独立）
 *  - broadcast 各モードの pose が有限・NaN無し
 * 10. HUD 表示条件（純粋関数）
 */

import * as THREE from 'three';
import {
  selectCameraMode,
  computeCameraPose,
  computeGoalStandPose,
  DEFAULT_GOAL_STAND_CONFIG,
  type PackFraming,
} from './camera-director';
import { shouldShowDebugHud } from './hud-visibility';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  \u2713 ${label}`); }
  else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}

const finite = (v: THREE.Vector3) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

console.log('=== selectCameraMode ===');
check('スタート→START_SIDE', selectCameraMode('スタート〜隊列形成', 0.02) === 'START_SIDE');
check('コーナー→CORNER_HIGH', selectCameraMode('3-4コーナー', 0.5) === 'CORNER_HIGH');
check('直線→FINAL_STRAIGHT_SIDE', selectCameraMode('直線〜ゴール', 0.8) === 'FINAL_STRAIGHT_SIDE');
check('直線終盤→FINISH', selectCameraMode('直線〜ゴール', 0.98) === 'FINISH');
check('ゴール→FINISH', selectCameraMode('ゴール', 0.99) === 'FINISH');
check('phase無し progressで分岐', selectCameraMode(undefined, 0.1) === 'START_SIDE');

console.log('=== broadcast 各モード pose 有限 & NaN無し ===');
{
  const framing: PackFraming = {
    center: new THREE.Vector3(10, 0, 20),
    tangent: new THREE.Vector3(1, 0, 0),
    normal: new THREE.Vector3(0, 0, -1),
    spread: 25,
    laneSpread: 8,
  };
  for (const mode of ['START_SIDE', 'BACK_STRAIGHT_TRACKING', 'CORNER_HIGH', 'FINAL_STRAIGHT_SIDE', 'FINISH'] as const) {
    const pose = computeCameraPose(mode, framing, 16 / 9);
    check(`${mode}: position/lookAt 有限`, finite(pose.position) && finite(pose.lookAt) && Number.isFinite(pose.fov));
    check(`${mode}: カメラは地面より上`, pose.position.y > 0);
    check(`${mode}: カメラが馬群中心から離れている`, pose.position.distanceTo(framing.center) > 5);
  }
}

console.log('=== clockwise/ccw で normal 独立（同じ地点で外向き一定） ===');
{
  // 進行方向が逆でも normal（外向き）を同じにして pose 計算が破綻しないこと
  const base: PackFraming = {
    center: new THREE.Vector3(0, 0, 0),
    tangent: new THREE.Vector3(1, 0, 0),
    normal: new THREE.Vector3(0, 0, -1),
    spread: 20, laneSpread: 6,
  };
  const reversed: PackFraming = { ...base, tangent: new THREE.Vector3(-1, 0, 0) };
  const p1 = computeCameraPose('FINAL_STRAIGHT_SIDE', base, 16 / 9);
  const p2 = computeCameraPose('FINAL_STRAIGHT_SIDE', reversed, 16 / 9);
  check('両方向とも有限', finite(p1.position) && finite(p2.position));
  // normal 側（z<0）にカメラがある = 進行方向によらず外側
  check('両方向ともカメラが外側(z<0)', p1.position.z < 0 && p2.position.z < 0);
}

console.log('=== GOAL_STAND カメラ ===');
{
  const goalPos = new THREE.Vector3(100, 3, -50);
  const goalTangent = new THREE.Vector3(1, 0, 0);
  const standNormal = new THREE.Vector3(0, 0, -1);
  const pose = computeGoalStandPose(goalPos, goalTangent, standNormal, DEFAULT_GOAL_STAND_CONFIG);
  check('位置/注視点 有限', finite(pose.position) && finite(pose.lookAt) && Number.isFinite(pose.fov));
  check('カメラが地面より十分上（地下でない）', pose.position.y > goalPos.y);
  check('カメラがゴールから離れている（走路内に埋まらない）', pose.position.distanceTo(goalPos) > 20);
  check('スタンド側(z<goal.z)に位置', pose.position.z < goalPos.z);
}

console.log('=== HUD 表示条件 ===');
check('development→表示', shouldShowDebugHud({ nodeEnv: 'development' }) === true);
check('production 通常URL→非表示', shouldShowDebugHud({ nodeEnv: 'production', search: '' }) === false);
check('production ?debug=1→表示', shouldShowDebugHud({ nodeEnv: 'production', search: '?debug=1' }) === true);
check('production ?debug=0→非表示', shouldShowDebugHud({ nodeEnv: 'production', search: '?debug=0' }) === false);
check('production 他param→非表示', shouldShowDebugHud({ nodeEnv: 'production', search: '?foo=bar' }) === false);
check('production debug=1 他param併存→表示', shouldShowDebugHud({ nodeEnv: 'production', search: '?a=1&debug=1' }) === true);

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
