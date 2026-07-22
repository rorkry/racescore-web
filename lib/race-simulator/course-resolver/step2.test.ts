/**
 * CourseResolver Step 2 テスト（resolveCourseLayout + registry）
 *
 * 実行方法:
 *   npx tsx lib/race-simulator/course-resolver/step2.test.ts
 *
 * A. 登録済み: 函館芝1200 / 東京ダート1400 / 福島芝1800 / 新潟芝1000
 * B. 未登録 → generic
 * C. 部分登録（geometry のみ / layout のみ）
 * D. 同一性・決定性・不変性・単一 buildPhaseBoundaries・warning 重複なし
 * E. 新潟芝1000（直線競走）と buildPhaseBoundaries の制約
 * F. 既存テストは別途実行
 */

import {
  resolveCourseLayout,
  resolveCourseParts,
  CourseBoundariesError,
  CourseInputError,
} from './index';

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

function hasWarning(warnings: { code: string }[], code: string): boolean {
  return warnings.some((w) => w.code === code);
}

// ===================================
// A. 登録済みケース
// ===================================
function testRegistered() {
  console.log('\n[A] 登録済みケース');

  // --- 函館芝1200 ---
  {
    const r = resolveCourseLayout({ place: '函館', trackType: '芝', distance: 1200 });
    check('函館芝1200: place 正規化', r.place === '函館');
    check('函館芝1200: trackType 正規化', r.trackType === 'turf');
    check('函館芝1200: distance 正規化', r.distance === 1200);
    check('函館芝1200: direction verified & cw', r.geometry.direction === 'cw' && r.geometryProvenance.direction === 'verified');
    check('函館芝1200: straightLength=262 verified', r.layout.straightLength === 262 && r.layoutProvenance.straightLength === 'verified');
    check('函館芝1200: startToFirstCorner=400 verified', r.layout.startToFirstCorner === 400 && r.layoutProvenance.startToFirstCorner === 'verified');
    check('函館芝1200: corners は derived（verified 扱いしない）', r.layoutProvenance.corners === 'derived');
    check('函館芝1200: CourseInfo 生成', r.courseInfo.id === '函館_1200_turf');
    check('函館芝1200: boundaries 生成 & goal.end===1200', Math.abs(r.boundaries.goal.end - 1200) < 1e-6);
    check('函館芝1200: resolutionSource=registry（generic に落ちない）', r.resolutionSource === 'registry');
    check('函館芝1200: 全体 provenance=generic（坂位置不明のため・honest）', r.provenance === 'generic', `provenance=${r.provenance}`);
    check('函館芝1200: warning CORNERS_DERIVED', hasWarning(r.warnings, 'CORNERS_DERIVED'));
    check('函館芝1200: warning SLOPES_MISSING（hasSlope=true）', hasWarning(r.warnings, 'SLOPES_MISSING'));
    check('函館芝1200: GENERIC_MODEL_USED は付かない', !hasWarning(r.warnings, 'GENERIC_MODEL_USED'));
  }

  // --- 東京ダート1400 ---
  {
    const r = resolveCourseLayout({ place: '東京', trackType: 'ダート', distance: 1400 });
    check('東京ダート1400: direction verified & ccw', r.geometry.direction === 'ccw' && r.geometryProvenance.direction === 'verified');
    check('東京ダート1400: straightLength=501 verified', r.layout.straightLength === 501);
    check('東京ダート1400: startToFirstCorner=450 verified', r.layout.startToFirstCorner === 450);
    check('東京ダート1400: slopes verified（平坦）', r.layoutProvenance.slopes === 'verified');
    check('東京ダート1400: 全体 provenance=derived（verified+derived混在）', r.provenance === 'derived', `provenance=${r.provenance}`);
    check('東京ダート1400: resolutionSource=registry', r.resolutionSource === 'registry');
    check('東京ダート1400: boundaries goal.end===1400', Math.abs(r.boundaries.goal.end - 1400) < 1e-6);
    check('東京ダート1400: SLOPES_MISSING は付かない', !hasWarning(r.warnings, 'SLOPES_MISSING'));
  }

  // --- 福島芝1800 ---
  {
    const r = resolveCourseLayout({ place: '福島', trackType: '芝', distance: 1800 });
    check('福島芝1800: direction verified & cw', r.geometry.direction === 'cw');
    check('福島芝1800: straightLength=292 verified', r.layout.straightLength === 292);
    check('福島芝1800: 全体 provenance=derived', r.provenance === 'derived', `provenance=${r.provenance}`);
    check('福島芝1800: resolutionSource=registry', r.resolutionSource === 'registry');
    check('福島芝1800: boundaries goal.end===1800', Math.abs(r.boundaries.goal.end - 1800) < 1e-6);
  }

  // --- 新潟芝1000（parts のみ。boundaries は E で検証）---
  {
    const p = resolveCourseParts({ place: '新潟', trackType: '芝', distance: 1000 });
    check('新潟芝1000: isStraightCourse=true', p.layout.isStraightCourse === true);
    check('新潟芝1000: corners=[]（偽コーナーなし）', p.layout.corners.length === 0);
    check('新潟芝1000: corners provenance verified（直線に不在は公式事実）', p.layoutProvenance.corners === 'verified');
    check('新潟芝1000: resolutionSource=registry', p.resolutionSource === 'registry');
    check('新潟芝1000: 全体 provenance=derived', p.provenance === 'derived', `provenance=${p.provenance}`);
  }
}

// ===================================
// B. 未登録 → generic
// ===================================
function testGeneric() {
  console.log('\n[B] 未登録 → generic');

  // 架空競馬場（未認識 place）
  {
    const r = resolveCourseLayout({ place: '架空競馬場X', trackType: '芝', distance: 1600 });
    check('架空X: resolutionSource=generic', r.resolutionSource === 'generic');
    check('架空X: GENERIC_MODEL_USED 警告', hasWarning(r.warnings, 'GENERIC_MODEL_USED'));
    check('架空X: PLACE_UNRECOGNIZED 警告', hasWarning(r.warnings, 'PLACE_UNRECOGNIZED'));
    check('架空X: 全体 provenance=generic', r.provenance === 'generic');
    check('架空X: boundaries 有効 goal.end===1600', Math.abs(r.boundaries.goal.end - 1600) < 1e-6);
    check('架空X: direction generic', r.geometryProvenance.direction === 'generic');
  }

  // 認識される place だが geometry/layout 未登録距離（中京は geometry 未登録 place）
  {
    const r = resolveCourseLayout({ place: '中京', trackType: '芝', distance: 9999 });
    check('中京9999: resolutionSource=generic', r.resolutionSource === 'generic');
    check('中京9999: GENERIC_MODEL_USED 警告', hasWarning(r.warnings, 'GENERIC_MODEL_USED'));
    check('中京9999: PLACE_UNRECOGNIZED は付かない（正式名）', !hasWarning(r.warnings, 'PLACE_UNRECOGNIZED'));
    check('中京9999: boundaries 有効', Math.abs(r.boundaries.goal.end - 9999) < 1e-6);
  }
}

// ===================================
// B'. 不正入力（generic に落とさずエラー）
// ===================================
function testInvalidInput() {
  console.log("\n[B'] 不正入力はエラー（generic に落とさない）");
  const bad: Array<[string, () => void]> = [
    ['空 place', () => resolveCourseLayout({ place: '', trackType: '芝', distance: 1200 })],
    ['不正 trackType', () => resolveCourseLayout({ place: '東京', trackType: 'x', distance: 1200 })],
    ['distance 0', () => resolveCourseLayout({ place: '東京', trackType: '芝', distance: 0 })],
    ['distance 負', () => resolveCourseLayout({ place: '東京', trackType: '芝', distance: -1 })],
    ['distance NaN', () => resolveCourseLayout({ place: '東京', trackType: '芝', distance: NaN })],
    ['distance Infinity', () => resolveCourseLayout({ place: '東京', trackType: '芝', distance: Infinity })],
    ['distance 解釈不可', () => resolveCourseLayout({ place: '東京', trackType: '芝', distance: 'abc' })],
  ];
  for (const [label, fn] of bad) {
    try {
      fn();
      check(`${label} はエラー`, false, 'エラーが発生しなかった');
    } catch (e) {
      check(`${label} は CourseInputError`, e instanceof CourseInputError, (e as Error).message);
    }
  }
}

// ===================================
// C. 部分登録
// ===================================
function testPartial() {
  console.log('\n[C] 部分登録');

  // geometry のみ登録（函館 turf は geometry 登録済み、距離 9999 は layout 未登録）
  {
    const r = resolveCourseLayout({ place: '函館', trackType: '芝', distance: 9999 });
    check('geometry のみ: resolutionSource=registry-partial', r.resolutionSource === 'registry-partial');
    check('geometry のみ: PARTIAL_REGISTRY_MATCH 警告', hasWarning(r.warnings, 'PARTIAL_REGISTRY_MATCH'));
    check('geometry のみ: direction は登録値 verified', r.geometryProvenance.direction === 'verified' && r.geometry.direction === 'cw');
    check('geometry のみ: layout は generic 補完', r.layoutProvenance.straightLength === 'generic');
    check('geometry のみ: 全体 provenance=generic（最弱）', r.provenance === 'generic');
    check('geometry のみ: boundaries 有効', Math.abs(r.boundaries.goal.end - 9999) < 1e-6);
  }

  // layout のみ登録（中山 turf は geometry 未登録、course-data に 1600 layout あり）
  {
    const r = resolveCourseLayout({ place: '中山', trackType: '芝', distance: 1600 });
    check('layout のみ: resolutionSource=registry-partial', r.resolutionSource === 'registry-partial');
    check('layout のみ: PARTIAL_REGISTRY_MATCH 警告', hasWarning(r.warnings, 'PARTIAL_REGISTRY_MATCH'));
    check('layout のみ: DIRECTION_GENERIC 警告', hasWarning(r.warnings, 'DIRECTION_GENERIC'));
    check('layout のみ: startToFirstCorner は登録値 verified', r.layoutProvenance.startToFirstCorner === 'verified');
    check('layout のみ: direction は generic', r.geometryProvenance.direction === 'generic');
    check('layout のみ: 全体 provenance=generic（最弱）', r.provenance === 'generic');
    check('layout のみ: boundaries 有効', Math.abs(r.boundaries.goal.end - 1600) < 1e-6);
  }
}

// ===================================
// D. 同一性・決定性・不変性
// ===================================
function testDeterminismImmutability() {
  console.log('\n[D] 同一性・決定性・不変性');

  // 決定性: 同じ入力 → 同じ結果
  const a = resolveCourseLayout({ place: '函館', trackType: '芝', distance: 1200 });
  const b = resolveCourseLayout({ place: '函館', trackType: '芝', distance: 1200 });
  check('決定性: 同一入力→同一結果', JSON.stringify(a) === JSON.stringify(b));

  // 別名でも同一結果
  const c = resolveCourseLayout({ place: '函館競馬場', trackType: 'turf', distance: '1200m' });
  check('別名・表記ゆれでも同一結果', JSON.stringify(a) === JSON.stringify(c));

  // 単一 buildPhaseBoundaries: parts に boundaries は無く、layout に boundaries がある
  const parts = resolveCourseParts({ place: '函館', trackType: '芝', distance: 1200 });
  check('parts に boundaries は含まれない', !('boundaries' in parts));
  check('resolveCourseLayout に boundaries が含まれる', 'boundaries' in a);

  // 不変性: 戻り値を変更しても registry / 次の解決に影響しない
  a.layout.startToFirstCorner = 99999;
  a.layout.corners.push({ name: 'X', position: 0, radius: 0, angle: 0 });
  const d = resolveCourseLayout({ place: '函館', trackType: '芝', distance: 1200 });
  check('不変性: 戻り値変更後も registry 不変（startToFirstCorner）', d.layout.startToFirstCorner === 400);
  check('不変性: 戻り値変更後も registry 不変（corners 数）', d.layout.corners.length === 2);

  // warning 重複なし
  const codes = d.warnings.map((w) => w.code);
  check('warning に重複なし', new Set(codes).size === codes.length);
}

// ===================================
// E. 新潟芝1000 と buildPhaseBoundaries の制約
// ===================================
function testStraightCourseConstraint() {
  console.log('\n[E] 新潟芝1000 直線競走の制約');

  // parts は生成できる（isStraightCourse=true, corners=[]）
  const parts = resolveCourseParts({ place: '新潟', trackType: '芝', distance: 1000 });
  check('parts 生成可能', parts.layout.isStraightCourse === true && parts.layout.corners.length === 0);
  check('偽コーナーが無い', parts.layout.corners.length === 0);

  // resolveCourseLayout は境界が成立せず CourseBoundariesError（無理に正常化しない）
  try {
    resolveCourseLayout({ place: '新潟', trackType: '芝', distance: 1000 });
    check('直線競走で CourseBoundariesError', false, 'エラーが発生しなかった');
  } catch (e) {
    check('直線競走で CourseBoundariesError（期待エラー）', e instanceof CourseBoundariesError, (e as Error).message);
    check('CourseInputError ではない（入力は有効）', !(e instanceof CourseInputError));
  }
}

function main() {
  console.log('======================================================');
  console.log(' CourseResolver Step 2 テスト');
  console.log('======================================================');

  testRegistered();
  testGeneric();
  testInvalidInput();
  testPartial();
  testDeterminismImmutability();
  testStraightCourseConstraint();

  console.log('\n======================================================');
  console.log(` 結果: 成功 ${passCount}件 / 失敗 ${failCount}件`);
  console.log('======================================================');

  if (failCount > 0) process.exitCode = 1;
}

main();
