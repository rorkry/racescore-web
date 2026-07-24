/**
 * broadcast-cel-horse（本番 Broadcast Cel 馬ビジュアル / THREE 描画専用）
 *
 * Visual Lab A（Broadcast Cel）の「馬らしいシルエット + セルルック + 騎手 + 識別」を
 * 本番 RaceSimulator3DProto へ安全に統合するための独立モジュール。
 * Visual Lab のコードを単純コピーせず、描画構造を最適化して再設計している。
 *
 * 設計方針（ユーザー承認済み）:
 *  - 共有リソース（geometry / material / toon gradient / 番号texture）は
 *    createHorseVisualResources() で 1 度だけ生成し、renderer/コンポーネント生存中は保持する。
 *    レース切替では各 HorseVisual の root だけを破棄し、共有リソースは破棄しない。
 *  - 毛色は単一固定にせず、少数パレット（鹿毛/黒鹿毛/青鹿毛/栗毛/芦毛）をキャッシュ共有。
 *    割当は horseNumber から決定的（Math.random 不使用）。実データに毛色があればそれを優先。
 *  - draw call 削減: 全馬同一形状のため、胴コア/首頭/騎手/脚 を「マージ済み共有 geometry」にして
 *    1 度だけ生成し全馬で共有する。material は色ごとにキャッシュ（無制限生成しない）。
 *
 * 変更禁止（このモジュールから触れない）:
 *  - raceProgress / lane / velocity / ranking / timeline / course position
 *  - root の world position と heading は本番ロジックが設定する。ここは受け取って反映するだけ。
 *
 * heading 規約: 本番は root.rotation.y = heading（heading = atan2(tangent.x, tangent.z)）で
 *  「ローカル +Z」を進行方向へ向ける。本モデルは鼻先が +X なので、内部の orient グループを
 *  rotation.y = -PI/2 して +X→+Z の固定補正を掛ける（＝A案の「進行方向を向く補正」）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---- 枠色（JRA 8枠: 1白 2黒 3赤 4青 5黄 6緑 7橙 8桃）----
export const WAKU_HEX: number[] = [
  0xf2f2f2, 0x222222, 0xe23b3b, 0x2f6fe0, 0xf2d024, 0x3caf4c, 0xf08a24, 0xf06fae,
];

/** 枠番の文字色（黒/青/緑帽など暗色帽は白文字） */
export function wakuTextColor(waku: number): string {
  return waku === 2 || waku === 4 || waku === 6 ? '#ffffff' : '#111111';
}

/** 枠色を CSS 文字列で（頭上ラベル用） */
export function wakuCssColor(waku: number): string {
  const hex = WAKU_HEX[(Math.max(1, waku) - 1) % 8];
  return `#${hex.toString(16).padStart(6, '0')}`;
}

// ---- 毛色パレット（鹿毛/黒鹿毛/青鹿毛/栗毛/芦毛）----
interface CoatDef { coat: number; mane: number }
export const COAT_PALETTE: CoatDef[] = [
  { coat: 0x6b4a34, mane: 0x2a1c12 }, // 鹿毛(bay)
  { coat: 0x4a3222, mane: 0x1f150d }, // 黒鹿毛(dark bay)
  { coat: 0x2f2620, mane: 0x17120e }, // 青鹿毛(brown-black)
  { coat: 0x9c6238, mane: 0x6b3f1e }, // 栗毛(chestnut)
  { coat: 0xb9b3ad, mane: 0x9a948e }, // 芦毛(gray)
];

/** 実データの毛色名 → パレット index（存在時のみ）。未知は -1。 */
export function coatIndexFromName(name?: string | null): number {
  if (!name) return -1;
  if (name.includes('青鹿')) return 2;
  if (name.includes('黒鹿')) return 1;
  if (name.includes('鹿')) return 0;
  if (name.includes('栗') || name.includes('栃栗')) return 3;
  if (name.includes('芦') || name.includes('葦') || name.includes('白')) return 4;
  return -1;
}

/** horseNumber から決定的に毛色 index を割当（Math.random 不使用・均等分散）。 */
export function coatIndexFor(horseNumber: number): number {
  const h = (horseNumber * 2654435761) >>> 0; // Knuth 乗算ハッシュ
  return h % COAT_PALETTE.length;
}

const SKIN_HEX = 0xe8c9a8;
const OUTLINE_HEX = 0x14171a;
const BLOCKED_HEX = 0xff3b30;

// トゥーンの明暗段（3段）
function makeToonGradient(): THREE.DataTexture {
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// 変換をベイクした geometry を返す（マージ用）
function bake(
  geo: THREE.BufferGeometry,
  pos: [number, number, number],
  euler?: [number, number, number],
): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (euler) q.setFromEuler(new THREE.Euler(euler[0], euler[1], euler[2]));
  m.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), q, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(m);
  return geo;
}

function mergeAndDispose(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('[broadcast-cel-horse] geometry merge に失敗');
  merged.computeVertexNormals();
  return merged;
}

/**
 * 共有リソース（renderer/コンポーネント生存中に 1 度だけ生成し保持）。
 * dispose() は component unmount / renderer 破棄時にだけ呼ぶ。
 */
export interface HorseVisualResources {
  gradientMap: THREE.Texture;
  geo: {
    bodyCore: THREE.BufferGeometry; // 胴 + 尻（マージ済み・全馬共有）
    neckHead: THREE.BufferGeometry; // 首 + 頭 + 耳（マージ済み）
    mane: THREE.BufferGeometry;     // たてがみ
    tail: THREE.BufferGeometry;     // 尾
    leg: THREE.BufferGeometry;      // 脚 + 蹄（マージ済み・4本共有）
    jockey: THREE.BufferGeometry;   // 騎手 胴 + 帽（マージ済み）
    face: THREE.BufferGeometry;     // 騎手 顔
    footRing: THREE.BufferGeometry; // 足元の枠色マーカー
    blob: THREE.BufferGeometry;     // 接地影
    selRing: THREE.BufferGeometry;  // 選択リング
    blocked: THREE.BufferGeometry;  // ブロック時マーカー
    saddle: THREE.BufferGeometry;   // ゼッケン板（sprite 代替の平面）
  };
  mats: {
    outline: THREE.MeshBasicMaterial;
    skin: THREE.MeshToonMaterial;
    blob: THREE.MeshBasicMaterial;
    selRing: THREE.MeshBasicMaterial;
    blocked: THREE.MeshBasicMaterial;
  };
  blobTexture: THREE.Texture;
  // 色ごとのキャッシュ（無制限生成しない）
  coatMats: Map<number, THREE.MeshToonMaterial>;
  maneMats: Map<number, THREE.MeshToonMaterial>;
  silkMats: Map<number, THREE.MeshToonMaterial>;
  footRingMats: Map<number, THREE.MeshBasicMaterial>;
  saddleTextures: Map<number, THREE.Texture>;
  saddleMats: Map<number, THREE.SpriteMaterial>;
  disposed: boolean;
  dispose: () => void;
}

/** 共有リソースを 1 度だけ生成する。 */
export function createHorseVisualResources(): HorseVisualResources {
  const gradientMap = makeToonGradient();

  // ---- 胴コア（胴 + 尻）----
  const bodyCore = mergeAndDispose([
    bake(new THREE.CapsuleGeometry(0.55, 1.5, 6, 14), [0, 1.25, 0], [0, 0, Math.PI / 2]),
    bake(new THREE.SphereGeometry(0.6, 14, 12), [-0.9, 1.25, 0]),
  ]);

  // ---- 首 + 頭 + 耳（neck グループのローカル空間）----
  const neckHead = mergeAndDispose([
    bake(new THREE.CylinderGeometry(0.28, 0.42, 1.0, 12), [0.28, 0.35, 0], [0, 0, -Math.PI / 3.2]),
    bake(new THREE.BoxGeometry(0.7, 0.36, 0.34), [0.75, 0.72, 0], [0, 0, -0.35]),
    bake(new THREE.ConeGeometry(0.07, 0.2, 8), [0.62, 0.92, 0.11]),
    bake(new THREE.ConeGeometry(0.07, 0.2, 8), [0.62, 0.92, -0.11]),
  ]);

  // ---- たてがみ（neck グループのローカル）----
  const mane = bake(new THREE.BoxGeometry(0.12, 0.9, 0.24), [0.2, 0.4, 0], [0, 0, -Math.PI / 3.2]);

  // ---- 尾（tail ピボットのローカル: 原点から後方へ垂れる）----
  const tail = bake(new THREE.ConeGeometry(0.18, 0.9, 8), [0, -0.1, 0], [0, 0, Math.PI / 2.2]);

  // ---- 脚 + 蹄（leg ピボットのローカル）----
  const leg = mergeAndDispose([
    bake(new THREE.CylinderGeometry(0.11, 0.08, 1.1, 8), [0, -0.55, 0]),
    bake(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 8), [0, -1.08, 0]),
  ]);

  // ---- 騎手（胴 + ヘルメット。枠色。遠景でも識別できるよう Visual Lab A 寄りに大型化）----
  // 前傾クラウチング姿勢: 胴を前方(+X=鼻先方向)へ倒し、ヘルメットを前上に置く。
  const jockey = mergeAndDispose([
    bake(new THREE.CapsuleGeometry(0.32, 0.54, 6, 12), [0, 0.16, 0], [0, 0, -0.55]),
    bake(new THREE.SphereGeometry(0.27, 14, 12), [0.34, 0.52, 0]),
  ]);
  // 顔（skin）: ヘルメットの前下に覗く
  const face = bake(new THREE.SphereGeometry(0.16, 10, 8), [0.44, 0.4, 0]);

  const footRing = new THREE.TorusGeometry(0.72, 0.07, 8, 20); // 控えめな足元マーカー
  const blob = new THREE.PlaneGeometry(2.4, 2.4);
  const selRing = new THREE.TorusGeometry(1.32, 0.12, 8, 28);
  const blocked = new THREE.SphereGeometry(0.16, 8, 8);
  const saddle = new THREE.PlaneGeometry(1, 1);

  const blobTexture = makeBlobTexture();

  const res: HorseVisualResources = {
    gradientMap,
    geo: { bodyCore, neckHead, mane, tail, leg, jockey, face, footRing, blob, selRing, blocked, saddle },
    mats: {
      outline: new THREE.MeshBasicMaterial({ color: OUTLINE_HEX, side: THREE.BackSide }),
      skin: new THREE.MeshToonMaterial({ color: SKIN_HEX, gradientMap }),
      blob: new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, opacity: 0.42, depthWrite: false }),
      selRing: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      blocked: new THREE.MeshBasicMaterial({ color: BLOCKED_HEX }),
    },
    blobTexture,
    coatMats: new Map(),
    maneMats: new Map(),
    silkMats: new Map(),
    footRingMats: new Map(),
    saddleTextures: new Map(),
    saddleMats: new Map(),
    disposed: false,
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.gradientMap.dispose();
      Object.values(this.geo).forEach((g) => g.dispose());
      Object.values(this.mats).forEach((m) => m.dispose());
      this.blobTexture.dispose();
      this.coatMats.forEach((m) => m.dispose());
      this.maneMats.forEach((m) => m.dispose());
      this.silkMats.forEach((m) => m.dispose());
      this.footRingMats.forEach((m) => m.dispose());
      this.saddleTextures.forEach((t) => t.dispose());
      this.saddleMats.forEach((m) => m.dispose());
      this.coatMats.clear(); this.maneMats.clear(); this.silkMats.clear();
      this.footRingMats.clear(); this.saddleTextures.clear(); this.saddleMats.clear();
    },
  };
  return res;
}

function getCoatMat(res: HorseVisualResources, hex: number): THREE.MeshToonMaterial {
  let m = res.coatMats.get(hex);
  if (!m) { m = new THREE.MeshToonMaterial({ color: hex, gradientMap: res.gradientMap }); res.coatMats.set(hex, m); }
  return m;
}
function getManeMat(res: HorseVisualResources, hex: number): THREE.MeshToonMaterial {
  let m = res.maneMats.get(hex);
  if (!m) { m = new THREE.MeshToonMaterial({ color: hex, gradientMap: res.gradientMap }); res.maneMats.set(hex, m); }
  return m;
}
function getSilkMat(res: HorseVisualResources, waku: number): THREE.MeshToonMaterial {
  const key = ((Math.max(1, waku) - 1) % 8) + 1;
  let m = res.silkMats.get(key);
  if (!m) { m = new THREE.MeshToonMaterial({ color: WAKU_HEX[key - 1], gradientMap: res.gradientMap }); res.silkMats.set(key, m); }
  return m;
}
function getFootRingMat(res: HorseVisualResources, waku: number): THREE.MeshBasicMaterial {
  const key = ((Math.max(1, waku) - 1) % 8) + 1;
  let m = res.footRingMats.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: WAKU_HEX[key - 1] }); res.footRingMats.set(key, m); }
  return m;
}

function makeBlobTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    // node（テスト）: canvas 不可。1x1 の擬似テクスチャで代替（GPU へは上がらない）。
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 120]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  }
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getSaddleMat(res: HorseVisualResources, num: number, waku: number): THREE.SpriteMaterial | null {
  if (typeof document === 'undefined') return null; // node ではゼッケン sprite を作らない
  let mat = res.saddleMats.get(num);
  if (mat) return mat;
  const bg = wakuCssColor(waku);
  const fg = wakuTextColor(((Math.max(1, waku) - 1) % 8) + 1);
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg; roundRect(ctx, 6, 6, 116, 84, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = 'bold 66px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 64, 52);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  res.saddleTextures.set(num, tex);
  mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true });
  res.saddleMats.set(num, mat);
  return mat;
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

export interface HorseVisualInput {
  horseNumber: number;
  waku: number;
  /** 実データの毛色名（あれば優先）。無ければ horseNumber から決定的割当。 */
  coatName?: string | null;
  selected?: boolean;
}

export interface HorseVisual {
  root: THREE.Group;
  horseNumber: number;
  /** 毎フレームのアニメーションのみ。root の position/rotation は変更しない。 */
  update: (gaitTime: number, speedFactor: number, cornerLean: number) => void;
  setSelected: (sel: boolean) => void;
  setBlocked: (blocked: boolean) => void;
  /** 頭上ラベルのアンカー world 座標（背の少し上）を out に書き込む。 */
  getLabelAnchor: (out: THREE.Vector3) => THREE.Vector3;
  dispose: () => void;
}

// ギャロップ近似（4脚の位相）
const LEG_PHASES = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];

/**
 * Broadcast Cel の馬ビジュアルを 1 頭ぶん生成する。
 * geometry / material は res の共有物のみを使う（このインスタンス固有の GPU リソースは作らない）。
 */
export function createBroadcastCelHorseVisual(
  res: HorseVisualResources,
  input: HorseVisualInput,
): HorseVisual {
  const waku = ((Math.max(1, input.waku) - 1) % 8) + 1;
  const coatIdx = (() => {
    const byName = coatIndexFromName(input.coatName);
    return byName >= 0 ? byName : coatIndexFor(input.horseNumber);
  })();
  const coatDef = COAT_PALETTE[coatIdx];
  const coatMat = getCoatMat(res, coatDef.coat);
  const maneMat = getManeMat(res, coatDef.mane);
  const silkMat = getSilkMat(res, waku);
  const footRingMat = getFootRingMat(res, waku);

  const root = new THREE.Group();
  root.userData.horseNumber = input.horseNumber;

  // 固定補正: 鼻先 +X → 進行方向 +Z（heading 規約に一致）
  const orient = new THREE.Group();
  orient.rotation.y = -Math.PI / 2;
  root.add(orient);

  // 上下動 + コーナー傾きの親
  const bodyBob = new THREE.Group();
  orient.add(bodyBob);

  // 胴コア + アウトライン
  const body = new THREE.Mesh(res.geo.bodyCore, coatMat);
  body.castShadow = true;
  bodyBob.add(body);
  const bodyOutline = new THREE.Mesh(res.geo.bodyCore, res.mats.outline);
  bodyOutline.scale.setScalar(1.06);
  body.add(bodyOutline);

  // 首（上下動する）+ 頭 + 耳 + たてがみ
  const neck = new THREE.Group();
  neck.position.set(0.85, 1.55, 0);
  bodyBob.add(neck);
  const neckMesh = new THREE.Mesh(res.geo.neckHead, coatMat);
  neckMesh.castShadow = true;
  neck.add(neckMesh);
  const neckOutline = new THREE.Mesh(res.geo.neckHead, res.mats.outline);
  neckOutline.scale.setScalar(1.06);
  neckMesh.add(neckOutline);
  const maneMesh = new THREE.Mesh(res.geo.mane, maneMat);
  neck.add(maneMesh);

  // 尾（揺れる）
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-1.4, 1.5, 0);
  bodyBob.add(tailPivot);
  const tailMesh = new THREE.Mesh(res.geo.tail, maneMat);
  tailPivot.add(tailMesh);

  // 騎手（上下動する）。背の上・前方(withers)へ座らせ、埋没を抑える。
  const jockeyPivot = new THREE.Group();
  jockeyPivot.position.set(0.15, 2.02, 0);
  bodyBob.add(jockeyPivot);
  const jockeyMesh = new THREE.Mesh(res.geo.jockey, silkMat);
  jockeyMesh.castShadow = true;
  jockeyPivot.add(jockeyMesh);
  // 騎手アウトライン（セルルックで馬体から分離して見えるように）
  const jockeyOutline = new THREE.Mesh(res.geo.jockey, res.mats.outline);
  jockeyOutline.scale.setScalar(1.08);
  jockeyMesh.add(jockeyOutline);
  const faceMesh = new THREE.Mesh(res.geo.face, res.mats.skin);
  jockeyPivot.add(faceMesh);

  // 脚 4 本
  const legDefs: [number, number][] = [
    [0.7, 0.32], [0.7, -0.32], [-0.7, 0.32], [-0.7, -0.32],
  ];
  const legs: THREE.Group[] = [];
  for (const [lx, lz] of legDefs) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 1.15, lz);
    const legMesh = new THREE.Mesh(res.geo.leg, coatMat);
    legMesh.castShadow = true;
    pivot.add(legMesh);
    bodyBob.add(pivot);
    legs.push(pivot);
  }

  // 足元の枠色マーカー（控えめ・接地面）
  const footRing = new THREE.Mesh(res.geo.footRing, footRingMat);
  footRing.rotation.x = Math.PI / 2;
  footRing.position.y = 0.05;
  orient.add(footRing);

  // 接地影
  const blob = new THREE.Mesh(res.geo.blob, res.mats.blob);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  orient.add(blob);

  // 選択リング（選択時のみ表示）
  const selRing = new THREE.Mesh(res.geo.selRing, res.mats.selRing);
  selRing.rotation.x = Math.PI / 2;
  selRing.position.y = 0.07;
  selRing.visible = !!input.selected;
  orient.add(selRing);

  // ブロック時マーカー（通常は非表示）
  const blockedMark = new THREE.Mesh(res.geo.blocked, res.mats.blocked);
  blockedMark.position.set(0, 2.65, 0);
  blockedMark.visible = false;
  bodyBob.add(blockedMark);

  // ゼッケン（補助識別・sprite。node では作らない）
  const saddleMat = getSaddleMat(res, input.horseNumber, waku);
  let saddle: THREE.Sprite | null = null;
  if (saddleMat) {
    saddle = new THREE.Sprite(saddleMat);
    saddle.scale.set(1.0, 0.75, 1);
    saddle.position.set(0, 1.75, 0); // 馬体寄り・控えめ（頭上ラベルの代替ではない補助識別）
    root.add(saddle);
  }

  // コーナー傾きの平滑用
  let leanCurrent = 0;

  const update = (gaitTime: number, speedFactor: number, cornerLean: number) => {
    const spd = Math.max(0, Math.min(1, speedFactor));
    if (spd <= 0.001) {
      for (const l of legs) l.rotation.z = 0;
      bodyBob.position.y = 0;
      neck.rotation.z = 0;
      jockeyPivot.position.y = 0;
      tailPivot.rotation.z = 0;
    } else {
      const phaseOffset = input.horseNumber * 0.7; // 馬番由来の固定 phase offset
      const f = gaitTime * (3 + spd * 6) + phaseOffset;
      for (let i = 0; i < legs.length; i++) {
        legs[i].rotation.z = Math.sin(f + LEG_PHASES[i]) * 0.7 * (0.4 + spd);
      }
      const bob = Math.abs(Math.sin(f)) * 0.08 * spd;
      bodyBob.position.y = bob;
      neck.rotation.z = Math.sin(f) * 0.06 * spd;
      jockeyPivot.position.y = -bob * 0.5; // 馬と逆位相で騎手が沈み込む
      tailPivot.rotation.z = Math.sin(f * 0.8) * 0.18 * spd;
    }
    // コーナー傾き（平滑化・frame-rate 非依存に近い緩和）
    const targetLean = Math.max(-0.35, Math.min(0.35, cornerLean));
    leanCurrent += (targetLean - leanCurrent) * 0.15;
    bodyBob.rotation.z = leanCurrent;
  };

  const setSelected = (sel: boolean) => { selRing.visible = sel; };
  const setBlocked = (b: boolean) => { blockedMark.visible = b; };
  const getLabelAnchor = (out: THREE.Vector3): THREE.Vector3 => {
    // 背の少し上（world）。root の matrixWorld を使う。
    return out.set(0, 2.9, 0).applyMatrix4(root.matrixWorld);
  };

  const dispose = () => {
    // このインスタンス固有の GPU リソースは無い（すべて res の共有物）。
    // scene からの remove は呼び出し側（本番）が行うが、二重防御で親からも外す。
    root.parent?.remove(root);
  };

  return { root, horseNumber: input.horseNumber, update, setSelected, setBlocked, getLabelAnchor, dispose };
}
