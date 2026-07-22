/**
 * 「逆走とオーバーランを止める最小修正」の回帰テスト
 *
 * 実行方法:
 *   npx tsx lib/race-simulator/straight-endistance.test.ts
 *
 * 検証内容:
 *   - 函館芝1200で straight フェーズ終了後、全馬 currentDistance <= 1200
 *   - goal >= straight（後退なし）
 *   - 距離超過0件（<= raceDistance / endDistance）
 *   - 距離減少0件（corner→straight→goal が単調非減少）
 *   - trackType が 芝 / ダート / turf / dirt で正規化される
 *
 * ※ DB非依存。エンジン（executeStraightPhase）・goal合成（computeGoalDistance）・
 *   コース取得（getCourseInfo）・正規化（normalizeTrackType）の実コードを直接検証する。
 */

import type { HorseState, PhaseResult } from '@/types/race-simulator';
import { getCourseInfo, normalizeTrackType } from './course-database';
import { executeStraightPhase } from './engines/straight-phase';
import { computeGoalDistance } from './simulation-orchestrator';

// ------------------------------------------------------------------
// 簡易アサーション
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// ダミー馬（コーナー終了時点の状態を模擬）
// ------------------------------------------------------------------
function makeCornerEndHorse(
  num: number,
  currentDistance: number,
  acceleration: number
): HorseState {
  return {
    horseNumber: num,
    horseName: `テスト${num}号`,
    position: num,
    internalLane: num,
    distanceFromLeader: 0,
    currentDistance,
    currentVelocity: 15,
    lateralPosition: 0,
    capabilities: {
      startSpeed: 50,
      cruiseSpeed: 50,
      acceleration,
      stamina: 60, // スタミナ切れによる失速を避けて距離ロジックを純粋に検証
      cornerSkill: 50,
    },
    leadingIntention: 50,
    pfs: 50,
    pastPositionPattern: '5-5-5-5',
    staminaRemaining: 60,
    blocked: false,
    outerPath: false,
    waku: num,
    weight: 55,
    trackBiasEffect: 0,
  };
}

function dummyPrevPhase(): PhaseResult {
  return {
    phaseName: '3-4コーナー',
    distanceRange: { start: 600, end: 938 },
    timeRange: { start: 0, end: 45 },
    horses: [],
    paceInfo: { averageSpeed: 15, leadingHorses: [1], paceType: 'middle' },
    events: [],
  };
}

// ==================================================================
// テスト1: trackType 正規化
// ==================================================================
function testNormalizeTrackType() {
  console.log('\n[Test 1] trackType 正規化（芝 / ダート / turf / dirt）');
  check("normalizeTrackType('芝') === 'turf'", normalizeTrackType('芝') === 'turf', String(normalizeTrackType('芝')));
  check("normalizeTrackType('ダート') === 'dirt'", normalizeTrackType('ダート') === 'dirt', String(normalizeTrackType('ダート')));
  check("normalizeTrackType('turf') === 'turf'", normalizeTrackType('turf') === 'turf', String(normalizeTrackType('turf')));
  check("normalizeTrackType('dirt') === 'dirt'", normalizeTrackType('dirt') === 'dirt', String(normalizeTrackType('dirt')));
  // 未対応値は null
  check("normalizeTrackType('unknown') === null", normalizeTrackType('unknown') === null, String(normalizeTrackType('unknown')));
}

// ==================================================================
// テスト2: 函館芝1200 の straight/goal 距離保証
// ==================================================================
function testHakodateTurf1200() {
  console.log('\n[Test 2] 函館芝1200: straight <= 1200 / goal >= straight / 超過・減少0件');

  const RACE_DISTANCE = 1200;

  // trackType 正規化 → courseInfo 取得（エンジンと同じ経路）
  const tt = normalizeTrackType('芝');
  const courseInfo = tt ? getCourseInfo('函館', RACE_DISTANCE, tt) : null;
  check('函館芝1200 の courseInfo が取得できる（null でない）', courseInfo !== null,
    courseInfo === null ? 'courseInfo=null（正規化 or コースデータ未取得）' : `straightLength=${courseInfo.straightLength}`);

  // コーナー終了時点の馬群（distance にばらつき、能力にもばらつき）
  const cornerHorses: HorseState[] = [
    makeCornerEndHorse(1, 955.0, 80),
    makeCornerEndHorse(2, 950.0, 60),
    makeCornerEndHorse(3, 944.5, 70),
    makeCornerEndHorse(4, 940.0, 90),
    makeCornerEndHorse(5, 935.0, 50),
    makeCornerEndHorse(6, 930.2, 65),
  ];
  const cornerSnapshot = cornerHorses.map(h => ({ num: h.horseNumber, d: h.currentDistance }));

  // straight フェーズ実行
  const straightResult = executeStraightPhase(
    {
      horses: cornerHorses,
      paceType: 'middle',
      trackBias: undefined,
      courseInfo,
      totalHorses: cornerHorses.length,
      raceDistance: RACE_DISTANCE,
      endDistance: RACE_DISTANCE,
    },
    dummyPrevPhase()
  );

  const straightHorses = straightResult.horses;

  // (a) 全馬 straight <= endDistance かつ <= raceDistance
  const overEnd = straightHorses.filter(h => h.currentDistance > RACE_DISTANCE + 1e-6);
  check('straight: 全馬 currentDistance <= 1200（超過0件）', overEnd.length === 0,
    overEnd.map(h => `${h.horseName}=${h.currentDistance.toFixed(1)}`).join(', '));

  // (b) 先頭馬は endDistance にちょうど到達
  const maxStraight = Math.max(...straightHorses.map(h => h.currentDistance));
  check('straight: 先頭馬が 1200 に到達', Math.abs(maxStraight - RACE_DISTANCE) < 1e-6,
    `max=${maxStraight.toFixed(3)}`);

  // (c) corner→straight で距離が減少していない
  let straightDecrease = 0;
  for (const h of straightHorses) {
    const prev = cornerSnapshot.find(c => c.num === h.horseNumber)!;
    if (h.currentDistance < prev.d - 1e-6) straightDecrease++;
  }
  check('corner→straight: 距離減少0件', straightDecrease === 0, `減少${straightDecrease}件`);

  // goal 合成（computeGoalDistance） を適用
  const goalHorses = straightHorses.map(h => ({
    horseNumber: h.horseNumber,
    straight: h.currentDistance,
    goal: computeGoalDistance(h.position, h.currentDistance, RACE_DISTANCE),
  }));

  // (d) goal >= straight（後退なし）
  const goalBackward = goalHorses.filter(g => g.goal < g.straight - 1e-6);
  check('goal >= straight（後退0件）', goalBackward.length === 0,
    goalBackward.map(g => `#${g.horseNumber} straight=${g.straight.toFixed(1)} goal=${g.goal.toFixed(1)}`).join(', '));

  // (e) goal <= raceDistance（超過0件）
  const goalOver = goalHorses.filter(g => g.goal > RACE_DISTANCE + 1e-6);
  check('goal: 全馬 <= 1200（超過0件）', goalOver.length === 0,
    goalOver.map(g => `#${g.horseNumber}=${g.goal.toFixed(1)}`).join(', '));

  // 参考ログ
  console.log('  [参考] 各馬 corner→straight→goal:');
  for (const h of straightHorses.sort((a, b) => a.horseNumber - b.horseNumber)) {
    const prev = cornerSnapshot.find(c => c.num === h.horseNumber)!;
    const goal = goalHorses.find(g => g.horseNumber === h.horseNumber)!;
    console.log(`    #${h.horseNumber}: ${prev.d.toFixed(1)} → ${h.currentDistance.toFixed(1)} → ${goal.goal.toFixed(1)}`);
  }
}

// ==================================================================
// テスト3: courseInfo=null（fallback）でも超過しない
// ==================================================================
function testNullCourseInfoNoOverrun() {
  console.log('\n[Test 3] courseInfo=null（fallback）でも straight <= endDistance');

  const RACE_DISTANCE = 1200;
  const cornerHorses: HorseState[] = [
    makeCornerEndHorse(1, 958.0, 70),
    makeCornerEndHorse(2, 945.0, 80),
    makeCornerEndHorse(3, 933.0, 55),
  ];

  const straightResult = executeStraightPhase(
    {
      horses: cornerHorses,
      paceType: 'middle',
      trackBias: undefined,
      courseInfo: null, // fallback 経路
      totalHorses: cornerHorses.length,
      raceDistance: RACE_DISTANCE,
      endDistance: RACE_DISTANCE,
    },
    dummyPrevPhase()
  );

  const over = straightResult.horses.filter(h => h.currentDistance > RACE_DISTANCE + 1e-6);
  check('courseInfo=null でも超過0件', over.length === 0,
    over.map(h => `${h.horseName}=${h.currentDistance.toFixed(1)}`).join(', '));
}

// ==================================================================
// 実行
// ==================================================================
function main() {
  console.log('======================================================');
  console.log(' 最小修正 回帰テスト: straight endDistance / goal 後退防止');
  console.log('======================================================');

  testNormalizeTrackType();
  testHakodateTurf1200();
  testNullCourseInfoNoOverrun();

  console.log('\n------------------------------------------------------');
  console.log(` 結果: 成功 ${passCount}件 / 失敗 ${failCount}件`);
  console.log('------------------------------------------------------');

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main();
