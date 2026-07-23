/**
 * race-3d-integration テスト
 * 実行: npx tsx lib/race-simulator/race-3d-integration.test.ts
 *
 * A. ResolvedCourse→layout解決 / 0m=start / raceDistance=finish / lateral走路内 / elevation有限
 * C. dynamics: 同時刻progress非一致 / rank変化 / 全馬完走 / 同一seed再現
 * E. スモーク8ケース: 解決成功・start/finish一致・pose有限
 */

import {
  resolveRacecourseLayout,
  runRaceDynamicsForRace,
  interpolateDynamics,
  computePackProgress,
  buildHorseInputsFromSimulation,
  type CourseInfoLike,
  type SimulationLike,
} from './race-3d-integration';
import { sampleRaceProgressPose, samplePathPose } from '../racecourse-geometry';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  \u2713 ${label}`); }
  else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}
const finite = (v: { x: number; y: number; z: number }) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

function mockSim(raceKey: string, raceDistance: number, n = 12): SimulationLike {
  const horses = Array.from({ length: n }, (_, i) => ({
    horseNumber: i + 1,
    horseName: `馬${i + 1}`,
    position: i + 1,
    waku: Math.min(8, Math.floor(i / 2) + 1),
    leadingIntention: 80 - i * 5,
    staminaRemaining: 100,
    capabilities: {
      startSpeed: 40 + ((i * 13) % 50),
      cruiseSpeed: 45 + ((i * 7) % 45),
      acceleration: 40 + ((i * 11) % 55),
      stamina: 40 + ((i * 5) % 50),
      cornerSkill: 50,
    },
  }));
  return { raceKey, raceDistance, phases: { start: { horses } }, finalStandings: horses };
}

interface SmokeCase {
  label: string; place: string; trackType: string; distance: number; clockwise: boolean;
  expectRoute: string;
}
const smoke: SmokeCase[] = [
  { label: '函館芝1200', place: '函館', trackType: 'turf', distance: 1200, clockwise: true, expectRoute: 'hakodate:turf:main' },
  { label: '東京ダート1400', place: '東京', trackType: 'dirt', distance: 1400, clockwise: false, expectRoute: 'tokyo:dirt:main' },
  { label: '福島芝1800', place: '福島', trackType: 'turf', distance: 1800, clockwise: true, expectRoute: 'fukushima:turf:main' },
  { label: '新潟芝1000直線', place: '新潟', trackType: 'turf', distance: 1000, clockwise: false, expectRoute: 'niigata:turf:straight' },
  { label: '中山芝1600外', place: '中山', trackType: 'turf', distance: 1600, clockwise: true, expectRoute: 'nakayama:turf:outer' },
  { label: '中山芝2000内', place: '中山', trackType: 'turf', distance: 2000, clockwise: true, expectRoute: 'nakayama:turf:inner' },
  { label: '京都芝2400外', place: '京都', trackType: 'turf', distance: 2400, clockwise: true, expectRoute: 'kyoto:turf:outer' },
  { label: '阪神芝2400外', place: '阪神', trackType: 'turf', distance: 2400, clockwise: true, expectRoute: 'hanshin:turf:outer' },
];

console.log('=== E. スモーク8ケース ===');
for (const sc of smoke) {
  const ci: CourseInfoLike = { place: sc.place, trackType: sc.trackType, distance: sc.distance, clockwise: sc.clockwise };
  const layout = resolveRacecourseLayout(ci);
  check(`${sc.label}: layout解決`, !!layout, 'null');
  if (!layout) continue;
  check(`${sc.label}: route=${sc.expectRoute}`, layout.routeId === sc.expectRoute, layout.routeId);

  // start(progress=0)
  const startPose = sampleRaceProgressPose(layout.geometry, layout.startMarker.pathDistance, 0, 0);
  const startRef = samplePathPose(layout.geometry, layout.startMarker.pathDistance, 0);
  check(`${sc.label}: 0m=start一致`, dist(startPose.position, startRef.position) < 0.5, `${dist(startPose.position, startRef.position)}`);

  // finish(progress=raceDistance)
  const finishPose = sampleRaceProgressPose(layout.geometry, layout.startMarker.pathDistance, layout.raceDistance, 0);
  const finishRef = samplePathPose(layout.geometry, layout.finishPathDistance, 0);
  check(`${sc.label}: raceDistance=finish一致`, dist(finishPose.position, finishRef.position) < 0.5, `${dist(finishPose.position, finishRef.position)}`);

  check(`${sc.label}: pose有限`, finite(startPose.position) && finite(finishPose.position) && Number.isFinite(startPose.heading));
  check(`${sc.label}: elevation有限`, Number.isFinite(startPose.position.y) && Number.isFinite(finishPose.position.y));

  // dynamics
  const sim = mockSim('RACE_' + sc.label, sc.distance);
  const dyn = runRaceDynamicsForRace(sim, layout, ci);
  check(`${sc.label}: dynamics生成`, !!dyn && dyn.frames.length > 5);
  if (!dyn) continue;

  // lateral 走路内
  const half = layout.geometry.trackWidth / 2;
  let latOk = true;
  for (const f of dyn.frames) for (const h of f.horses) if (Math.abs(h.lateralPosition) > half + 1e-6) latOk = false;
  check(`${sc.label}: lateralが走路幅内`, latOk, `half=${half}`);

  // 全馬完走 & 距離超過なし
  const lastF = dyn.frames[dyn.frames.length - 1];
  check(`${sc.label}: 全馬完走`, lastF.horses.every((h) => h.finished));
  let over = false;
  for (const f of dyn.frames) for (const h of f.horses) if (h.raceProgress > sc.distance + 1e-6) over = true;
  check(`${sc.label}: 距離超過なし`, !over);

  // 各馬の world pose（dynamics→geometry）有限 & 走路上
  const midFrame = interpolateDynamics(dyn, dyn.totalTime * 0.5);
  let poseOk = true;
  for (const h of midFrame) {
    const p = sampleRaceProgressPose(layout.geometry, layout.startMarker.pathDistance, h.raceProgress, h.lateralPosition);
    if (!finite(p.position) || !Number.isFinite(p.heading)) poseOk = false;
  }
  check(`${sc.label}: dynamics→world pose有限`, poseOk);
}

console.log('=== C. dynamics 表示挙動（函館芝1200） ===');
{
  const ci: CourseInfoLike = { place: '函館', trackType: 'turf', distance: 1200, clockwise: true };
  const layout = resolveRacecourseLayout(ci)!;
  const sim = mockSim('HAKO1200', 1200);
  const dyn = runRaceDynamicsForRace(sim, layout, ci)!;

  const f5 = interpolateDynamics(dyn, 5);
  const progs = f5.map((h) => h.raceProgress);
  check('5s: progress非一致', Math.max(...progs) - Math.min(...progs) > 3);

  const pack = computePackProgress(f5)!;
  check('packProgress 計算', Number.isFinite(pack.avgProgress) && pack.laneSpread >= 0);

  const early = interpolateDynamics(dyn, 5);
  const end = dyn.frames[dyn.frames.length - 1].horses;
  let rankChanged = false;
  for (const h of end) {
    const e = early.find((x) => x.horseNumber === h.horseNumber);
    if (e && e.rank !== h.rank) rankChanged = true;
  }
  check('rank変化あり', rankChanged);

  // 決定論
  const dyn2 = runRaceDynamicsForRace(mockSim('HAKO1200', 1200), layout, ci)!;
  check('同一seed再現', JSON.stringify(dyn2.finishOrder) === JSON.stringify(dyn.finishOrder));
}

console.log('=== A. layout解決の堅牢性 ===');
{
  check('null courseInfo→null', resolveRacecourseLayout(null) === null);
  check('存在しない場→null', resolveRacecourseLayout({ place: '存在しない', trackType: 'turf', distance: 1200 }) === null);
  const inputs = buildHorseInputsFromSimulation(mockSim('X', 1200));
  check('HorseInputs 12頭', inputs.length === 12);
  check('脚質が割当', inputs.every((h) => ['escape', 'front', 'stalker', 'closer'].includes(h.runningStyle)));
  check('能力0..1', inputs.every((h) => h.ability >= 0 && h.ability <= 1));
}

function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
