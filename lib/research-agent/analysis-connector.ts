/**
 * 既存分析エンジンとの連携
 * 条件を既存の分析ツールで評価する
 */

import type { RuleCondition } from '@/types/rule';

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
    // 血統条件を抽出
    const sireCondition = conditions.find(c => c.field === 'sire');
    const broodmareSireCondition = conditions.find(c => c.field === 'broodmare_sire');
    const surfaceCondition = conditions.find(c => c.field === 'surface');
    const distanceCondition = conditions.find(c => c.field === 'distance');
    
    // APIエンドポイント選択
    if (broodmareSireCondition) {
      // 母父分析
      const params = {
        horse_name: null, // ダミー（実際は直接クエリを投げる）
        broodmare_sire: broodmareSireCondition.value,
        race_surface: surfaceCondition?.value || '芝',
        race_distance: this.extractDistance(distanceCondition)
      };
      
      const response = await fetch(`${this.baseUrl}/api/ai-tools/broodmare-sire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      if (!response.ok) {
        throw new Error(`Broodmare sire analysis failed: ${response.statusText}`);
      }
      
      return this.parseAnalysisResponse(await response.json());
    }
    
    if (sireCondition) {
      // 種牡馬分析
      const params = {
        horse_name: null,
        sire: sireCondition.value,
        race_surface: surfaceCondition?.value || '芝',
        race_distance: this.extractDistance(distanceCondition) || 2000
      };
      
      const response = await fetch(`${this.baseUrl}/api/ai-tools/sire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      if (!response.ok) {
        throw new Error(`Sire analysis failed: ${response.statusText}`);
      }
      
      return this.parseAnalysisResponse(await response.json());
    }
    
    // フォールバック
    return this.callGenericAnalysis(conditions);
  }
  
  /**
   * 前走分析
   */
  private async callLastRaceAnalysis(conditions: RuleCondition[]): Promise<AnalysisResult> {
    // レースレベル分析を使用
    const levelCondition = conditions.find(c => c.field === 'last_race_level');
    
    if (levelCondition) {
      // TODO: レベル分析APIの呼び出し
      // 現状はlevel_analysisは特定のrace_idが必要なので、
      // ここでは直接DBクエリを投げる必要がある
    }
    
    return this.callGenericAnalysis(conditions);
  }
  
  /**
   * 枠順分析
   */
  private async callWakuAnalysis(conditions: RuleCondition[]): Promise<AnalysisResult> {
    const wakuCondition = conditions.find(c => c.field === 'waku');
    const placeCondition = conditions.find(c => c.field === 'place');
    const distanceCondition = conditions.find(c => c.field === 'distance');
    const surfaceCondition = conditions.find(c => c.field === 'surface');
    
    if (!wakuCondition) {
      return this.callGenericAnalysis(conditions);
    }
    
    const params = {
      race_place: placeCondition?.value || '東京',
      race_distance: this.extractDistance(distanceCondition) || 2000,
      track_type: surfaceCondition?.value || '芝',
      waku_number: parseInt(wakuCondition.value, 10)
    };
    
    const response = await fetch(`${this.baseUrl}/api/ai-tools/waku`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    if (!response.ok) {
      throw new Error(`Waku analysis failed: ${response.statusText}`);
    }
    
    return this.parseAnalysisResponse(await response.json());
  }
  
  /**
   * コース分析
   */
  private async callCourseAnalysis(conditions: RuleCondition[]): Promise<AnalysisResult> {
    const placeCondition = conditions.find(c => c.field === 'place');
    const distanceCondition = conditions.find(c => c.field === 'distance');
    const surfaceCondition = conditions.find(c => c.field === 'surface');
    
    const params = {
      place: placeCondition?.value || '東京',
      distance: this.extractDistance(distanceCondition) || 2000,
      surface: surfaceCondition?.value || '芝',
      horse_name: null // ダミー
    };
    
    const response = await fetch(`${this.baseUrl}/api/ai-tools/course`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    if (!response.ok) {
      throw new Error(`Course analysis failed: ${response.statusText}`);
    }
    
    return this.parseAnalysisResponse(await response.json());
  }
  
  /**
   * 複合条件の分析
   */
  private async callCombinedAnalysis(conditions: RuleCondition[]): Promise<AnalysisResult> {
    // 複数条件の場合、DBに直接クエリを投げる
    // TODO: 汎用的なクエリビルダーの実装
    return this.callGenericAnalysis(conditions);
  }
  
  /**
   * 汎用分析（DBクエリ）
   */
  private async callGenericAnalysis(conditions: RuleCondition[]): Promise<AnalysisResult> {
    // TODO: 汎用的なDB分析APIの実装
    // 現時点では仮の値を返す
    return {
      statistics: {
        sample_size: 100,
        win_rate: 0.15,
        place_rate: 0.30,
        show_rate: 0.40,
        avg_finish: 5.2,
        win_return_rate: 95.0,
        place_return_rate: 110.0,
        expected_value_diff: 10.0
      },
      confidence: {
        confidence_level: 65,
        is_significant: true,
        warnings: ['汎用分析を使用']
      }
    };
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
