/**
 * ルールマッチングエンジン
 * レースの出走馬に対してルールを適用し、評価を行う
 */

import type { Rule, RuleCondition, RuleMatch, HorseEvaluation, RaceEvaluation } from '@/types/rule';

export class RuleMatcher {
  /**
   * レース全体を評価
   */
  async evaluateRace(
    raceKey: string,
    horses: any[],
    rules: Rule[]
  ): Promise<RaceEvaluation> {
    const activeRules = rules.filter(r => r.is_active);
    const evaluations: HorseEvaluation[] = [];
    
    for (const horse of horses) {
      const evaluation = await this.evaluateHorse(horse, activeRules);
      evaluations.push(evaluation);
    }
    
    return {
      race_key: raceKey,
      evaluated_at: new Date(),
      horses: evaluations,
      rules_applied: activeRules.length
    };
  }
  
  /**
   * 1頭を評価
   */
  private async evaluateHorse(
    horse: any,
    rules: Rule[]
  ): Promise<HorseEvaluation> {
    const matches: RuleMatch[] = [];
    
    for (const rule of rules) {
      const match = this.matchRule(horse, rule);
      if (match) {
        matches.push(match);
      }
    }
    
    const totalScore = matches.reduce((sum, m) => sum + m.weight, 0);
    const totalEV = matches.reduce((sum, m) => sum + m.expected_value_diff, 0);
    const avgConf = matches.length > 0
      ? matches.reduce((sum, m) => sum + m.confidence_level, 0) / matches.length
      : 0;
    
    return {
      horse_number: parseInt(horse.umaban || '0', 10),
      horse_name: horse.umamei || '',
      matched_rules: matches,
      total_score: totalScore,
      total_expected_value: totalEV,
      avg_confidence: avgConf,
      rank: this.calculateRank(totalScore)
    };
  }
  
  /**
   * ルールマッチング
   */
  private matchRule(horse: any, rule: Rule): RuleMatch | null {
    const matchedConditions: RuleMatch['matched_conditions'] = [];
    
    for (const condition of rule.conditions) {
      const result = this.checkCondition(horse, condition);
      
      matchedConditions.push({
        field: condition.field,
        operator: condition.operator,
        actual_value: result.actual_value,
        required_value: condition.value,
        matched: result.matched
      });
      
      // AND条件なので1つでも満たさなければNG
      if (!result.matched) {
        return null;
      }
    }
    
    // すべての条件を満たした場合
    return {
      rule_id: rule.id,
      rule_name: rule.name,
      weight: rule.weight,
      expected_value_diff: rule.statistics.expected_value_diff,
      confidence_level: rule.statistics.confidence_level,
      category: rule.category,
      matched_conditions: matchedConditions
    };
  }
  
  /**
   * 条件チェック
   */
  private checkCondition(
    horse: any,
    condition: RuleCondition
  ): { matched: boolean; actual_value: any } {
    const actualValue = this.getValue(horse, condition);
    const matched = this.compareValues(actualValue, condition.operator, condition.value);
    
    return { matched, actual_value: actualValue };
  }
  
  /**
   * 値の取得
   */
  private getValue(horse: any, condition: RuleCondition): any {
    const { field, target } = condition;
    
    // 前走データの場合
    if (target === 'last_race') {
      // TODO: 前走データを取得
      // horse.past_races?.[0]?.[field]
      return horse.past?.[0]?.[field] || null;
    }
    
    // 血統データの場合
    if (target === 'pedigree') {
      // horse.sire, horse.broodmare_sire など
      return horse[field] || null;
    }
    
    // 今回のレースデータ
    return horse[field] || null;
  }
  
  /**
   * 値の比較
   */
  private compareValues(actual: any, operator: RuleCondition['operator'], required: any): boolean {
    if (actual === null || actual === undefined) return false;
    
    switch (operator) {
      case 'eq':
        return actual === required;
      
      case 'neq':
        return actual !== required;
      
      case 'gte':
        return parseFloat(actual) >= parseFloat(required);
      
      case 'lte':
        return parseFloat(actual) <= parseFloat(required);
      
      case 'between':
        if (!Array.isArray(required) || required.length !== 2) return false;
        const val = parseFloat(actual);
        return val >= parseFloat(required[0]) && val <= parseFloat(required[1]);
      
      case 'in':
        if (!Array.isArray(required)) return false;
        return required.includes(actual);
      
      case 'not_in':
        if (!Array.isArray(required)) return false;
        return !required.includes(actual);
      
      default:
        return false;
    }
  }
  
  /**
   * ランク計算
   */
  private calculateRank(score: number): HorseEvaluation['rank'] {
    if (score >= 80) return 'S';
    if (score >= 60) return 'A';
    if (score >= 40) return 'B';
    if (score >= 20) return 'C';
    if (score > 0) return 'D';
    return 'N';  // No match
  }
}

/**
 * ランクの表示用ラベル
 */
export function getRankLabel(rank: HorseEvaluation['rank']): string {
  switch (rank) {
    case 'S': return '⭐⭐⭐ 最高';
    case 'A': return '⭐⭐ 高評価';
    case 'B': return '⭐ 中評価';
    case 'C': return '低評価';
    case 'D': return '微評価';
    case 'N': return '該当なし';
  }
}

/**
 * ランクの色
 */
export function getRankColor(rank: HorseEvaluation['rank']): string {
  switch (rank) {
    case 'S': return 'text-purple-600 bg-purple-100';
    case 'A': return 'text-blue-600 bg-blue-100';
    case 'B': return 'text-green-600 bg-green-100';
    case 'C': return 'text-yellow-600 bg-yellow-100';
    case 'D': return 'text-gray-600 bg-gray-100';
    case 'N': return 'text-gray-400 bg-gray-50';
  }
}
