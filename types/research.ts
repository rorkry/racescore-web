/**
 * 研究AI の型定義
 */

export type ResearchToolName = 
  | 'sire_analysis'
  | 'broodmare_sire_analysis'
  | 'time_correction'
  | 'waku_analysis'
  | 'style_analysis'
  | 'course_analysis'
  | 'level_analysis'
  | 'odds_analysis';

export type ResearchTargetType = 'race' | 'horse' | 'jockey' | 'sire' | 'course';

export interface ResearchSession {
  id: string;
  userId: string;
  parentSessionId?: string;         // 親研究のID（派生元）
  targetType: ResearchTargetType;   // レース・馬・騎手など
  targetId: string;                 // 対象のID
  initialQuestion: string;
  researchGoal: string;             // 今回何を明らかにしたいか
  modelUsed: string;
  status: 'running' | 'completed' | 'failed';
  totalSteps: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface ResearchStep {
  id: string;
  sessionId: string;
  stepNumber: number;
  
  // 行動ログ（シンプル）
  toolName: ResearchToolName;
  toolVersion: string;              // ツールのスキーマバージョン
  toolInput: Record<string, any>;
  toolOutput: Record<string, any>;  // schema_version を含む
  
  executedAt: Date;
  executionTimeMs?: number;
}

export interface ResearchRequest {
  target_type: ResearchTargetType;
  target_id: string;
  question: string;
  goal: string;  // 「過大評価の理由を明らかにする」
  parent_session_id?: string;  // 派生元の研究ID
  context?: Record<string, any>;
}

// 将来の拡張: AIが研究計画を立てる
// export interface ResearchPlan {
//   steps: Array<{
//     tool: ResearchToolName;
//     purpose: string;
//     expected_output: string;
//   }>;
//   estimated_duration: number;
// }
