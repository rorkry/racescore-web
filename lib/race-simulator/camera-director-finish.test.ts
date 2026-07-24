/**
 * camera-director finish モード テスト
 * 実行: npx tsx lib/race-simulator/camera-director-finish.test.ts
 */
import * as THREE from 'three';
import {
  shouldUseFinishCamera,
  computeFinishApproachPose,
  FINISH_CAMERA_PROGRESS,
  FINISH_HOLD_SECONDS,
} from './camera-director';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  ✗ ${label} ${detail}`); }
}

console.log('=== camera-director finish ===');

check('進行度しきい値未満は通常', shouldUseFinishCamera({ leaderProgress01: 0.90 }) === false);
check('進行度しきい値以上でゴールモード', shouldUseFinishCamera({ leaderProgress01: FINISH_CAMERA_PROGRESS }) === true);
check('入線直後は保持', shouldUseFinishCamera({
  leaderProgress01: 1,
  leaderFinished: true,
  timeSinceLeaderFinish: 0.5,
}) === true);
check('保持時間超過で解除', shouldUseFinishCamera({
  leaderProgress01: 1,
  leaderFinished: true,
  timeSinceLeaderFinish: FINISH_HOLD_SECONDS + 0.1,
}) === false);

const goal = new THREE.Vector3(10, 0, 0);
const tan = new THREE.Vector3(0, 0, 1);
const normal = new THREE.Vector3(1, 0, 0);
const leader = new THREE.Vector3(10, 0, -20);
const pose = computeFinishApproachPose({
  goalPosition: goal,
  goalTangent: tan,
  standSideNormal: normal,
  leaderPosition: leader,
  packSpread: 30,
});

check('pose position が有限', Number.isFinite(pose.position.x) && Number.isFinite(pose.position.y) && Number.isFinite(pose.position.z));
check('pose lookAt が有限', Number.isFinite(pose.lookAt.x) && Number.isFinite(pose.lookAt.y) && Number.isFinite(pose.lookAt.z));
check('fov が妥当範囲', pose.fov >= 28 && pose.fov <= 55);
// lookAt はゴールと先頭の中点付近
const mid = goal.clone().add(leader).multiplyScalar(0.5);
check('lookAt がゴール〜先頭の中点付近', pose.lookAt.distanceTo(mid) < 5, `dist=${pose.lookAt.distanceTo(mid).toFixed(2)}`);

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
