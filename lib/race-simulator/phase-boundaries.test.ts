/**
 * buildPhaseBoundaries の回帰テスト
 *
 * 実行方法:
 *   npx tsx lib/race-simulator/phase-boundaries.test.ts
 *
 * 検証内容:
 *   - 各境界が連続（前.end === 次.start）
 *   - 単調増加（start < formation < pace < corner <= straight < goal）
 *   - goal.end === raceDistance
 *   - 3コース（函館芝1200 / 東京ダート1400 / 福島芝1800）で境界生成
 *   - 成立しない入力ではエラーになる（黙って補正しない）
 *
 * ※ DB非依存。getCourseInfo / buildPhaseBoundaries の実コードを検証する。
 */

import type { PhaseBoundaries } from '@/types/race-simulator';
import { getCourseInfo, normalizeTrackType } from './course-database';
import { buildPhaseBoundaries } from './phase-boundaries';

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

/** 境界の共通不変条件をまとめて検証 */
function checkInvariants(label: string, b: PhaseBoundaries, raceDistance: number) {
  const phases: Array<[string, { start: number; end: number }]> = [
    ['start', b.start],
    ['formation', b.formation],
    ['pace', b.pace],
    ['corner', b.corner],
    ['straight', b.straight],
    ['goal', b.goal],
  ];

  // start.start === 0
  check(`${label}: start.start === 0`, Math.abs(b.start.start) < EPS, `${b.start.start}`);

  // 連続性
  let continuous = true;
  let contDetail = '';
  for (let i = 1; i < phases.length; i++) {
    const [pn, prev] = phases[i - 1];
    const [cn, curr] = phases[i];
    if (Math.abs(prev.end - curr.start) > EPS) {
      continuous = false;
      contDetail = `${pn}.end=${prev.end} != ${cn}.start=${curr.start}`;
      break;
    }
  }
  check(`${label}: 連続（前.end === 次.start）`, continuous, contDetail);

  // 単調増加（start < formation < pace < corner <= straight < goal）
  const s = phases.map(([, seg]) => seg.start);
  const [sStart, sFormation, sPace, sCorner, sStraight, sGoal] = s;
  check(
    `${label}: start < formation < pace < corner <= straight < goal`,
    sStart < sFormation - EPS &&
      sFormation < sPace - EPS &&
      sPace < sCorner - EPS &&
      sCorner <= sStraight + EPS &&
      sStraight < sGoal - EPS,
    `[${s.map(v => v.toFixed(1)).join(', ')}]`
  );

  // goal.end === raceDistance
  check(`${label}: goal.end === raceDistance(${raceDistance})`, Math.abs(b.goal.end - raceDistance) < EPS, `${b.goal.end}`);

  // 全フェーズ end <= raceDistance
  const over = phases.filter(([, seg]) => seg.end > raceDistance + EPS);
  check(`${label}: 全フェーズ end <= raceDistance`, over.length === 0, over.map(([n]) => n).join(', '));
}

function printBoundaries(label: string, b: PhaseBoundaries) {
  console.log(`  [${label}] 境界値:`);
  const rows: Array<[string, { start: number; end: number }]> = [
    ['start', b.start],
    ['formation', b.formation],
    ['pace', b.pace],
    ['corner', b.corner],
    ['straight', b.straight],
    ['goal', b.goal],
  ];
  for (const [name, seg] of rows) {
    const len = (seg.end - seg.start).toFixed(1);
    console.log(`    ${name.padEnd(10)} [${seg.start.toFixed(1).padStart(7)}, ${seg.end.toFixed(1).padStart(7)}]  (長さ ${len}m)`);
  }
}

function testCourse(label: string, place: string, distance: number, surface: string) {
  console.log(`\n[Test] ${label}`);
  const tt = normalizeTrackType(surface);
  const courseInfo = tt ? getCourseInfo(place, distance, tt) : null;
  check(`${label}: courseInfo 取得（null でない）`, courseInfo !== null,
    courseInfo === null ? 'null' : `straightLength=${courseInfo.straightLength}, startToFirstCorner=${courseInfo.startToFirstCorner}, corners=${courseInfo.corners.length}`);

  if (!courseInfo) return;

  let b: PhaseBoundaries | null = null;
  try {
    b = buildPhaseBoundaries(distance, courseInfo);
  } catch (e) {
    check(`${label}: buildPhaseBoundaries が成功`, false, (e as Error).message);
    return;
  }
  check(`${label}: buildPhaseBoundaries が成功`, true);

  printBoundaries(label, b);
  checkInvariants(label, b, distance);
}

// ==================================================================
// 異常系: 成立しない入力はエラー（黙って補正しない）
// ==================================================================
function testErrorCases() {
  console.log('\n[Test] 異常系: 補正せずエラーになる');

  // courseInfo=null → throw
  let threwNull = false;
  try {
    buildPhaseBoundaries(1200, null);
  } catch {
    threwNull = true;
  }
  check('courseInfo=null で throw', threwNull);

  // straightLength >= raceDistance（ホームストレートがレース距離以上）→ throw
  const bad = {
    id: 'bad_course', place: 'テスト', distance: 1200, trackType: 'turf' as const,
    straightLength: 1300, startToFirstCorner: 300,
    corners: [], slopes: [],
    innerAdvantage: 0, outerAdvantage: 0, paceTendency: 'middle' as const,
  };
  let threwStraight = false;
  try {
    buildPhaseBoundaries(1200, bad);
  } catch {
    threwStraight = true;
  }
  check('straightLength >= raceDistance で throw', threwStraight);

  // 最終コーナーが長すぎてバックストレッチが負 → throw
  const tightCorner = {
    id: 'tight_course', place: 'テスト', distance: 1200, trackType: 'turf' as const,
    straightLength: 300, startToFirstCorner: 500,
    // straightStart = 900, backstretch=[500,900]=400 に対し、円弧 500m は過大
    corners: [
      { name: '3コーナー', position: 600, radius: 200, angle: 90 },
      { name: '4コーナー', position: 750, radius: 200, angle: 90 },
    ],
    slopes: [],
    innerAdvantage: 0, outerAdvantage: 0, paceTendency: 'middle' as const,
  };
  let threwTight = false;
  try {
    buildPhaseBoundaries(1200, tightCorner);
  } catch {
    threwTight = true;
  }
  check('最終コーナー過大でバックストレッチ負 → throw', threwTight);
}

function main() {
  console.log('======================================================');
  console.log(' buildPhaseBoundaries 回帰テスト');
  console.log('======================================================');

  testCourse('函館芝1200', '函館', 1200, '芝');
  testCourse('東京ダート1400', '東京', 1400, 'ダート');
  testCourse('福島芝1800', '福島', 1800, '芝');
  testErrorCases();

  console.log('\n------------------------------------------------------');
  console.log(` 結果: 成功 ${passCount}件 / 失敗 ${failCount}件`);
  console.log('------------------------------------------------------');

  if (failCount > 0) process.exitCode = 1;
}

main();
