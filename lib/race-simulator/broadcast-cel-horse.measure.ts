/**
 * broadcast-cel-horse 計測（描画コストの解析プロキシ / bounding box）
 * 実行: npx tsx lib/race-simulator/broadcast-cel-horse.measure.ts
 *
 * 注意: 実機 WebGL の renderer.info.render.calls は GPU 実行時の値であり、本環境(node)では取れない。
 *       ここでは「シーングラフ上の描画対象数(Mesh/Sprite/Line/Instanced=各1)」を draw call の
 *       解析プロキシとして数える。傾向比較には十分で、実測は実機 Visual HUD で行う前提。
 */
import * as THREE from 'three';
import { createHorseVisualResources, createBroadcastCelHorseVisual } from './broadcast-cel-horse';

interface Counts { drawProxy: number; triangles: number; geometries: number; materials: number; textures: number; }

function countScene(scene: THREE.Object3D): Counts {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const texs = new Set<THREE.Texture>();
  let drawProxy = 0;
  let triangles = 0;
  scene.traverse((o) => {
    const anyO = o as any;
    if (anyO.isMesh || anyO.isSprite || anyO.isLine || anyO.isInstancedMesh) {
      if (o.visible) drawProxy += anyO.isInstancedMesh ? 1 : 1;
    }
    if (anyO.isMesh) {
      const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry;
      if (g) {
        geos.add(g);
        const idx = g.getIndex();
        const triCount = idx ? idx.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
        if (o.visible) triangles += triCount;
      }
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((x) => mats.add(x)); else if (m) mats.add(m);
    }
    if (anyO.isSprite) {
      const m = (o as THREE.Sprite).material;
      if (m) { mats.add(m); if (m.map) texs.add(m.map); }
    }
  });
  mats.forEach((m) => {
    for (const v of Object.values(m as unknown as Record<string, unknown>)) {
      if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture);
    }
  });
  return { drawProxy, triangles: Math.round(triangles), geometries: geos.size, materials: mats.size, textures: texs.size };
}

function buildCelScene(n: number) {
  const res = createHorseVisualResources();
  const scene = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const v = createBroadcastCelHorseVisual(res, { horseNumber: i + 1, waku: Math.min(8, Math.floor(i / 2) + 1), selected: i === 4 });
    scene.add(v.root);
  }
  return { scene, res };
}

function buildLegacyScene(n: number) {
  // 旧馬の解析プロキシ: 馬ごとに capsule(1) + sprite(1)。geometry/material/texture は馬ごとに個別。
  const scene = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const geo = new THREE.CapsuleGeometry(0.6, 2.5, 8, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const body = new THREE.Mesh(geo, mat); g.add(body);
    disposables.push(geo, mat);
    // sprite の CanvasTexture は node で作れないため、texture 数は「馬ごとに1」を加算で表現
    const spMat = new THREE.SpriteMaterial();
    const sp = new THREE.Sprite(spMat); g.add(sp);
    disposables.push(spMat);
    scene.add(g);
  }
  return { scene, disposables };
}

console.log('=== Broadcast Cel 描画コスト（解析プロキシ） ===');
console.log('※ 実機 draw calls は Visual HUD で実測する前提。ここは傾向比較用。\n');

console.log('[Broadcast Cel]');
for (const n of [8, 14, 18]) {
  const { scene, res } = buildCelScene(n);
  const c = countScene(scene);
  const perHorse = (c.drawProxy / n).toFixed(1);
  // node ではゼッケン sprite/CanvasTexture は生成されないため、実機の texture 数は +N(番号) を見込む
  console.log(
    `  ${String(n).padStart(2)}頭: drawProxy=${c.drawProxy} (約${perHorse}/頭)  triangles=${c.triangles}  geometries=${c.geometries}  materials=${c.materials}  textures(node)=${c.textures}`,
  );
  res.dispose();
}

console.log('\n[legacy（旧カプセル）参考]');
for (const n of [8, 14, 18]) {
  const { scene, disposables } = buildLegacyScene(n);
  const c = countScene(scene);
  console.log(
    `  ${String(n).padStart(2)}頭: drawProxy=${c.drawProxy} (2.0/頭)  triangles=${c.triangles}  geometries=${c.geometries}  materials=${c.materials}  textures(sprite別)=${n}`,
  );
  for (const d of disposables) d.dispose();
}

// ---- bounding box 比較（見た目サイズ維持の確認）----
console.log('\n=== bounding box（scale=1.8 適用時）===');
const HORSE_VISUAL_SCALE = 1.8;
{
  const res = createHorseVisualResources();
  const v = createBroadcastCelHorseVisual(res, { horseNumber: 1, waku: 3 });
  v.root.scale.setScalar(HORSE_VISUAL_SCALE);
  v.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(v.root);
  const size = new THREE.Vector3(); box.getSize(size);
  console.log(`  Broadcast Cel: 長さ(x)=${size.x.toFixed(2)}  高さ(y)=${size.y.toFixed(2)}  幅(z)=${size.z.toFixed(2)}`);
  res.dispose();
}
{
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 2.5, 8, 16));
  body.rotation.x = Math.PI / 2; g.add(body);
  g.scale.setScalar(HORSE_VISUAL_SCALE);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  const size = new THREE.Vector3(); box.getSize(size);
  console.log(`  legacy capsule: 長さ(z)=${size.z.toFixed(2)}  高さ(y)=${size.y.toFixed(2)}  幅(x)=${size.x.toFixed(2)}`);
}
