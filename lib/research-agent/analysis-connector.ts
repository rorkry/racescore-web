/**
 * 既存分析エンジンとの連携
 * 条件を既存の分析ツールで評価する
 */

import type { RuleCondition } from '@/types/rule';
import { getDb } from '@/lib/db';

export interface AnalysisStatistics {
  sample_size: number;
  win_rate: number;
  place_rate: number;
  show_rate: number;
  avg_finish: number;
  win_return_rate: number;
  place_return_rate: number;
  expected_value_diff: number;
  total_investment?: number;
  total_return?: number;
  profit?: number;
}

export interface AnalysisResult {
  statistics: AnalysisStatistics;
  confidence: {
    confidence_level: number;
    is_significant: boolean;
    warnings: string[];
  };
  baseline_comparison?: {
    baseline: any;
    lift: any;
    expected_value_diff: number;
    is_better: boolean;
  };
  odds_breakdown?: {
    total_horses: number;
    horses_with_odds: number;
    winning_horses: number;
    avg_all_odds: number;
    avg_winning_odds: number;
    avg_losing_odds: number;
  };
}

export class AnalysisConnector {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }
  
  /**
   * 条件を既存エンジンで評価
   */
  async evaluateCondition(conditions: RuleCondition[]): Promise<AnalysisResult> {
    // 条件の種類を判定
    const conditionType = this.detectConditionType(conditions);
    
    // 適切な分析ツールを選択して呼び出し
    switch (conditionType) {
      case 'pedigree':
        return await this.callPedigreeAnalysis(conditions);
      
      case 'last_race':
        return await this.callLastRaceAnalysis(conditions);
      
      case 'waku':
        return await this.callWakuAnalysis(conditions);
      
      case 'course':
        return await this.callCourseAnalysis(conditions);
      
      case 'combined':
        return await this.callCombinedAnalysis(conditions);
      
      default:
        return await this.callGenericAnalysis(conditions);
    }
  }
  
  /**
   * 条件の種類を判定
   */
  private detectConditionType(conditions: RuleCondition[]): string {
    const fields = conditions.map(c => c.field);
    
    // 血統系
    if (fields.some(f => ['sire', 'broodmare_sire', 'sire_type', 'dam_type'].includes(f))) {
      return 'pedigree';
    }
    
    // 前走系
    if (fields.some(f => f.startsWith('last_'))) {
      return 'last_race';
    }
    
    // 枠順系
    if (fields.includes('waku')) {
      return 'waku';
    }
    
    // コース系
    if (fields.some(f => ['place', 'surface', 'distance'].includes(f))) {
      return 'course';
    }
    
    // 複合
    if (conditions.length > 2) {
      return 'combined';
    }
    
    return 'generic';
  }
  
  /**
   * 血統分析
   */
  private async callPedigreeAnalysis(conditions: RuleCondition[]): Promise<AnalysisResult> {
    // 血統系の条件は汎用分析で処理
    return this.callGenericAnalysis(conditions);
  }
  
  /**
   * 前走分析
   */
  private async callLastRaceAnalysis(conditions: RuleCondition[]): Promise<AnalysisResult> {
    return this.callGenericAnalysis(conditions);
  }
  
  /**
   * 枠順分析
   */
  private async callWakuAnalysis(conditions: RuleCondition[]): Promise<AnalysisResult> {
    return this.callGenericAnalysis(conditions);
  }
  
  /**
   * コース分析
   */
  private async callCourseAnalysis(conditions: RuleCondition[]): Promise<AnalysisResult> {
    return this.callGenericAnalysis(conditions);
  }
  
  /**
   * 複合条件の分析
   */
  private async callCombinedAnalysis(conditions: RuleCondition[]): Promise<AnalysisResult> {
    return this.callGenericAnalysis(conditions);
  }
  
  /**
   * 汎用分析（DBクエリ）
   */
  private async callGenericAnalysis(conditions: RuleCondition[]): Promise<AnalysisResult> {
    try {
      const db = getDb();
      
      // indicesテーブルのフィールド
      const indicesFields = ['makikaeshi', 'potential', 'L4F', 'T2F', 'revouma', 'cushion'];
      const hasIndicesCondition = conditions.some(c => indicesFields.includes(c.field));
      
      // 条件からWHERE句を構築
      const whereClauses: string[] = [];
      const params: any[] = [];
      
      for (const condition of conditions) {
        const { field, operator, value } = condition;
        const paramIndex = params.length + 1;
        
        // indicesテーブルのフィールドには "i." プレフィックスを付ける
        const fieldName = indicesFields.includes(field) ? `i."${field}"` : `u.${field}`;

        switch (operator) {
          case 'eq':
            whereClauses.push(`${fieldName} = $${paramIndex}`);
            params.push(value);
            break;

          case 'gte':
            whereClauses.push(`${fieldName} >= $${paramIndex}`);
            params.push(value);
            break;

          case 'lte':
            whereClauses.push(`${fieldName} <= $${paramIndex}`);
            params.push(value);
            break;

          case 'in':
            if (Array.isArray(value)) {
              const placeholders = value.map((_, i) => `$${paramIndex + i}`).join(', ');
              whereClauses.push(`${fieldName} IN (${placeholders})`);
              params.push(...value);
            }
            break;

          case 'between':
            if (Array.isArray(value) && value.length === 2) {
              whereClauses.push(`${fieldName} BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
              params.push(value[0], value[1]);
            }
            break;

          case 'contains':
            whereClauses.push(`${fieldName} ILIKE $${paramIndex}`);
            params.push(`%${value}%`);
            break;

          default:
            console.warn(`Unknown operator: ${operator}`);
        }
      }

      const whereClause = whereClauses.length > 0 
        ? `WHERE ${whereClauses.join(' AND ')}`
        : '';
      
      // indicesテーブルとのJOIN（必要な場合のみ）
      const joinClause = hasIndicesCondition
        ? `LEFT JOIN indices i ON (u.race_id || LPAD(u.umaban, 2, '0')) = i.race_id`
        : '';

      // 統計クエリ（全角→半角変換、数値チェック追加）
      const statsQuery = `
        SELECT 
          COUNT(*) as sample_size,
          AVG(
            CASE 
              WHEN TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789') ~ '^[0-9]+$' 
                AND TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789')::INTEGER = 1 
              THEN 1.0 
              ELSE 0.0 
            END
          ) as win_rate,
          AVG(
            CASE 
              WHEN TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789') ~ '^[0-9]+$'
                AND TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789')::INTEGER <= 2 
              THEN 1.0 
              ELSE 0.0 
            END
          ) as place_rate,
          AVG(
            CASE 
              WHEN TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789') ~ '^[0-9]+$'
                AND TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789')::INTEGER <= 3 
              THEN 1.0 
              ELSE 0.0 
            END
          ) as show_rate,
          AVG(
            CASE 
              WHEN TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789') ~ '^[0-9]+$'
              THEN TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789')::FLOAT
              ELSE NULL
            END
          ) as avg_finish,
          AVG(
            CASE 
              WHEN TRANSLATE(u.win_odds, '０１２３４５６７８９.．', '0123456789..') ~ '^[0-9.]+$'
              THEN TRANSLATE(u.win_odds, '０１２３４５６７８９.．', '0123456789..')::FLOAT
              ELSE NULL
            END
          ) as avg_win_odds,
          AVG(
            CASE 
              WHEN TRANSLATE(u.place_odds_low, '０１２３４５６７８９.．', '0123456789..') ~ '^[0-9.]+$'
              THEN TRANSLATE(u.place_odds_low, '０１２３４５６７８９.．', '0123456789..')::FLOAT
              ELSE NULL
            END
          ) as avg_place_odds
        FROM umadata u
        ${joinClause}
        ${whereClause}
      `;

      console.log('[AnalysisConnector] Generic Analysis Query:', statsQuery);
      console.log('[AnalysisConnector] Params:', params);

      const result = await db.prepare(statsQuery).get<any>(...params);

      if (!result) {
        throw new Error('No result from database query');
      }

      const sample_size = parseInt(result.sample_size, 10) || 0;

      if (sample_size === 0) {
        return {
          statistics: {
            sample_size: 0,
            win_rate: 0,
            place_rate: 0,
            show_rate: 0,
            avg_finish: 0,
            win_return_rate: 0,
            place_return_rate: 0,
            expected_value_diff: 0
          },
          confidence: {
            confidence_level: 0,
            is_significant: false,
            warnings: ['サンプル数が0件です']
          }
        };
      }

      const win_rate = parseFloat(result.win_rate) || 0;
      const place_rate = parseFloat(result.place_rate) || 0;
      const show_rate = parseFloat(result.show_rate) || 0;
      const avg_finish = parseFloat(result.avg_finish) || 0;
      const avg_win_odds = parseFloat(result.avg_win_odds) || 0;
      const avg_place_odds = parseFloat(result.avg_place_odds) || 0;

      // デバッグ: より詳細な分析
      // 勝った馬だけのオッズ平均を計算
      const debugQuery = `
        SELECT 
          -- 全体
          COUNT(*) as total_horses,
          
          -- オッズデータがある馬
          SUM(CASE 
            WHEN TRANSLATE(u.win_odds, '０１２３４５６７８９.．', '0123456789..') ~ '^[0-9.]+$'
            THEN 1 ELSE 0 
          END) as horses_with_odds,
          
          -- 勝った馬（1着）
          SUM(CASE 
            WHEN TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789') ~ '^[0-9]+$'
              AND TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789')::INTEGER = 1
            THEN 1 ELSE 0 
          END) as winning_horses,
          
          -- 勝った馬のオッズ平均（勝った馬だけ）
          AVG(CASE 
            WHEN TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789') ~ '^[0-9]+$'
              AND TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789')::INTEGER = 1
              AND TRANSLATE(u.win_odds, '０１２３４５６７８９.．', '0123456789..') ~ '^[0-9.]+$'
            THEN TRANSLATE(u.win_odds, '０１２３４５６７８９.．', '0123456789..')::FLOAT
            ELSE NULL
          END) as avg_winning_odds,
          
          -- 負けた馬のオッズ平均（2着以下）
          AVG(CASE 
            WHEN TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789') ~ '^[0-9]+$'
              AND TRANSLATE(u.finish_position, '０１２３４５６７８９', '0123456789')::INTEGER > 1
              AND TRANSLATE(u.win_odds, '０１２３４５６７８９.．', '0123456789..') ~ '^[0-9.]+$'
            THEN TRANSLATE(u.win_odds, '０１２３４５６７８９.．', '0123456789..')::FLOAT
            ELSE NULL
          END) as avg_losing_odds
          
        FROM umadata u
        ${joinClause}
        ${whereClause}
      `;
      
      const debugResult = await db.prepare(debugQuery).get<any>(...params);
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[AnalysisConnector] 詳細デバッグ情報');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('【サンプル数】');
      console.log(`  総馬数: ${debugResult.total_horses}頭`);
      console.log(`  オッズデータあり: ${debugResult.horses_with_odds}頭 (${((debugResult.horses_with_odds / debugResult.total_horses) * 100).toFixed(1)}%)`);
      console.log(`  勝利馬: ${debugResult.winning_horses}頭`);
      console.log('');
      console.log('【オッズ情報】');
      console.log(`  全体の平均オッズ: ${avg_win_odds.toFixed(2)}倍`);
      console.log(`  勝った馬の平均オッズ: ${(parseFloat(debugResult.avg_winning_odds) || 0).toFixed(2)}倍`);
      console.log(`  負けた馬の平均オッズ: ${(parseFloat(debugResult.avg_losing_odds) || 0).toFixed(2)}倍`);
      console.log('');
      console.log('【成績】');
      console.log(`  勝率: ${(win_rate * 100).toFixed(2)}%`);
      console.log(`  連対率: ${(place_rate * 100).toFixed(2)}%`);
      console.log(`  三着内率: ${(show_rate * 100).toFixed(2)}%`);
      console.log('');

      // 回収率計算（オッズ × 的中率 × 100 = %）
      const win_return_rate = avg_win_odds > 0 ? (win_rate * avg_win_odds * 100) : 0;
      const place_return_rate = avg_place_odds > 0 ? (show_rate * avg_place_odds * 100) : 0;
      
      console.log('【回収率計算】');
      console.log(`  計算式: 勝率 × 平均オッズ × 100`);
      console.log(`  単勝回収率: ${win_rate.toFixed(4)} × ${avg_win_odds.toFixed(2)} × 100 = ${win_return_rate.toFixed(1)}%`);
      console.log(`  複勝回収率: ${show_rate.toFixed(4)} × ${avg_place_odds.toFixed(2)} × 100 = ${place_return_rate.toFixed(1)}%`);
      
      // 期待値計算
      const expected_profit_per_100yen = (win_return_rate - 100);
      console.log('');
      console.log('【投資シミュレーション（100円購入）】');
      console.log(`  投資額: 100円`);
      console.log(`  平均払戻: ${(win_return_rate).toFixed(1)}円`);
      console.log(`  期待損益: ${expected_profit_per_100yen >= 0 ? '+' : ''}${expected_profit_per_100yen.toFixed(1)}円`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // デバッグ情報をオブジェクトとして保存
      const oddsBreakdown = {
        total_horses: parseInt(debugResult.total_horses, 10) || 0,
        horses_with_odds: parseInt(debugResult.horses_with_odds, 10) || 0,
        winning_horses: parseInt(debugResult.winning_horses, 10) || 0,
        avg_all_odds: avg_win_odds,
        avg_winning_odds: parseFloat(debugResult.avg_winning_odds) || 0,
        avg_losing_odds: parseFloat(debugResult.avg_losing_odds) || 0
      };

      // 投資パフォーマンス
      const total_investment = sample_size * 100;
      const total_return_place = total_investment * (place_return_rate / 100);
      const profit_place = total_return_place - total_investment;

      // 期待値（複勝ベース）
      const expected_value_diff = profit_place / sample_size;

      // 信頼度計算
      let confidence_level = 0;
      if (sample_size >= 100) {
        confidence_level = 95;
      } else if (sample_size >= 50) {
        confidence_level = 80;
      } else if (sample_size >= 30) {
        confidence_level = 65;
      } else {
        confidence_level = 40;
      }

      const warnings: string[] = [];
      if (sample_size < 30) {
        warnings.push('サンプル数が少ない（30件未満）');
      }
      if (show_rate < 0.1) {
        warnings.push('三着内率が低い（10%未満）');
      }

      return {
        statistics: {
          sample_size,
          win_rate,
          place_rate,
          show_rate,
          avg_finish,
          win_return_rate,
          place_return_rate,
          expected_value_diff,
          total_investment,
          total_return: total_return_place,
          profit: profit_place
        },
        confidence: {
          confidence_level,
          is_significant: sample_size >= 30,
          warnings
        },
        odds_breakdown: oddsBreakdown
      };
    } catch (error) {
      console.error('[AnalysisConnector] Generic analysis error:', error);
      throw error;
    }
  }
  
  /**
   * 距離の抽出
   */
  private extractDistance(condition?: RuleCondition): number | null {
    if (!condition) return null;
    
    if (condition.operator === 'eq') {
      return parseInt(condition.value, 10);
    }
    
    if (condition.operator === 'between' && Array.isArray(condition.value)) {
      // 中間値を返す
      return Math.floor((condition.value[0] + condition.value[1]) / 2);
    }
    
    return null;
  }
  
  /**
   * APIレスポンスのパース
   */
  private parseAnalysisResponse(response: any): AnalysisResult {
    // 既存の分析ツールのレスポンス形式を変換
    return {
      statistics: {
        sample_size: response.competition_performance?.sample_size || 0,
        win_rate: response.competition_performance?.win_rate || 0,
        place_rate: response.competition_performance?.place_rate || 0,
        show_rate: response.competition_performance?.show_rate || 0,
        avg_finish: response.competition_performance?.avg_finish || 0,
        win_return_rate: response.investment_performance?.win_return_rate || 0,
        place_return_rate: response.investment_performance?.place_return_rate || 0,
        expected_value_diff: response.baseline_comparison?.expected_value_diff || 0
      },
      confidence: {
        confidence_level: response.performance_score?.statistical_confidence || 
                         response.statistics?.confidence_level || 70,
        is_significant: response.statistics?.is_significant || true,
        warnings: response.statistics?.warnings || []
      },
      baseline_comparison: response.baseline_comparison
    };
  }
}
