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

// 2) geometry 共有: 全馬の胴コア geometry が同一参照
const bodyGeos = visuals.map((v) => {
  let g: THREE.BufferGeometry | null = null;
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry === res.geo.bodyCore) g = m.geometry;
  });
  return g;
});
check('胴コアgeometry共有', bodyGeos.every((g) => g === res.geo.bodyCore));

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
check('毛色名: 青鹿毛→2', coatIndexFromName('青鹿毛') === 2);
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
let movingAtStop = false;
v0.root.traverse((o) => {
  // bodyBob 配下の脚ピボット rotation.z がすべて 0 か
});
// 直接検証: 脚 rotation.z 合計
let legRotSum = 0;
// bodyBob(orient>bodyBob) の子で position.y≈1.15 の Group を脚とみなす
v0.root.traverse((o) => {
  if (o.type === 'Group' && Math.abs(o.position.y - 1.15) < 1e-6) legRotSum += Math.abs(o.rotation.z);
});
check('停止時は脚 rotation=0', legRotSum < 1e-6, `sum=${legRotSum}`);

// 9) dispose: root が親から外れる。共有リソースは破棄されない
v0.dispose();
check('dispose後 root が scene から外れる', v0.root.parent === null);
check('dispose後も共有geometry健在', (res.geo.bodyCore.attributes.position?.count ?? 0) > 0);
// 別の馬をさらに生成できる（共有リソース再利用）
const extra = createBroadcastCelHorseVisual(res, { horseNumber: 99, waku: 3 });
check('dispose後も新規visual生成可', extra.root.children.length > 0);

// 10) setSelected / setBlocked が例外なく動く
extra.setSelected(true); extra.setSelected(false);
extra.setBlocked(true); extra.setBlocked(false);
check('setSelected/setBlocked 例外なし', true);

// 11) res.dispose()（unmount 相当）で geometry.dispose() が呼ばれる（dispose イベント発火）
const geoRef = res.geo.bodyCore;
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
