/**
 * レースシミュレーター用の型定義
 */

// ===================================
// コース情報
// ===================================

export interface CourseInfo {
  id: string;
  place: string;              // 競馬場名（例: "東京", "中山"）
  distance: number;           // 距離（m）
  trackType: 'turf' | 'dirt'; // 芝/ダート
  
  // コース形状
  straightLength: number;     // 直線距離（m）
  startToFirstCorner: number; // スタートから1コーナーまで（m）
  
  corners: Corner[];
  slopes: Slope[];
  
  // 傾向
  innerAdvantage: number;     // 内有利度 (-5 〜 +5)
  outerAdvantage: number;     // 外有利度 (-5 〜 +5)
  paceTendency: 'slow' | 'middle' | 'high';
}

export interface Corner {
  name: string;               // "1コーナー", "3コーナー"
  position: number;           // スタートからの距離（m）
  radius: number;             // コーナー半径（m、小さい=急）
  angle: number;              // 曲がる角度（度）
}

export interface Slope {
  start: number;              // 坂開始地点（m）
  end: number;                // 坂終了地点（m）
  gradient: number;           // 勾配（%）
  type: 'up' | 'down';
}

// ===================================
// 馬場バイアス（ユーザー入力）
// ===================================

export interface TrackBias {
  condition: 'firm' | 'good' | 'yielding' | 'soft' | 'heavy'; // 馬場状態
  innerBias: number;          // 内有利度 (-10 〜 +10)
  outerBias: number;          // 外有利度 (-10 〜 +10)
  frontBias: number;          // 前残り度 (-10 〜 +10)
  rearBias: number;           // 差し有利度 (-10 〜 +10)
  comment?: string;           // ユーザーコメント
}

// ===================================
// 馬の状態
// ===================================

export interface HorseState {
  horseNumber: number;
  horseName: string;
  
  // 位置情報
  position: number;           // 現在の順位（1=先頭）
  internalLane: number;       // 内外ライン（1=最内, 8=最外）
  distanceFromLeader: number; // 先頭からの距離（メートル）
  
  // 【Phase 4.1 追加】走行データ（シミュレーション計算結果）
  currentDistance: number;    // スタートから現在地までの走行距離（m）
  currentVelocity: number;    // 現在速度（m/s）
  lateralPosition: number;    // 横位置（m、コース中央を0として -10〜+10）
  
  // 能力値（0-100スケール）
  capabilities: HorseCapabilities;
  
  // 意欲・戦略
  leadingIntention: number;   // 先行意欲 (0-100)
  pfs: number;                // 先行期待度（過去）
  pastPositionPattern: string;// 過去通過順パターン "1-1-2-3" など
  
  // 状態
  staminaRemaining: number;   // 残スタミナ (0-100)
  blocked: boolean;           // 前が詰まっている
  outerPath: boolean;         // 外を回っている
  
  // 馬場・枠
  waku: number;
  weight: number;             // 斤量（kg）
  trackBiasEffect: number;    // 馬場バイアス効果 (-10 〜 +10)
}

export interface HorseCapabilities {
  startSpeed: number;         // スタートダッシュ力 (0-100)
  cruiseSpeed: number;        // 巡航速度 (0-100)
  acceleration: number;       // 加速力 (0-100)
  stamina: number;            // スタミナ (0-100)
  cornerSkill: number;        // コーナリング (0-100)
}

// ===================================
// シミュレーション結果
// ===================================

export interface SimulationResult {
  raceKey: string;
  phases: {
    start: PhaseResult;
    formation: PhaseResult;
    pace: PhaseResult;
    corner3_4: PhaseResult;
    straight: PhaseResult;
    goal: PhaseResult;
  };
  finalStandings: HorseState[];
  visualization?: {
    timeline: Array<{ time: number; horses: HorseState[] }>;
  };
}

export interface PhaseResult {
  phaseName: string;
  distanceRange: { start: number; end: number };
  timeRange: { start: number; end: number }; // 【Phase 4.1 追加】経過時間（秒）
  horses: HorseState[];
  paceInfo: {
    averageSpeed: number;
    leadingHorses: number[];
    paceType: 'slow' | 'middle' | 'high';
  };
  events: SimulationEvent[];
}

export interface SimulationEvent {
  horseNumber: number;
  horseName: string;
  event: 'cut-in' | 'blocked' | 'accelerate' | 'decelerate' | 'overtake' | 'stamina-loss';
  description: string;
}

// ===================================
// シミュレーション入力
// ===================================

export interface SimulationInput {
  // レース情報
  year: string;
  date: string;
  place: string;
  raceNumber: string;
  
  // オプション
  trackBias?: TrackBias;      // ユーザー入力の馬場バイアス
  enableDetailedLog?: boolean; // 詳細ログ出力
}
