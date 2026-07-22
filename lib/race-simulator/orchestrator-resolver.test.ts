/**
 * Step 3 テスト: simulation-orchestrator ↔ CourseResolver 接続
 *
 * 実行方法:
 *   npx tsx lib/race-simulator/orchestrator-resolver.test.ts
 *
 * A. resolver 未注入（内部解決）: 函館芝1200 / 東京ダート1400 / 福島芝1800
 * B. resolver 注入: 事前解決を渡すと内部で再解決しない
 * C. 旧経路削除: getCourseInfo / normalizeTrackType / buildPhaseBoundaries 直呼びが無い
 * D. 新潟芝1000: CourseBoundariesError がそのまま伝播
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { runRaceSimulation } from './simulation-orchestrator';
import { resolveCourseLayout, CourseBoundariesError } from './course-resolver';
import type { SimulationResult } from '@/types/race-simulator';

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

/** 出走馬モック（surface: '芝' | 'ダート'） */
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

/** DB モック（wakujun→馬、umadata→空 で fetchHorseIndices を早期 return させる） */
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

function maxDistance(horses: { currentDistance: number }[]): number {
  return Math.max(...horses.map((h) => h.currentDistance));
}

async function runCase(place: string, surface: '芝' | 'ダート', dist: number, opts: { inject?: boolean } = {}) {
  const db = makeMockDb(makeHorses(surface, dist));
  const injected = opts.inject
    ? resolveCourseLayout({ place, trackType: surface, distance: dist })
    : undefined;
  const result = await runRaceSimulation(db as never, {
    year: '2024',
    date: '0101',
    place,
    raceNumber: '11',
    distance: dist,
    resolvedCourse: injected,
  });
  return { result, injected };
}

// ===================================
// A. resolver 未注入（内部解決）
// ===================================
async function testInternalResolve() {
  console.log('\n[A] resolver 未注入（内部で 1 回解決）');
  const cases: Array<[string, '芝' | 'ダート', number]> = [
    ['函館', '芝', 1200],
    ['東京', 'ダート', 1400],
    ['福島', '芝', 1800],
  ];

  for (const [place, surface, dist] of cases) {
    const { result } = await runCase(place, surface, dist);
    const expected = resolveCourseLayout({ place, trackType: surface, distance: dist }).boundaries;

    const s = leaderDistance(result.phases.start.horses);
    const f = leaderDistance(result.phases.formation.horses);
    const p = leaderDistance(result.phases.pace.horses);
    const c = leaderDistance(result.phases.corner3_4.horses);
    const st = leaderDistance(result.phases.straight.horses);
    const g = leaderDistance(result.phases.goal.horses);

    const tag = `${place}${surface}${dist}`;
    check(`${tag}: raceDistance=${dist}`, result.raceDistance === dist);
    check(`${tag}: 単調非減少 start≤formation≤pace≤corner≤straight≤goal`,
      s <= f + 1e-6 && f <= p + 1e-6 && p <= c + 1e-6 && c <= st + 1e-6 && st <= g + 1e-6,
      `${s.toFixed(1)}/${f.toFixed(1)}/${p.toFixed(1)}/${c.toFixed(1)}/${st.toFixed(1)}/${g.toFixed(1)}`);
    check(`${tag}: goal 到達（leader===${dist}）`, Math.abs(g - dist) < 1e-6, `goal=${g}`);

    // 内部解決の境界と一致（先頭馬）
    check(`${tag}: start.end 一致`, Math.abs(s - expected.start.end) < 1.0, `${s} vs ${expected.start.end}`);
    check(`${tag}: formation.end 一致`, Math.abs(f - expected.formation.end) < 1.0, `${f} vs ${expected.formation.end}`);
    check(`${tag}: pace.end 一致`, Math.abs(p - expected.pace.end) < 1e-6, `${p} vs ${expected.pace.end}`);
    check(`${tag}: corner.end 一致`, Math.abs(c - expected.corner.end) < 1.0, `${c} vs ${expected.corner.end}`);

    // 全フェーズで raceDistance 超過なし
    const phases = [result.phases.start, result.phases.formation, result.phases.pace,
      result.phases.corner3_4, result.phases.straight, result.phases.goal];
    const noOverrun = phases.every((ph) => maxDistance(ph.horses) <= dist + 1e-6);
    check(`${tag}: raceDistance 超過 0 件`, noOverrun);
    const noNeg = phases.every((ph) => ph.horses.every((h) => h.currentDistance >= 0));
    check(`${tag}: 負の距離 0 件`, noNeg);
  }
}

// ===================================
// B. resolver 注入（再解決しない）
// ===================================
async function testInjected() {
  console.log('\n[B] resolver 注入（内部で再解決しない）');

  const injected = resolveCourseLayout({ place: '函館', trackType: '芝', distance: 1200 });
  const SENTINEL = 613.7; // formation.end(≈574.8) < SENTINEL < corner.end(≈938) の有効値
  injected.boundaries.pace.end = SENTINEL;

  const db = makeMockDb(makeHorses('芝', 1200));
  const result = await runRaceSimulation(db as never, {
    year: '2024', date: '0101', place: '函館', raceNumber: '11', distance: 1200,
    resolvedCourse: injected,
  });

  const paceLeader = leaderDistance(result.phases.pace.horses);
  check('注入 pace.end(sentinel=613.7) がそのまま使われる（再解決していない）',
    Math.abs(paceLeader - SENTINEL) < 0.5, `paceLeader=${paceLeader}`);
  check('注入時も goal 到達', Math.abs(leaderDistance(result.phases.goal.horses) - 1200) < 1e-6);
  check('注入時も raceDistance=1200', result.raceDistance === 1200);
}

// ===================================
// C. 旧経路削除（静的チェック）
// ===================================
function testLegacyRemoved() {
  console.log('\n[C] 旧経路削除（orchestrator ソース静的チェック）');
  const src = readFileSync(join(process.cwd(), 'lib/race-simulator/simulation-orchestrator.ts'), 'utf-8');

  check('getCourseInfo( の直呼びが無い', !/getCourseInfo\s*\(/.test(src));
  check('normalizeTrackType( の直呼びが無い', !/normalizeTrackType\s*\(/.test(src));
  check('buildPhaseBoundaries( の直呼びが無い', !/buildPhaseBoundaries\s*\(/.test(src));
  check("course-database import が無い", !/from '\.\/course-database'/.test(src));
  check("phase-boundaries import が無い", !/from '\.\/phase-boundaries'/.test(src));
  const calls = (src.match(/resolveCourseLayout\s*\(/g) || []).length;
  check('resolveCourseLayout 呼び出しはちょうど 1 箇所', calls === 1, `count=${calls}`);
  check('input.resolvedCourse ?? でガードされている', /input\.resolvedCourse\s*\r?\n?\s*\?\?/.test(src) || /input\.resolvedCourse\s*\?\?/.test(src));
}

// ===================================
// D. 新潟芝1000（直線競走）
// ===================================
async function testStraightCourse() {
  console.log('\n[D] 新潟芝1000（CourseBoundariesError 伝播）');
  const db = makeMockDb(makeHorses('芝', 1000));
  try {
    await runRaceSimulation(db as never, {
      year: '2024', date: '0101', place: '新潟', raceNumber: '11', distance: 1000,
    });
    check('新潟芝1000 でエラー', false, 'エラーが発生しなかった');
  } catch (e) {
    check('新潟芝1000 は CourseBoundariesError（偽コーナー/generic 変換なし）',
      e instanceof CourseBoundariesError, (e as Error).message);
  }
}

async function main() {
  console.log('======================================================');
  console.log(' Step 3 orchestrator ↔ CourseResolver テスト');
  console.log('======================================================');

  await testInternalResolve();
  await testInjected();
  testLegacyRemoved();
  await testStraightCourse();

  console.log('\n======================================================');
  console.log(` 結果: 成功 ${passCount}件 / 失敗 ${failCount}件`);
  console.log('======================================================');

  if (failCount > 0) process.exitCode = 1;
}

void main();
