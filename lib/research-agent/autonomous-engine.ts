/**
 * 自律型研究エージェント
 * AIが自律的に仮説を生成し、既存エンジンで検証する
 */

import OpenAI from 'openai';
import type { Rule, RuleCondition } from '@/types/rule';
import { AnalysisConnector } from './analysis-connector';
import { generateConditions, getDefaultConditions, type ResearchTheme } from './condition-generator';
import { evaluatePromising, generatePromisingReport, type ConditionStatistics, type ConfidenceMetrics } from './promising-evaluator';
import { saveToMemory, getResearchHistory, hasBeenTested, getPromisingThemes } from './research-memory';

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
  reasoning: string;                 // なぜこの条件を試すのか（根拠）
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
    odds_breakdown?: {
      total_horses: number;
      horses_with_odds: number;
      winning_horses: number;
      avg_all_odds: number;
      avg_winning_odds: number;
      avg_losing_odds: number;
    };
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
    
    console.log(`[Phase 1 Complete] Found ${promising.length} promising themes`);
    if (promising.length > 0) {
      console.log('[Phase 1 Complete] Promising themes:');
      promising.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.candidate.name} (Score: ${r.promising_score}, EV: ${r.statistics.expected_value_diff.toFixed(0)}円)`);
      });
    }
    
    // Phase 2: 有望テーマの深掘り（今回の結果 + 過去の有望テーマ）
    session.phase = 2;
    session.progress = 50;
    
    // 過去の有望テーマも深掘り対象に追加
    console.log(`\n[Phase 2 Start] Loading past promising themes...`);
    try {
      const pastPromising = await getPromisingThemes(this.userId, 3); // 上位3件
      console.log(`[Phase 2] Found ${pastPromising.length} past promising themes`);
      
      // 過去の有望テーマを ConditionResult 形式に変換
      for (const past of pastPromising) {
        const pastResult: ConditionResult = {
          candidate: {
            name: past.condition_name,
            conditions: past.conditions,
            hypothesis: '過去の有望テーマを再検証',
            expected_outcome: `期待値: ${past.expected_value_diff.toFixed(0)}円`,
            reason: '過去の研究で有望と判定されたテーマ'
          },
          statistics: past.statistics,
          confidence: { confidence_level: 80, is_significant: true },
          is_promising: true,
          promising_score: past.promising_score,
          promising_reasons: ['過去の研究で有望'],
          promising_warnings: [],
          debug_info: { evaluated_at: past.last_tested_at.toISOString() }
        };
        
        promising.push(pastResult);
      }
    } catch (error) {
      console.warn('[Phase 2] Failed to load past promising themes:', error);
    }
    
    console.log(`[Phase 2 Start] Deep diving ${promising.length} promising themes (including past themes)...`);
    session.phase2_results = await this.phase2_deepDivePromising(promising);
    
    const synergies = session.phase2_results.filter(r => r.is_promising);
    console.log(`[Phase 2 Complete] Found ${synergies.length} promising deep dive results`);
    
    // Phase 3: 派生検証
    session.phase = 3;
    session.progress = 80;
    session.phase3_results = await this.phase3_validateVariations(synergies);
    
    // ルール候補の保存
    session.progress = 100;
    session.rule_candidates = this.generateRuleCandidates(session.phase3_results);
  }
  
  /**
   * Phase 1: 単独条件の探索（メモリ統合版）
   */
  private async phase1_exploreConditions(theme: ResearchTheme): Promise<ConditionResult[]> {
    console.log(`[Phase 1] Loading research memory...`);
    
    // 過去の研究結果を読み込む
    let pastResults: any[] = [];
    let promisingThemes: any[] = [];
    let avoidThemes: any[] = [];
    
    try {
      pastResults = await getResearchHistory(this.userId, { limit: 100 });
      promisingThemes = pastResults.filter(r => r.is_promising);
      avoidThemes = pastResults.filter(r => r.exploration_status === 'avoid');
      
      console.log(`[Phase 1] Memory loaded:`);
      console.log(`  - Total past results: ${pastResults.length}`);
      console.log(`  - Promising themes: ${promisingThemes.length}`);
      console.log(`  - Themes to avoid: ${avoidThemes.length}`);
    } catch (error) {
      console.warn('[Phase 1] Failed to load memory (table may not exist yet):', error);
      // メモリ読み込み失敗でも研究は続行
    }
    
    console.log(`[Phase 1] Generating condition candidates (theme-based)...`);
    
    // AIに条件候補を生成させる（テーマベース: 10個）
    const targetCount = 10;
    let candidates = await this.generateConditionCandidates(theme, targetCount);
    
    // 重複チェック
    candidates = this.removeDuplicateConditions(candidates);
    
    console.log(`[Phase 1] Generated ${candidates.length} unique candidates (after deduplication)`);
    
    // すでに試した条件をスキップ
    const filteredCandidates: typeof candidates = [];
    for (const candidate of candidates) {
      try {
        const alreadyTested = await hasBeenTested(this.userId, candidate.conditions);
        if (alreadyTested) {
          console.log(`[Phase 1] Skip: ${candidate.name} (already tested)`);
          continue;
        }
        filteredCandidates.push(candidate);
      } catch (error) {
        // メモリチェック失敗でも条件は残す
        filteredCandidates.push(candidate);
      }
    }
    
    candidates = filteredCandidates;
    
    console.log(`[Phase 1] After memory filter: ${candidates.length} candidates`);
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
    
    // 結果をメモリに保存
    console.log(`[Phase 1] Saving results to memory...`);
    try {
      for (const result of results) {
        await saveToMemory(this.userId, result);
      }
      console.log(`[Phase 1] Memory saved: ${results.length} conditions`);
    } catch (error) {
      console.error('[Phase 1] Failed to save to memory:', error);
      // メモリ保存失敗でも研究は続行
    }
    
    return results;
  }
  
  /**
   * Phase 2: 有望テーマの深掘り（自律的探索）
   * Phase 1で有望だったテーマを深く掘り下げる
   */
  private async phase2_deepDivePromising(
    promising: ConditionResult[]
  ): Promise<ConditionResult[]> {
    if (promising.length === 0) {
      console.log('[Phase 2] No promising conditions to deep dive');
      return [];
    }

    console.log(`[Phase 2] Deep diving ${promising.length} promising themes...`);
    
    // 有望な条件から深掘り候補を生成（親IDをマッピング）
    const deepDiveCandidates: Array<{ candidate: ConditionCandidate; parentId?: string }> = [];
    
    for (const result of promising) {
      // 親条件のIDを取得（メモリから）
      let parentId: string | undefined;
      try {
        const conditionHash = (await import('./research-memory')).generateConditionHash(result.candidate.conditions);
        const existing = await (await import('@/lib/db')).getDbAsync().then(db => 
          db.query('SELECT id FROM research_memory WHERE user_id = $1 AND condition_hash = $2', [this.userId, conditionHash])
        );
        if (existing.rows.length > 0) {
          parentId = existing.rows[0].id;
        }
      } catch (error) {
        console.warn('[Phase 2] Failed to get parent ID:', error);
      }
      
      // 各有望条件から派生条件を生成
      const variations = await this.generateDeepDiveVariations(result);
      variations.forEach(v => deepDiveCandidates.push({ candidate: v, parentId }));
    }
    
    console.log(`[Phase 2] Generated ${deepDiveCandidates.length} deep dive candidates`);
    
    // バッチ処理で評価
    const batchSize = 5;
    const results: ConditionResult[] = [];
    
    for (let i = 0; i < deepDiveCandidates.length; i += batchSize) {
      const batch = deepDiveCandidates.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(deepDiveCandidates.length / batchSize);
      
      console.log(`[Phase 2] Batch ${batchNum}/${totalBatches}`);
      
      const batchResults = await Promise.all(
        batch.map(async ({ candidate, parentId }) => {
          const result = await this.evaluateCondition(candidate);
          
          // メモリに保存（親IDを記録）
          try {
            await saveToMemory(this.userId, result, parentId);
            console.log(`[Phase 2] Saved to memory: ${result.candidate.name} (parent: ${parentId || 'none'})`);
          } catch (error) {
            console.warn('[Phase 2] Failed to save to memory:', error);
          }
          
          return result;
        })
      );
      
      results.push(...batchResults);
    }
    
    // 有望な結果のみ返す
    return results.filter(r => r.is_promising);
  }

  /**
   * 深掘り用の派生条件を生成
   */
  private async generateDeepDiveVariations(
    result: ConditionResult
  ): Promise<ConditionCandidate[]> {
    const variations: ConditionCandidate[] = [];
    const baseCondition = result.candidate.conditions[0];
    
    if (!baseCondition) return variations;
    
    // パターン1: 閾値を調整（指数系のみ）
    if (baseCondition.operator === 'gte' && typeof baseCondition.value === 'number') {
      const baseValue = baseCondition.value;
      
      // 少し緩める
      variations.push({
        name: `${result.candidate.name.replace(/\d+\.?\d*/g, (baseValue - 0.5).toString())}`,
        conditions: [
          { ...baseCondition, value: baseValue - 0.5 }
        ],
        hypothesis: `閾値を緩めて範囲を拡大: ${result.candidate.hypothesis}`,
        expected_outcome: result.candidate.expected_outcome,
        reason: '有望な条件の閾値を調整して最適化'
      });
      
      // 少し厳しくする
      variations.push({
        name: `${result.candidate.name.replace(/\d+\.?\d*/g, (baseValue + 0.5).toString())}`,
        conditions: [
          { ...baseCondition, value: baseValue + 0.5 }
        ],
        hypothesis: `閾値を厳しくして精度向上: ${result.candidate.hypothesis}`,
        expected_outcome: result.candidate.expected_outcome,
        reason: '有望な条件の閾値を調整して最適化'
      });
    }
    
    // パターン2: コース条件を追加
    if (!result.candidate.conditions.some(c => c.field === 'distance')) {
      variations.push({
        name: `${result.candidate.name}×今走ダート`,
        conditions: [
          ...result.candidate.conditions,
          { field: 'distance', operator: 'contains', value: 'ダ' }
        ],
        hypothesis: `${result.candidate.hypothesis}（ダート限定）`,
        expected_outcome: result.candidate.expected_outcome,
        reason: '有望条件にダート条件を追加'
      });
      
      variations.push({
        name: `${result.candidate.name}×今走芝`,
        conditions: [
          ...result.candidate.conditions,
          { field: 'distance', operator: 'contains', value: '芝' }
        ],
        hypothesis: `${result.candidate.hypothesis}（芝限定）`,
        expected_outcome: result.candidate.expected_outcome,
        reason: '有望条件に芝条件を追加'
      });
    }
    
    // パターン3: 枠番条件を追加
    if (!result.candidate.conditions.some(c => c.field === 'waku')) {
      variations.push({
        name: `${result.candidate.name}×今走3枠以内`,
        conditions: [
          ...result.candidate.conditions,
          { field: 'waku', operator: 'lte', value: 3 }
        ],
        hypothesis: `${result.candidate.hypothesis}（内枠限定）`,
        expected_outcome: result.candidate.expected_outcome,
        reason: '有望条件に内枠条件を追加'
      });
    }
    
    return variations.slice(0, 3); // 最大3つの派生条件
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
          analysis_tool_used: 'AnalysisConnector',
          odds_breakdown: result.odds_breakdown
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
    
    // AIの応答をパース
    const lines = content.split('\n').filter(l => l.trim());
    let summary = '';
    let matches_hypothesis = false;
    const next_steps: string[] = [];
    
    for (const line of lines) {
      if (line.match(/^1[\.、:：]/)) {
        summary = line.replace(/^1[\.、:：]\s*/, '').trim();
      } else if (line.match(/^2[\.、:：]/)) {
        const match = line.match(/Yes|はい|一致|合致|通り/i);
        matches_hypothesis = !!match;
      } else if (line.match(/^3[\.、:：]/)) {
        // 次のステップを抽出
        const stepsText = line.replace(/^3[\.、:：]\s*/, '').trim();
        const steps = stepsText.split(/[、,・]|および/).map(s => s.trim()).filter(s => s);
        next_steps.push(...steps);
      } else if (line.match(/^[-・*]/)) {
        // リスト形式の次のステップ
        const step = line.replace(/^[-・*]\s*/, '').trim();
        if (step) next_steps.push(step);
      }
    }
    
    // フォールバック：パースに失敗した場合
    if (!summary) {
      summary = `${candidate.name}: ${is_promising ? '有望' : '不十分'}。期待値${statistics.expected_value_diff >= 0 ? '+' : ''}${statistics.expected_value_diff.toFixed(0)}円`;
    }
    if (next_steps.length === 0) {
      next_steps.push('距離帯で細分化', 'コース別に検証', '人気帯で分析');
    }
    
    return {
      summary,
      matches_hypothesis,
      next_steps: next_steps.slice(0, 3)
    };
  }
  
  
  /**
   * 組み合わせ生成（2条件、3条件）
   * 同じフィールドへの条件が重複する場合は統合する
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
          
          // 条件を統合（重複フィールドを処理）
          const mergedResult = this.mergeConditions(
            a.candidate.conditions,
            b.candidate.conditions
          );
          
          // 統合できない（矛盾する）条件はスキップ
          if (!mergedResult.valid) {
            console.log(`[Phase 2] Skipping invalid combination: ${a.candidate.name} × ${b.candidate.name} (${mergedResult.reason})`);
            continue;
          }
          
          // 条件名を改善（重複表現を避ける）
          const combinedName = this.generateCombinedName(
            a.candidate.name,
            b.candidate.name,
            mergedResult.merged
          );
          
          combinations.push({
            name: combinedName,
            conditions: mergedResult.merged,
            reasoning: `${a.candidate.reasoning}、かつ${b.candidate.reasoning}`,
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
            
            // 3つの条件を段階的に統合
            const mergedAB = this.mergeConditions(
              a.candidate.conditions,
              b.candidate.conditions
            );
            
            if (!mergedAB.valid) {
              continue;
            }
            
            const mergedABC = this.mergeConditions(
              mergedAB.merged,
              c.candidate.conditions
            );
            
            if (!mergedABC.valid) {
              continue;
            }
            
            const combinedName = this.generateCombinedName(
              a.candidate.name,
              `${b.candidate.name}×${c.candidate.name}`,
              mergedABC.merged
            );
            
            combinations.push({
              name: combinedName,
              conditions: mergedABC.merged,
              reasoning: `3条件の掛け合わせ`,
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
        reasoning: r.candidate.reasoning,
        interpretation: r.ai_interpretation,
        generated_at: new Date().toISOString(),
        model: 'gpt-4o-mini'
      }
    }));
  }
  
  /**
   * 条件の統合（同じフィールドへの条件を処理）
   */
  private mergeConditions(
    conditionsA: RuleCondition[],
    conditionsB: RuleCondition[]
  ): { valid: boolean; merged: RuleCondition[]; reason?: string } {
    const merged: RuleCondition[] = [...conditionsA];
    const fieldMap = new Map<string, RuleCondition>();
    
    // conditionsA のフィールドをマップに登録
    for (const cond of conditionsA) {
      fieldMap.set(cond.field, cond);
    }
    
    // conditionsB の各条件をチェック
    for (const condB of conditionsB) {
      const existingCond = fieldMap.get(condB.field);
      
      if (!existingCond) {
        // 新しいフィールドなら追加
        merged.push(condB);
        fieldMap.set(condB.field, condB);
      } else {
        // 同じフィールドの条件が既に存在する場合
        // 統合可能かチェック
        const mergeResult = this.mergeFieldCondition(existingCond, condB);
        
        if (!mergeResult.valid) {
          return { valid: false, merged: [], reason: mergeResult.reason };
        }
        
        // 統合された条件で置き換え
        const index = merged.findIndex(c => c.field === condB.field);
        if (index >= 0 && mergeResult.condition) {
          merged[index] = mergeResult.condition;
          fieldMap.set(condB.field, mergeResult.condition);
        }
      }
    }
    
    return { valid: true, merged };
  }
  
  /**
   * 同じフィールドへの2つの条件を統合
   */
  private mergeFieldCondition(
    condA: RuleCondition,
    condB: RuleCondition
  ): { valid: boolean; condition?: RuleCondition; reason?: string } {
    // 同一条件ならそのまま
    if (
      condA.operator === condB.operator &&
      JSON.stringify(condA.value) === JSON.stringify(condB.value)
    ) {
      return { valid: true, condition: condA };
    }
    
    // 数値条件の場合
    if (typeof condA.value === 'number' && typeof condB.value === 'number') {
      // gte と gte の場合、より大きい方を採用
      if (condA.operator === 'gte' && condB.operator === 'gte') {
        const stricterValue = Math.max(condA.value, condB.value);
        return {
          valid: true,
          condition: { ...condA, value: stricterValue }
        };
      }
      
      // lte と lte の場合、より小さい方を採用
      if (condA.operator === 'lte' && condB.operator === 'lte') {
        const stricterValue = Math.min(condA.value, condB.value);
        return {
          valid: true,
          condition: { ...condA, value: stricterValue }
        };
      }
      
      // gte と lte の組み合わせ（範囲指定）
      if (condA.operator === 'gte' && condB.operator === 'lte') {
        if (condA.value <= condB.value) {
          // 有効な範囲
          return {
            valid: true,
            condition: {
              field: condA.field,
              operator: 'between',
              value: [condA.value, condB.value]
            }
          };
        } else {
          // 矛盾（下限 > 上限）
          return {
            valid: false,
            reason: `${condA.field}の条件が矛盾（${condA.value}以上 かつ ${condB.value}以下）`
          };
        }
      }
      
      if (condA.operator === 'lte' && condB.operator === 'gte') {
        if (condB.value <= condA.value) {
          return {
            valid: true,
            condition: {
              field: condA.field,
              operator: 'between',
              value: [condB.value, condA.value]
            }
          };
        } else {
          return {
            valid: false,
            reason: `${condA.field}の条件が矛盾（${condB.value}以上 かつ ${condA.value}以下）`
          };
        }
      }
    }
    
    // その他の場合は統合不可
    return {
      valid: false,
      reason: `${condA.field}の条件が競合（${condA.operator} ${condA.value} vs ${condB.operator} ${condB.value}）`
    };
  }
  
  /**
   * 組み合わせ条件名の生成（重複表現を避ける）
   */
  private generateCombinedName(
    nameA: string,
    nameB: string,
    mergedConditions: RuleCondition[]
  ): string {
    // フィールドごとの条件を抽出
    const fieldDescriptions: string[] = [];
    const seenFields = new Set<string>();
    
    for (const cond of mergedConditions) {
      if (!seenFields.has(cond.field)) {
        seenFields.add(cond.field);
        
        // フィールド名の表示名
        const fieldLabel = this.getFieldLabel(cond.field);
        
        // 条件の説明
        const valueDesc = this.getConditionValueDescription(cond);
        
        fieldDescriptions.push(`${fieldLabel}${valueDesc}`);
      }
    }
    
    // 最大3つのフィールドまで表示
    if (fieldDescriptions.length > 3) {
      return fieldDescriptions.slice(0, 3).join('×') + '...';
    }
    
    return fieldDescriptions.join('×');
  }
  
  /**
   * フィールドの表示名を取得（前走/今走を明記）
   */
  private getFieldLabel(field: string): string {
    // 前走指数（indicesテーブル由来）
    const previousRaceIndices: Record<string, string> = {
      makikaeshi: '前走巻き返し指数',
      potential: '前走ポテンシャル指数',
      L4F: '前走L4F',
      T2F: '前走T2F',
      revouma: '前走レボウマ',
      cushion: '前走クッション値',
      pfs_past: '前走PFS過去',
      corner_lane: '前走4角位置',
      revouma2: '前走レボウマ2',
    };
    
    // 今走情報（umadataテーブル由来）
    const currentRaceFields: Record<string, string> = {
      popularity: '今走人気',
      waku: '今走枠番',
      distance: '今走距離',
      place: '今走競馬場',
      weight_carried: '今走斤量',
      win_odds: '今走単勝オッズ',
      place_odds_low: '今走複勝オッズ',
      sire: '今走父',
      jockey: '今走騎手',
      trainer: '今走調教師',
      field_size: '今走頭数',
      gender: '性別',
      age: '年齢',
      track_condition: '今走馬場状態'
    };
    
    return previousRaceIndices[field] || currentRaceFields[field] || field;
  }
  
  /**
   * 条件値の説明を取得
   */
  private getConditionValueDescription(cond: RuleCondition): string {
    if (cond.operator === 'gte') {
      return `${cond.value}以上`;
    } else if (cond.operator === 'lte') {
      return `${cond.value}以下`;
    } else if (cond.operator === 'eq') {
      return `=${cond.value}`;
    } else if (cond.operator === 'between' && Array.isArray(cond.value)) {
      return `${cond.value[0]}-${cond.value[1]}`;
    } else if (cond.operator === 'contains') {
      return `${cond.value}`;
    } else if (cond.operator === 'in' && Array.isArray(cond.value)) {
      return `(${cond.value.join('/')})`;
    }
    return `${cond.value}`;
  }
}
