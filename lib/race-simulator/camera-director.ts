/**
 * CameraDirector（Visual Step 1C-3A / 描画専用・純粋関数）
 *
 * 役割:
 *  - レース中継用のカメラモードを phase / progress から選択する
 *  - 馬群の framing（中心・進行方向・法線・広がり）からカメラの
 *    position / lookAt / fov を計算する
 *
 * 設計方針:
 *  - simulation / timeline / curve の値は一切変更しない（読み取りのみ）
 *  - 画面座標の左右を理由に curve の進行方向(dir)を変えない。
 *    横位置は必ず framing.normal（curve 由来の外向き法線）と tangent で決める。
 *  - clockwise / counterclockwise で同じロジックが成立する
 *    （tangent は進行方向、normal は外向きで与えられる前提）。
 *  - 全周を小さく映す overview はここでは扱わない（コンポーネント側の静的処理）。
 */

import * as THREE from 'three';

export type CameraMode =
  | 'START_SIDE'
  | 'BACK_STRAIGHT_TRACKING'
  | 'CORNER_HIGH'
  | 'FINAL_STRAIGHT_SIDE'
  | 'FINISH';

/** 馬群の framing 情報（すべて world 座標・単位ベクトル） */
export interface PackFraming {
  /** 馬群中心（中心線付近の world 座標） */
  center: THREE.Vector3;
  /** 進行方向の単位接線 */
  tangent: THREE.Vector3;
  /** 外向き水平単位法線 */
  normal: THREE.Vector3;
  /** 縦方向（進行方向）の広がり(m) = 先頭と最後方の距離差 */
  spread: number;
  /** 横方向の広がり(m) = laneOffset の最大-最小 */
  laneSpread: number;
}

export interface CameraPose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/** 馬群サイズの下限（1頭でも近づきすぎないように） */
const MIN_PACK_SIZE = 18;
/** サイド距離のクランプ範囲 */
const MIN_SIDE_DISTANCE = 26;
const MAX_SIDE_DISTANCE = 130;

interface ModeParams {
  fov: number;        // 視野角(度)
  coverage: number;   // 馬群が画面幅に占める目標割合(0..1)
  height: number;     // カメラ高さ(m)
  trailing: number;   // 進行方向後方への引き(m)
  forward: number;    // lookAt を進行方向前方へ送る量(m)
  lookHeight: number; // lookAt の高さ(m)
}

const MODE_PARAMS: Record<CameraMode, ModeParams> = {
  // スタート地点を斜め横から。全周へ引かない。
  START_SIDE:             { fov: 42, coverage: 0.60, height: 15, trailing: 10, forward: 6,  lookHeight: 2 },
  // 向正面の横並走。進行方向が画面横へ流れる。
  BACK_STRAIGHT_TRACKING: { fov: 40, coverage: 0.65, height: 11, trailing: 7,  forward: 22, lookHeight: 2 },
  // コーナーのみ少し高い斜め視点。全周は映さない。
  CORNER_HIGH:            { fov: 46, coverage: 0.72, height: 30, trailing: 16, forward: 8,  lookHeight: 2 },
  // 最終直線の横追走（最優先の通常映像）。前方に余白を多く。
  FINAL_STRAIGHT_SIDE:    { fov: 38, coverage: 0.58, height: 9,  trailing: 4,  forward: 34, lookHeight: 2 },
  // ゴール直前。馬群とゴール方向を同時に。真上にしない。
  FINISH:                 { fov: 40, coverage: 0.62, height: 12, trailing: 2,  forward: 14, lookHeight: 2 },
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * phase名（日本語）と progress(0..1) からカメラモードを選ぶ。
 * phase を優先し、無ければ progress でフォールバックする。
 */
export function selectCameraMode(phase: string | undefined, progress: number): CameraMode {
  const p = phase ?? '';
  // 注意: phase名は複合語のため判定順が重要。
  //  'スタート〜隊列形成' は '隊列' より先に 'スタート' を判定する。
  //  '直線〜ゴール' は 'ゴール' より先に '直線' を判定する（純 'ゴール' フェーズと区別）。
  if (p.includes('スタート')) return 'START_SIDE';
  if (p.includes('コーナー')) return 'CORNER_HIGH';
  if (p.includes('直線')) return progress >= 0.97 ? 'FINISH' : 'FINAL_STRAIGHT_SIDE';
  if (p.includes('ゴール')) return 'FINISH';
  if (p.includes('隊列') || p.includes('ペース')) return 'BACK_STRAIGHT_TRACKING';

  // フォールバック（progress ベース）
  if (progress >= 0.97) return 'FINISH';
  if (progress >= 0.72) return 'FINAL_STRAIGHT_SIDE';
  if (progress >= 0.45) return 'CORNER_HIGH';
  if (progress >= 0.20) return 'BACK_STRAIGHT_TRACKING';
  return 'START_SIDE';
}

/**
 * framing とモードから必要なサイド距離を求める。
 * 透視投影の可視幅 = 2 * d * tan(fov/2) * aspect を用い、
 * 馬群が画面幅の coverage を占めるように d を逆算する。
 */
function computeSideDistance(mode: CameraMode, framing: PackFraming, aspect: number): number {
  const params = MODE_PARAMS[mode];
  const packSize = Math.max(framing.spread, framing.laneSpread, MIN_PACK_SIZE) + 12;
  const safeAspect = Number.isFinite(aspect) && aspect > 0.1 ? aspect : 16 / 9;
  const halfFov = (params.fov * Math.PI) / 180 / 2;
  const denom = 2 * Math.tan(halfFov) * safeAspect;
  const raw = denom > 1e-6 ? (packSize / params.coverage) / denom : MIN_SIDE_DISTANCE;
  return clamp(raw, MIN_SIDE_DISTANCE, MAX_SIDE_DISTANCE);
}

/**
 * カメラ pose を計算する（純粋関数）。
 *
 *   cameraPosition = center + normal*sideDistance + up*height - tangent*trailing
 *   lookAt         = center + tangent*forward (+ up*lookHeight)
 */
export function computeCameraPose(
  mode: CameraMode,
  framing: PackFraming,
  aspect: number
): CameraPose {
  const params = MODE_PARAMS[mode];
  const sideDistance = computeSideDistance(mode, framing, aspect);

  const position = framing.center.clone()
    .addScaledVector(framing.normal, sideDistance)
    .addScaledVector(UP, params.height)
    .addScaledVector(framing.tangent, -params.trailing);

  const lookAt = framing.center.clone()
    .addScaledVector(framing.tangent, params.forward)
    .addScaledVector(UP, params.lookHeight);

  return { position, lookAt, fov: params.fov };
}

/**
 * GOAL_STAND_CAMERA（ゴール板前スタンド固定・純粋関数）
 *
 * 実際の競馬場のようにゴール板前スタンド側へカメラを置き、
 * ホームストレッチを横から見る。全周を真上から映すデバッグ模型にしない。
 *
 *   cameraPosition = goalPosition + standSideNormal*standDistance
 *                    + up*standHeight - goalTangent*straightOffset
 *   lookAt         = goalPosition - goalTangent*homeStraightLookBack + up*targetHeight
 *
 * goalTangent は「ゴール地点でのレース進行方向」（ゴールへ向かう向き）。
 * standSideNormal は観客席（芝の外側）方向の水平単位ベクトル（registry/描画側で決定）。
 */
export interface GoalStandConfig {
  /** スタンドまでの横距離(m) */
  standDistance: number;
  /** カメラ高さ(m) */
  standHeight: number;
  /** ゴール板から進行方向手前へのオフセット(m) */
  straightOffset: number;
  /** lookAt を直線奥（手前）へ送る量(m) */
  homeStraightLookBack: number;
  /** 注視点の高さ(m) */
  targetHeight: number;
  /** 視野角(度) */
  fov: number;
}

export const DEFAULT_GOAL_STAND_CONFIG: GoalStandConfig = {
  standDistance: 45,
  standHeight: 20,
  straightOffset: 30,
  homeStraightLookBack: 60,
  targetHeight: 2,
  fov: 40,
};

export function computeGoalStandPose(
  goalPosition: THREE.Vector3,
  goalTangent: THREE.Vector3,
  standSideNormal: THREE.Vector3,
  config: GoalStandConfig = DEFAULT_GOAL_STAND_CONFIG
): CameraPose {
  const position = goalPosition.clone()
    .addScaledVector(standSideNormal, config.standDistance)
    .addScaledVector(UP, config.standHeight)
    .addScaledVector(goalTangent, -config.straightOffset);

  const lookAt = goalPosition.clone()
    .addScaledVector(goalTangent, -config.homeStraightLookBack)
    .addScaledVector(UP, config.targetHeight);

  return { position, lookAt, fov: config.fov };
}
