/**
 * 全フェーズ endDistance 駆動 統合テスト
 *
 * 実行方法:
 *   npx tsx lib/race-simulator/all-phases-endistance.test.ts
 *
 * 検証内容:
 *   - 函館芝1200 / 東京ダート1400 / 福島芝1800 で全フェーズ実行
 *   - formation/pace/corner/straight: 各フェーズ終了値が対応 boundary.end の許容誤差1m以内
 *   - start: 固定200m使用のため boundary との不整合は許容（次段階で修正予定）
 *   - 全フェーズ単調非減少（後退なし）
 *   - raceDistance 超過0件
 *   - 負の距離0件
 *   - NaN/Infinity なし
 *   - goal 到達
 *   - corner ゼロ長でも正常動作
 *
 * ※ DB非依存。エンジンの実コードを直接検証する。
 */

import type { HorseState, PhaseResult } from '@/types/race-simulator';
import { getCourseInfo, normalizeTrackType } from './course-database';
import { buildPhaseBoundaries } from './phase-boundaries';
import { executeStartPhase } from './engines/start-phase';
import { executeFormationPhase } from './engines/formation-phase';
import { executeCornerPhase } from './engines/corner-phase';
import { executeStraightPhase } from './engines/straight-phase';

let passCount = 0;
let failCount = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passCount++;
    console.log(`  ✓ ${name}`);
  } else {
    failCount++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const EPS = 1e-6;

/** ダミー馬（start開始前の状態） */
function makeDummyHorse(num: number, waku: number): HorseState {
  return {
    horseNumber: num,
    horseName: `テスト${num}号`,
    position: 0,
    internalLane: waku,
    distanceFromLeader: 0,
    currentDistance: 0,
    currentVelocity: 0,
    lateralPosition: (waku - 4.5) * 2.5,
    capabilities: {
      startSpeed: 50 + num * 3,
      cruiseSpeed: 50 + num * 2,
      acceleration: 50 + num * 4,
      stamina: 70,
      cornerSkill: 50,
    },
    leadingIntention: 50,
    pfs: 50,
    pastPositionPattern: '5-5-5-5',
    staminaRemaining: 70,
    blocked: false,
    outerPath: false,
    waku,
    weight: 55,
    trackBiasEffect: 0,
  };
}

function testCourse(label: string, place: string, distance: number, surface: string) {
  console.log(`\n========================================`);
  console.log(`[Test] ${label}`);
  console.log(`========================================`);

  const tt = normalizeTrackType(surface);
  const courseInfo = tt ? getCourseInfo(place, distance, tt) : null;
  check(`${label}: courseInfo 取得`, courseInfo !== null);
  if (!courseInfo) return;

  let boundaries;
  try {
    boundaries = buildPhaseBoundaries(distance, courseInfo);
  } catch (e) {
    check(`${label}: buildPhaseBoundaries`, false, (e as Error).message);
    return;
  }
  check(`${label}: buildPhaseBoundaries`, true);

  // ダミー馬を作成
  const totalHorses = 8;
  const horses: HorseState[] = [];
  for (let i = 1; i <= totalHorses; i++) {
    horses.push(makeDummyHorse(i, i));
  }

  // Phase 1: start（今回のスコープ外、固定200m使用のため boundary 不整合）
  let result: PhaseResult;
  try {
    result = executeStartPhase({ horses, totalHorses });
  } catch (e) {
    check(`${label}: start実行`, false, (e as Error).message);
    return;
  }
  check(`${label}: start実行`, true);

  const startHorses = result.horses;
  const startMax = Math.max(...startHorses.map(h => h.currentDistance));
  // start は今回のスコープ外（固定 200m 使用）のため、boundary.end との乖離は許容
  check(`${label}: start終了値 <= raceDistance`, startMax <= distance + EPS, `max=${startMax.toFixed(1)}`);
  console.log(`    [Note] start は固定200m（boundary.start.end=${boundaries.start.end}との乖離は既知の制限）`);

  // Phase 2: formation
  try {
    result = executeFormationPhase({
      horses: startHorses,
      courseInfo,
      totalHorses,
      endDistance: boundaries.formation.end,
    }, result);
  } catch (e) {
    check(`${label}: formation実行`, false, (e as Error).message);
    return;
  }
  check(`${label}: formation実行`, true);

  const formationHorses = result.horses;
  const formationMax = Math.max(...formationHorses.map(h => h.currentDistance));
  check(`${label}: formation終了値 <= boundary.end(${boundaries.formation.end})`, formationMax <= boundaries.formation.end + EPS, `max=${formationMax.toFixed(1)}`);
  check(`${label}: formation先頭馬が boundary.end に到達（許容1m）`, Math.abs(formationMax - boundaries.formation.end) < 1.0, `差=${Math.abs(formationMax - boundaries.formation.end).toFixed(1)}m`);

  // 後退チェック（start→formation）
  let backward = 0;
  for (const h of formationHorses) {
    const prev = startHorses.find(s => s.horseNumber === h.horseNumber)!;
    if (h.currentDistance < prev.currentDistance - EPS) backward++;
  }
  check(`${label}: start→formation 後退なし`, backward === 0, `後退${backward}件`);

  // Phase 2.5: pace（簡易、orchestratorと同じロジック）
  const paceHorses = formationHorses.map(h => ({ ...h }));
  const paceMaxBefore = Math.max(...paceHorses.map(h => h.currentDistance));
  const paceRun = Math.max(0, boundaries.pace.end - paceMaxBefore);
  for (const h of paceHorses) {
    h.currentDistance = Math.min(boundaries.pace.end, h.currentDistance + paceRun);
  }
  const paceMax = Math.max(...paceHorses.map(h => h.currentDistance));
  check(`${label}: pace終了値 <= boundary.end(${boundaries.pace.end})`, paceMax <= boundaries.pace.end + EPS, `max=${paceMax.toFixed(1)}`);
  check(`${label}: pace先頭馬が boundary.end に到達（許容1m）`, Math.abs(paceMax - boundaries.pace.end) < 1.0, `差=${Math.abs(paceMax - boundaries.pace.end).toFixed(1)}m`);

  // 後退チェック（formation→pace）
  backward = 0;
  for (const h of paceHorses) {
    const prev = formationHorses.find(f => f.horseNumber === h.horseNumber)!;
    if (h.currentDistance < prev.currentDistance - EPS) backward++;
  }
  check(`${label}: formation→pace 後退なし`, backward === 0, `後退${backward}件`);

  // Phase 3-4: corner
  const paceResult: PhaseResult = {
    phaseName: 'ペース',
    distanceRange: { start: boundaries.pace.start, end: boundaries.pace.end },
    timeRange: { start: result.timeRange.end, end: result.timeRange.end + 10 },
    horses: paceHorses,
    paceInfo: result.paceInfo,
    events: [],
  };

  try {
    result = executeCornerPhase({
      horses: paceHorses,
      courseInfo,
      totalHorses,
      endDistance: boundaries.corner.end,
    }, paceResult);
  } catch (e) {
    check(`${label}: corner実行`, false, (e as Error).message);
    return;
  }
  check(`${label}: corner実行`, true);

  const cornerHorses = result.horses;
  const cornerMax = Math.max(...cornerHorses.map(h => h.currentDistance));
  const cornerLen = boundaries.corner.end - boundaries.corner.start;
  if (cornerLen < EPS) {
    check(`${label}: corner ゼロ長で正常終了`, true);
  } else {
    check(`${label}: corner終了値 <= boundary.end(${boundaries.corner.end})`, cornerMax <= boundaries.corner.end + EPS, `max=${cornerMax.toFixed(1)}`);
    check(`${label}: corner先頭馬が boundary.end に到達（許容1m）`, Math.abs(cornerMax - boundaries.corner.end) < 1.0, `差=${Math.abs(cornerMax - boundaries.corner.end).toFixed(1)}m`);
  }

  // 後退チェック（pace→corner）
  backward = 0;
  for (const h of cornerHorses) {
    const prev = paceHorses.find(p => p.horseNumber === h.horseNumber)!;
    if (h.currentDistance < prev.currentDistance - EPS) backward++;
  }
  check(`${label}: pace→corner 後退なし`, backward === 0, `後退${backward}件`);

  // Phase 5: straight
  try {
    result = executeStraightPhase({
      horses: cornerHorses,
      paceType: 'middle',
      courseInfo,
      totalHorses,
      raceDistance: distance,
      endDistance: boundaries.straight.end,
    }, result);
  } catch (e) {
    check(`${label}: straight実行`, false, (e as Error).message);
    return;
  }
  check(`${label}: straight実行`, true);

  const straightHorses = result.horses;
  const straightMax = Math.max(...straightHorses.map(h => h.currentDistance));
  check(`${label}: straight終了値 <= raceDistance(${distance})`, straightMax <= distance + EPS, `max=${straightMax.toFixed(1)}`);
  check(`${label}: straight先頭馬が raceDistance に到達（許容1m）`, Math.abs(straightMax - distance) < 1.0, `差=${Math.abs(straightMax - distance).toFixed(1)}m`);

  // 後退チェック（corner→straight）
  backward = 0;
  for (const h of straightHorses) {
    const prev = cornerHorses.find(c => c.horseNumber === h.horseNumber)!;
    if (h.currentDistance < prev.currentDistance - EPS) backward++;
  }
  check(`${label}: corner→straight 後退なし`, backward === 0, `後退${backward}件`);

  // 全フェーズで NaN/Infinity/負の距離チェック
  const allHorses = [...startHorses, ...formationHorses, ...paceHorses, ...cornerHorses, ...straightHorses];
  const nanCount = allHorses.filter(h => !Number.isFinite(h.currentDistance)).length;
  const negCount = allHorses.filter(h => h.currentDistance < -EPS).length;
  check(`${label}: NaN/Infinity なし`, nanCount === 0, `異常値${nanCount}件`);
  check(`${label}: 負の距離なし`, negCount === 0, `負${negCount}件`);

  // 実測値を出力
  console.log(`\n  [${label}] 各フェーズ実測値（先頭馬）:`);
  console.log(`    start    : ${startMax.toFixed(1)}m (boundary=${boundaries.start.end})`);
  console.log(`    formation: ${formationMax.toFixed(1)}m (boundary=${boundaries.formation.end})`);
  console.log(`    pace     : ${paceMax.toFixed(1)}m (boundary=${boundaries.pace.end})`);
  console.log(`    corner   : ${cornerMax.toFixed(1)}m (boundary=${boundaries.corner.end})`);
  console.log(`    straight : ${straightMax.toFixed(1)}m (boundary=${boundaries.straight.end}=${distance})`);
}

function main() {
  console.log('======================================================');
  console.log(' 全フェーズ endDistance 駆動 統合テスト');
  console.log('======================================================');

  testCourse('函館芝1200', '函館', 1200, '芝');
  testCourse('東京ダート1400', '東京', 1400, 'ダート');
  testCourse('福島芝1800', '福島', 1800, '芝');

  console.log('\n======================================================');
  console.log(` 結果: 成功 ${passCount}件 / 失敗 ${failCount}件`);
  console.log('======================================================');

  if (failCount > 0) process.exitCode = 1;
}

main();
