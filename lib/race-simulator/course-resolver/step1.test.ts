/**
 * CourseResolver Step 1 単体テスト
 *
 * 実行方法:
 *   npx tsx lib/race-simulator/course-resolver/step1.test.ts
 *
 * 検証内容:
 *   - trackType 正規化: 芝 / ダート / ダ / turf / dirt
 *   - place 正規化: 東京競馬場 → 東京 / 未知 place は変換しない
 *   - 空 place はエラー
 *   - 未知 trackType はエラー
 *   - distance: 0 / 負数 / NaN / Infinity はエラー
 *   - 未登録だが有効な入力は generic 生成可能
 *   - generic から有効な CourseInfo を合成可能
 *   - buildPhaseBoundaries が generic 入力でも成立可能
 *   - provenance の最弱値判定
 *
 * ※ DB非依存。新規モジュールの実コードを直接検証する。
 */

import {
  normalizePlace,
  normalizeTrackType,
  normalizeDistance,
  normalizeCourseKey,
  CourseInputError,
  CANONICAL_PLACES,
} from './normalize';
import {
  weakestProvenance,
  strongestProvenance,
  overallProvenance,
  PROVENANCE_RANK,
} from './provenance';
import { buildGenericGeometry, buildGenericLayout } from './generic-model';
import { toCourseInfo } from './to-course-info';
import { buildPhaseBoundaries } from '../phase-boundaries';
import type { DataProvenance } from '@/types/course-resolver';

let passCount = 0;
let failCount = 0;

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passCount++;
    console.log(`  ✓ ${label}`);
  } else {
    failCount++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function expectThrow(label: string, fn: () => void, expectType = true) {
  try {
    fn();
    check(label, false, 'エラーが発生しなかった');
  } catch (e) {
    const isInputError = e instanceof CourseInputError;
    check(label, expectType ? isInputError : true, (e as Error).message);
  }
}

// ===================================
// Test 1: trackType 正規化
// ===================================
function testTrackTypeNormalization() {
  console.log('\n[Test 1] trackType 正規化');
  check("normalizeTrackType('芝') === 'turf'", normalizeTrackType('芝') === 'turf');
  check("normalizeTrackType('ダート') === 'dirt'", normalizeTrackType('ダート') === 'dirt');
  check("normalizeTrackType('ダ') === 'dirt'", normalizeTrackType('ダ') === 'dirt');
  check("normalizeTrackType('turf') === 'turf'", normalizeTrackType('turf') === 'turf');
  check("normalizeTrackType('dirt') === 'dirt'", normalizeTrackType('dirt') === 'dirt');
  check("normalizeTrackType(' 芝 ') === 'turf'（trim）", normalizeTrackType(' 芝 ') === 'turf');
  expectThrow("未知 trackType 'foo' はエラー", () => normalizeTrackType('foo'));
  expectThrow('trackType null はエラー', () => normalizeTrackType(null));
}

// ===================================
// Test 2: place 正規化
// ===================================
function testPlaceNormalization() {
  console.log('\n[Test 2] place 正規化');
  check('東京競馬場 → 東京', normalizePlace('東京競馬場').place === '東京');
  check('東京競馬場 は recognized=true', normalizePlace('東京競馬場').recognized === true);
  check('東京 → 東京', normalizePlace('東京').place === '東京');
  check('東京 は recognized=true', normalizePlace('東京').recognized === true);
  check(' 中山  → 中山（trim）', normalizePlace(' 中山 ').place === '中山');

  // 未知 place は変換しない・recognized=false
  const unknown = normalizePlace('架空競馬場X');
  check('未知 place はそのまま返す', unknown.place === '架空競馬場X');
  check('未知 place は recognized=false', unknown.recognized === false);

  // 全正式名が recognized=true
  const allRecognized = CANONICAL_PLACES.every(p => normalizePlace(p).recognized === true);
  check('全正式名が recognized=true', allRecognized);

  expectThrow("空 place '' はエラー", () => normalizePlace(''));
  expectThrow("空白のみ place '   ' はエラー", () => normalizePlace('   '));
  expectThrow('place null はエラー', () => normalizePlace(null));
}

// ===================================
// Test 3: distance 正規化・検証
// ===================================
function testDistanceNormalization() {
  console.log('\n[Test 3] distance 正規化・検証');
  check('1200 → 1200', normalizeDistance(1200) === 1200);
  check("'1400' → 1400", normalizeDistance('1400') === 1400);
  check("'1200m' → 1200", normalizeDistance('1200m') === 1200);
  check("'芝1600' → 1600", normalizeDistance('芝1600') === 1600);

  expectThrow('distance 0 はエラー', () => normalizeDistance(0));
  expectThrow('distance 負数 はエラー', () => normalizeDistance(-100));
  expectThrow('distance NaN はエラー', () => normalizeDistance(NaN));
  expectThrow('distance Infinity はエラー', () => normalizeDistance(Infinity));
  expectThrow('distance -Infinity はエラー', () => normalizeDistance(-Infinity));
  expectThrow("distance '' はエラー（数値抽出不可）", () => normalizeDistance(''));
  expectThrow("distance 'abc' はエラー（数値抽出不可）", () => normalizeDistance('abc'));
}

// ===================================
// Test 4: normalizeCourseKey（統合）
// ===================================
function testNormalizeCourseKey() {
  console.log('\n[Test 4] normalizeCourseKey（統合）');
  const key = normalizeCourseKey({ place: '東京競馬場', trackType: '芝', distance: '2000m' });
  check('place 正規化', key.place === '東京');
  check('trackType 正規化', key.trackType === 'turf');
  check('distance 正規化', key.distance === 2000);
  check('placeRecognized=true', key.placeRecognized === true);

  const unregistered = normalizeCourseKey({ place: '架空X', trackType: 'ダ', distance: 1234 });
  check('未登録 place でも例外にならない', unregistered.place === '架空X');
  check('未登録 place は placeRecognized=false', unregistered.placeRecognized === false);
  check('未登録でも trackType 正規化される', unregistered.trackType === 'dirt');

  expectThrow('空 place を含む入力はエラー', () =>
    normalizeCourseKey({ place: '', trackType: '芝', distance: 1200 })
  );
  expectThrow('不正 trackType を含む入力はエラー', () =>
    normalizeCourseKey({ place: '東京', trackType: 'x', distance: 1200 })
  );
  expectThrow('不正 distance を含む入力はエラー', () =>
    normalizeCourseKey({ place: '東京', trackType: '芝', distance: -1 })
  );
}

// ===================================
// Test 5: provenance 最弱値判定
// ===================================
function testProvenance() {
  console.log('\n[Test 5] provenance 判定');
  check('rank: verified > derived > generic',
    PROVENANCE_RANK.verified > PROVENANCE_RANK.derived &&
    PROVENANCE_RANK.derived > PROVENANCE_RANK.generic);

  check("weakest([verified,derived,generic]) === 'generic'",
    weakestProvenance(['verified', 'derived', 'generic']) === 'generic');
  check("weakest([verified,verified]) === 'verified'",
    weakestProvenance(['verified', 'verified']) === 'verified');
  check("weakest([verified,derived]) === 'derived'",
    weakestProvenance(['verified', 'derived']) === 'derived');
  check("weakest([]) === 'generic'（空は安全側）",
    weakestProvenance([]) === 'generic');

  check("strongest([generic,derived,verified]) === 'verified'",
    strongestProvenance(['generic', 'derived', 'verified']) === 'verified');

  // 項目別混在 → 最弱代表値
  const geoProv = { direction: 'verified' as DataProvenance, lapDistance: 'generic' as DataProvenance, courseWidth: 'verified' as DataProvenance, elevationRange: 'derived' as DataProvenance };
  const layProv = { startToFirstCorner: 'verified' as DataProvenance, straightLength: 'verified' as DataProvenance, corners: 'derived' as DataProvenance, slopes: 'verified' as DataProvenance, isStraightCourse: 'verified' as DataProvenance };
  check("overall(混在, 最弱=generic) === 'generic'", overallProvenance(geoProv, layProv) === 'generic');

  // corners=derived, 他 verified → derived
  const layProv2 = { ...layProv, corners: 'derived' as DataProvenance };
  const geoProv2 = { direction: 'verified' as DataProvenance, lapDistance: 'verified' as DataProvenance, courseWidth: 'verified' as DataProvenance, elevationRange: 'verified' as DataProvenance };
  check("overall(corners=derived, 他 verified) === 'derived'", overallProvenance(geoProv2, layProv2) === 'derived');
}

// ===================================
// Test 6: generic モデル生成
// ===================================
function testGenericModel() {
  console.log('\n[Test 6] generic モデル生成');
  const geoResult = buildGenericGeometry('架空X', 'turf');
  check('generic geometry: place 保持', geoResult.geometry.place === '架空X');
  check('generic geometry: 全項目 generic',
    Object.values(geoResult.provenance).every(p => p === 'generic'));
  check('generic geometry: lapDistance 未設定（A決め打ちしない）',
    geoResult.geometry.lapDistance === undefined);

  const layResult = buildGenericLayout('架空X', 'turf', 1600);
  check('generic layout: distance 保持', layResult.layout.distance === 1600);
  check('generic layout: straightLength > 0', layResult.layout.straightLength > 0);
  check('generic layout: startToFirstCorner > 0', layResult.layout.startToFirstCorner > 0);
  check('generic layout: corners 2本（3-4角）', layResult.layout.corners.length === 2);
  check('generic layout: 全項目 generic',
    Object.values(layResult.provenance).every(p => p === 'generic'));
}

// ===================================
// Test 7: generic → CourseInfo 合成
// ===================================
function testToCourseInfo() {
  console.log('\n[Test 7] generic → CourseInfo 合成');
  const geo = buildGenericGeometry('架空X', 'dirt').geometry;
  const lay = buildGenericLayout('架空X', 'dirt', 1400).layout;
  const ci = toCourseInfo(geo, lay);

  check('CourseInfo: id 生成', ci.id === '架空X_1400_dirt');
  check('CourseInfo: trackType', ci.trackType === 'dirt');
  check('CourseInfo: straightLength > 0', ci.straightLength > 0);
  check('CourseInfo: startToFirstCorner > 0', ci.startToFirstCorner > 0);
  check('CourseInfo: corners 引き継ぎ', ci.corners.length === 2);
  check('CourseInfo: clockwise は direction 由来（ccw→false）', ci.clockwise === false);
  check('CourseInfo: paceTendency 中立値', ci.paceTendency === 'middle');
  check('CourseInfo: innerAdvantage 中立値', ci.innerAdvantage === 0);

  // cw の場合 clockwise=true
  const geoCw = { ...geo, direction: 'cw' as const };
  const ciCw = toCourseInfo(geoCw, lay);
  check('CourseInfo: cw → clockwise=true', ciCw.clockwise === true);

  // place/trackType 不一致は合成エラー
  try {
    toCourseInfo(geo, { ...lay, place: '別' });
    check('place 不一致はエラー', false, 'エラーが発生しなかった');
  } catch {
    check('place 不一致はエラー', true);
  }
}

// ===================================
// Test 8: buildPhaseBoundaries が generic でも成立
// ===================================
function testGenericBoundaries() {
  console.log('\n[Test 8] buildPhaseBoundaries × generic');
  const distances = [1000, 1150, 1200, 1400, 1600, 1800, 2000, 2400, 3200];
  for (const d of distances) {
    const geo = buildGenericGeometry('架空X', 'turf').geometry;
    const lay = buildGenericLayout('架空X', 'turf', d).layout;
    const ci = toCourseInfo(geo, lay);
    try {
      const b = buildPhaseBoundaries(d, ci);
      const ok =
        Math.abs(b.start.start) < 1e-6 &&
        b.formation.start > b.start.start &&
        b.pace.start > b.formation.start &&
        b.corner.start > b.pace.start &&
        b.corner.start <= b.straight.start + 1e-6 &&
        b.straight.start > b.corner.start - 1e-6 &&
        Math.abs(b.goal.end - d) < 1e-6;
      check(`generic ${d}m: buildPhaseBoundaries 成立 & goal.end===距離`, ok,
        `goal.end=${b.goal.end}`);
    } catch (e) {
      check(`generic ${d}m: buildPhaseBoundaries 成立`, false, (e as Error).message);
    }
  }
}

function main() {
  console.log('======================================================');
  console.log(' CourseResolver Step 1 単体テスト');
  console.log('======================================================');

  testTrackTypeNormalization();
  testPlaceNormalization();
  testDistanceNormalization();
  testNormalizeCourseKey();
  testProvenance();
  testGenericModel();
  testToCourseInfo();
  testGenericBoundaries();

  console.log('\n======================================================');
  console.log(` 結果: 成功 ${passCount}件 / 失敗 ${failCount}件`);
  console.log('======================================================');

  if (failCount > 0) process.exitCode = 1;
}

main();
