/**
 * Visual Lab 馬モデルビルダー（3案）
 *
 * - cel     : Broadcast Cel（トゥーン + 輪郭線、明瞭なシルエット、騎手あり）
 * - semi    : Semi-Realistic（PBR風 StandardMaterial、関節脚、たてがみ・尾・騎手）
 * - dataviz : Premium Data Visualization（簡略シルエット + 枠色リング + 大きな番号）
 *
 * 外部リグ付き glTF は「候補」として loadGltfHorse フックを用意するが、
 * ライセンス未確認の資産はコミットしないため、既定は全案 procedural。
 * public/models/horse.glb を置けば semi 案で読み込める設計（任意）。
 *
 * 返り値 HorseModel:
 *  - group : シーンに add する Object3D
 *  - gait(t): 脚・首・体の運動（t は秒。speed=0 のとき呼ばれても静止）
 *  - dispose(): geometry/material/texture を確実に解放
 */
import * as THREE from 'three';
import { WAKU_HEX } from './fixtures';

export interface HorseModel {
  group: THREE.Group;
  gait: (t: number, speed: number) => void;
  dispose: () => void;
}

interface BuildOpts {
  waku: number; // 1..8
  horseNumber: number;
  selected?: boolean;
}

// ---- 破棄トラッキング -------------------------------------------------------
class Disposer {
  private geos = new Set<THREE.BufferGeometry>();
  private mats = new Set<THREE.Material>();
  private texs = new Set<THREE.Texture>();
  geo<T extends THREE.BufferGeometry>(g: T): T { this.geos.add(g); return g; }
  mat<T extends THREE.Material>(m: T): T { this.mats.add(m); return m; }
  tex<T extends THREE.Texture>(t: T): T { this.texs.add(t); return t; }
  dispose() {
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    this.texs.forEach((t) => t.dispose());
    this.geos.clear(); this.mats.clear(); this.texs.clear();
  }
}

// トゥーン用グラデーションマップ（3段）
function toonGradient(d: Disposer): THREE.Texture {
  const data = new Uint8Array([80, 80, 80, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return d.tex(tex);
}

/** 番号スプライト（頭上）。CanvasTexture。返り値の dispose は Disposer 側で。 */
function numberSprite(d: Disposer, num: number, bg: string, fg: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg; roundRect(ctx, 8, 8, 112, 112, 22); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 64, 70);
  const tex = d.tex(new THREE.CanvasTexture(canvas));
  const mat = d.mat(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const s = new THREE.Sprite(mat);
  return s;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- 関節馬（cel / semi 共用の骨格）----------------------------------------
interface RiggedParts {
  legs: THREE.Group[]; // [LF, RF, LH, RH]
  neck: THREE.Group;
  bodyBob: THREE.Group; // 上下動させる親
}

function buildRigged(
  root: THREE.Group,
  d: Disposer,
  makeMat: (hex: number, role: 'body' | 'leg' | 'head' | 'mane' | 'silk' | 'skin') => THREE.Material,
  opts: BuildOpts,
  outline: boolean,
): RiggedParts {
  const silk = WAKU_HEX[(opts.waku - 1) % 8];

  const bodyBob = new THREE.Group();
  root.add(bodyBob);

  const addOutline = (mesh: THREE.Mesh) => {
    if (!outline) return;
    const om = new THREE.Mesh(
      mesh.geometry,
      d.mat(new THREE.MeshBasicMaterial({ color: 0x111417, side: THREE.BackSide })),
    );
    om.scale.setScalar(1.08);
    mesh.add(om);
  };

  const horseHex = 0x6b4a34; // 鹿毛
  // 胴体
  const bodyGeo = d.geo(new THREE.CapsuleGeometry(0.55, 1.5, 6, 14));
  const body = new THREE.Mesh(bodyGeo, makeMat(horseHex, 'body'));
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 1.25, 0);
  body.castShadow = true;
  addOutline(body);
  bodyBob.add(body);

  // 尻
  const rumpGeo = d.geo(new THREE.SphereGeometry(0.6, 14, 12));
  const rump = new THREE.Mesh(rumpGeo, makeMat(horseHex, 'body'));
  rump.position.set(-0.9, 1.25, 0);
  rump.castShadow = true;
  addOutline(rump);
  bodyBob.add(rump);

  // 首（前方 +Z が heading=0 の進行方向。モデルは +X を前として組み、rootで回す）
  const neck = new THREE.Group();
  neck.position.set(0.85, 1.55, 0);
  bodyBob.add(neck);
  const neckGeo = d.geo(new THREE.CylinderGeometry(0.28, 0.42, 1.0, 12));
  const neckMesh = new THREE.Mesh(neckGeo, makeMat(horseHex, 'body'));
  neckMesh.rotation.z = -Math.PI / 3.2;
  neckMesh.position.set(0.28, 0.35, 0);
  neckMesh.castShadow = true;
  addOutline(neckMesh);
  neck.add(neckMesh);
  // 頭
  const headGeo = d.geo(new THREE.BoxGeometry(0.7, 0.36, 0.34));
  const head = new THREE.Mesh(headGeo, makeMat(horseHex, 'head'));
  head.position.set(0.75, 0.72, 0);
  head.rotation.z = -0.35;
  head.castShadow = true;
  addOutline(head);
  neck.add(head);
  // 耳
  const earGeo = d.geo(new THREE.ConeGeometry(0.07, 0.2, 8));
  for (const dz of [-0.11, 0.11]) {
    const ear = new THREE.Mesh(earGeo, makeMat(horseHex, 'head'));
    ear.position.set(0.62, 0.92, dz);
    neck.add(ear);
  }
  // たてがみ
  const maneGeo = d.geo(new THREE.BoxGeometry(0.12, 0.9, 0.24));
  const mane = new THREE.Mesh(maneGeo, makeMat(0x2a1c12, 'mane'));
  mane.rotation.z = -Math.PI / 3.2;
  mane.position.set(0.2, 0.4, 0);
  neck.add(mane);

  // 尾
  const tailGeo = d.geo(new THREE.ConeGeometry(0.18, 0.9, 8));
  const tail = new THREE.Mesh(tailGeo, makeMat(0x2a1c12, 'mane'));
  tail.position.set(-1.4, 1.15, 0);
  tail.rotation.z = Math.PI / 2.2;
  bodyBob.add(tail);

  // 脚（4本）: 位置は [前後, 左右]
  const legGeo = d.geo(new THREE.CylinderGeometry(0.11, 0.08, 1.1, 8));
  const legDefs: [number, number][] = [
    [0.7, 0.32],   // LF
    [0.7, -0.32],  // RF
    [-0.7, 0.32],  // LH
    [-0.7, -0.32], // RH
  ];
  const legs: THREE.Group[] = [];
  for (const [lx, lz] of legDefs) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 1.15, lz);
    const legMesh = new THREE.Mesh(legGeo, makeMat(horseHex, 'leg'));
    legMesh.position.set(0, -0.55, 0);
    legMesh.castShadow = true;
    addOutline(legMesh);
    // 蹄
    const hoofGeo = d.geo(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 8));
    const hoof = new THREE.Mesh(hoofGeo, makeMat(0x1a1a1a, 'leg'));
    hoof.position.set(0, -1.08, 0);
    pivot.add(hoof);
    pivot.add(legMesh);
    bodyBob.add(pivot);
    legs.push(pivot);
  }

  // 騎手（帽色=枠色）
  const jockey = new THREE.Group();
  jockey.position.set(-0.25, 1.95, 0);
  const torsoGeo = d.geo(new THREE.CapsuleGeometry(0.26, 0.42, 4, 8));
  const torso = new THREE.Mesh(torsoGeo, makeMat(silk, 'silk'));
  torso.rotation.x = 0.5;
  torso.castShadow = true;
  addOutline(torso);
  jockey.add(torso);
  const helmetGeo = d.geo(new THREE.SphereGeometry(0.2, 12, 10));
  const helmet = new THREE.Mesh(helmetGeo, makeMat(silk, 'silk'));
  helmet.position.set(0.18, 0.42, 0);
  jockey.add(helmet);
  // 顔（肌色の面）
  const faceGeo = d.geo(new THREE.SphereGeometry(0.14, 10, 8));
  const face = new THREE.Mesh(faceGeo, makeMat(0xe8c9a8, 'skin'));
  face.position.set(0.32, 0.36, 0);
  jockey.add(face);
  bodyBob.add(jockey);

  return { legs, neck, bodyBob };
}

// ---- 案A: Broadcast Cel ----------------------------------------------------
export function buildCelHorse(opts: BuildOpts): HorseModel {
  const d = new Disposer();
  const group = new THREE.Group();
  const grad = toonGradient(d);
  const cache = new Map<string, THREE.Material>();
  const makeMat = (hex: number, role: string): THREE.Material => {
    const key = role + hex;
    const hit = cache.get(key);
    if (hit) return hit;
    const m = d.mat(new THREE.MeshToonMaterial({ color: hex, gradientMap: grad }));
    cache.set(key, m);
    return m;
  };
  const parts = buildRigged(group, d, makeMat as any, opts, true);
  group.userData.parts = parts;
  return finalize(group, d, parts);
}

// ---- 案B: Semi-Realistic ---------------------------------------------------
export function buildSemiHorse(opts: BuildOpts): HorseModel {
  const d = new Disposer();
  const group = new THREE.Group();
  const cache = new Map<string, THREE.Material>();
  const makeMat = (hex: number, role: string): THREE.Material => {
    const key = role + hex;
    const hit = cache.get(key);
    if (hit) return hit;
    const rough = role === 'silk' ? 0.6 : role === 'leg' ? 0.85 : 0.75;
    const m = d.mat(new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0.0 }));
    cache.set(key, m);
    return m;
  };
  const parts = buildRigged(group, d, makeMat as any, opts, false);
  group.userData.parts = parts;
  return finalize(group, d, parts);
}

// ---- 案C: Premium Data Visualization ---------------------------------------
export function buildDataVizHorse(opts: BuildOpts): HorseModel {
  const d = new Disposer();
  const group = new THREE.Group();
  const silk = WAKU_HEX[(opts.waku - 1) % 8];

  // 進行方向を示すティアドロップ/シェブロン本体（簡略シルエット）
  const bodyGeo = d.geo(new THREE.CapsuleGeometry(0.5, 1.3, 4, 10));
  const bodyMat = d.mat(new THREE.MeshStandardMaterial({ color: 0x30363d, roughness: 0.5, metalness: 0.1 }));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);

  // 先端チップ（前方=+X を指す）
  const noseGeo = d.geo(new THREE.ConeGeometry(0.45, 0.9, 12));
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(1.1, 1.0, 0);
  group.add(nose);

  // 枠色リング（足元、真上から視認しやすい）
  const ringGeo = d.geo(new THREE.TorusGeometry(1.0, 0.16, 10, 28));
  const ringMat = d.mat(new THREE.MeshBasicMaterial({ color: silk }));
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);

  // 枠色の縦フィン（横からも枠色が見える）
  const finGeo = d.geo(new THREE.BoxGeometry(0.7, 0.7, 0.08));
  const finMat = d.mat(new THREE.MeshBasicMaterial({ color: silk }));
  const fin = new THREE.Mesh(finGeo, finMat);
  fin.position.set(-0.3, 1.7, 0);
  group.add(fin);

  const d2 = d;
  return {
    group,
    gait: () => { /* データ可視化案は脚アニメを持たない（意図的に静的） */ },
    dispose: () => d2.dispose(),
  };
}

// ---- 仕上げ（gait 関数を関節馬に付与）--------------------------------------
function finalize(group: THREE.Group, d: Disposer, parts: RiggedParts): HorseModel {
  const gait = (t: number, speed: number) => {
    if (speed <= 0) {
      parts.legs.forEach((l) => (l.rotation.z = 0));
      parts.bodyBob.position.y = 0;
      return;
    }
    const f = t * (3 + speed * 6); // ストライド周波数
    // ギャロップ近似: 前後で位相をずらす
    const phases = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
    parts.legs.forEach((leg, i) => {
      leg.rotation.z = Math.sin(f + phases[i]) * 0.7 * (0.4 + speed);
    });
    parts.bodyBob.position.y = Math.abs(Math.sin(f)) * 0.08 * speed;
    parts.neck.rotation.z = Math.sin(f) * 0.06 * speed;
  };
  return { group, gait, dispose: () => d.dispose() };
}

/**
 * 任意: リグ付き glTF を読み込む（semi案の上位互換候補）。
 * public/models/horse.glb が存在する場合のみ利用。ライセンス未確認資産はコミット禁止。
 * AnimationMixer を返し、呼び出し側で update・dispose する。
 */
export async function loadGltfHorse(url: string): Promise<{
  group: THREE.Group; mixer: THREE.AnimationMixer | null; dispose: () => void;
} | null> {
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const group = new THREE.Group();
    group.add(gltf.scene);
    let mixer: THREE.AnimationMixer | null = null;
    if (gltf.animations && gltf.animations.length) {
      mixer = new THREE.AnimationMixer(gltf.scene);
      mixer.clipAction(gltf.animations[0]).play();
    }
    gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    const dispose = () => {
      mixer?.stopAllAction();
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => disposeMat(x));
        else if (mat) disposeMat(mat);
        const skinned = o as THREE.SkinnedMesh;
        if (skinned.isSkinnedMesh && skinned.skeleton?.boneTexture) skinned.skeleton.boneTexture.dispose();
      });
    };
    return { group, mixer, dispose };
  } catch {
    return null; // 資産が無い/読み込み失敗時は procedural にフォールバック
  }
}

function disposeMat(m: THREE.Material) {
  for (const v of Object.values(m as unknown as Record<string, unknown>)) {
    if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
  }
  m.dispose();
}

export function buildHorse(approach: 'cel' | 'semi' | 'dataviz', opts: BuildOpts): HorseModel {
  if (approach === 'cel') return buildCelHorse(opts);
  if (approach === 'dataviz') return buildDataVizHorse(opts);
  return buildSemiHorse(opts);
}
