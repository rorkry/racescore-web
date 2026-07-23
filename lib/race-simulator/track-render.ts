/**
 * track-render（THREE / 描画専用）
 *
 * RacecourseGeometry から走路メッシュ一式を生成する共通生成器。
 * 全10場で同じ生成器を使い、競馬場ごとの巨大if文を作らない。
 *
 * 生成物:
 *  - 走路 ribbon（芝=緑ストライプ / ダート=土色ストライプ, elevation反映, FrontSide, 法線+Y）
 *  - 内柵・外柵（Line）+ 簡易立体支柱（InstancedMesh）
 *  - インフィールド（active のみ・内側の面）
 *  - スタート線 / ゴール線（active のみ）
 *
 * すべての geometry/material を dispose 可能にまとめて返す。
 */

import * as THREE from 'three';
import type { RacecourseGeometry, StartMarker } from '../racecourse-geometry/types';
import { samplePathPose } from '../racecourse-geometry';

export interface TrackRenderResult {
  group: THREE.Group;
  dispose: () => void;
}

export interface TrackRenderOptions {
  /** アクティブ走路（選択レース）は明るく＋柵/スタート/ゴール/インフィールドを描く */
  active: boolean;
  /** サンプル分割数（既定 240） */
  segments?: number;
}

const TURF_BASE = 0x2f8f3f;
const TURF_STRIPE = 0x267a35;
const TURF_ACTIVE_BASE = 0x37a94a;
const TURF_ACTIVE_STRIPE = 0x2c9440;
const DIRT_BASE = 0xb08858;
const DIRT_STRIPE = 0xa67c4c;
const DIRT_ACTIVE_BASE = 0xc0925f;
const DIRT_ACTIVE_STRIPE = 0xb48453;
const RAIL_COLOR = 0xffffff;
const POST_COLOR = 0x2a2a2a;
const STRIPE_EVERY = 3; // 何リングごとに縞を変えるか

/** RacecourseGeometry から走路 group を構築 */
export function buildTrackGroup(
  geometry: RacecourseGeometry,
  opts: TrackRenderOptions
): TrackRenderResult {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = (d: { dispose: () => void }) => {
    disposables.push(d);
    return d;
  };

  const segments = opts.segments ?? 240;
  const closed = geometry.pathKind === 'closed-loop';
  const halfWidth = geometry.trackWidth / 2;
  const isTurf = geometry.surface === 'turf';

  // ---- サンプル点（inner/outer/center, elevation反映） ----
  const inner: THREE.Vector3[] = [];
  const outer: THREE.Vector3[] = [];
  const center: THREE.Vector3[] = [];
  const ringCount = segments; // closed は 0..pathLength を segments 分割（末尾=先頭は sampler が wrap）
  const total = geometry.pathLength;
  for (let i = 0; i <= ringCount; i++) {
    const d = (i / ringCount) * total;
    const pose = samplePathPose(geometry, d, 0);
    const c = new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z);
    const nrm = new THREE.Vector3(pose.normal.x, 0, pose.normal.z);
    center.push(c);
    inner.push(c.clone().addScaledVector(nrm, -halfWidth));
    outer.push(c.clone().addScaledVector(nrm, halfWidth));
  }

  // ---- ribbon mesh ----
  const positions: number[] = [];
  const colors: number[] = [];
  const baseColor = new THREE.Color(
    isTurf ? (opts.active ? TURF_ACTIVE_BASE : TURF_BASE) : opts.active ? DIRT_ACTIVE_BASE : DIRT_BASE
  );
  const stripeColor = new THREE.Color(
    isTurf ? (opts.active ? TURF_ACTIVE_STRIPE : TURF_STRIPE) : opts.active ? DIRT_ACTIVE_STRIPE : DIRT_STRIPE
  );
  for (let i = 0; i <= ringCount; i++) {
    const useStripe = Math.floor(i / STRIPE_EVERY) % 2 === 1;
    const col = useStripe ? stripeColor : baseColor;
    positions.push(inner[i].x, inner[i].y, inner[i].z);
    colors.push(col.r, col.g, col.b);
    positions.push(outer[i].x, outer[i].y, outer[i].z);
    colors.push(col.r, col.g, col.b);
  }
  const trackGeom = new THREE.BufferGeometry();
  trackGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  trackGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const indices: number[] = [];
  for (let i = 0; i < ringCount; i++) {
    const base = i * 2;
    // 法線が +Y を向く巻き順（inner,outer,inner+1,outer+1）
    indices.push(base, base + 2, base + 1);
    indices.push(base + 1, base + 2, base + 3);
  }
  trackGeom.setIndex(indices);
  trackGeom.computeVertexNormals();
  const trackMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.FrontSide,
    roughness: isTurf ? 0.95 : 0.85,
    metalness: 0,
  });
  const trackMesh = new THREE.Mesh(trackGeom, trackMat);
  trackMesh.renderOrder = 0;
  group.add(trackMesh);
  track(trackGeom); track(trackMat);

  // ---- 柵（Line） ----
  const railMat = new THREE.LineBasicMaterial({ color: RAIL_COLOR });
  const innerRailPts = inner.map((p) => p.clone().setY(p.y + 0.3));
  const outerRailPts = outer.map((p) => p.clone().setY(p.y + 0.3));
  const innerRailGeom = new THREE.BufferGeometry().setFromPoints(innerRailPts);
  const outerRailGeom = new THREE.BufferGeometry().setFromPoints(outerRailPts);
  const innerRail = new THREE.Line(innerRailGeom, railMat);
  const outerRail = new THREE.Line(outerRailGeom, railMat);
  group.add(innerRail); group.add(outerRail);
  track(innerRailGeom); track(outerRailGeom); track(railMat);

  // ---- 支柱（InstancedMesh, 外柵沿い） ----
  const postStep = Math.max(1, Math.floor(ringCount / 60)); // 約60本
  const postPositions: THREE.Vector3[] = [];
  for (let i = 0; i <= ringCount; i += postStep) postPositions.push(outer[i]);
  if (postPositions.length > 0) {
    const postGeom = new THREE.BoxGeometry(0.2, 1.2, 0.2);
    const postMat = new THREE.MeshStandardMaterial({ color: POST_COLOR });
    const posts = new THREE.InstancedMesh(postGeom, postMat, postPositions.length);
    const m = new THREE.Matrix4();
    postPositions.forEach((p, idx) => {
      m.makeTranslation(p.x, p.y + 0.6, p.z);
      posts.setMatrixAt(idx, m);
    });
    posts.instanceMatrix.needsUpdate = true;
    group.add(posts);
    track(postGeom); track(postMat);
  }

  // ---- アクティブ走路のみ: インフィールド + スタート/ゴール線 ----
  if (opts.active && closed) {
    // インフィールド（inner を扇状に三角化, 走路より少し下）
    const centroid = new THREE.Vector3();
    for (const p of inner) centroid.add(p);
    centroid.multiplyScalar(1 / inner.length);
    const infY = Math.min(...inner.map((p) => p.y)) - 0.15;
    centroid.setY(infY);
    const inPos: number[] = [centroid.x, centroid.y, centroid.z];
    for (const p of inner) inPos.push(p.x, infY, p.z);
    const inIdx: number[] = [];
    for (let i = 1; i < inner.length; i++) inIdx.push(0, i + 1, i);
    const infGeom = new THREE.BufferGeometry();
    infGeom.setAttribute('position', new THREE.Float32BufferAttribute(inPos, 3));
    infGeom.setIndex(inIdx);
    infGeom.computeVertexNormals();
    const infMat = new THREE.MeshStandardMaterial({ color: 0x2b6b34, side: THREE.DoubleSide, roughness: 1 });
    const infMesh = new THREE.Mesh(infGeom, infMat);
    infMesh.renderOrder = -1;
    group.add(infMesh);
    track(infGeom); track(infMat);
  }

  return {
    group,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

/** スタート線 / ゴール線を構築（active 走路用） */
export function buildStartFinishGroup(
  geometry: RacecourseGeometry,
  startMarker: StartMarker
): TrackRenderResult {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const halfWidth = geometry.trackWidth / 2;

  const makeLine = (pathDistance: number, color: number, widthM: number) => {
    const pose = samplePathPose(geometry, pathDistance, 0);
    const c = new THREE.Vector3(pose.position.x, pose.position.y + 0.15, pose.position.z);
    const nrm = new THREE.Vector3(pose.normal.x, 0, pose.normal.z);
    const tan = new THREE.Vector3(pose.tangent.x, 0, pose.tangent.z).normalize();
    const inner = c.clone().addScaledVector(nrm, -halfWidth);
    const outer = c.clone().addScaledVector(nrm, halfWidth);
    const halfLen = widthM / 2;
    const p0 = inner.clone().addScaledVector(tan, -halfLen);
    const p1 = outer.clone().addScaledVector(tan, -halfLen);
    const p2 = inner.clone().addScaledVector(tan, halfLen);
    const p3 = outer.clone().addScaledVector(tan, halfLen);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z],
        3
      )
    );
    geom.setIndex([0, 2, 1, 1, 2, 3]);
    geom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 1 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 1;
    group.add(mesh);
    disposables.push(geom); disposables.push(mat);
  };

  // スタート線（黄）とゴール線（白・少し太く）
  makeLine(startMarker.pathDistance, 0xffdd33, 2);
  makeLine(geometry.finishPathDistance, 0xffffff, 3);

  return {
    group,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
