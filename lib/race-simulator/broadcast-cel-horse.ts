/**
 * broadcast-cel-horse（本番 Broadcast Cel 馬ビジュアル / THREE 描画専用）
 *
 * Visual Lab A（Broadcast Cel）の「馬らしいシルエット + セルルック + 騎手 + 識別」を
 * 本番 RaceSimulator3DProto へ忠実に再現するための独立モジュール。
 *
 * 正本方針（ユーザー承認済み）:
 *  - 馬・騎手の造形、輪郭、材質、姿勢、接地感、アニメーションは Visual Lab A を正本とする。
 *    パーツは A 案どおり「個別メッシュ」で構成する（geometry merge はしない）。
 *    → 騎手は 胴(torso)・帽(helmet)・顔(face) を独立メッシュに戻す。
 *    → 寸法・位置・rotation・outline はすべて Visual Lab A の buildRigged に一致させる。
 *  - 共有リソース（geometry / material / toon gradient / 番号texture）は
 *    createHorseVisualResources() で 1 度だけ生成し、renderer/コンポーネント生存中は保持する。
 *    レース切替では各 HorseVisual の root だけを破棄し、共有リソースは破棄しない。
 *    （geometry は全馬同一形状なので共有・material は色ごとにキャッシュ）
 *  - 毛色は Visual Lab A の単一鹿毛へは戻さない。少数パレット（鹿毛/黒鹿毛/青鹿毛/栗毛/芦毛）を
 *    キャッシュ共有し、実データ keiro があれば優先、無ければ horseNumber から決定的割当
 *    （Math.random 不使用）。A 案の単一毛色は研究用 fixture の仕様として扱う。
 *
 * 変更禁止（このモジュールから触れない）:
 *  - raceProgress / lane / velocity / ranking / timeline / course position
 *  - root の world position と heading は本番ロジックが設定する。ここは受け取って反映するだけ。
 *
 * heading 規約: 本番は root.rotation.y = heading（heading = atan2(tangent.x, tangent.z)）で
 *  「ローカル +Z」を進行方向へ向ける。A 案モデルは鼻先が +X なので、内部の orient グループを
 *  rotation.y = -PI/2 して +X→+Z の固定補正を掛ける。
 */
import * as THREE from 'three';
import { normalizeCoatColor, COAT_PALETTE_INDEX } from './coat-normalize';
export { normalizeCoatColor } from './coat-normalize';
export type { NormalizedCoatColor } from './coat-normalize';

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

// ---- 毛色パレット（正規化済み NormalizedCoatColor と対応）----
interface CoatDef { coat: number; mane: number }
export const COAT_PALETTE: CoatDef[] = [
  { coat: 0x6b4a34, mane: 0x2a1c12 }, // 0 bay 鹿毛 ※ Visual Lab A と同値
  { coat: 0x4a3222, mane: 0x1f150d }, // 1 darkBay 黒鹿毛/青鹿毛寄り
  { coat: 0x2f2620, mane: 0x17120e }, // 2 black 青毛/青鹿毛
  { coat: 0x9c6238, mane: 0x6b3f1e }, // 3 chestnut 栗毛
  { coat: 0xb9b3ad, mane: 0x9a948e }, // 4 gray 芦毛/葦毛
  { coat: 0x7a4a28, mane: 0x3a2414 }, // 5 darkChestnut 栃栗毛
  { coat: 0xe8e4dc, mane: 0xc8c4bc }, // 6 white 白毛
];

/** 実データの毛色名 → パレット index（存在時のみ）。未知は -1。 */
export function coatIndexFromName(name?: string | null): number {
  const n = normalizeCoatColor(name);
  if (!n) return -1;
  const idx = COAT_PALETTE_INDEX[n];
  return idx >= 0 && idx < COAT_PALETTE.length ? idx : -1;
}

/** horseNumber から決定的に毛色 index を割当（Math.random 不使用・均等分散）。 */
export function coatIndexFor(horseNumber: number): number {
  const h = (horseNumber * 2654435761) >>> 0; // Knuth 乗算ハッシュ
  return h % COAT_PALETTE.length;
}

// Visual Lab A 準拠の定数
const SKIN_HEX = 0xe8c9a8;   // 騎手の顔
const HOOF_HEX = 0x1a1a1a;   // 蹄
const OUTLINE_HEX = 0x111417; // A 案の addOutline 色
const OUTLINE_SCALE = 1.08;   // A 案の addOutline scale
const BLOCKED_HEX = 0xff3b30;

// トゥーンの明暗段（3段・Visual Lab A の toonGradient と同値）
function makeToonGradient(): THREE.DataTexture {
  const data = new Uint8Array([80, 80, 80, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 共有リソース（renderer/コンポーネント生存中に 1 度だけ生成し保持）。
 * dispose() は component unmount / renderer 破棄時にだけ呼ぶ。
 * geometry は全馬同一形状なので「個別パーツ geometry」を全馬で共有する（A 案どおりのメッシュ構成）。
 */
export interface HorseVisualResources {
  gradientMap: THREE.Texture;
  geo: {
    body: THREE.BufferGeometry;        // 胴（Capsule）
    rump: THREE.BufferGeometry;        // 尻（Sphere）
    neck: THREE.BufferGeometry;        // 首（Cylinder）
    head: THREE.BufferGeometry;        // 頭（Box）
    ear: THREE.BufferGeometry;         // 耳（Cone）
    mane: THREE.BufferGeometry;        // たてがみ（Box）
    tail: THREE.BufferGeometry;        // 尾（Cone）
    leg: THREE.BufferGeometry;         // 脚（Cylinder）
    hoof: THREE.BufferGeometry;        // 蹄（Cylinder）
    jockeyTorso: THREE.BufferGeometry; // 騎手 胴（Capsule）
    helmet: THREE.BufferGeometry;      // 騎手 帽（Sphere）
    face: THREE.BufferGeometry;        // 騎手 顔（Sphere）
    footRing: THREE.BufferGeometry;    // 足元の枠色マーカー
    blob: THREE.BufferGeometry;        // 接地影
    selRing: THREE.BufferGeometry;     // 選択リング
    blocked: THREE.BufferGeometry;     // ブロック時マーカー
  };
  mats: {
    outline: THREE.MeshBasicMaterial;
    skin: THREE.MeshToonMaterial;
    hoof: THREE.MeshToonMaterial;
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

  // ---- 馬体パーツ（Visual Lab A の buildRigged と同一寸法・全馬で共有）----
  const body = new THREE.CapsuleGeometry(0.55, 1.5, 6, 14);
  const rump = new THREE.SphereGeometry(0.6, 14, 12);
  const neck = new THREE.CylinderGeometry(0.28, 0.42, 1.0, 12);
  const head = new THREE.BoxGeometry(0.7, 0.36, 0.34);
  const ear = new THREE.ConeGeometry(0.07, 0.2, 8);
  const mane = new THREE.BoxGeometry(0.12, 0.9, 0.24);
  const tail = new THREE.ConeGeometry(0.18, 0.9, 8);
  const leg = new THREE.CylinderGeometry(0.11, 0.08, 1.1, 8);
  const hoof = new THREE.CylinderGeometry(0.1, 0.12, 0.16, 8);

  // ---- 騎手パーツ（Visual Lab A: 胴 + 帽 + 顔 を独立メッシュ）----
  const jockeyTorso = new THREE.CapsuleGeometry(0.26, 0.42, 4, 8);
  const helmet = new THREE.SphereGeometry(0.2, 12, 10);
  const face = new THREE.SphereGeometry(0.14, 10, 8);

  // ---- 識別・接地マーカー（本番付加。接地影と選択リングは維持）----
  const footRing = new THREE.TorusGeometry(0.72, 0.07, 8, 20);
  const blob = new THREE.PlaneGeometry(2.4, 2.4);
  const selRing = new THREE.TorusGeometry(1.32, 0.12, 8, 28);
  const blocked = new THREE.SphereGeometry(0.16, 8, 8);

  const blobTexture = makeBlobTexture();

  const res: HorseVisualResources = {
    gradientMap,
    geo: {
      body, rump, neck, head, ear, mane, tail, leg, hoof,
      jockeyTorso, helmet, face,
      footRing, blob, selRing, blocked,
    },
    mats: {
      outline: new THREE.MeshBasicMaterial({ color: OUTLINE_HEX, side: THREE.BackSide }),
      skin: new THREE.MeshToonMaterial({ color: SKIN_HEX, gradientMap }),
      hoof: new THREE.MeshToonMaterial({ color: HOOF_HEX, gradientMap }),
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

// ギャロップ近似（4脚の位相・Visual Lab A finalize と同値）
const LEG_PHASES = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];

/**
 * Broadcast Cel の馬ビジュアルを 1 頭ぶん生成する（Visual Lab A の buildRigged 構造に忠実）。
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

  // 上下動 + コーナー傾きの親（A 案の bodyBob 相当）
  const bodyBob = new THREE.Group();
  orient.add(bodyBob);

  // outline を追加するヘルパー（A 案 addOutline: BackSide / scale 1.08 / 共有 outline material）
  const addOutline = (mesh: THREE.Mesh) => {
    const om = new THREE.Mesh(mesh.geometry, res.mats.outline);
    om.scale.setScalar(OUTLINE_SCALE);
    mesh.add(om);
  };

  // 胴（A 案: rotation.z=PI/2, position(0,1.25,0)）
  const body = new THREE.Mesh(res.geo.body, coatMat);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 1.25, 0);
  body.castShadow = true;
  addOutline(body);
  bodyBob.add(body);

  // 尻（A 案: position(-0.9,1.25,0)）
  const rump = new THREE.Mesh(res.geo.rump, coatMat);
  rump.position.set(-0.9, 1.25, 0);
  rump.castShadow = true;
  addOutline(rump);
  bodyBob.add(rump);

  // 首グループ（A 案: position(0.85,1.55,0)。上下動で rotation.z がわずかに動く）
  const neck = new THREE.Group();
  neck.position.set(0.85, 1.55, 0);
  bodyBob.add(neck);
  const neckMesh = new THREE.Mesh(res.geo.neck, coatMat);
  neckMesh.rotation.z = -Math.PI / 3.2;
  neckMesh.position.set(0.28, 0.35, 0);
  neckMesh.castShadow = true;
  addOutline(neckMesh);
  neck.add(neckMesh);
  // 頭
  const head = new THREE.Mesh(res.geo.head, coatMat);
  head.position.set(0.75, 0.72, 0);
  head.rotation.z = -0.35;
  head.castShadow = true;
  addOutline(head);
  neck.add(head);
  // 耳 ×2（A 案は outline なし）
  for (const dz of [-0.11, 0.11]) {
    const earMesh = new THREE.Mesh(res.geo.ear, coatMat);
    earMesh.position.set(0.62, 0.92, dz);
    neck.add(earMesh);
  }
  // たてがみ（A 案は outline なし・mane 色）
  const maneMesh = new THREE.Mesh(res.geo.mane, maneMat);
  maneMesh.rotation.z = -Math.PI / 3.2;
  maneMesh.position.set(0.2, 0.4, 0);
  neck.add(maneMesh);

  // 尾（A 案: bodyBob 直下・静的・position(-1.4,1.15,0), rotation.z=PI/2.2, mane 色, outline なし）
  const tailMesh = new THREE.Mesh(res.geo.tail, maneMat);
  tailMesh.position.set(-1.4, 1.15, 0);
  tailMesh.rotation.z = Math.PI / 2.2;
  bodyBob.add(tailMesh);

  // 脚 4 本（A 案: pivot(lx,1.15,lz) / legMesh(0,-0.55,0) outline / hoof(0,-1.08,0)）
  const legDefs: [number, number][] = [
    [0.7, 0.32], [0.7, -0.32], [-0.7, 0.32], [-0.7, -0.32],
  ];
  const legs: THREE.Group[] = [];
  for (const [lx, lz] of legDefs) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 1.15, lz);
    const legMesh = new THREE.Mesh(res.geo.leg, coatMat);
    legMesh.position.set(0, -0.55, 0);
    legMesh.castShadow = true;
    addOutline(legMesh);
    const hoofMesh = new THREE.Mesh(res.geo.hoof, res.mats.hoof);
    hoofMesh.position.set(0, -1.08, 0);
    pivot.add(hoofMesh);
    pivot.add(legMesh);
    bodyBob.add(pivot);
    legs.push(pivot);
  }

  // 騎手（A 案: bodyBob 直下 jockey group(-0.25,1.95,0)。胴/帽=枠色, 顔=skin。胴に outline）
  const jockey = new THREE.Group();
  jockey.position.set(-0.25, 1.95, 0);
  const torso = new THREE.Mesh(res.geo.jockeyTorso, silkMat);
  torso.rotation.x = 0.5;
  torso.castShadow = true;
  addOutline(torso);
  jockey.add(torso);
  const helmet = new THREE.Mesh(res.geo.helmet, silkMat);
  helmet.position.set(0.18, 0.42, 0);
  jockey.add(helmet);
  const faceMesh = new THREE.Mesh(res.geo.face, res.mats.skin);
  faceMesh.position.set(0.32, 0.36, 0);
  jockey.add(faceMesh);
  bodyBob.add(jockey);

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
    saddle.position.set(0, 1.75, 0);
    root.add(saddle);
  }

  // コーナー傾きの平滑用
  let leanCurrent = 0;

  const update = (gaitTime: number, speedFactor: number, cornerLean: number) => {
    const spd = Math.max(0, Math.min(1, speedFactor));
    if (spd <= 0.001) {
      // 停止（再生していない）: A 案どおり脚・上下動を止める
      for (const l of legs) l.rotation.z = 0;
      bodyBob.position.y = 0;
      neck.rotation.z = 0;
    } else {
      // A 案 finalize の gait。全 14 頭で脚が完全同期しないよう馬番由来の phase offset のみ加える。
      const phaseOffset = input.horseNumber * 0.7;
      const f = gaitTime * (3 + spd * 6) + phaseOffset;
      for (let i = 0; i < legs.length; i++) {
        legs[i].rotation.z = Math.sin(f + LEG_PHASES[i]) * 0.7 * (0.4 + spd);
      }
      bodyBob.position.y = Math.abs(Math.sin(f)) * 0.08 * spd;
      neck.rotation.z = Math.sin(f) * 0.06 * spd;
    }
    // コーナー傾き（本番付加・平滑化）。騎手/尾は bodyBob の子なので一緒に傾く。
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
