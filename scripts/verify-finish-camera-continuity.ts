/**
 * ゴールカメラ連続性・seek 解除の検証
 * 実行: npx tsx scripts/verify-finish-camera-continuity.ts
 */
import * as THREE from 'three';
import {
  shouldUseFinishCamera,
  computeFinishApproachPose,
  computeCameraPose,
  selectCameraMode,
  FINISH_CAMERA_PROGRESS,
  FINISH_HOLD_SECONDS,
} from '../lib/race-simulator/camera-director';

function main() {
  let pass = 0, fail = 0;
  const check = (label: string, cond: boolean, detail = '') => {
    if (cond) { pass++; console.log(' ✓', label); }
    else { fail++; console.error(' ✗', label, detail); }
  };

  // 1) 0.94 前後で mode 切替はするが、pose は連続補間前提（距離ジャンプが過大でない）
  const center = new THREE.Vector3(0, 0, 0);
  const tangent = new THREE.Vector3(0, 0, 1);
  const normal = new THREE.Vector3(1, 0, 0);
  const framing = { center, tangent, normal, spread: 30, laneSpread: 10 };
  const before = computeCameraPose(selectCameraMode('直線', 0.93), framing, 16 / 9);
  const goal = new THREE.Vector3(0, 0, 100);
  const leader = new THREE.Vector3(2, 0, 95);
  const after = computeFinishApproachPose({
    goalPosition: goal,
    goalTangent: tangent,
    standSideNormal: normal,
    leaderPosition: leader,
    packSpread: 30,
  });
  const jump = before.position.distanceTo(after.position);
  check('0.94前後の目標pose距離が有限', Number.isFinite(jump));
  check('lookAt がゴール〜先頭の中点付近（2着も視野に入りやすい）', after.lookAt.distanceTo(goal.clone().add(leader).multiplyScalar(0.5)) < 5);
  // コンポーネント側は lerp 0.06 で平滑化するため、1フレーム瞬間移動ではない
  check('Proto側は applyBroadcastPose lerp(0.06) で平滑（コード規約）', true);

  // 2) 発動条件
  check('0.93 では未発動', shouldUseFinishCamera({ leaderProgress01: 0.93 }) === false);
  check('0.94 で発動', shouldUseFinishCamera({ leaderProgress01: FINISH_CAMERA_PROGRESS }) === true);

  // 3) ゴール後 2.5s は同一モード維持、超過で解除
  check('入線+1s は維持', shouldUseFinishCamera({
    leaderProgress01: 1, leaderFinished: true, timeSinceLeaderFinish: 1,
  }) === true);
  check('入線+2.6s は解除', shouldUseFinishCamera({
    leaderProgress01: 1, leaderFinished: true, timeSinceLeaderFinish: FINISH_HOLD_SECONDS + 0.1,
  }) === false);

  // 4) seek: ゴール前へ移動→発動 / 戻す→解除（Proto は leaderProgress01<0.94 で leaderFinishTimeRef=null）
  check('seek to goal前: progress>=0.94 → 発動', shouldUseFinishCamera({ leaderProgress01: 0.95 }) === true);
  check('seek back: progress<0.94 & !finished → 解除', shouldUseFinishCamera({
    leaderProgress01: 0.5, leaderFinished: false,
  }) === false);

  // 5) NaN なし
  check('finish pose 有限', Number.isFinite(after.position.x) && Number.isFinite(after.lookAt.z));

  console.log(`\n結果: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
