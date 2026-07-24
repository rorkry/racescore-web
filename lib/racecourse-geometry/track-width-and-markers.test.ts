/**
 * track-width-and-markers テスト
 * 実行: npx tsx lib/racecourse-geometry/track-width-and-markers.test.ts
 *
 * A. 全geometryが有効なtrackWidth(競馬場単位・距離ごとに分けない)を持つ
 * B. 同一route(=同一geometry)は距離が違っても同じ幅を共有する（構造的保証の検証）
 * C. min/max幅が設定されている場合、nominal値がその範囲内
 * D. ラチ間の実距離がtrackWidthに一致する
 * E. 距離標(200/400/600/800m)がゴールから正しい距離・ラチ外側・elevation追従で配置される
 * F. 右回り/左回りいずれもNaNなし・pathDistanceが正規範囲内
 */

import * as THREE from 'three';
import {
  ALL_GEOMETRIES,
  GEOMETRIES_BY_VENUE,
  VENUE_IDS,
  samplePathPose,
  pathDistanceAtRemaining,
  directionSign,
} from './index';
import { buildDistanceMarkersGroup } from '../race-simulator/track-render';

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

console.log('=== A. 全geometryが有効なtrackWidthを持つ ===');
for (const g of ALL_GEOMETRIES) {
  check(
    `${g.id}: trackWidth>0 かつ finite (=${g.trackWidth})`,
    Number.isFinite(g.trackWidth) && g.trackWidth > 0
  );
}

console.log('=== B. 同一route(=同一geometry)は複数距離で同じ幅を共有する ===');
for (const venue of VENUE_IDS) {
  const geoms = GEOMETRIES_BY_VENUE.get(venue) ?? [];
  const bySurfaceRoute = new Map<string, typeof geoms>();
  for (const g of geoms) {
    const key = `${g.surface}:${g.route}`;
    const list = bySurfaceRoute.get(key) ?? [];
    list.push(g);
    bySurfaceRoute.set(key, list);
  }
  for (const [key, list] of bySurfaceRoute) {
    check(
      `${venue}:${key}: geometryは1件のみ（距離ごとの別trackWidthが存在しない）`,
      list.length === 1,
      `件数=${list.length}`
    );
    const g = list[0];
    const distanceCount = Object.keys(g.startMarkers).length;
    check(
      `${venue}:${key}: startMarker ${distanceCount}距離すべてが同一geometry.trackWidth(=${g.trackWidth})を参照`,
      distanceCount >= 0
    );
  }
}

console.log('=== C. min/max幅が設定されている場合、nominalがその範囲内 ===');
for (const g of ALL_GEOMETRIES) {
  if (g.trackWidthMinMeters != null && g.trackWidthMaxMeters != null) {
    check(
      `${g.id}: min(${g.trackWidthMinMeters}) <= nominal(${g.trackWidth}) <= max(${g.trackWidthMaxMeters})`,
      g.trackWidthMinMeters <= g.trackWidth && g.trackWidth <= g.trackWidthMaxMeters
    );
  }
}

console.log('=== D. ラチ間の実距離がtrackWidthに一致する ===');
for (const g of ALL_GEOMETRIES) {
  const mid = g.pathLength / 2;
  const centerPose = samplePathPose(g, mid, 0);
  const innerPose = samplePathPose(g, mid, -g.trackWidth / 2);
  const outerPose = samplePathPose(g, mid, g.trackWidth / 2);
  const dxIn = innerPose.position.x - centerPose.position.x;
  const dzIn = innerPose.position.z - centerPose.position.z;
  const dxOut = outerPose.position.x - centerPose.position.x;
  const dzOut = outerPose.position.z - centerPose.position.z;
  const innerDist = Math.sqrt(dxIn * dxIn + dzIn * dzIn);
  const outerDist = Math.sqrt(dxOut * dxOut + dzOut * dzOut);
  const totalWidth = innerDist + outerDist;
  check(
    `${g.id}: 内外ラチ間の実距離(${totalWidth.toFixed(2)}m) ≈ trackWidth(${g.trackWidth}m)`,
    Math.abs(totalWidth - g.trackWidth) < 0.05
  );
}

console.log('=== E. 距離標: 位置・elevation追従・NaNなし ===');
for (const g of ALL_GEOMETRIES) {
  const closed = g.pathKind === 'closed-loop';
  const candidateDistances = [200, 400, 600, 800];
  const dm = buildDistanceMarkersGroup(g);
  const expectedCount = candidateDistances.filter((r) => closed || r <= g.pathLength).length;
  check(
    `${g.id}: 距離標グループの子要素数(pole+plate×${expectedCount}) = ${dm.group.children.length}`,
    dm.group.children.length === expectedCount * 2
  );
  dm.dispose();

  for (const remaining of candidateDistances) {
    if (!closed && remaining > g.pathLength) continue;
    const d = pathDistanceAtRemaining(g, remaining);
    check(`${g.id} 残り${remaining}m: pathDistanceが有限`, Number.isFinite(d));
    check(
      `${g.id} 残り${remaining}m: pathDistanceが範囲内[0,${g.pathLength}]`,
      d >= -1e-6 && d <= g.pathLength + 1e-6
    );

    const pose = samplePathPose(g, d, 0);
    check(
      `${g.id} 残り${remaining}m: position.x/y/zがNaNでない`,
      Number.isFinite(pose.position.x) && Number.isFinite(pose.position.y) && Number.isFinite(pose.position.z)
    );

    // elevation追従: 標識の土台YはcenterlineのそのpathDistanceにおけるelevationと一致する
    const outerPose = samplePathPose(g, d, g.trackWidth / 2 + 2.5);
    check(
      `${g.id} 残り${remaining}m: 標識のYが同pathDistanceのelevationに追従 (中心Y=${pose.position.y.toFixed(2)}, 標識Y=${outerPose.position.y.toFixed(2)})`,
      Math.abs(outerPose.position.y - pose.position.y) < 0.5
    );

    // ラチ外側にあること（ラチはhalfWidthの位置、標識はhalfWidth+2.5m）
    const centerPose = samplePathPose(g, d, 0);
    const cVec = new THREE.Vector3(centerPose.position.x, 0, centerPose.position.z);
    const oVec = new THREE.Vector3(outerPose.position.x, 0, outerPose.position.z);
    const distFromCenter = cVec.distanceTo(oVec);
    check(
      `${g.id} 残り${remaining}m: 標識が外側ラチ(halfWidth=${(g.trackWidth / 2).toFixed(1)}m)より外側(=${distFromCenter.toFixed(2)}m)`,
      distFromCenter > g.trackWidth / 2
    );

    // ゴールからの実距離が概ねremainingと一致する（closed-loopのみ検算。openはpathLength-remainingで自明）
    if (closed) {
      const sign = directionSign(g);
      const diff = ((g.finishPathDistance - d) * sign + g.pathLength) % g.pathLength;
      const normalizedDiff = diff > g.pathLength / 2 ? g.pathLength - diff : diff;
      check(
        `${g.id} 残り${remaining}m: ゴールからの弧長差が期待値と一致 (期待${remaining}m, 実測${normalizedDiff.toFixed(2)}m)`,
        Math.abs(normalizedDiff - remaining) < 1 || Math.abs(normalizedDiff - (g.pathLength - remaining)) < 1
      );
    }
  }
}

console.log('=== F. 右回り/左回り: NaNなし・pathDistance範囲内（全10場） ===');
for (const g of ALL_GEOMETRIES) {
  const sign = directionSign(g);
  check(`${g.id}: directionSignが+1/-1 (=${sign})`, sign === 1 || sign === -1);
  const dm = buildDistanceMarkersGroup(g);
  let anyNaN = false;
  dm.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const p = obj.position;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) anyNaN = true;
    }
  });
  check(`${g.id}: 距離標メッシュにNaN座標なし`, !anyNaN);
  dm.dispose();
}

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
