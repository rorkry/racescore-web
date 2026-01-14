export type PaceType = 'slow' | 'middle' | 'high';
export type RunningStyle = 'escape' | 'lead' | 'sashi' | 'oikomi';

export interface HorsePositionPrediction {
  horseNumber: number;
  horseName: string;
  runningStyle: RunningStyle;
  expectedPosition2C: number;
  avgFront2FLap: number | null;  // 距離フィルタ済みT2F（前半2F秒数）
  avgL4F?: number | null;        // 距離フィルタ済みL4F（後半4F指数）
  avgPosition2C: number | null;
  pastRaceCount: number;
  confidence: 'high' | 'medium' | 'low';
  waku: string;
  kinryo: number; // 斤量（kg）
  isConsistentLoser?: boolean; // 近走平均2秒以上大敗（ゴール前失速フラグ）
  avgPotential: number | null; // 平均ポテンシャル指数
  avgMakikaeshi: number | null; // 平均巻き返し指数
  // デバッグ情報（メンバー内比較）
  t2fRaceCount?: number;         // T2F対象レース数（距離フィルタ済み）
  l4fRaceCount?: number;         // L4F対象レース数（距離フィルタ済み）
  t2fPercentile?: number;        // メンバー内T2Fパーセンタイル（低いほど速い）
  l4fPercentile?: number;        // メンバー内L4Fパーセンタイル（低いほど速い）
  t2fMemberCount?: number;       // T2Fデータがあるメンバー数
  l4fMemberCount?: number;       // L4Fデータがあるメンバー数
  // 椅子取りゲーム（相対評価）情報
  chairGameCutIn?: boolean;      // 内に切れ込んだか
  chairGamePushedOut?: boolean;  // 外に押し出されたか
}

export interface RacePacePrediction {
  raceKey: string;
  expectedPace: PaceType;
  frontRunners: number;
  avgFront2FLap: number | null;
  predictions: HorsePositionPrediction[];
  courseInfo: {
    place: string;
    distance: number;
    trackType: string;
    straightLength: number;
    hasSlope: boolean;
    slopePosition?: string;
    innerFrameAdvantage: number;
    outerFrameAdvantage: number;
  } | null;
}

export interface UmadataRecord {
  race_id_new_no_horse_num: string;
  horse_name: string;
  horse_number: string;
  corner_2?: string;
  corner_3?: string;
  corner_4?: string;
  distance?: string;
}

export interface WakujunRecord {
  umaban: string;
  umamei: string;
  waku: string;
  distance: string;
  track_type: string;
  kinryo: string;
}

