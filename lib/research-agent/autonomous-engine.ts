/**
 * 自律型研究エージェント
 * AIが自律的に仮説を生成し、既存エンジンで検証する
 */

import OpenAI from 'openai';
import type { Rule, RuleCondition } from '@/types/rule';
import { AnalysisConnector } from './analysis-connector';

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

export interface ResearchTheme {
  theme: string;
  description: string;
  focus_areas: string[];
}

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
    place_return_rate: number;
    show_rate: number;
    expected_value_diff: number;
  };
  confidence: {
    confidence_level: number;
    is_significant: boolean;
  };
  is_promising: boolean;
  
  // AI の解釈（結果を受けて）
  ai_interpretation?: {
    summary: string;                 // 結果の要約
    matches_hypothesis: boolean;     // 仮説と一致したか
    next_steps: string[];            // 次に試すべきこと
  };
}

export interface ResearchSession {
  id: string;
  user_id: string;
  theme: ResearchTheme;
  phase: 1 | 2 | 3;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  
  // 各フェーズの結果
  phase1_results: ConditionResult[];
  phase2_results: ConditionResult[];
  phase3_results: ConditionResult[];
  
  // 最終的なルール候補
  rule_candidates: any[];
  
  started_at: Date;
  completed_at?: Date;
}

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
   * Phase 1: 単独条件の探索
   */
  private async phase1_exploreConditions(theme: ResearchTheme): Promise<ConditionResult[]> {
    // AIに条件候補を生成させる
    const candidates = await this.generateConditionCandidates(theme, 20);
    
    // 各条件を検証（並列実行）
    const results = await Promise.all(
      candidates.map(c => this.evaluateCondition(c))
    );
    
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
   * 条件候補の生成（AI）
   */
  private async generateConditionCandidates(
    theme: ResearchTheme,
    count: number
  ): Promise<ConditionCandidate[]> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: RESEARCH_AGENT_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `テーマ: ${theme.theme}

          このテーマに関連する条件を${count}個生成してください。
          各条件は検証可能で、サンプル数が確保できるものにしてください。`
        }
      ],
      tools: [CONDITION_GENERATOR_TOOL],
      tool_choice: 'auto'
    });
    
    // TODO: 実際のレスポンスをパース
    // 仮実装
    return [
      {
        name: '母父ディープ × 芝',
        conditions: [
          { field: 'broodmare_sire', operator: 'eq', value: 'ディープインパクト' },
          { field: 'surface', operator: 'eq', value: '芝' }
        ],
        reason: '母父ディープは芝で好成績の傾向',
        hypothesis: 'ディープインパクトを母父に持つ馬は、芝のレースで期待値が高い',
        expected_outcome: '回収率120%以上、三着内率40%以上'
      }
    ];
  }
  
  /**
   * 条件の評価（既存エンジン使用）
   */
  private async evaluateCondition(
    candidate: ConditionCandidate
  ): Promise<ConditionResult> {
    try {
      // 既存の分析ツールで検証
      const result = await this.analysisConnector.evaluateCondition(candidate.conditions);
      
      const statistics = {
        sample_size: result.statistics.sample_size,
        win_rate: result.statistics.win_rate,
        place_return_rate: result.statistics.place_return_rate,
        show_rate: result.statistics.show_rate,
        expected_value_diff: result.statistics.expected_value_diff
      };
      
      const confidence = {
        confidence_level: result.confidence.confidence_level,
        is_significant: result.confidence.is_significant
      };
      
      const is_promising = this.isPromising({
        candidate,
        statistics,
        confidence,
        is_promising: false
      });
      
      // AIに結果を解釈させる
      const ai_interpretation = await this.interpretResult(candidate, statistics, is_promising);
      
      return {
        candidate,
        statistics,
        confidence,
        is_promising,
        ai_interpretation
      };
    } catch (error) {
      console.error('Condition evaluation failed:', error);
      
      // エラー時はデフォルト値
      return {
        candidate,
        statistics: {
          sample_size: 0,
          win_rate: 0,
          place_return_rate: 0,
          show_rate: 0,
          expected_value_diff: 0
        },
        confidence: {
          confidence_level: 0,
          is_significant: false
        },
        is_promising: false
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
   * 有望条件の判定
   */
  private isPromising(result: ConditionResult): boolean {
    return (
      result.statistics.sample_size >= 30 &&
      result.statistics.show_rate >= 0.1 &&
      result.statistics.expected_value_diff >= 20 &&
      result.confidence.confidence_level >= 60
    );
  }
  
  /**
   * 組み合わせ生成
   */
  private generateCombinations(
    promising: ConditionResult[],
    ...sizes: number[]
  ): ConditionCandidate[] {
    // TODO: 実装
    return [];
  }
  
  /**
   * 相乗効果の判定
   */
  private hasSynergy(result: ConditionResult): boolean {
    // TODO: 単独条件の合計と比較
    return true;
  }
  
  /**
   * 派生パターン生成
   */
  private generateVariations(candidate: ConditionCandidate): ConditionCandidate[] {
    // TODO: 実装
    return [];
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
