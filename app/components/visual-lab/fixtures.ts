/**
 * Visual Lab 固定フィクスチャ（本番ロジック非依存）
 *
 * 目的: 3つのビジュアル案を「同じ14頭・同じ密集・同じカメラ・同じコース幅」で
 *       比較するための決定論的なダミーデータ。
 *       本番の timeline / race-dynamics / racecourse-geometry は一切使わない。
 *
 * 座標系は本番と同じ Three.js（Y=up, 地面=XZ）。距離感も本番の馬スケールに合わせる。
 */

export type Surface = 'turf' | 'dirt';
export type Scenario = 'straight' | 'corner' | 'goal' | 'pack';
export type SpeedMode = 'still' | 'slow' | 'normal';
export type Approach = 'cel' | 'semi' | 'dataviz';
export type LabelMode = 'all' | 'selected' | 'leaders' | 'strip';

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

/** 枠番の文字色（黒帽・青帽など暗色は白文字） */
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

/** 18頭分のベース。head(n) で 8/14/18 頭に切り出す。waku は頭数から算出。 */
export function buildFixtureHorses(n: number): FixtureHorse[] {
  const count = Math.max(2, Math.min(18, n));
  const horses: FixtureHorse[] = [];
  for (let i = 0; i < count; i++) {
    const horseNumber = i + 1;
    horses.push({
      horseNumber,
      waku: wakuOf(horseNumber, count),
      name: NAMES[i % NAMES.length],
      styleBias: pseudo(i * 7 + 3),
      jitter: pseudo(i * 13 + 1) * 2 - 1,
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

/** 決定論的な擬似乱数[0,1)（seed から） */
function pseudo(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface HorsePose {
  horseNumber: number;
  x: number;
  z: number;
  /** 進行方向 heading(rad)。atan2(dir.x, dir.z) 準拠 */
  heading: number;
  /** 脚のgait位相オフセット（頭ごとにずらす） */
  gaitOffset: number;
}

/** コース幅（本番 trackWidth 相当）。全案で共通に使う。 */
export const TRACK_WIDTH = 24;
/** 馬の実寸（鼻先〜尾）m 相当。全案共通・見やすさのために変えない。 */
export const HORSE_LENGTH = 2.4;

/**
 * シナリオごとの各馬 world pose を返す（決定論的・密集を再現）。
 * pack は最も密集、straight/goal は隊列、corner は円弧上。
 */
export function scenarioPoses(
  horses: FixtureHorse[],
  scenario: Scenario,
  packT: number // 0..1 アニメの進み（密集の呼吸・前後の揺れ）
): HorsePose[] {
  const n = horses.length;
  const laneStep = TRACK_WIDTH / (Math.max(n, 8) + 1);

  return horses.map((h, i) => {
    // 前後位置: 脚質バイアス + わずかな揺れ
    const rank = h.styleBias; // 0(前)..1(後)
    const wobble = Math.sin(packT * Math.PI * 2 + i) * 0.6 * h.jitter;

    if (scenario === 'corner') {
      // 円弧（右回り想定の一区画）。中心(0,0)半径R。
      const R = 60;
      const spreadAng = 0.55; // 馬群の角度幅
      const a = -Math.PI / 2 + spreadAng * (rank - 0.5) + wobble * 0.01;
      // レーン（内外）: waku 内枠=内側
      const laneR = R + (h.horseNumber - (n + 1) / 2) * laneStep * 0.7;
      const x = Math.cos(a) * laneR;
      const z = Math.sin(a) * laneR;
      const heading = a + Math.PI / 2; // 接線方向
      return { horseNumber: h.horseNumber, x, z, heading, gaitOffset: i * 0.37 };
    }

    // straight / goal / pack: +Z 方向へ進む隊列
    const lane = (h.horseNumber - (n + 1) / 2) * laneStep;
    let depthSpread: number;
    let baseZ: number;
    if (scenario === 'pack') {
      depthSpread = 6; baseZ = 0; // 超密集
    } else if (scenario === 'goal') {
      depthSpread = 10; baseZ = 8; // ゴール前でやや詰まる
    } else {
      depthSpread = 26; baseZ = 0; // 通常隊列
    }
    const z = baseZ - rank * depthSpread + wobble;
    const x = lane;
    return { horseNumber: h.horseNumber, x, z, heading: 0, gaitOffset: i * 0.37 };
  });
}

/** シナリオごとの共通カメラ（全案で同一）。position/lookAt/fov。 */
export interface CameraPreset { position: [number, number, number]; lookAt: [number, number, number]; fov: number; }

export function cameraFor(scenario: Scenario): CameraPreset {
  switch (scenario) {
    case 'corner':
      return { position: [70, 26, -70], lookAt: [40, 2, -40], fov: 34 };
    case 'goal':
      return { position: [26, 9, 34], lookAt: [0, 2, 6], fov: 30 };
    case 'pack':
      return { position: [20, 8, 26], lookAt: [0, 2, 0], fov: 28 };
    case 'straight':
    default:
      return { position: [30, 10, 20], lookAt: [0, 2, -6], fov: 32 };
  }
}
