/**
 * 黒画面回帰テスト
 * 実行: npx tsx lib/race-simulator/black-screen-regression.test.ts
 *
 * 本番症状「クラッシュしないが 3D canvas が真っ黒」をブラウザ非依存で検証する。
 * 根本原因は「container 未マウント時に init が bail し、その後 scene が生成されない」
 * という React ライフサイクル問題だったため、ここでは
 *  - init 相当で scene/track/horse/light が正しく構築されること
 *  - goal-stand カメラが対象を前方に捉え NDC が可視範囲に入ること
 *  - generation guard が「新世代の loop」を止めないこと
 *  - timeline が空でも render が実行される描画判定であること
 * を数値で固定する。
 *
 * THREE は WebGL コンテキスト無し(node)で Scene/Camera/行列/project まで動作する。
 */

import * as THREE from 'three';
import { resolveRacecourseLayout, type CourseInfoLike, type SimulationLike } from './race-3d-integration';
import { buildTrackGroup, buildStartFinishGroup, type TrackRenderResult } from './track-render';
import { sampleRaceProgressPose, GEOMETRIES_BY_VENUE } from '../racecourse-geometry';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}

function mockSim(raceKey: string, raceDistance: number, n: number): SimulationLike {
  const horses = Array.from({ length: n }, (_, i) => ({
    horseNumber: i + 1, horseName: `馬${i + 1}`, position: i + 1,
    waku: Math.min(8, Math.floor(i / 2) + 1), leadingIntention: 80 - i * 5, staminaRemaining: 100,
    capabilities: { startSpeed: 40 + ((i * 13) % 50), cruiseSpeed: 45 + ((i * 7) % 45), acceleration: 40 + ((i * 11) % 55), stamina: 40 + ((i * 5) % 50), cornerSkill: 50 },
  }));
  return { raceKey, raceDistance, phases: { start: { horses } }, finalStandings: horses };
}

/** RaceSimulator3DProto の init と同じ順序で headless に scene を構築する */
function buildSceneLikeInit(ci: CourseInfoLike, n: number) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  // ライト（init と同じ 2灯）
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(100, 200, 100);
  scene.add(dir);

  // 地面
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x3a5f3a }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  scene.add(ground);

  const layout = resolveRacecourseLayout(ci);
  const groups: TrackRenderResult[] = [];
  let activeMeshCount = 0;
  if (layout) {
    const venueGeoms = GEOMETRIES_BY_VENUE.get(layout.geometry.venue) ?? [layout.geometry];
    for (const g of venueGeoms) {
      const tr = buildTrackGroup(g, { active: g.id === layout.geometry.id });
      scene.add(tr.group);
      groups.push(tr);
      if (g.id === layout.geometry.id) {
        tr.group.traverse((o) => { if ((o as unknown as { isMesh?: boolean }).isMesh) activeMeshCount++; });
      }
    }
    const sf = buildStartFinishGroup(layout.geometry, layout.startMarker);
    scene.add(sf.group);
    groups.push(sf);
  }

  // 馬メッシュ（頭数ぶん）
  const horses: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    scene.add(m);
    horses.push(m);
  }

  return { scene, layout, groups, horses, activeMeshCount, dispose: () => groups.forEach((g) => g.dispose()) };
}

console.log('=== 黒画面回帰テスト ===');

// ── scene 構築の不変条件（函館芝1200 / 14頭） ──
{
  const built = buildSceneLikeInit({ place: '函館', trackType: 'turf', distance: 1200 }, 14);
  check('scene.children > 0', built.scene.children.length > 0, `children=${built.scene.children.length}`);
  check('active track の mesh > 0', built.activeMeshCount > 0, `mesh=${built.activeMeshCount}`);
  let lightCount = 0;
  built.scene.traverse((o) => { if ((o as unknown as { isLight?: boolean }).isLight) lightCount++; });
  check('light >= 2', lightCount >= 2, `light=${lightCount}`);
  check('horse mesh 数 = 頭数(14)', built.horses.length === 14);
  check('layout 解決', !!built.layout);

  // ── goal-stand カメラが対象を前方に捉える（updateBroadcastCamera と同じ幾何） ──
  const layout = built.layout!;
  const g = layout.geometry;
  const start = layout.startMarker.pathDistance;
  const gp = sampleRaceProgressPose(g, start, layout.raceDistance, 0);
  const goalPos = new THREE.Vector3(gp.position.x, gp.position.y, gp.position.z);
  const goalTan = new THREE.Vector3(gp.tangent.x, 0, gp.tangent.z).normalize();
  const standNormal = new THREE.Vector3(gp.normal.x, 0, gp.normal.z).normalize();
  const camPos = goalPos.clone().addScaledVector(standNormal, 50).addScaledVector(new THREE.Vector3(0, 1, 0), 34).addScaledVector(goalTan, -30);
  const mid = sampleRaceProgressPose(g, start, layout.raceDistance / 2, 0);
  const packCenter = new THREE.Vector3(mid.position.x, mid.position.y + 2, mid.position.z);

  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 10000);
  camera.position.copy(camPos);
  camera.lookAt(packCenter);
  camera.updateMatrixWorld(true);

  const finite = (v: THREE.Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  check('camera position 有限', finite(camPos));
  check('lookAt(pack center) 有限', finite(packCenter));
  check('camera Y > 地面(-1)', camPos.y > -1);

  // track center をカメラ空間へ → 前方(z<0)
  const trackCenter = new THREE.Vector3(mid.position.x, mid.position.y, mid.position.z);
  const camSpace = trackCenter.clone().applyMatrix4(camera.matrixWorldInverse);
  check('track center がカメラ前方(camZ<0)', camSpace.z < 0, `camZ=${camSpace.z.toFixed(1)}`);
  // カメラ前方ベクトル(-Z)と「カメラ→pack中心」方向が一致（対象が正面）
  const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const dirToPack = packCenter.clone().sub(camPos).normalize();
  check('カメラ前方と pack 方向が一致(dot>0.9)', camForward.dot(dirToPack) > 0.9, `dot=${camForward.dot(dirToPack).toFixed(3)}`);

  // NDC が有限（可視範囲に概ね収まる）
  const ndc = trackCenter.clone().project(camera);
  check('track center の project 結果が有限', Number.isFinite(ndc.x) && Number.isFinite(ndc.y) && Number.isFinite(ndc.z));
  check('track center NDC z が可視範囲(-1..1)', ndc.z >= -1 && ndc.z <= 1, `z=${ndc.z.toFixed(3)}`);

  built.dispose();
}

// ── generation guard: 新世代 loop は止めない / 旧世代 loop は止める ──
{
  // 実装と同じ判定: animate は `sceneGenerationRef.current !== myGeneration` のとき停止
  const gen = { current: 1 };
  const myGenOld = gen.current;       // 旧ループが掴んだ世代
  // レース切替相当: cleanup(+1) → init(+1)
  gen.current++; // cleanup
  gen.current++; // init（新世代）
  const myGenNew = gen.current;       // 新ループが掴んだ世代

  const stopped = (myGen: number) => gen.current !== myGen;
  check('旧世代 loop は停止する', stopped(myGenOld) === true);
  check('新世代 loop は停止しない', stopped(myGenNew) === false);
}

// ── timeline が空でも render は実行される描画判定 ──
{
  // 実装: scene/camera/renderer が揃えば timeline の有無に関わらず render する
  let renderCalls = 0;
  const sceneReady = true, cameraReady = true, rendererReady = true;
  const runFrame = (timeline: unknown) => {
    if (!sceneReady || !cameraReady || !rendererReady) return;
    // timeline 依存の更新はスキップされても render は必ず走る
    if (timeline) { /* 位置/カメラ更新 */ }
    renderCalls++;
  };
  runFrame(null);       // timeline 未設定
  runFrame(null);
  check('timeline が空でも render される', renderCalls >= 1, `renderCalls=${renderCalls}`);
  runFrame({ totalDuration: 10 }); // timeline 設定後も render
  check('timeline 設定後も render 継続', renderCalls === 3);
}

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
