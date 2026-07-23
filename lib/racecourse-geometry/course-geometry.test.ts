/**
 * racecourse-geometry テスト
 * 実行: npx tsx lib/racecourse-geometry/course-geometry.test.ts
 *
 * A. 全ジオメトリの静的検証（NaN/長さ/法線/tangent/seam）
 * B. start/finish 検算（全 startMarker で誤差が許容内）
 * C. open-path（新潟直線1000）の性質
 * D. route-resolver（日本語入力・距離解決）
 * E. sampleRaceProgressPose の連続性・clockwise/ccw
 */

import {
  ALL_GEOMETRIES,
  GEOMETRIES_BY_VENUE,
  VENUE_IDS,
  validateGeometry,
  verifyStartFinish,
  sampleRaceProgressPose,
  resolveRoute,
  samplePathPose,
} from './index';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  \u2713 ${label}`);
  } else {
    fail++;
    console.error(`  \u2717 ${label} ${detail}`);
  }
}

console.log('=== A. 全ジオメトリ静的検証 ===');
for (const g of ALL_GEOMETRIES) {
  const r = validateGeometry(g, { pathLengthTolerance: 5 });
  check(`${g.id}: ok (errors=${r.errors.length})`, r.ok, r.errors.join('; '));
  check(
    `${g.id}: pathLength誤差 ${r.metrics.pathLengthErrorMeters.toFixed(2)}m < 5m`,
    r.metrics.pathLengthErrorMeters < 5,
    `arc=${r.metrics.arcLength.toFixed(1)} declared=${r.metrics.declaredPathLength}`
  );
  check(
    `${g.id}: tangent単位長ずれ ${r.metrics.maxTangentDeviation.toFixed(3)} < 0.05`,
    r.metrics.maxTangentDeviation < 0.05
  );
}

console.log('=== 10場すべて登録 ===');
check(`venue数=10`, GEOMETRIES_BY_VENUE.size === 10, `actual=${GEOMETRIES_BY_VENUE.size}`);
for (const v of VENUE_IDS) {
  const arr = GEOMETRIES_BY_VENUE.get(v) ?? [];
  const hasTurf = arr.some((g) => g.surface === 'turf');
  const hasDirt = arr.some((g) => g.surface === 'dirt');
  check(`${v}: 芝あり`, hasTurf);
  check(`${v}: ダートあり`, hasDirt);
}

console.log('=== 芝とダートは別centerline ===');
for (const v of VENUE_IDS) {
  const arr = GEOMETRIES_BY_VENUE.get(v) ?? [];
  const turf = arr.find((g) => g.surface === 'turf');
  const dirt = arr.find((g) => g.surface === 'dirt');
  if (turf && dirt) {
    const same =
      turf.centerlinePoints.length === dirt.centerlinePoints.length &&
      turf.centerlinePoints.every(
        (p, i) =>
          Math.abs(p.x - dirt.centerlinePoints[i].x) < 1e-6 &&
          Math.abs(p.z - dirt.centerlinePoints[i].z) < 1e-6
      );
    check(`${v}: 芝とダートのcenterlineが異なる`, !same);
  }
}

console.log('=== B. start/finish 検算（全startMarker） ===');
let markerCount = 0;
for (const g of ALL_GEOMETRIES) {
  for (const key of Object.keys(g.startMarkers)) {
    markerCount++;
    const m = g.startMarkers[key];
    const v = verifyStartFinish(g, m);
    check(
      `${g.id}:${key} finish誤差 ${v.finishErrorMeters.toFixed(3)}m < 1m`,
      v.finishErrorMeters < 1,
      JSON.stringify(v)
    );
  }
}
check(`startMarker総数 > 40`, markerCount > 40, `count=${markerCount}`);

console.log('=== raceProgress=0→start, =raceDistance→finish の pose が有限 ===');
for (const g of ALL_GEOMETRIES) {
  const key = Object.keys(g.startMarkers)[0];
  if (!key) continue;
  const m = g.startMarkers[key];
  const p0 = sampleRaceProgressPose(g, m.pathDistance, 0, 0);
  const pF = sampleRaceProgressPose(g, m.pathDistance, m.raceDistance, 0);
  const finite = [p0.position, p0.tangent, pF.position, pF.tangent].every(
    (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
  );
  check(`${g.id}: start/finish pose 有限`, finite);
}

console.log('=== C. open-path（新潟直線1000） ===');
{
  const niigataStraight = ALL_GEOMETRIES.find((g) => g.id === 'niigata:turf:straight');
  check('新潟直線1000 存在', !!niigataStraight);
  if (niigataStraight) {
    check('open-path である', niigataStraight.pathKind === 'open-path');
    check('pathLength≈1000', Math.abs(niigataStraight.pathLength - 1000) < 1);
    const m = niigataStraight.startMarkers['1000'];
    check('1000mマーカーあり', !!m);
    if (m) {
      const v = verifyStartFinish(niigataStraight, m);
      check(`直線 finish誤差 ${v.finishErrorMeters.toFixed(3)} < 0.5`, v.finishErrorMeters < 0.5);
    }
  }
}

console.log('=== D. route-resolver ===');
{
  const r1 = resolveRoute({ venue: '函館', surface: '芝', raceDistance: 1200 });
  check('函館 芝 1200 → hakodate:turf:main', r1?.geometry.id === 'hakodate:turf:main', r1?.geometry.id);

  const r2 = resolveRoute({ venue: '東京', surface: '芝', raceDistance: 2400 });
  check('東京 芝 2400 → tokyo:turf:main', r2?.geometry.id === 'tokyo:turf:main', r2?.geometry.id);

  const r3 = resolveRoute({ venue: '中山', surface: '芝', route: '外', raceDistance: 1600 });
  check('中山 芝 外 1600 → nakayama:turf:outer', r3?.geometry.id === 'nakayama:turf:outer', r3?.geometry.id);

  const r4 = resolveRoute({ venue: '新潟', surface: '芝', route: '直線', raceDistance: 1000 });
  check('新潟 芝 直線 1000 → niigata:turf:straight', r4?.geometry.id === 'niigata:turf:straight', r4?.geometry.id);

  const r5 = resolveRoute({ venue: '函館', surface: 'ダート', raceDistance: 1700 });
  check('函館 ダート 1700 → hakodate:dirt:main', r5?.geometry.id === 'hakodate:dirt:main', r5?.geometry.id);

  const r6 = resolveRoute({ venue: '存在しない', surface: '芝' });
  check('存在しない競馬場 → null', r6 === null);
}

console.log('=== E. sampleRaceProgressPose 連続性 & clockwise/ccw ===');
{
  // clockwise（函館）と ccw（東京）で外向き法線が破綻しないこと
  const hakodate = ALL_GEOMETRIES.find((g) => g.id === 'hakodate:turf:main')!;
  const tokyo = ALL_GEOMETRIES.find((g) => g.id === 'tokyo:turf:main')!;
  for (const g of [hakodate, tokyo]) {
    const key = Object.keys(g.startMarkers)[0];
    const m = g.startMarkers[key];
    let maxJump = 0;
    let prev = sampleRaceProgressPose(g, m.pathDistance, 0, 0).position;
    const steps = 200;
    for (let i = 1; i <= steps; i++) {
      const prog = (m.raceDistance * i) / steps;
      const p = sampleRaceProgressPose(g, m.pathDistance, prog, 0).position;
      const jump = Math.hypot(p.x - prev.x, p.z - prev.z);
      maxJump = Math.max(maxJump, jump);
      prev = p;
    }
    // 1ステップの理論移動量 ~ raceDistance/steps。その3倍以内ならジャンプ無し
    const expected = (m.raceDistance / steps) * 3;
    check(`${g.id}: 連続移動（maxJump ${maxJump.toFixed(1)} < ${expected.toFixed(1)}）`, maxJump < expected);
  }

  // laneOffset 正 = 外側（中心から遠ざかる）
  const g = tokyo;
  const centerPose = samplePathPose(g, g.pathLength * 0.5, 0);
  const outerPose = samplePathPose(g, g.pathLength * 0.5, 10);
  const centroidDistCenter = Math.hypot(centerPose.position.x, centerPose.position.z);
  const centroidDistOuter = Math.hypot(outerPose.position.x, outerPose.position.z);
  check('laneOffset正で外側へ（中心から遠ざかる）', centroidDistOuter > centroidDistCenter);
}

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
