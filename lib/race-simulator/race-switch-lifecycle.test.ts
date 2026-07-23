/**
 * レース切替ライフサイクル テスト
 * 実行: npx tsx lib/race-simulator/race-switch-lifecycle.test.ts
 *
 * 本番症状「最初のレースは動くが別レースへ切替でclient-side exception」を
 * ブラウザ非依存で再現検証する。
 *
 * initRaceScene / disposeRaceScene を純粋パイプライン（layout+dynamics+track描画）
 * で模擬し、A→B→C…の切替で:
 *  - 例外が出ない
 *  - dispose 後の再initが成功する
 *  - horse mesh 相当の頭数が新レースと一致
 *  - NaN/Infinity なし
 *  - closed-loop ↔ open-path 切替で壊れない
 */

import {
  resolveRacecourseLayout,
  runRaceDynamicsForRace,
  interpolateDynamics,
  type CourseInfoLike,
  type SimulationLike,
} from './race-3d-integration';
import { sampleRaceProgressPose, GEOMETRIES_BY_VENUE } from '../racecourse-geometry';
import { buildTrackGroup, buildStartFinishGroup, type TrackRenderResult } from './track-render';

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

interface RaceScene {
  layout: ReturnType<typeof resolveRacecourseLayout>;
  dynamics: ReturnType<typeof runRaceDynamicsForRace>;
  groups: TrackRenderResult[];
  horseNumbers: number[];
}

function initRaceScene(courseInfo: CourseInfoLike, sim: SimulationLike): RaceScene {
  const layout = resolveRacecourseLayout(courseInfo);
  const dynamics = layout ? runRaceDynamicsForRace(sim, layout, courseInfo) : null;
  const groups: TrackRenderResult[] = [];
  if (layout) {
    const venueGeoms = GEOMETRIES_BY_VENUE.get(layout.geometry.venue) ?? [layout.geometry];
    for (const g of venueGeoms) {
      groups.push(buildTrackGroup(g, { active: g.id === layout.geometry.id }));
    }
    groups.push(buildStartFinishGroup(layout.geometry, layout.startMarker));
  }
  const horseNumbers = (sim.phases?.start?.horses ?? []).map((h) => h.horseNumber);
  return { layout, dynamics, groups, horseNumbers };
}

function disposeRaceScene(s: RaceScene) {
  for (const g of s.groups) g.dispose();
  s.groups.length = 0;
}

/** animate ループ相当: 複数時刻で各馬の world pose を生成し有限性を確認 */
function runFrames(s: RaceScene): boolean {
  if (!s.layout || !s.dynamics) return true; // fallback経路（例外なし）
  const dyn = s.dynamics;
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const frame = interpolateDynamics(dyn, dyn.totalTime * frac);
    for (const h of frame) {
      const pose = sampleRaceProgressPose(
        s.layout.geometry, s.layout.startMarker.pathDistance, h.raceProgress, h.lateralPosition
      );
      if (!Number.isFinite(pose.position.x) || !Number.isFinite(pose.position.y) ||
          !Number.isFinite(pose.position.z) || !Number.isFinite(pose.heading)) {
        return false;
      }
    }
  }
  return true;
}

interface Race { label: string; ci: CourseInfoLike; n: number; }
const races: Record<string, Race> = {
  hakodate1200: { label: '函館芝1200', ci: { place: '函館', trackType: 'turf', distance: 1200 }, n: 14 },
  tokyoDirt1400: { label: '東京ダート1400', ci: { place: '東京', trackType: 'dirt', distance: 1400 }, n: 8 },
  niigata1000: { label: '新潟芝1000直線', ci: { place: '新潟', trackType: 'turf', distance: 1000 }, n: 14 },
  nakayama2000: { label: '中山芝2000内', ci: { place: '中山', trackType: 'turf', distance: 2000 }, n: 8 },
};

// 切替シーケンス（closed↔open, 頭数差14↔8を含む）
const sequence: string[] = [
  'hakodate1200', 'tokyoDirt1400', 'niigata1000', 'nakayama2000',
  'niigata1000', 'hakodate1200', 'tokyoDirt1400',
];

console.log('=== レース切替ライフサイクル ===');
let prev: RaceScene | null = null;
let threw = false;
for (let step = 0; step < sequence.length; step++) {
  const r = races[sequence[step]];
  try {
    // 切替: 旧sceneをdispose（本番のcleanup相当）
    if (prev) disposeRaceScene(prev);
    const sim = mockSim(`R_${r.label}_${step}`, r.ci.distance!, r.n);
    const scene = initRaceScene(r.ci, sim);
    check(`step${step} ${r.label}: layout解決`, !!scene.layout);
    check(`step${step} ${r.label}: track group生成`, scene.groups.length > 0);
    check(`step${step} ${r.label}: 頭数一致`, scene.horseNumbers.length === r.n);
    check(`step${step} ${r.label}: dynamics頭数一致`,
      !!scene.dynamics && scene.dynamics.frames[0].horses.length === r.n,
      `${scene.dynamics?.frames[0].horses.length} vs ${r.n}`);
    check(`step${step} ${r.label}: frame pose有限`, runFrames(scene));
    prev = scene;
  } catch (e) {
    threw = true;
    fail++;
    console.error(`  \u2717 step${step} ${r.label} で例外:`, (e as Error).message);
    console.error((e as Error).stack);
  }
}
if (prev) disposeRaceScene(prev);
check('切替中に例外が発生しない', !threw);

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
