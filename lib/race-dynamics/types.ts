/**
 * race-dynamics / types
 *
 * 「各馬が別々のレースをする」独立ダイナミクスの型。
 * 3D座標化はここでは行わない（raceProgress / lateralPosition を出力するだけ）。
 * 描画側で sampleRaceProgressPose(geometry, startMarker, raceProgress, lateralPosition) を使う。
 */

export type RunningStyle = 'escape' | 'front' | 'stalker' | 'closer';

export type PaceType = 'slow' | 'middle' | 'high';

/** シミュレーション入力（1頭分） */
export interface HorseInput {
  horseId: string;
  horseNumber: number;
  runningStyle: RunningStyle;
  /** 総合能力 0..1（正規化済み） */
  ability: number;
  /** 0-based の枠順（初期横位置に使用）。配列 index ではない */
  gateIndex: number;
  /** 反応の遅れ(s)。省略時は脚質から決定 */
  reactionDelay?: number;
  /** スタミナ基礎 0..1。省略時は 0.6 + ability*0.3 */
  staminaBase?: number;
  /**
   * 初期横位置(m)。指定時は gateIndex 由来より優先。
   * start-phase / 旧2D の lateralPosition を踏襲するために使う。
   */
  initialLateralPosition?: number;
  /**
   * スタート後隊列の初期 raceProgress オフセット（0..約0.08）。
   * 先頭に近いほど大きい。省略時は 0。
   */
  initialProgressOffset?: number;
}

export interface RaceDynamicsConfig {
  raceDistance: number;
  /** 走路幅(m)。横移動の限界に使う */
  trackWidth: number;
  /** 決定論シード */
  seed: number;
  /** 外部から与えるペース傾向（無ければ隊列から推定） */
  pace?: PaceType;
  /** 積分ステップ(s)。既定 0.1 */
  dt?: number;
  /** フレーム記録間隔(s)。既定 0.2 */
  frameInterval?: number;
  /** コース補正（既定 1 = identity。将来の速度モデル差し込み口） */
  courseModifier?: number;
  /** 馬場補正（既定 1 = identity） */
  goingModifier?: number;
  /** 安全上限時間(s)。既定 raceDistance/8 + 60 */
  maxTime?: number;
}

/** 1フレーム・1頭の状態 */
export interface HorseFrameState {
  horseId: string;
  horseNumber: number;
  /** 走破距離メートル（0..raceDistance）。0..1 正規化値ではない */
  raceProgress: number;
  speed: number;
  acceleration: number;
  lateralPosition: number;
  targetLateralPosition: number;
  runningStyle: RunningStyle;
  ability: number;
  stamina: number;
  rank: number;
  blocked: boolean;
  finished: boolean;
  finishTime?: number;
}

export interface RaceDynamicsFrame {
  time: number;
  horses: HorseFrameState[];
}

export interface FinishRecord {
  horseId: string;
  horseNumber: number;
  rank: number;
  finishTime: number;
}

export interface RaceDynamicsResult {
  frames: RaceDynamicsFrame[];
  finishOrder: FinishRecord[];
  raceDistance: number;
  totalTime: number;
  seed: number;
  pace: PaceType;
  warnings: string[];
}
