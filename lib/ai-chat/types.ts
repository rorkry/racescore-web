/**
 * AIチャット関連の型定義
 */

// チャットメッセージ
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// 予想リクエスト
export interface PredictionRequest {
  raceKey: string;        // レースキー（例: 2026_0123_中山_11）
  year: number;
  date: string;
  place: string;
  raceNumber: number;
  baba?: 'inner' | 'outer' | 'flat';  // 馬場（内/外/フラット）
  pace?: 'slow' | 'middle' | 'fast';   // 展開（スロー/ミドル/ハイ）
}

// 予想レスポンス
export interface PredictionResponse {
  prediction: string;     // 生成された予想文
  analysis?: {
    overvalued: string[];   // 過大評価の馬
    undervalued: string[];  // 過小評価の馬
  };
  references?: string[];  // 参考にした過去予想のID
}

// 過去予想データ（DB保存用）
export interface StoredPrediction {
  id: string;
  discord_message_id: string;
  timestamp: string;
  author: string;
  
  // レース情報
  race_course: string | null;
  race_number: number | null;
  race_name: string | null;
  distance: number | null;
  surface: string | null;
  
  // 予想内容
  honmei: number[];
  taikou: number[];
  ana: number[];
  
  // 買い目（JSON文字列）
  bets_json: string;
  
  // 予想文（全文）
  full_text: string;
  
  // メタ情報
  reaction_count: number;
  hit: boolean | null;     // 的中したか（🎯リアクションで判定）
  
  created_at: string;
}

// ギャップ判定結果
export interface GapEvaluation {
  horseName: string;
  horseNumber: number;
  type: '過大評価' | '妥当' | '過小評価';
  reasons: string[];
  score: number;
}

// レースデータ（AIに渡す用）
export interface RaceDataForAI {
  place: string;
  raceNumber: number;
  distance: number;
  surface: '芝' | 'ダ';
  trackCondition: string;
  horses: HorseDataForAI[];
}

export interface HorseDataForAI {
  number: number;
  name: string;
  jockey: string;
  trainer: string;
  
  // 過去走
  last1: PastRaceForAI | null;
  last2: PastRaceForAI | null;
  last3: PastRaceForAI | null;
  
  // Strideデータ
  timeRating?: string;      // タイム評価
  lapRating?: string;       // ラップ評価
  potential?: number;       // ポテンシャル指数
  makikaeshi?: number;      // 巻き返し指数
  raceLevel?: string;       // 前走レースレベル
  
  // ギャップ判定
  gap?: GapEvaluation;
}

export interface PastRaceForAI {
  date: string;
  place: string;
  distance: number;
  surface: string;
  finishPosition: number;
  margin: string;
  trackCondition: string;
  popularity: number;
}
