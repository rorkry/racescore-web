/**
 * Step 4 テスト: API handler と CourseResolver の同一化
 *
 * 実行方法:
 *   npx tsx app/api/simulator/handler.test.ts
 *
 * next/server・auth・db に依存しない純粋関数（handler.ts）を検証する。
 *
 * A. 函館芝1200 / 東京ダート1400 / 福島芝1800
 *    - API courseInfo が resolveCourseLayout 由来（旧 getCourseInfo ではない）
 *    - courseResolution が期待どおり
 *    - simulation の境界が同一 ResolvedCourse 由来
 * B. resolver 呼び出し回数（handler 1 / orchestrator 0）
 * C. trackType 正規化（芝 / ダート / ダ / turf / dirt）
 * D. エラー処理（CourseInputError→400 / CourseBoundariesError→422 / その他→500）
 * E. 新潟芝1000（CourseBoundariesError）
 * F. route.ts から旧処理が消えている（静的）
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { buildSimulatorResponse, mapSimulatorError } from './handler';
import {
  resolveCourseLayout,
  CourseInputError,
  CourseBoundariesError,
} from '@/lib/race-simulator/course-resolver';

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

function makeHorses(surface: '芝' | 'ダート', dist: number, n = 8) {
  const horses = [];
  for (let i = 1; i <= n; i++) {
    horses.push({
      umaban: String(i),
      umamei: `テスト馬${i}`,
      waku: String(Math.ceil(i / 2)),
      distance: `${surface}${dist}`,
      track_type: surface,
      kinryo: '55.0',
    });
  }
  return horses;
}

function makeMockDb(horses: ReturnType<typeof makeHorses>) {
  return {
    prepare(sql: string) {
      return {
        all: async (..._args: unknown[]) => {
          if (sql.includes('FROM wakujun')) return horses;
          if (sql.includes('FROM umadata')) return [];
          return [];
        },
        get: async (..._args: unknown[]) => undefined,
      };
    },
  };
}

function leaderDistance(horses: { currentDistance: number }[]): number {
  return Math.max(...horses.map((h) => h.currentDistance));
}

// ===================================
// A. 登録3コース: 同一 ResolvedCourse 由来
// ===================================
async function testSharedResolution() {
  console.log('\n[A] 3コース: courseInfo/boundaries が resolver 由来で同一');
  const cases: Array<[string, '芝' | 'ダート', string, number, 'verified' | 'derived' | 'generic']> = [
    ['函館', '芝', '芝', 1200, 'generic'],
    ['東京', 'ダート', 'ダート', 1400, 'derived'],
    ['福島', '芝', '芝', 1800, 'derived'],
  ];

  for (const [place, surface, rawTT, dist, expProv] of cases) {
    const db = makeMockDb(makeHorses(surface, dist));
    const payload = await buildSimulatorResponse(db, {
      year: '2024', date: '0101', place, raceNumber: '11', distance: dist, rawTrackType: rawTT,
    });
    const resolved = resolveCourseLayout({ place, trackType: rawTT, distance: dist });
    const tag = `${place}${surface}${dist}`;

    // courseInfo が resolver 由来（決定性で一致）
    check(`${tag}: API courseInfo === resolveCourseLayout().courseInfo`,
      JSON.stringify(payload.courseInfo) === JSON.stringify(resolved.courseInfo));
    // 旧 getCourseInfo ではない証拠（resolver は derived コーナー2本を持つ。旧経路は函館で空だった）
    check(`${tag}: courseInfo.corners が resolver 由来（2本）`,
      payload.courseInfo.corners.length === 2, `len=${payload.courseInfo.corners.length}`);

    // courseResolution
    check(`${tag}: courseResolution.resolutionSource=registry`,
      payload.courseResolution.resolutionSource === 'registry');
    check(`${tag}: courseResolution.provenance=${expProv}`,
      payload.courseResolution.provenance === expProv, `prov=${payload.courseResolution.provenance}`);
    check(`${tag}: warnings は code+message を持つ`,
      payload.courseResolution.warnings.every((w) => typeof w.code === 'string' && typeof w.message === 'string'));

    // simulation の境界が同一 ResolvedCourse 由来（pace 先頭 === boundaries.pace.end）
    const paceLeader = leaderDistance(payload.simulation.phases.pace.horses);
    check(`${tag}: simulation pace.end === resolved boundaries.pace.end`,
      Math.abs(paceLeader - resolved.boundaries.pace.end) < 1e-6,
      `${paceLeader} vs ${resolved.boundaries.pace.end}`);
    const goalLeader = leaderDistance(payload.simulation.phases.goal.horses);
    check(`${tag}: goal 到達（${dist}）`, Math.abs(goalLeader - dist) < 1e-6, `goal=${goalLeader}`);
    check(`${tag}: payload.distance=${dist}`, payload.distance === dist);
    // timeline も同一距離
    check(`${tag}: timeline.courseDistance 妥当`, payload.timeline.courseDistance <= dist + 1e-6);
  }
}

// ===================================
// B. resolver 呼び出し回数（静的）
// ===================================
function testResolveCallCount() {
  console.log('\n[B] resolver 呼び出し回数');
  const handlerSrc = readFileSync(join(process.cwd(), 'app/api/simulator/handler.ts'), 'utf-8');
  const calls = (handlerSrc.match(/resolveCourseLayout\s*\(/g) || []).length;
  check('handler の resolveCourseLayout 呼び出しはちょうど 1 箇所', calls === 1, `count=${calls}`);
  check('handler は orchestrator へ resolvedCourse を注入する', /resolvedCourse\s*,/.test(handlerSrc) || /resolvedCourse\s*}/.test(handlerSrc));
}

// ===================================
// C. trackType 正規化
// ===================================
async function testTrackTypeNormalization() {
  console.log('\n[C] trackType 正規化');
  const turfVariants = ['芝', 'turf'];
  for (const tt of turfVariants) {
    const db = makeMockDb(makeHorses('芝', 1200));
    const payload = await buildSimulatorResponse(db, {
      year: '2024', date: '0101', place: '函館', raceNumber: '11', distance: 1200, rawTrackType: tt,
    });
    check(`trackType "${tt}" → turf`, payload.courseInfo.trackType === 'turf');
  }
  const dirtVariants = ['ダート', 'ダ', 'dirt'];
  for (const tt of dirtVariants) {
    const db = makeMockDb(makeHorses('ダート', 1400));
    const payload = await buildSimulatorResponse(db, {
      year: '2024', date: '0101', place: '東京', raceNumber: '11', distance: 1400, rawTrackType: tt,
    });
    check(`trackType "${tt}" → dirt`, payload.courseInfo.trackType === 'dirt');
  }
}

// ===================================
// D. エラー処理
// ===================================
async function testErrorHandling() {
  console.log('\n[D] エラー処理（HTTP マッピング）');

  // CourseInputError → 400
  const badDb = makeMockDb(makeHorses('芝', 1200));
  try {
    await buildSimulatorResponse(badDb, {
      year: '2024', date: '0101', place: '東京', raceNumber: '11', distance: 1200, rawTrackType: 'unknown',
    });
    check('不正 trackType で throw', false, 'throw されなかった');
  } catch (e) {
    check('不正 trackType は CourseInputError', e instanceof CourseInputError);
    const m = mapSimulatorError(e);
    check('CourseInputError → 400', m.status === 400, `status=${m.status}`);
    check('CourseInputError body に code', m.body.code === 'INVALID_COURSE_INPUT');
  }

  // 空 place → CourseInputError → 400
  const m400 = mapSimulatorError(new CourseInputError('empty place'));
  check('mapSimulatorError(CourseInputError)=400', m400.status === 400);

  // CourseBoundariesError → 422
  const m422 = mapSimulatorError(new CourseBoundariesError('straight not supported'));
  check('mapSimulatorError(CourseBoundariesError)=422', m422.status === 422);
  check('422 body に code=COURSE_BOUNDARIES_UNSUPPORTED', m422.body.code === 'COURSE_BOUNDARIES_UNSUPPORTED');
  check('422 は原因 message を隠さない', typeof m422.body.details === 'string' && (m422.body.details as string).length > 0);

  // その他 → 500、スタックを漏らさない
  const m500 = mapSimulatorError(new Error('boom'));
  check('mapSimulatorError(Error)=500', m500.status === 500);
  check('500 body に stack を含めない', !('stack' in m500.body));
  check('500 body.details は message のみ', m500.body.details === 'boom');
}

// ===================================
// E. 新潟芝1000（CourseBoundariesError）
// ===================================
async function testStraightCourse() {
  console.log('\n[E] 新潟芝1000（generic 周回へ変換しない）');
  const db = makeMockDb(makeHorses('芝', 1000));
  try {
    await buildSimulatorResponse(db, {
      year: '2024', date: '0101', place: '新潟', raceNumber: '11', distance: 1000, rawTrackType: '芝',
    });
    check('新潟芝1000 で throw', false, 'throw されなかった');
  } catch (e) {
    check('新潟芝1000 は CourseBoundariesError', e instanceof CourseBoundariesError, (e as Error).message);
    check('新潟芝1000 → 422', mapSimulatorError(e).status === 422);
  }
}

// ===================================
// F. route.ts の旧処理削除（静的）
// ===================================
function testRouteLegacyRemoved() {
  console.log('\n[F] route.ts 旧処理削除（静的）');
  const src = readFileSync(join(process.cwd(), 'app/api/simulator/route.ts'), 'utf-8');
  check('getCourseInfo( の直呼びが無い', !/getCourseInfo\s*\(/.test(src));
  check("course-database import が無い", !/course-database/.test(src));
  check('インライン trackType 正規化が無い', !/rawTrackType === '芝'/.test(src));
  check('buildSimulatorResponse を使用', /buildSimulatorResponse\s*\(/.test(src));
  check('mapSimulatorError を使用', /mapSimulatorError\s*\(/.test(src));
}

async function main() {
  console.log('======================================================');
  console.log(' Step 4 API handler ↔ CourseResolver 同一化テスト');
  console.log('======================================================');

  await testSharedResolution();
  testResolveCallCount();
  await testTrackTypeNormalization();
  await testErrorHandling();
  await testStraightCourse();
  testRouteLegacyRemoved();

  console.log('\n======================================================');
  console.log(` 結果: 成功 ${passCount}件 / 失敗 ${failCount}件`);
  console.log('======================================================');

  if (failCount > 0) process.exitCode = 1;
}

void main();
