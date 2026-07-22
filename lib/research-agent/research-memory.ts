/**
 * 研究メモリシステム
 * 過去の研究結果を記憶し、セッションをまたいで活用する
 */

import { getDbAsync } from '@/lib/db';
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import type { ConditionCandidate } from './condition-generator';
import type { ConditionResult } from './autonomous-engine';

export interface ResearchMemoryEntry {
  id: string;
  user_id: string;
  condition_hash: string;
  condition_name: string;
  conditions: any[];
  statistics: any;
  is_promising: boolean;
  promising_score: number;
  expected_value_diff: number;
  theme_type?: string;
  base_field?: string;
  first_tested_at: Date;
  last_tested_at: Date;
  test_count: number;
  parent_condition_id?: string;
  derived_condition_ids: string[];
  exploration_status: 'new' | 'promising' | 'exhausted' | 'avoid';
  ai_notes?: string;
  next_actions?: any;
}

/**
 * 条件のハッシュ値を生成（重複チェック用）
 */
export function generateConditionHash(conditions: any[]): string {
  // 条件を正規化してソート
  const normalized = conditions
    .map(c => ({
      field: c.field,
      operator: c.operator,
      value: c.value
    }))
    .sort((a, b) => a.field.localeCompare(b.field));
  
  const json = JSON.stringify(normalized);
  return createHash('sha256').update(json).digest('hex').substring(0, 16);
}

/**
 * テーマタイプを推測
 */
export function inferThemeType(conditions: any[]): string | undefined {
  if (conditions.length === 0) return undefined;
  
  const fields = conditions.map(c => c.field);
  
  if (fields.includes('makikaeshi')) return 'makikaeshi';
  if (fields.includes('potential')) return 'potential';
  if (fields.includes('L4F')) return 'l4f';
  if (fields.includes('T2F')) return 't2f';
  if (fields.includes('sire')) return 'pedigree';
  if (fields.includes('jockey')) return 'jockey';
  if (fields.includes('place') || fields.includes('distance')) return 'course';
  if (fields.includes('waku')) return 'waku';
  if (fields.includes('weight_carried')) return 'weight';
  if (fields.includes('popularity')) return 'popularity';
  
  return 'other';
}

/**
 * 研究結果をメモリに保存
 */
export async function saveToMemory(
  userId: string,
  result: ConditionResult,
  parentConditionId?: string
): Promise<string> {
  const db = await getDbAsync();
  const conditionHash = generateConditionHash(result.candidate.conditions);
  const themeType = inferThemeType(result.candidate.conditions);
  const baseField = result.candidate.conditions[0]?.field;
  
  // 既存のエントリを確認
  const existing = await db.query(
    'SELECT id, test_count, derived_condition_ids FROM research_memory WHERE user_id = $1 AND condition_hash = $2',
    [userId, conditionHash]
  );
  
  if (existing.rows.length > 0) {
    // 既存エントリを更新
    const existingEntry = existing.rows[0];
    await db.query(
      `UPDATE research_memory
       SET 
         last_tested_at = NOW(),
         test_count = test_count + 1,
         statistics = $1,
         is_promising = $2,
         promising_score = $3,
         expected_value_diff = $4,
         updated_at = NOW()
       WHERE id = $5`,
      [
        JSON.stringify(result.statistics),
        result.is_promising,
        result.promising_score,
        result.statistics.expected_value_diff,
        existingEntry.id
      ]
    );
    
    return existingEntry.id;
  } else {
    // 新規エントリを作成
    const id = nanoid();
    const explorationStatus = result.is_promising ? 'promising' : 
                               result.promising_score < 30 ? 'avoid' : 'new';
    
    await db.query(
      `INSERT INTO research_memory (
        id, user_id, condition_hash, condition_name, conditions,
        statistics, is_promising, promising_score, expected_value_diff,
        theme_type, base_field, exploration_status, parent_condition_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        userId,
        conditionHash,
        result.candidate.name,
        JSON.stringify(result.candidate.conditions),
        JSON.stringify(result.statistics),
        result.is_promising,
        result.promising_score,
        result.statistics.expected_value_diff,
        themeType,
        baseField,
        explorationStatus,
        parentConditionId || null
      ]
    );
    
    // 親条件の派生リストを更新
    if (parentConditionId) {
      await db.query(
        `UPDATE research_memory
         SET derived_condition_ids = array_append(derived_condition_ids, $1),
             updated_at = NOW()
         WHERE id = $2`,
        [id, parentConditionId]
      );
    }
    
    return id;
  }
}

/**
 * 過去の研究結果を取得
 */
export async function getResearchHistory(
  userId: string,
  filters?: {
    theme_type?: string;
    is_promising?: boolean;
    exploration_status?: string;
    limit?: number;
  }
): Promise<ResearchMemoryEntry[]> {
  const db = await getDbAsync();
  
  let query = 'SELECT * FROM research_memory WHERE user_id = $1';
  const params: any[] = [userId];
  let paramIndex = 2;
  
  if (filters?.theme_type) {
    query += ` AND theme_type = $${paramIndex}`;
    params.push(filters.theme_type);
    paramIndex++;
  }
  
  if (filters?.is_promising !== undefined) {
    query += ` AND is_promising = $${paramIndex}`;
    params.push(filters.is_promising);
    paramIndex++;
  }
  
  if (filters?.exploration_status) {
    query += ` AND exploration_status = $${paramIndex}`;
    params.push(filters.exploration_status);
    paramIndex++;
  }
  
  query += ' ORDER BY last_tested_at DESC';
  
  if (filters?.limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(filters.limit);
  }
  
  const result = await db.query(query, params);
  return result.rows;
}

/**
 * すでにテストした条件かチェック
 */
export async function hasBeenTested(
  userId: string,
  conditions: any[]
): Promise<boolean> {
  const db = await getDbAsync();
  const conditionHash = generateConditionHash(conditions);
  
  const result = await db.query(
    'SELECT id FROM research_memory WHERE user_id = $1 AND condition_hash = $2',
    [userId, conditionHash]
  );
  
  return result.rows.length > 0;
}

/**
 * 有望なテーマを取得
 */
export async function getPromisingThemes(
  userId: string,
  limit: number = 5
): Promise<ResearchMemoryEntry[]> {
  return getResearchHistory(userId, {
    is_promising: true,
    exploration_status: 'promising',
    limit
  });
}
