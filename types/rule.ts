/**
 * ルールエンジンの型定義
 */

export type RuleOperator = 'eq' | 'neq' | 'gte' | 'lte' | 'between' | 'in' | 'not_in';

export type RuleTarget = 'last_race' | 'last_2_race' | 'current' | 'pedigree';

export interface RuleCondition {
  field: string;                   // "race_level", "margin", "broodmare_sire"
  operator: RuleOperator;
  value: any;                      // "A", 0.3, ["ディープ", "キンカメ"]
  target?: RuleTarget;             // データの取得元
}

export interface Rule {
  id: string;
  user_id: string;
  
  // 基本情報
  name: string;                    // "前走A+僅差負け"
  description?: string;
  category?: string;               // "前走", "血統", "枠順"
  
  // 重み付け
  weight: number;                  // 30点
  
  // 条件定義（複数条件のAND）
  conditions: RuleCondition[];
  
  // 統計データ
  statistics: {
    sample_size: number;
    win_rate: number;
    place_return_rate: number;
    expected_value_diff: number;
    confidence_level: number;
  };
  
  // メタ情報
  is_active: boolean;              // アクティブか
  tags: string[];                  // タグ
  
  created_at: Date;
  updated_at: Date;
}

export interface RuleMatch {
  rule_id: string;
  rule_name: string;
  weight: number;
  expected_value_diff: number;
  confidence_level: number;
  category?: string;
  
  // マッチした条件の詳細
  matched_conditions: {
    field: string;
    operator: RuleOperator;
    actual_value: any;             // 実際の値
    required_value: any;           // 要求値
    matched: boolean;
  }[];
}

export interface HorseEvaluation {
  horse_number: number;
  horse_name: string;
  
  // マッチしたルール
  matched_rules: RuleMatch[];
  
  // 総合スコア
  total_score: number;             // 合計点
  total_expected_value: number;    // 合計期待値
  avg_confidence: number;          // 平均信頼度
  
  // 評価ランク
  rank: 'S' | 'A' | 'B' | 'C' | 'D' | 'N';  // N = No match
}

export interface RaceEvaluation {
  race_key: string;
  evaluated_at: Date;
  horses: HorseEvaluation[];
  rules_applied: number;
}
