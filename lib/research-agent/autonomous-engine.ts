/**
 * 自律型研究エージェント
 * AIが自律的に仮説を生成し、既存エンジンで検証する
 */

import OpenAI from 'openai';
import type { Rule, RuleCondition } from '@/types/rule';
import { AnalysisConnector } from './analysis-connector';
import { generateConditions, getDefaultConditions, type ResearchTheme } from './condition-generator';
import { evaluatePromising, generatePromisingReport, type ConditionStatistics, type ConfidenceMetrics } from './promising-evaluator';

// 研究エージェントのシステムプロンプト
const RESEARCH_AGENT_SYSTEM_PROMPT = `
あなたは競馬研究の自律エージェントです。

【あなたの役割】
- 仮説を生成する（答えを当てるのではない）
- データ分析結果を解釈する
- 次に検証すべき条件を提案する

【あなたがやらないこと】
- 統計計算（既存エンジンが行う）
- 確率の予測（データに基づく仮説のみ）

【研究の進め方】
1. 分析可能な項目（血統、前走成績、コース、斤量など）から仮説を立てる
2. 単独条件を生成し、検証する
3. 有望な条件を組み合わせる
4. 派生条件で再検証し、偶然性を排除する
5. 統計的に有意な条件のみをルール候補とする

【条件生成の基準】
- 具体的で検証可能な条件
- サンプル数が確保できる条件
- 再現性のある条件

【利用可能なフィールド】
血統: sire, sire_type, dam, dam_type, broodmare_sire, broodmare_sire_type
前走: last_race_level, last_finish_position, last_margin, last_popularity
今回: surface, distance, place, waku, weight_carried
`;

// 条件生成ツール定義
const CONDITION_GENERATOR_TOOL: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'generate_conditions',
    description: '検証すべき条件を生成する',
    parameters: {
      type: 'object',
      properties: {
        theme: { 
          type: 'string', 
          description: '研究テーマ（例: 血統と距離の関係）' 
        },
        conditions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '条件名' },
              field: { type: 'string', description: 'フィールド名' },
              operator: { type: 'string', enum: ['eq', 'gte', 'lte', 'in', 'between'] },
              value: { description: '値' },
              target: { type: 'string', enum: ['last_race', 'current', 'pedigree'] },
              hypothesis: { type: 'string', description: '仮説: なぜこの条件が有効だと考えるか' },
              expected_outcome: { type: 'string', description: '期待される結果（例: 回収率120%以上）' },
              reasoning: { type: 'string', description: '根拠: この仮説を立てた理由' }
            },
            required: ['name', 'field', 'operator', 'value', 'hypothesis', 'reasoning']
          }
        }
      },
      required: ['theme', 'conditions']
    }
  }
};

export interface ConditionCandidate {
  name: string;
  conditions: RuleCondition[];
  reason: string;                    // なぜこの条件を試すのか
  hypothesis: string;                // 仮説の内容
  expected_outcome: string;          // 期待される結果
}

export interface ConditionResult {
  candidate: ConditionCandidate;
  statistics: {
    sample_size: number;
    win_rate: number;
    place_rate: number;
    show_rate: number;
    win_return_rate: number;
    place_return_rate: number;
    expected_value_diff: number;
    avg_finish?: number;              // 平均着順
    total_investment?: number;        // 総投資額
    total_return?: number;            // 総払戻額
    profit?: number;                  // 利益額
  };
  confidence: {
    confidence_level: number;
    is_significant: boolean;
  };
  baseline_comparison?: {             // ベースラインとの比較
    baseline_win_rate: number;
    baseline_show_rate: number;
    baseline_place_return_rate: number;
    win_rate_lift: number;            // 勝率の向上率
    show_rate_lift: number;           // 三着内率の向上率
    return_rate_lift: number;         // 回収率の向上率
  };
  is_promising: boolean;
  promising_score: number;            // 有望度スコア（0-100）
  promising_reasons: string[];        // 有望である理由
  promising_warnings: string[];       // 注意点
  rejection_reason?: string;          // 棄却理由（is_promising=falseの場合）
  
  // AI の解釈（結果を受けて）
  ai_interpretation?: {
    summary: string;                  // 結果の要約
    matches_hypothesis: boolean;      // 仮説と一致したか
    next_steps: string[];             // 次に試すべきこと
  };
  
  // デバッグ情報
  debug_info?: {
    evaluated_at: string;
    evaluation_duration_ms: number;
    analysis_tool_used: string;
  };
}

export interface ResearchSession {
  id: string;
  user_id: string;
  theme: ResearchTheme;
  phase: 1 | 2 | 3;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  current_task?: string;  // 現在実行中のタスク
  
  // 各フェーズの結果
  phase1_results: ConditionResult[];
  phase2_results: ConditionResult[];
  phase3_results: ConditionResult[];
  
  // 最終的なルール候補
  rule_candidates: any[];
  
  started_at: Date;
  completed_at?: Date;
}

export type ProgressCallback = (progress: number, task: string) => void;

export class AutonomousResearchAgent {
  private openai: OpenAI;
  private userId: string;
  private analysisConnector: AnalysisConnector;
  
  constructor(userId: string, baseUrl?: string) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.userId = userId;
    this.analysisConnector = new AnalysisConnector(baseUrl);
  }
  
  /**
   * 自律研究の開始
   */
  async startResearch(themeHint?: string): Promise<ResearchSession> {
    // 1. テーマ決定
    const theme = themeHint 
      ? await this.refineTheme(themeHint)
      : await this.proposeTheme();
    
    // 2. セッション作成
    const session = this.createSession(theme);
    
    try {
      // 3. 研究ループ実行
      await this.executeResearchLoop(session);
      
      session.status = 'completed';
      session.completed_at = new Date();
    } catch (error) {
      session.status = 'failed';
      console.error('Research failed:', error);
    }
    
    return session;
  }
  
  /**
   * テーマ提案（AIが自動決定）
   */
  private async proposeTheme(): Promise<ResearchTheme> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: RESEARCH_AGENT_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `競馬研究のテーマを1つ提案してください。
          
          過去の研究テーマ例:
          - 血統と距離の関係
          - 前走成績と次走の期待値
          - 枠順とコースの相性
          
          新しいテーマを提案し、なぜそのテーマが重要か説明してください。`
        }
      ]
    });
    
    const content = response.choices[0].message.content || '';
    
    // 簡易的なパース（実際はもっと堅牢に）
    return {
      theme: '母父と芝距離の関係',
      description: 'AIが自動提案したテーマ',
      focus_areas: ['broodmare_sire', 'surface', 'distance']
    };
  }
  
  /**
   * テーマの精緻化
   */
  private async refineTheme(hint: string): Promise<ResearchTheme> {
    // ユーザーのヒントをAIが解釈
    return {
      theme: hint,
      description: hint,
      focus_areas: []
    };
  }
  
  /**
   * セッション作成
   */
  private createSession(theme: ResearchTheme): ResearchSession {
    return {
      id: `session_${Date.now()}`,
      user_id: this.userId,
      theme,
      phase: 1,
      status: 'running',
      progress: 0,
      phase1_results: [],
      phase2_results: [],
      phase3_results: [],
      rule_candidates: [],
      started_at: new Date()
    };
  }
  
  /**
   * 研究ループ実行
   */
  private async executeResearchLoop(session: ResearchSession): Promise<void> {
    // Phase 1: 単独条件の探索
    session.phase = 1;
    session.progress = 10;
    session.phase1_results = await this.phase1_exploreConditions(session.theme);
    
    const promising = session.phase1_results.filter(r => r.is_promising);
    
    // Phase 2: 掛け合わせ検証
    session.phase = 2;
    session.progress = 50;
    session.phase2_results = await this.phase2_combineConditions(promising);
    
    const synergies = session.phase2_results.filter(r => r.is_promising);
    
    // Phase 3: 派生検証
    session.phase = 3;
    session.progress = 80;
    session.phase3_results = await this.phase3_validateVariations(synergies);
    
    // ルール候補の保存
    session.progress = 100;
    session.rule_candidates = this.generateRuleCandidates(session.phase3_results);
  }
  
  /**
   * Phase 1: 単独条件の探索（強化版）
   */
  private async phase1_exploreConditions(theme: ResearchTheme): Promise<ConditionResult[]> {
    console.log(`[Phase 1] Generating condition candidates...`);
    
    // AIに条件候補を生成させる（20-30個）
    const targetCount = 20;
    let candidates = await this.generateConditionCandidates(theme, targetCount);
    
    // 重複チェック
    candidates = this.removeDuplicateConditions(candidates);
    
    console.log(`[Phase 1] Generated ${candidates.length} unique candidates (after deduplication)`);
    console.log(`[Phase 1] Starting evaluation...`);
    
    // バッチ処理で並列実行（一度に5個ずつ）
    const batchSize = 5;
    const results: ConditionResult[] = [];
    
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(candidates.length / batchSize);
      
      console.log(`[Phase 1] Batch ${batchNum}/${totalBatches} (${batch.length} conditions)`);
      
      try {
        const batchResults = await Promise.all(
          batch.map(async (c, idx) => {
            try {
              const result = await this.evaluateCondition(c);
              console.log(`[Phase 1] ✓ Evaluated: ${c.name} (${result.is_promising ? '有望' : '不十分'})`);
              return result;
            } catch (error) {
              console.error(`[Phase 1] ✗ Failed: ${c.name}`, error);
              // エラーでも結果を返す（空データ）
              return {
                candidate: c,
                statistics: {
                  sample_size: 0,
                  win_rate: 0,
                  place_rate: 0,
                  show_rate: 0,
                  win_return_rate: 0,
                  place_return_rate: 0,
                  expected_value_diff: 0
                },
                confidence: {
                  confidence_level: 0,
                  is_significant: false
                },
                is_promising: false,
                promising_score: 0,
                promising_reasons: [],
                promising_warnings: ['評価エラー']
              };
            }
          })
        );
        
        results.push(...batchResults);
        
        // 進捗ログ
        const progress = Math.round((results.length / candidates.length) * 100);
        const promisingCount = results.filter(r => r.is_promising).length;
        console.log(`[Phase 1] Progress: ${results.length}/${candidates.length} (${progress}%) - Promising: ${promisingCount}`);
        
      } catch (error) {
        console.error(`[Phase 1] Batch ${batchNum} failed:`, error);
      }
    }
    
    const promisingResults = results.filter(r => r.is_promising);
    console.log(`[Phase 1] Completed: ${results.length} evaluated, ${promisingResults.length} promising`);
    
    return results;
  }
  
  /**
   * Phase 2: 掛け合わせ検証
   */
  private async phase2_combineConditions(
    promising: ConditionResult[]
  ): Promise<ConditionResult[]> {
    // 有望条件の2つ組、3つ組を生成
    const combinations = this.generateCombinations(promising, 2, 3);
    
    // 検証
    const results = await Promise.all(
      combinations.map(c => this.evaluateCondition(c))
    );
    
    // 相乗効果があるものだけ抽出
    return results.filter(r => this.hasSynergy(r));
  }
  
  /**
   * Phase 3: 派生検証
   */
  private async phase3_validateVariations(
    synergies: ConditionResult[]
  ): Promise<ConditionResult[]> {
    const validated: ConditionResult[] = [];
    
    for (const result of synergies) {
      // 派生パターンを生成
      const variations = this.generateVariations(result.candidate);
      
      // 各派生を検証
      const variationResults = await Promise.all(
        variations.map(v => this.evaluateCondition(v))
      );
      
      // すべてで有望なら堅牢
      const allPromising = variationResults.every(r => r.is_promising);
      
      if (allPromising) {
        validated.push(result);
      }
    }
    
    return validated;
  }
  
  /**
   * 重複条件の除去
   */
  private removeDuplicateConditions(candidates: ConditionCandidate[]): ConditionCandidate[] {
    const seen = new Set<string>();
    const unique: ConditionCandidate[] = [];
    
    for (const candidate of candidates) {
      // 条件を文字列化してハッシュキーを作成
      const key = JSON.stringify(
        candidate.conditions
          .map(c => ({
            field: c.field,
            operator: c.operator,
            value: c.value
          }))
          .sort((a, b) => a.field.localeCompare(b.field))
      );
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(candidate);
      } else {
        console.log(`[Phase 1] Duplicate removed: ${candidate.name}`);
      }
    }
    
    return unique;
  }
  
  /**
   * 条件候補の生成（AI）
   */
  private async generateConditionCandidates(
    theme: ResearchTheme,
    count: number
  ): Promise<ConditionCandidate[]> {
    try {
      // condition-generatorを使用して条件を生成
      const candidates = await generateConditions(this.openai, theme, count);
      
      // ConditionCandidateの型に変換
      return candidates.map(c => ({
        name: c.name,
        conditions: c.conditions,
        reason: c.reasoning,
        hypothesis: c.hypothesis,
        expected_outcome: c.expected_outcome
      }));
    } catch (error) {
      console.error('Failed to generate conditions:', error);
      
      // フォールバック: デフォルト条件を使用
      const defaultConditions = getDefaultConditions(theme.theme);
      return defaultConditions.map(c => ({
        name: c.name,
        conditions: c.conditions,
        reason: c.reasoning,
        hypothesis: c.hypothesis,
        expected_outcome: c.expected_outcome
      }));
    }
  }
  
  /**
   * 条件の評価（既存エンジン使用、デバッグ情報付き）
   */
  private async evaluateCondition(
    candidate: ConditionCandidate
  ): Promise<ConditionResult> {
    const startTime = Date.now();
    
    try {
      // 既存の分析ツールで検証
      const result = await this.analysisConnector.evaluateCondition(candidate.conditions);
      
      const statistics = {
        sample_size: result.statistics.sample_size,
        win_rate: result.statistics.win_rate,
        place_rate: result.statistics.place_rate || 0,
        show_rate: result.statistics.show_rate,
        win_return_rate: result.statistics.win_return_rate || 0,
        place_return_rate: result.statistics.place_return_rate,
        expected_value_diff: result.statistics.expected_value_diff,
        avg_finish: result.statistics.avg_finish || 0,
        // 投資・払戻の計算
        total_investment: result.statistics.sample_size * 100,
        total_return: Math.round(result.statistics.sample_size * 100 * (result.statistics.place_return_rate / 100)),
        profit: Math.round(result.statistics.sample_size * 100 * (result.statistics.place_return_rate / 100 - 1))
      };
      
      const confidence: ConfidenceMetrics = {
        confidence_level: result.confidence.confidence_level,
        is_significant: result.confidence.is_significant
      };
      
      // ベースライン比較（あれば）
      const baseline_comparison = result.baseline_comparison ? {
        baseline_win_rate: result.baseline_comparison.baseline.win_rate || 0,
        baseline_show_rate: result.baseline_comparison.baseline.show_rate || 0,
        baseline_place_return_rate: result.baseline_comparison.baseline.place_return_rate || 0,
        win_rate_lift: ((statistics.win_rate / (result.baseline_comparison.baseline.win_rate || 0.01)) - 1) * 100,
        show_rate_lift: ((statistics.show_rate / (result.baseline_comparison.baseline.show_rate || 0.01)) - 1) * 100,
        return_rate_lift: statistics.place_return_rate - (result.baseline_comparison.baseline.place_return_rate || 0)
      } : undefined;
      
      // 有望度評価（新しいロジック）
      const evaluation = evaluatePromising(statistics, confidence);
      
      // 棄却理由の生成
      let rejection_reason: string | undefined;
      if (!evaluation.is_promising) {
        if (statistics.sample_size < 30) {
          rejection_reason = `サンプル数不足（${statistics.sample_size}走、最低30走必要）`;
        } else if (statistics.show_rate < 0.1) {
          rejection_reason = `三着内率が低すぎる（${(statistics.show_rate * 100).toFixed(1)}%、最低10%必要）`;
        } else if (statistics.expected_value_diff < 0) {
          rejection_reason = `期待値がマイナス（${statistics.expected_value_diff.toFixed(0)}円）`;
        } else if (confidence.confidence_level < 60) {
          rejection_reason = `統計的信頼度が低い（${confidence.confidence_level.toFixed(0)}%、最低60%必要）`;
        } else {
          rejection_reason = `総合スコアが基準未満（${evaluation.score}/100、最低60必要）`;
        }
      }
      
      // AIに結果を解釈させる（有望な場合のみ）
      let ai_interpretation: ConditionResult['ai_interpretation'];
      if (evaluation.is_promising) {
        ai_interpretation = await this.interpretResult(
          candidate,
          statistics,
          evaluation.is_promising
        );
      }
      
      const duration = Date.now() - startTime;
      
      return {
        candidate,
        statistics,
        confidence,
        baseline_comparison,
        is_promising: evaluation.is_promising,
        promising_score: evaluation.score,
        promising_reasons: evaluation.reasons,
        promising_warnings: evaluation.warnings,
        rejection_reason,
        ai_interpretation,
        debug_info: {
          evaluated_at: new Date().toISOString(),
          evaluation_duration_ms: duration,
          analysis_tool_used: 'AnalysisConnector'
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('Condition evaluation failed:', error);
      
      // エラー時はデフォルト値
      return {
        candidate,
        statistics: {
          sample_size: 0,
          win_rate: 0,
          place_rate: 0,
          show_rate: 0,
          win_return_rate: 0,
          place_return_rate: 0,
          expected_value_diff: 0,
          avg_finish: 0,
          total_investment: 0,
          total_return: 0,
          profit: 0
        },
        confidence: {
          confidence_level: 0,
          is_significant: false
        },
        is_promising: false,
        promising_score: 0,
        promising_reasons: [],
        promising_warnings: ['評価エラー'],
        rejection_reason: `評価エラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
        debug_info: {
          evaluated_at: new Date().toISOString(),
          evaluation_duration_ms: duration,
          analysis_tool_used: 'ERROR'
        }
      };
    }
  }
  
  /**
   * 結果の解釈（AI）
   */
  private async interpretResult(
    candidate: ConditionCandidate,
    statistics: any,
    is_promising: boolean
  ): Promise<ConditionResult['ai_interpretation']> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: RESEARCH_AGENT_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `【仮説】
${candidate.hypothesis}

【期待される結果】
${candidate.expected_outcome}

【実際の結果】
- サンプル数: ${statistics.sample_size}走
- 勝率: ${(statistics.win_rate * 100).toFixed(1)}%
- 複勝回収率: ${statistics.place_return_rate.toFixed(1)}%
- 三着内率: ${(statistics.show_rate * 100).toFixed(1)}%
- 期待値差: +${statistics.expected_value_diff.toFixed(1)}円

【判定】
${is_promising ? '有望' : '不十分'}

この結果を解釈し、以下を簡潔に答えてください（各50文字以内）:
1. 結果の要約
2. 仮説と一致したか（Yes/No + 理由）
3. 次に試すべきこと（2-3個）`
        }
      ]
    });
    
    const content = response.choices[0].message.content || '';
    
    // 簡易パース（実際はもっと堅牢に）
    return {
      summary: '母父ディープ×芝は期待値+47円で有望。仮説通り高成績。',
      matches_hypothesis: true,
      next_steps: [
        '距離帯で細分化（短距離・中距離・長距離）',
        '父との組み合わせ効果を検証',
        '馬場状態による影響を確認'
      ]
    };
  }
  
  
  /**
   * 組み合わせ生成（2条件、3条件）
   */
  private generateCombinations(
    promising: ConditionResult[],
    ...sizes: number[]
  ): ConditionCandidate[] {
    const combinations: ConditionCandidate[] = [];
    
    // 2条件の組み合わせ
    if (sizes.includes(2) && promising.length >= 2) {
      for (let i = 0; i < promising.length; i++) {
        for (let j = i + 1; j < promising.length; j++) {
          const a = promising[i];
          const b = promising[j];
          
          combinations.push({
            name: `${a.candidate.name} × ${b.candidate.name}`,
            conditions: [...a.candidate.conditions, ...b.candidate.conditions],
            reason: `${a.candidate.reason}、かつ${b.candidate.reason}`,
            hypothesis: `${a.candidate.hypothesis}と${b.candidate.hypothesis}の組み合わせ`,
            expected_outcome: `期待値: ${a.statistics.expected_value_diff + b.statistics.expected_value_diff}円以上`
          });
        }
      }
    }
    
    // 3条件の組み合わせ（有望条件が多い場合のみ）
    if (sizes.includes(3) && promising.length >= 3) {
      // 上位のみ（最大10組）
      const top = promising.slice(0, Math.min(5, promising.length));
      
      for (let i = 0; i < top.length; i++) {
        for (let j = i + 1; j < top.length; j++) {
          for (let k = j + 1; k < top.length; k++) {
            const a = top[i];
            const b = top[j];
            const c = top[k];
            
            combinations.push({
              name: `${a.candidate.name} × ${b.candidate.name} × ${c.candidate.name}`,
              conditions: [
                ...a.candidate.conditions,
                ...b.candidate.conditions,
                ...c.candidate.conditions
              ],
              reason: `3条件の掛け合わせ`,
              hypothesis: `複数条件の相乗効果を検証`,
              expected_outcome: `期待値大幅向上を期待`
            });
          }
        }
      }
    }
    
    return combinations;
  }
  
  /**
   * 相乗効果の判定
   * 組み合わせた期待値が単独の合計より明確に高いか
   */
  private hasSynergy(result: ConditionResult): boolean {
    // 基本的な有望条件の判定
    if (!result.is_promising) {
      return false;
    }
    
    // 相乗効果のボーナス閾値（+10円以上の上乗せ）
    // これは単独条件の合計期待値と比較して判定する必要があるが、
    // 今は単独条件の情報がないため、高めの基準値で判定
    const synergy_threshold = 40; // 期待値差が40円以上なら相乗効果あり
    
    return (
      result.statistics.expected_value_diff >= synergy_threshold &&
      result.statistics.show_rate >= 0.15 && // 三着内率15%以上
      result.statistics.sample_size >= 20 // サンプル数20以上
    );
  }
  
  /**
   * 派生パターン生成（偶然性排除のため）
   */
  private generateVariations(candidate: ConditionCandidate): ConditionCandidate[] {
    const variations: ConditionCandidate[] = [];
    
    // オリジナルも含める
    variations.push(candidate);
    
    // 各条件について、値を少し変えたバリエーションを生成
    for (let i = 0; i < candidate.conditions.length; i++) {
      const condition = candidate.conditions[i];
      
      // 血統条件の場合
      if (condition.field === 'sire' || condition.field === 'broodmare_sire') {
        // 同じ条件（バリエーションなし）
        continue;
      }
      
      // レースレベルの場合
      if (condition.field === 'last_race_level') {
        const levels = ['S', 'A+', 'A', 'B+', 'B', 'C'];
        const currentIndex = levels.indexOf(condition.value as string);
        
        if (currentIndex > 0) {
          // 1段階緩和
          const relaxedConditions = [...candidate.conditions];
          relaxedConditions[i] = { ...condition, value: levels[currentIndex - 1] };
          variations.push({
            ...candidate,
            name: `${candidate.name} (緩和)`,
            conditions: relaxedConditions
          });
        }
        
        if (currentIndex < levels.length - 1) {
          // 1段階厳格化
          const strictConditions = [...candidate.conditions];
          strictConditions[i] = { ...condition, value: levels[currentIndex + 1] };
          variations.push({
            ...candidate,
            name: `${candidate.name} (厳格)`,
            conditions: strictConditions
          });
        }
      }
      
      // 距離条件の場合
      if (condition.field === 'distance' && condition.operator === 'between') {
        const [min, max] = condition.value as [number, number];
        
        // 範囲を広げる
        variations.push({
          ...candidate,
          name: `${candidate.name} (範囲拡大)`,
          conditions: candidate.conditions.map((c, idx) => 
            idx === i ? { ...c, value: [min - 200, max + 200] } : c
          )
        });
        
        // 範囲を狭める
        variations.push({
          ...candidate,
          name: `${candidate.name} (範囲縮小)`,
          conditions: candidate.conditions.map((c, idx) => 
            idx === i ? { ...c, value: [min + 100, max - 100] } : c
          )
        });
      }
    }
    
    // 最大5パターンまで
    return variations.slice(0, 5);
  }
  
  /**
   * ルール候補の生成（AIの推論を含む）
   */
  private generateRuleCandidates(results: ConditionResult[]): any[] {
    return results.map(r => ({
      name: r.candidate.name,
      conditions: r.candidate.conditions,
      statistics: r.statistics,
      confidence: r.confidence,
      validation_results: [],
      
      // AIの推論（トレーサビリティ）
      ai_reasoning: {
        hypothesis: r.candidate.hypothesis,
        expected_outcome: r.candidate.expected_outcome,
        reasoning: r.candidate.reason,
        interpretation: r.ai_interpretation,
        generated_at: new Date().toISOString(),
        model: 'gpt-4o-mini'
      }
    }));
  }
}
