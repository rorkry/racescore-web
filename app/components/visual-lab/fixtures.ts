/**
 * Visual Lab 固定フィクスチャ（本番ロジック非依存）
 *
 * 目的: 3つのビジュアル案を「同じ頭数・同じ密集・同じカメラ・同じコース幅・同じ time」で
 *       中立比較するための決定論的なダミーデータ。
 *       本番の timeline / race-dynamics / racecourse-geometry は一切使わない。
 *
 * 座標系は本番と同じ Three.js（Y=up, 地面=XZ）。
 * 乱数は Math.random を直接使わず seed 固定の疑似乱数のみ（同一 URL=完全再現）。
 */

export type Surface = 'turf' | 'dirt';
export type Scenario = 'straight' | 'corner' | 'goal' | 'pack';
export type SpeedMode = 'still' | 'slow' | 'normal';
export type Approach = 'cel' | 'semi' | 'dataviz';
export type LabelMode = 'all' | 'selected' | 'saddle' | 'tracking';
export type ViewMode = 'default' | 'zoomSide' | 'zoomFront' | 'zoomRear';

/** JRA 8枠の帽色（1白 2黒 3赤 4青 5黄 6緑 7橙 8桃） */
export const WAKU_HEX: number[] = [
  0xf2f2f2, // 1 白
  0x222222, // 2 黒
  0xe23b3b, // 3 赤
  0x2f6fe0, // 4 青
  0xf2d024, // 5 黄
  0x3caf4c, // 6 緑
  0xf08a24, // 7 橙
  0xf06fae, // 8 桃
];

/** 枠番の文字色（黒帽・青帽・緑帽など暗色は白文字） */
export function wakuTextColor(waku: number): string {
  return waku === 2 || waku === 4 || waku === 6 ? '#ffffff' : '#111111';
}

export interface FixtureHorse {
  horseNumber: number;
  waku: number;
  name: string;
  /** 脚質バイアス(0=逃げ..1=追込) 初期隊列の前後位置に使用 */
  styleBias: number;
  /** 個体の脚色差（-1..1）: 密集内での前後ゆらぎ */
  jitter: number;
}

const NAMES = [
  'ハヤテノオー', 'ミナモザクラ', 'テツオーカン', 'リュウノトドロキ', 'サチノヒカリ',
  'クロガネロード', 'アオバイースト', 'ハルカゼボーイ', 'ヒノデジョオー', 'ツキノアカリ',
  'カゼオトメ', 'イワオウジ', 'ソラノナミダ', 'ダイヤモンドアイ', 'ノースブリッツ',
  'マリンルビー', 'コウテイペンギン', 'シルクロードキング',
];

/** 決定論的な擬似乱数[0,1)（seed から）。Math.random は使わない。 */
export function pseudo(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** seed 付きベース。head(n) で 8/14/18 頭に切り出す。waku は頭数から算出。 */
export function buildFixtureHorses(n: number, seed = 1): FixtureHorse[] {
  const count = Math.max(2, Math.min(18, n));
  const horses: FixtureHorse[] = [];
  for (let i = 0; i < count; i++) {
    const horseNumber = i + 1;
    horses.push({
      horseNumber,
      waku: wakuOf(horseNumber, count),
      name: NAMES[i % NAMES.length],
      styleBias: pseudo(i * 7 + 3 + seed * 101.3),
      jitter: pseudo(i * 13 + 1 + seed * 57.7) * 2 - 1,
    });
  }
  return horses;
}

/** JRA の枠割り（頭数に応じて 1..8 枠へ均等割り、余りは後ろ枠へ） */
export function wakuOf(horseNumber: number, total: number): number {
  if (total <= 8) return horseNumber;
  const base = Math.floor(total / 8);
  const extra = total % 8; // 後ろの extra 枠が base+1 頭
  let acc = 0;
  for (let w = 1; w <= 8; w++) {
    const inWaku = base + (w > 8 - extra ? 1 : 0);
    acc += inWaku;
    if (horseNumber <= acc) return w;
  }
  return 8;
}

export interface HorsePose {
  horseNumber: number;
  x: number;
  z: number;
  /** group.rotation.y に渡す heading(rad)。モデル前方 +X を進行方向へ向ける。 */
  heading: number;
  gaitOffset: number;
}

/** コース幅（本番 trackWidth 相当）。全案で共通。 */
export const TRACK_WIDTH = 24;
/** 馬の実寸（鼻先〜尾）m 相当。全案共通・見やすさのために変えない。 */
export const HORSE_LENGTH = 2.4;

/** モデル前方(+X)を world 進行方向(dx,dz)へ向ける Y 回転 */
function headingFor(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

/**
 * シナリオごとの各馬 world pose（決定論的・密集を再現）。
 * pack=超密集 / goal=前後詰まる / straight=通常隊列 / corner=円弧。
 */
export function scenarioPoses(
  horses: FixtureHorse[],
  scenario: Scenario,
  packT: number,
): HorsePose[] {
  const n = horses.length;
  const laneStep = TRACK_WIDTH / (Math.max(n, 8) + 1);

  return horses.map((h, i) => {
    const rank = h.styleBias; // 0(前)..1(後)
    const wobble = Math.sin(packT * Math.PI * 2 + i) * 0.6 * h.jitter;

    if (scenario === 'corner') {
      const R = 60;
      const spreadAng = 0.55;
      const a = -Math.PI / 2 + spreadAng * (rank - 0.5) + wobble * 0.01;
      const laneR = R + (h.horseNumber - (n + 1) / 2) * laneStep * 0.7;
      const x = Math.cos(a) * laneR;
      const z = Math.sin(a) * laneR;
      // 接線（a 増加方向）: d/da(cos,sin)=(-sin,cos)
      const heading = headingFor(-Math.sin(a), Math.cos(a));
      return { horseNumber: h.horseNumber, x, z, heading, gaitOffset: i * 0.37 };
    }

    // straight / goal / pack: +Z 方向へ進む隊列
    const lane = (h.horseNumber - (n + 1) / 2) * laneStep;
    let depthSpread: number; let baseZ: number;
    if (scenario === 'pack') { depthSpread = 6; baseZ = 0; }
    else if (scenario === 'goal') { depthSpread = 10; baseZ = 8; }
    else { depthSpread = 26; baseZ = 0; }
    const z = baseZ - rank * depthSpread + wobble;
    const x = lane;
    return { horseNumber: h.horseNumber, x, z, heading: headingFor(0, 1), gaitOffset: i * 0.37 };
  });
}

/** 指定馬番の pose を取得（ズームカメラ用） */
export function poseOf(
  horseNumber: number, horseCount: number, scenario: Scenario, packT: number, seed: number,
): HorsePose | null {
  const horses = buildFixtureHorses(horseCount, seed);
  const poses = scenarioPoses(horses, scenario, packT);
  return poses.find((p) => p.horseNumber === horseNumber) ?? null;
}

export interface CameraPreset { position: [number, number, number]; lookAt: [number, number, number]; fov: number; }

/**
 * カメラプリセット（全案で同一）。
 * view=default はシナリオ広角、zoom* は選択馬をアップ（側面/斜め前/斜め後ろ）。
 */
export function cameraFor(
  scenario: Scenario, view: ViewMode, selected?: HorsePose | null,
): CameraPreset {
  if (view !== 'default' && selected) {
    const cx = selected.x, cz = selected.z, cy = 1.5;
    // 進行方向ベクトル（heading の逆算）
    const fx = Math.cos(selected.heading), fz = -Math.sin(selected.heading);
    // 右手側（進行方向に対する右）
    const rx = -fz, rz = fx;
    const dist = 4.5, up = 2.2;
    let px: number, pz: number;
    if (view === 'zoomSide') { px = cx + rx * dist; pz = cz + rz * dist; }
    else if (view === 'zoomFront') { px = cx + fx * dist * 0.9 + rx * dist * 0.6; pz = cz + fz * dist * 0.9 + rz * dist * 0.6; }
    else { px = cx - fx * dist * 0.9 + rx * dist * 0.6; pz = cz - fz * dist * 0.9 + rz * dist * 0.6; } // zoomRear
    return { position: [px, up, pz], lookAt: [cx, cy, cz], fov: 30 };
  }

  switch (scenario) {
    case 'corner': return { position: [70, 26, -70], lookAt: [40, 2, -40], fov: 34 };
    case 'goal': return { position: [26, 9, 34], lookAt: [0, 2, 6], fov: 30 };
    case 'pack': return { position: [20, 8, 26], lookAt: [0, 2, 0], fov: 28 };
    case 'straight':
    default: return { position: [30, 10, 20], lookAt: [0, 2, -6], fov: 32 };
  }
}

// ---- URL パラメータ ⇔ 内部設定 の対応 -------------------------------------
export const VARIANT_TO_APPROACH: Record<string, Approach> = { A: 'cel', B: 'semi', C: 'dataviz' };
export const APPROACH_TO_VARIANT: Record<Approach, string> = { cel: 'A', semi: 'B', dataviz: 'C' };
export const SCENE_TO_SCENARIO: Record<string, Scenario> = {
  straight: 'straight', corner: 'corner', finish: 'goal', dense: 'pack',
};
export const SCENARIO_TO_SCENE: Record<Scenario, string> = {
  straight: 'straight', corner: 'corner', goal: 'finish', pack: 'dense',
};
