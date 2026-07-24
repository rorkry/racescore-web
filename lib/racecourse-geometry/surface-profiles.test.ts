/**
 * surface-profiles テスト（芝スタートのダート近似表示）
 * 実行: npx tsx lib/racecourse-geometry/surface-profiles.test.ts
 *
 * - 対象8コースに profile が存在
 * - 対象外は geometry.surface へフォールバック
 * - raceProgress=0 で芝 / 境界直前で芝 / 境界直後でダート / 終端でダート
 * - 負数・超過・NaN の安全性
 * - ランダムアクセス（seek相当）で決定論的
 * - direction 非依存 / open-path 回帰なし
 * - 東京ダ1600 の内外差補間（内150m/外180m）
 */

import {
  GEOMETRY_BY_ID,
  getSurfaceProfile,
  hasMixedSurface,
  resolveSurfaceAtRaceProgress,
  type SurfaceSegmentProvenance,
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

/** 対象8コース: [geometryId, raceDistance, 内側芝終端m, provenance分類] */
const TARGETS: Array<[string, number, number, 'official' | 'documented-secondary' | 'estimated']> = [
  ['tokyo:dirt:main', 1600, 150, 'official'],
  ['niigata:dirt:main', 1200, 100, 'documented-secondary'],
  ['chukyo:dirt:main', 1400, 150, 'documented-secondary'],
  ['hanshin:dirt:main', 2000, 80, 'documented-secondary'],
  ['hanshin:dirt:main', 1400, 110, 'estimated'],
  ['fukushima:dirt:main', 1150, 100, 'estimated'],
  ['nakayama:dirt:main', 1200, 130, 'estimated'],
  ['kyoto:dirt:main', 1400, 100, 'estimated'],
];

console.log('=== A. 対象8コースに profile が存在し、区間が整合 ===');
check('対象数=8', TARGETS.length === 8);
for (const [id, dist, turfEnd, prov] of TARGETS) {
  const segs = getSurfaceProfile(id, dist);
  check(`${id}@${dist}: profileあり`, !!segs && segs.length >= 2, `segs=${segs?.length}`);
  if (!segs) continue;
  const turfSeg = segs.find((s) => s.surface === 'turf');
  const dirtSeg = segs.find((s) => s.surface === 'dirt');
  check(`${id}@${dist}: 芝区間 0→${turfEnd}`, !!turfSeg && turfSeg.fromRaceProgress === 0 && turfSeg.toRaceProgress === turfEnd, `actual=${turfSeg?.toRaceProgress}`);
  check(`${id}@${dist}: ダート区間終端=${dist}`, !!dirtSeg && dirtSeg.toRaceProgress === dist, `actual=${dirtSeg?.toRaceProgress}`);
  check(`${id}@${dist}: sourceNote必須`, !!turfSeg && turfSeg.sourceNote.length > 0 && !!dirtSeg && dirtSeg.sourceNote.length > 0);
  check(`${id}@${dist}: provenance=${prov}`, !!turfSeg && turfSeg.provenance === prov, `actual=${turfSeg?.provenance}`);
  check(`${id}@${dist}: hasMixedSurface=true`, hasMixedSurface(id, dist));
}

console.log('=== B. 境界判定（0=芝 / 直前=芝 / 直後=ダート / 終端=ダート）===');
for (const [id, dist, turfEnd] of TARGETS) {
  const geometry = GEOMETRY_BY_ID.get(id)!;
  check(`${id}@${dist}: geometry存在`, !!geometry);
  if (!geometry) continue;
  // 内ラチ側で判定（toRaceProgress が内側の芝終端。東京の内外差はセクションFで別途検証）
  const innerLat = -geometry.trackWidth / 2;
  const at = (p: number) =>
    resolveSurfaceAtRaceProgress({ geometry, raceDistance: dist, raceProgress: p, lateralPosition: innerLat }).surface;
  check(`${id}@${dist}: p=0 は芝`, at(0) === 'turf');
  check(`${id}@${dist}: 境界直前(${turfEnd - 1}) は芝`, at(turfEnd - 1) === 'turf');
  check(`${id}@${dist}: 境界直後(${turfEnd + 1}) はダート`, at(turfEnd + 1) === 'dirt');
  check(`${id}@${dist}: 境界ちょうど(${turfEnd}) はダート`, at(turfEnd) === 'dirt');
  check(`${id}@${dist}: 終端(${dist}) はダート`, at(dist) === 'dirt');
  check(`${id}@${dist}: 中間(${dist / 2}) はダート`, at(dist / 2) === 'dirt');
}

console.log('=== C. 入力の安全性（負数・超過・NaN） ===');
{
  const g = GEOMETRY_BY_ID.get('tokyo:dirt:main')!;
  const r1 = resolveSurfaceAtRaceProgress({ geometry: g, raceDistance: 1600, raceProgress: -50 });
  check('負数→clampして芝(発走)', r1.surface === 'turf');
  const r2 = resolveSurfaceAtRaceProgress({ geometry: g, raceDistance: 1600, raceProgress: 99999 });
  check('超過→clampしてダート(終端)', r2.surface === 'dirt');
  const r3 = resolveSurfaceAtRaceProgress({ geometry: g, raceDistance: 1600, raceProgress: NaN });
  check('NaN→安全に芝(0扱い) & NaNを返さない', r3.surface === 'turf' && !!r3.surface);
  const r4 = resolveSurfaceAtRaceProgress({ geometry: g, raceDistance: 1600, raceProgress: 500, lateralPosition: NaN });
  check('lateral NaN→中央扱いで安全', r4.surface === 'dirt');
}

console.log('=== D. 対象外・open-path はフォールバック ===');
{
  // 東京芝main（mixed profile 無し）→ turf, fromProfile=false
  const turf = GEOMETRY_BY_ID.get('tokyo:turf:main')!;
  const r = resolveSurfaceAtRaceProgress({ geometry: turf, raceDistance: 1600, raceProgress: 10 });
  check('東京芝: profile無し→turf(fromProfile=false)', r.surface === 'turf' && r.fromProfile === false);

  // ダートだが profile 未登録の距離（東京ダ1400）→ dirt, fromProfile=false
  const dirt = GEOMETRY_BY_ID.get('tokyo:dirt:main')!;
  const r2 = resolveSurfaceAtRaceProgress({ geometry: dirt, raceDistance: 1400, raceProgress: 10 });
  check('東京ダ1400(未登録距離): dirt(fromProfile=false)', r2.surface === 'dirt' && r2.fromProfile === false);

  // 新潟芝直線1000（open-path）→ turf、profile無しで回帰なし
  const straight = GEOMETRY_BY_ID.get('niigata:turf:straight')!;
  check('新潟直線1000 geometry存在', !!straight);
  if (straight) {
    const r3 = resolveSurfaceAtRaceProgress({ geometry: straight, raceDistance: 1000, raceProgress: 10 });
    check('新潟直線: turf(fromProfile=false)', r3.surface === 'turf' && r3.fromProfile === false);
    check('新潟直線: hasMixedSurface=false', !hasMixedSurface('niigata:turf:straight', 1000));
  }
}

console.log('=== E. 決定論（seek相当のランダムアクセスで同一結果） ===');
{
  const g = GEOMETRY_BY_ID.get('tokyo:dirt:main')!;
  const points = [0, 37, 149, 150, 151, 300, 800, 1599, 1600];
  const forward = points.map((p) => resolveSurfaceAtRaceProgress({ geometry: g, raceDistance: 1600, raceProgress: p }).surface);
  const backward = [...points].reverse().map((p) => resolveSurfaceAtRaceProgress({ geometry: g, raceDistance: 1600, raceProgress: p }).surface).reverse();
  check('順アクセスと逆アクセスで一致（順序非依存）', JSON.stringify(forward) === JSON.stringify(backward));
  // 同一入力を2回で同じ
  const a = resolveSurfaceAtRaceProgress({ geometry: g, raceDistance: 1600, raceProgress: 165, lateralPosition: 5 });
  const b = resolveSurfaceAtRaceProgress({ geometry: g, raceDistance: 1600, raceProgress: 165, lateralPosition: 5 });
  check('同一入力は決定論的に同一', a.surface === b.surface && a.fromProfile === b.fromProfile);
}

console.log('=== F. 東京ダ1600 内外差補間（内150m/外180m） ===');
{
  const g = GEOMETRY_BY_ID.get('tokyo:dirt:main')!;
  const half = g.trackWidth / 2;
  const inner = -half; // 内ラチ側
  const outer = half; // 外ラチ側
  const at = (p: number, lat: number) => resolveSurfaceAtRaceProgress({ geometry: g, raceDistance: 1600, raceProgress: p, lateralPosition: lat }).surface;
  // 165m地点: 内はダート(150で終わる), 外は芝(180まで)
  check('165m 内ラチ→ダート', at(165, inner) === 'dirt');
  check('165m 外ラチ→芝', at(165, outer) === 'turf');
  // 149m: 内外とも芝
  check('149m 内ラチ→芝', at(149, inner) === 'turf');
  check('149m 外ラチ→芝', at(149, outer) === 'turf');
  // 181m: 内外ともダート
  check('181m 内ラチ→ダート', at(181, inner) === 'dirt');
  check('181m 外ラチ→ダート', at(181, outer) === 'dirt');
  // lateral 範囲外を clamp（内側を大きく超えても内=150扱い、外側超過も外=180扱い）
  check('lateral範囲外(内側超過)→内扱いでダート(165)', at(165, inner * 10) === 'dirt');
  check('lateral範囲外(外側超過)→外扱いで芝(165)', at(165, outer * 10) === 'turf');
  // 中央(lateral省略=中央)は165mで境界付近（中央終端=165）→ ちょうど165はダート、164は芝
  check('中央 164m→芝', at(164, 0) === 'turf');
  check('中央 166m→ダート', at(166, 0) === 'dirt');
}

console.log('=== G. provenance 分類の内訳（official/二次/estimated） ===');
{
  const estimated = TARGETS.filter(([, , , p]) => p === 'estimated').length;
  const official = TARGETS.filter(([, , , p]) => p === 'official').length;
  const secondary = TARGETS.filter(([, , , p]) => p === 'documented-secondary').length;
  check('estimated=4', estimated === 4, `actual=${estimated}`);
  check('official=1(東京ダ1600)', official === 1, `actual=${official}`);
  check('documented-secondary=3', secondary === 3, `actual=${secondary}`);
}

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
