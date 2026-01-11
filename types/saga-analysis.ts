/**
 * 俺AI 分析結果の型定義
 */

/**
 * パフォーマンスデバッグ情報
 * 指数比較の詳細を表示するための情報
 */
export interface PerformanceDebugInfo {
  /** 比較対象の総数 */
  totalComparisons: number;
  /** レース内での順位 */
  rankInRace: number;
  /** パーセンタイル（上位何%か） */
  percentile: number;
  /** 比較スコープの説明 */
  comparisonScope: string;
}

/**
 * 馬の分析結果
 */
export interface HorseAnalysis {
  horseName: string;
  horseNumber: number;
  /** 俺AI総合スコア（0-100） */
  score: number;
  /** 競うスコア */
  kisoScore: number;
  /** タグ（近走好調、スコア1位など） */
  tags: string[];
  /** コメント */
  comments: string[];
  /** 警告 */
  warnings: string[];
  /** コース適性 */
  courseMatch: {
    rating: 'S' | 'A' | 'B' | 'C' | 'D';
    reason: string;
  };
  /** ローテーション分析 */
  rotationNote: string | null;
  /** デバッグ情報 */
  debugInfo?: {
    l4f?: PerformanceDebugInfo;
    t2f?: PerformanceDebugInfo;
    potential?: PerformanceDebugInfo;
    makikaeshi?: PerformanceDebugInfo;
  };
}

/**
 * 推定指数
 * 実際の指数データがない場合に着順・着差から推定
 */
export interface EstimatedIndices {
  l4f: number;
  t2f: number;
  potential: number;
  makikaeshi: number;
  /** 推定値かどうか */
  isEstimated: boolean;
}

/**
 * 馬の入力データ
 */
export interface HorseInput {
  horseId: string;
  horseName: string;
  horseNumber: number;
  frameNumber: number;
  kisoScore?: number;
  l4f?: number;
  t2f?: number;
  potential?: number;
  makikaeshi?: number;
  position_2corner?: string;
  daysSinceLastRace?: number;
  previousDistance?: number;
  pastRaces?: any[];
  /** 今回距離±200mの過去走数 */
  relevantRaceCount?: number;
}

/**
 * レース情報
 */
export interface RaceInfo {
  place: string;
  distance: number;
  surface: '芝' | 'ダ' | 'ダート';
  trackCondition?: '良' | '稍' | '重' | '不';
}




