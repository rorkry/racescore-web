/**
 * broadcast-cel-horse テスト
 * 実行: npx tsx lib/race-simulator/broadcast-cel-horse.test.ts
 *
 * 検証:
 *  - geometry / material / toon gradient / texture が全馬で共有される（インスタンスごとに増えない）
 *  - update() が root の position / rotation を変更しない（アニメは子だけ動かす）
 *  - 停止時（speed=0）は脚が動かない
 *  - dispose 後に root が親から外れる。共有リソースは破棄されない（複数回作成しても再利用）
 *  - HorseVisual 数 == 出走頭数
 *  - 毛色が単一固定でなく複数使われる（決定的割当）
 *  - res.dispose() 後に geometry が破棄される（unmount 相当）
 *  - Visual Lab A 準拠: 騎手は 胴(torso) / 帽(helmet) / 顔(face) の独立メッシュ
 */
import * as THREE from 'three';
import {
  createHorseVisualResources,
  createBroadcastCelHorseVisual,
  coatIndexFor,
  coatIndexFromName,
  COAT_PALETTE,
} from './broadcast-cel-horse';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}

console.log('=== broadcast-cel-horse ===');

const res = createHorseVisualResources();
const scene = new THREE.Group();

// 14 頭生成
const N = 14;
const visuals = Array.from({ length: N }, (_, i) =>
  createBroadcastCelHorseVisual(res, { horseNumber: i + 1, waku: Math.min(8, Math.floor(i / 2) + 1) }),
);
for (const v of visuals) scene.add(v.root);

// 1) HorseVisual 数 == 頭数
check('visual数==頭数', visuals.length === N, `${visuals.length}`);
check('scene children==頭数', scene.children.length === N, `${scene.children.length}`);

// 2) geometry 共有: 全馬の胴 geometry が同一参照
const bodyGeos = visuals.map((v) => {
  let g: THREE.BufferGeometry | null = null;
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry === res.geo.body) g = m.geometry;
  });
  return g;
});
check('胴geometry共有', bodyGeos.every((g) => g === res.geo.body));

// 3) material キャッシュ: 同一 waku の silk material は同一参照
function findSilk(v: (typeof visuals)[number]): THREE.Material | null {
  let mat: THREE.Material | null = null;
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && res.silkMats && Array.from(res.silkMats.values()).includes(m.material as THREE.MeshToonMaterial)) {
      mat = m.material as THREE.Material;
    }
  });
  return mat;
}
// waku は Math.floor(i/2)+1 → 1,1,2,2,3,3... 馬1と馬2は同枠
const silk1 = findSilk(visuals[0]);
const silk2 = findSilk(visuals[1]);
const silk3 = findSilk(visuals[2]);
check('同枠のsilk material共有', silk1 !== null && silk1 === silk2, 'horse1/2');
check('別枠のsilk material別物', silk1 !== silk3, 'horse1 vs horse3');
check('silkMats数<=8', res.silkMats.size <= 8, `${res.silkMats.size}`);

// 4) 毛色は複数使われる（単一固定でない）
const coatSet = new Set(Array.from({ length: N }, (_, i) => coatIndexFor(i + 1)));
check('毛色パレットが複数使われる', coatSet.size >= 2, `used=${coatSet.size}`);
check('coatMats数<=パレット数', res.coatMats.size <= COAT_PALETTE.length, `${res.coatMats.size}`);

// 5) 実データ毛色名の優先
check('毛色名: 鹿毛→0', coatIndexFromName('鹿毛') === 0);
check('毛色名: 青鹿毛→1', coatIndexFromName('青鹿毛') === 1);
check('毛色名: 芦毛→4', coatIndexFromName('芦毛') === 4);
check('毛色名: 未知→-1', coatIndexFromName('未知色') === -1);

// 6) update() は root の position / rotation を変えない（本番が設定する world pose を尊重）
const v0 = visuals[0];
v0.root.position.set(12.3, 4.5, -6.7);
v0.root.rotation.y = 1.234;
v0.root.updateMatrixWorld(true);
const posBefore = v0.root.position.clone();
const rotBefore = v0.root.rotation.y;
for (let t = 0; t < 30; t++) v0.update(t * 0.016, 0.8, 0.1);
check('update後 root.position不変', v0.root.position.equals(posBefore), v0.root.position.toArray().join(','));
check('update後 root.rotation.y不変', v0.root.rotation.y === rotBefore, `${v0.root.rotation.y}`);

// 7) update() が子（脚）を動かす（アニメ有効・speed>0）
const legPivot = (() => {
  // orient>bodyBob 配下の脚ピボット（rotation.z が動くもの）
  let found: THREE.Object3D | null = null;
  v0.root.traverse((o) => { if (found === null && o.type === 'Group' && Math.abs(o.rotation.z) > 1e-4) found = o; });
  return found as THREE.Object3D | null;
})();
check('speed>0で脚が動く', legPivot !== null);

// 8) 停止時（speed=0）は脚が動かない
v0.update(1.0, 0, 0);
let legRotSum = 0;
// bodyBob(orient>bodyBob) の子で position.y≈1.15 の Group を脚とみなす
v0.root.traverse((o) => {
  if (o.type === 'Group' && Math.abs(o.position.y - 1.15) < 1e-6) legRotSum += Math.abs(o.rotation.z);
});
check('停止時は脚 rotation=0', legRotSum < 1e-6, `sum=${legRotSum}`);

// 8.5) 騎手（rider）が独立メッシュ（胴/帽/顔）で全頭に存在し、可視で、馬体上に突出している
function findMeshesByGeo(v: (typeof visuals)[number], geo: THREE.BufferGeometry): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  v.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry === geo) found.push(m); });
  return found;
}
// Visual Lab A 準拠: 胴・帽・顔は別 geometry の独立メッシュ
check('騎手 胴/帽/顔は別 geometry', res.geo.jockeyTorso !== res.geo.helmet && res.geo.helmet !== res.geo.face && res.geo.jockeyTorso !== res.geo.face);
check('全頭に rider torso が存在', visuals.every((v) => findMeshesByGeo(v, res.geo.jockeyTorso).length >= 1));
check('全頭に rider helmet が存在', visuals.every((v) => findMeshesByGeo(v, res.geo.helmet).length >= 1));
check('全頭に rider face が存在', visuals.every((v) => findMeshesByGeo(v, res.geo.face).length >= 1));
// rider 各パーツの材質（胴/帽=枠色 silk・顔=skin）
{
  const jv = visuals[2]; // waku=2
  const torso = findMeshesByGeo(jv, res.geo.jockeyTorso)[0];
  const helmet = findMeshesByGeo(jv, res.geo.helmet)[0];
  const faceM = findMeshesByGeo(jv, res.geo.face)[0];
  const silk = Array.from(res.silkMats.values());
  check('胴 material は silk(枠色)', silk.includes(torso.material as THREE.MeshToonMaterial));
  check('帽 material は silk(枠色)', silk.includes(helmet.material as THREE.MeshToonMaterial));
  check('顔 material は skin', faceM.material === res.mats.skin);
  check('胴/帽 が同一 silk material 共有', torso.material === helmet.material);
}
// rider は root の子孫
{
  const jv = visuals[3];
  const jm = findMeshesByGeo(jv, res.geo.jockeyTorso)[0];
  let isDescendant = false;
  let o: THREE.Object3D | null = jm;
  while (o) { if (o === jv.root) { isDescendant = true; break; } o = o.parent; }
  check('rider が root の子孫', isDescendant);
  const jmat = jm.material as THREE.Material;
  check('rider material visible', jmat.visible === true);
  check('rider material opacity>0', (jmat.opacity ?? 1) > 0);
  const ws = new THREE.Vector3(); jm.getWorldScale(ws);
  check('rider scale>0', ws.x > 0.01 && ws.y > 0.01 && ws.z > 0.01, ws.toArray().join(','));
}
// 騎手が馬体上部へ突出（埋没しきっていない）
{
  const jv = visuals[4];
  jv.root.updateMatrixWorld(true);
  const bodyBox = new THREE.Box3();
  for (const m of findMeshesByGeo(jv, res.geo.body)) bodyBox.expandByObject(m);
  for (const m of findMeshesByGeo(jv, res.geo.rump)) bodyBox.expandByObject(m);
  const riderBox = new THREE.Box3();
  for (const m of findMeshesByGeo(jv, res.geo.jockeyTorso)) riderBox.expandByObject(m);
  for (const m of findMeshesByGeo(jv, res.geo.helmet)) riderBox.expandByObject(m);
  for (const m of findMeshesByGeo(jv, res.geo.face)) riderBox.expandByObject(m);
  check('rider が馬体トップより上に突出', riderBox.max.y > bodyBox.max.y + 0.3,
    `rider.max=${riderBox.max.y.toFixed(2)} body.max=${bodyBox.max.y.toFixed(2)}`);
  const protrude = riderBox.max.y - bodyBox.max.y;
  const riderH = riderBox.max.y - riderBox.min.y;
  check('rider の突出が十分（埋没しすぎない）', protrude / riderH > 0.4, `protrude/H=${(protrude / riderH).toFixed(2)}`);
}
// selected/unselected で騎手が消えない
{
  const jv = visuals[5];
  jv.setSelected(true);
  check('selected でも rider 可視', findMeshesByGeo(jv, res.geo.jockeyTorso)[0].visible === true);
  jv.setSelected(false);
  check('unselected でも rider 可視', findMeshesByGeo(jv, res.geo.jockeyTorso)[0].visible === true);
}

// 9) dispose: root が親から外れる。共有リソースは破棄されない
v0.dispose();
check('dispose後 root が scene から外れる', v0.root.parent === null);
check('dispose後も共有geometry健在', (res.geo.body.attributes.position?.count ?? 0) > 0);
// 別の馬をさらに生成できる（共有リソース再利用）
const extra = createBroadcastCelHorseVisual(res, { horseNumber: 99, waku: 3 });
check('dispose後も新規visual生成可', extra.root.children.length > 0);

// 10) setSelected / setBlocked が例外なく動く
extra.setSelected(true); extra.setSelected(false);
extra.setBlocked(true); extra.setBlocked(false);
check('setSelected/setBlocked 例外なし', true);

// 11) res.dispose()（unmount 相当）で geometry.dispose() が呼ばれる（dispose イベント発火）
const geoRef = res.geo.body;
let geoDisposed = false;
geoRef.addEventListener('dispose', () => { geoDisposed = true; });
let matDisposed = false;
res.mats.outline.addEventListener('dispose', () => { matDisposed = true; });
res.dispose();
check('res.dispose()で disposed フラグ', res.disposed === true);
check('res.dispose()後 geometry.dispose()発火', geoDisposed === true);
check('res.dispose()後 material.dispose()発火', matDisposed === true);
// 二重 dispose 安全
res.dispose();
check('res 二重dispose 安全', true);

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
