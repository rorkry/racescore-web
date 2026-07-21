/**
 * ルール候補サービス
 * rule_candidates テーブルの操作
 */

import { db } from '@/lib/db';

export interface RuleCandidate {
  id: string;
  user_id: string;
  name: string;
  conditions: any;
  statistics: any;
  confidence: any;
  validation_results: any[];
  ai_reasoning: {
    hypothesis: string;
    expected_outcome: string;
    reasoning: string;
    interpretation?: any;
    generated_at: string;
    model: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  reviewed_at?: Date;
  research_session_id?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * ルール候補を保存
 */
export async function saveRuleCandidate(
  userId: string,
  candidate: Omit<RuleCandidate, 'id' | 'user_id' | 'status' | 'created_at' | 'updated_at'>
): Promise<RuleCandidate> {
  const id = `rule_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  const result = await db.prepare(`
    INSERT INTO rule_candidates (
      id,
      user_id,
      name,
      conditions,
      statistics,
      confidence,
      validation_results,
      ai_reasoning,
      research_session_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    )
    RETURNING *
  `).get<RuleCandidate>(
    id,
    userId,
    candidate.name,
    JSON.stringify(candidate.conditions),
    JSON.stringify(candidate.statistics),
    JSON.stringify(candidate.confidence),
    JSON.stringify(candidate.validation_results),
    JSON.stringify(candidate.ai_reasoning),
    candidate.research_session_id || null
  );
  
  return result!;
}

/**
 * ユーザーのルール候補一覧を取得
 */
export async function getRuleCandidates(
  userId: string,
  status?: 'pending' | 'approved' | 'rejected'
): Promise<RuleCandidate[]> {
  let query = 'SELECT * FROM rule_candidates WHERE user_id = $1';
  const params: any[] = [userId];
  
  if (status) {
    query += ' AND status = $2';
    params.push(status);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const results = await db.prepare(query).all<RuleCandidate>(...params);
  
  return results.map(r => ({
    ...r,
    conditions: typeof r.conditions === 'string' ? JSON.parse(r.conditions) : r.conditions,
    statistics: typeof r.statistics === 'string' ? JSON.parse(r.statistics) : r.statistics,
    confidence: typeof r.confidence === 'string' ? JSON.parse(r.confidence) : r.confidence,
    validation_results: typeof r.validation_results === 'string' ? JSON.parse(r.validation_results) : r.validation_results,
    ai_reasoning: typeof r.ai_reasoning === 'string' ? JSON.parse(r.ai_reasoning) : r.ai_reasoning
  }));
}

/**
 * ルール候補を承認
 */
export async function approveRuleCandidate(id: string, userId: string): Promise<void> {
  await db.prepare(`
    UPDATE rule_candidates
    SET status = 'approved',
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1 AND user_id = $2
  `).run(id, userId);
}

/**
 * ルール候補を却下
 */
export async function rejectRuleCandidate(id: string, userId: string): Promise<void> {
  await db.prepare(`
    UPDATE rule_candidates
    SET status = 'rejected',
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1 AND user_id = $2
  `).run(id, userId);
}

/**
 * ルール候補を削除
 */
export async function deleteRuleCandidate(id: string, userId: string): Promise<void> {
  await db.prepare(`
    DELETE FROM rule_candidates
    WHERE id = $1 AND user_id = $2
  `).run(id, userId);
}

/**
 * 特定のルール候補を取得
 */
export async function getRuleCandidate(id: string, userId: string): Promise<RuleCandidate | null> {
  const result = await db.prepare(`
    SELECT * FROM rule_candidates
    WHERE id = $1 AND user_id = $2
  `).get<RuleCandidate>(id, userId);
  
  if (!result) return null;
  
  return {
    ...result,
    conditions: typeof result.conditions === 'string' ? JSON.parse(result.conditions) : result.conditions,
    statistics: typeof result.statistics === 'string' ? JSON.parse(result.statistics) : result.statistics,
    confidence: typeof result.confidence === 'string' ? JSON.parse(result.confidence) : result.confidence,
    validation_results: typeof result.validation_results === 'string' ? JSON.parse(result.validation_results) : result.validation_results,
    ai_reasoning: typeof result.ai_reasoning === 'string' ? JSON.parse(result.ai_reasoning) : result.ai_reasoning
  };
}
