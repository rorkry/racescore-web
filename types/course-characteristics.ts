/**
 * コース特性データベースの型定義
 * 
 * 全競馬場のコース特性を定義し、
 * 展開予想AI、俺AI、コース分析機能で参照される
 */

export type TrackSurface = '芝' | 'ダート';
export type TrackDirection = '右回り' | '左回り';
export type TrackSize = '内回り' | '外回り' | '標準';
export type StraightLength = '短い' | '標準' | '長い';

/**
 * 馬場状態
 * 良: 良馬場（標準状態）
 * 稍: 稍重（やや水分を含む）
 * 重: 重馬場（水分多め）
 * 不: 不良馬場（非常に水分が多い）
 */
export type TrackCondition = '良' | '稍' | '重' | '不';

/**
 * 馬場状態別の特性情報
 */
export interface ConditionNotes {
  /** 良馬場時の特性 */
  良?: {
    gateAdvantage?: string;
    characteristics?: string[];
    notes?: string;
  };
  /** 稍重時の特性 */
  稍?: {
    gateAdvantage?: string;
    characteristics?: string[];
    notes?: string;
  };
  /** 重馬場時の特性 */
  重?: {
    gateAdvantage?: string;
    characteristics?: string[];
    notes?: string;
  };
  /** 不良馬場時の特性 */
  不?: {
    gateAdvantage?: string;
    characteristics?: string[];
    notes?: string;
  };
}

/**
 * コースパターン分類
 * A-C: 芝コース（最初のコーナーまでの距離で分類）
 * D-F: ダートコース（最初のコーナーまでの距離で分類）
 */
export type CoursePattern = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface CourseCharacteristics {
  // ========================================
  // 基本情報
  // ========================================
  
  /** コースID（例: "nakayama_turf_1600"） */
  courseId: string;
  
  /** 競馬場名（例: "中山"） */
  racecourse: string;
  
  /** 距離（メートル） */
  distance: number;
  
  /** 馬場（芝/ダート） */
  surface: TrackSurface;
  
  /** 回り方向 */
  direction: TrackDirection;
  
  /** コースサイズ（内回り/外回り/標準） */
  trackSize?: TrackSize;
  
  // ========================================
  // コース形状
  // ========================================
  
  /** 直線の長さ */
  straightLength: StraightLength;
  
  /** 直線距離（メートル） */
  straightDistance?: number;
  
  /** 坂の有無 */
  hasSlope: boolean;
  
  /** 坂の説明 */
  slopeDescription?: string;
  
  /** ダートコースで芝スタートかどうか */
  turfStartDirt?: boolean;
  
  /** 芝スタートの説明（スタート位置の詳細） */
  turfStartDescription?: string;
  
  // ========================================
  // 内部データ（AIが参照するが表示しない）
  // ========================================
  
  /** 最初のコーナーまでの距離（メートル） */
  distanceToFirstCorner: number;
  
  /** コースパターン分類 */
  coursePattern: CoursePattern;
  
  // ========================================
  // コース特性（テキスト）
  // ========================================
  
  /** 特徴のリスト（UI表示用） */
  characteristics: string[];
  
  /** ペース傾向 */
  paceTendency?: string;
  
  /** 時期別特性 */
  seasonalNotes?: {
    [month: string]: string;
  };
  
  /** 枠有利不利 */
  gateAdvantage?: string;
  
  /** 有利な脚質 */
  runningStyleAdvantage?: string[];
  
  /** 追加メモ */
  notes?: string;
  
  // ========================================
  // 馬場状態別特性
  // ========================================
  
  /** 馬場状態別の特性（良/稍/重/不） */
  conditionNotes?: ConditionNotes;
}

/**
 * コースデータベース全体の型
 */
export type CourseDatabase = {
  [courseId: string]: CourseCharacteristics;
};

/**
 * コースIDを生成するヘルパー
 */
export function generateCourseId(
  racecourse: string,
  surface: TrackSurface,
  distance: number,
  trackSize?: TrackSize
): string {
  const surfaceKey = surface === '芝' ? 'turf' : 'dirt';
  const base = `${racecourse.toLowerCase()}_${surfaceKey}_${distance}`;
  
  if (trackSize && trackSize !== '標準') {
    return `${base}_${trackSize === '内回り' ? 'inner' : 'outer'}`;
  }
  
  return base;
}

/**
 * 競馬場コード（JRA公式）
 */
export const RACECOURSE_CODES: Record<string, string> = {
  '札幌': '01',
  '函館': '02',
  '福島': '03',
  '新潟': '04',
  '東京': '05',
  '中山': '06',
  '中京': '07',
  '京都': '08',
  '阪神': '09',
  '小倉': '10',
};

/**
 * 競馬場の直線距離（参考値）
 */
export const STRAIGHT_DISTANCES: Record<string, number> = {
  '東京': 525,
  '中京': 412,
  '京都_外': 404,
  '阪神_外': 473,
  '新潟_外': 659,
  '新潟_内': 359,
  '中山': 310,
  '福島': 292,
  '小倉': 293,
  '札幌': 266,
  '函館': 262,
  '京都_内': 328,
  '阪神_内': 356,
};

