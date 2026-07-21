/**
 * 条件候補生成
 * AIが検証すべき条件を生成する
 */

import OpenAI from 'openai';
import type { RuleCondition } from '@/types/rule';

const RESEARCH_AGENT_SYSTEM_PROMPT = `
あなたは競馬研究の自律エージェントです。

【あなたの役割】
- 仮説を生成する（答えを当てるのではない）
- データ分析結果を解釈する
- 次に検証すべき条件を提案する

【研究の進め方】
1. 分析可能な項目から仮説を立てる
2. 具体的で検証可能な条件を生成する
3. サンプル数が確保できる条件にする
4. 再現性のある条件にする

【利用可能なフィールド（実際のDBカラム名）】
血統:
  - sire: 種牡馬名（例: "ディープインパクト", "キングカメハメハ"）
  ※注意: sire_type, dam_type, broodmare_sireは現在使用不可

コース:
  - place: 競馬場（例: "東京", "新潟", "中山"）
  - distance: 距離（"芝1600", "ダ1800"のような形式）
    ※distance LIKEで検索する場合: "芝%"（芝全体）, "芝1600"（芝1600m）
  - waku: 枠番（例: "1", "2", "3", "4", "5", "6", "7", "8"）
  - weight_carried: 斤量（例: "55", "54", "57"）

レース結果:
  - finish_position: 着順（例: "1", "2", "3"）
  - popularity: 人気（例: "1", "2", "3"）
  - field_size: 頭数（例: "18", "16", "12"）

【重要な注意事項】
- 血統タイプ（sire_type, dam_type）や母父（broodmare_sire）は使用しないこと
- sire（父名）のみ使用可能
- 条件は実際にDBに存在するカラムのみを使用すること

【条件生成のポイント】
- 1つの条件は1-3個のフィールドを組み合わせる
- あまりに限定的な条件は避ける（サンプル数確保）
- 仮説の根拠を明確にする
`;

export interface ConditionCandidate {
  name: string;
  conditions: RuleCondition[];
  hypothesis: string;
  expected_outcome: string;
  reasoning: string;
}

export interface ResearchTheme {
  theme: string;
  description: string;
  focus_areas: string[];
}

/**
 * 条件候補を生成（リトライ機能付き）
 */
export async function generateConditions(
  openai: OpenAI,
  theme: ResearchTheme,
  count: number = 20,
  maxRetries: number = 3
): Promise<ConditionCandidate[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: RESEARCH_AGENT_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: buildPrompt(theme, count)
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7 + (attempt - 1) * 0.1 // リトライごとに温度を上げる
      });
      
      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from AI');
      }
      
      const conditions = parseResponse(content);
      
      // 最低限の条件が生成されているか確認
      if (conditions.length === 0) {
        throw new Error('No conditions generated');
      }
      
      return conditions;
    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt}/${maxRetries} failed:`, error);
      
      // 最後の試行でなければ少し待つ
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  // すべてのリトライが失敗した場合、デフォルト条件を返す
  console.error('All retries failed, using default conditions');
  return getDefaultConditions(theme.theme);
}

/**
 * プロンプト構築
 */
function buildPrompt(theme: ResearchTheme, count: number): string {
  return `
テーマ: ${theme.theme}

このテーマに関連する検証すべき条件を${count}個生成してください。

【条件の形式】
各条件には以下を含めてください:
1. name: 条件名（30文字以内）
2. conditions: フィールドと値の配列
3. hypothesis: 仮説（なぜこの条件が有効だと考えるか、50文字以内）
4. expected_outcome: 期待される結果（例: 回収率120%以上）
5. reasoning: 根拠（この仮説を立てた理由、80文字以内）

【条件の例】
{
  "name": "母父ディープ×芝2000m",
  "conditions": [
    {
      "field": "broodmare_sire",
      "operator": "eq",
      "value": "ディープインパクト"
    },
    {
      "field": "surface",
      "operator": "eq",
      "value": "芝"
    },
    {
      "field": "distance",
      "operator": "between",
      "value": [1800, 2200]
    }
  ],
  "hypothesis": "ディープを母父に持つ馬は芝中距離で期待値が高い",
  "expected_outcome": "回収率120%以上、三着内率40%以上",
  "reasoning": "ディープは芝で圧倒的な成績を残しており、その血を引く馬は芝適性が高い"
}

【出力形式】
以下のJSON形式で出力してください:
{
  "conditions": [
    { ... },
    { ... },
    ...
  ]
}
`.trim();
}

/**
 * レスポンスのパース
 */
function parseResponse(content: string): ConditionCandidate[] {
  try {
    const parsed = JSON.parse(content);
    
    if (!parsed.conditions || !Array.isArray(parsed.conditions)) {
      throw new Error('Invalid response format');
    }
    
    return parsed.conditions.map((c: any) => ({
      name: c.name || '無名条件',
      conditions: parseConditions(c.conditions || []),
      hypothesis: c.hypothesis || '',
      expected_outcome: c.expected_outcome || '',
      reasoning: c.reasoning || ''
    }));
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    console.error('Response content:', content);
    throw new Error('Failed to parse AI response');
  }
}

/**
 * 条件の配列をパース
 */
function parseConditions(conditions: any[]): RuleCondition[] {
  return conditions.map(c => ({
    field: c.field,
    operator: c.operator || 'eq',
    value: c.value,
    target: c.target
  }));
}

/**
 * デフォルトの条件候補（フォールバック）
 */
export function getDefaultConditions(theme: string): ConditionCandidate[] {
  // テーマに応じたデフォルト条件
  if (theme.includes('母父') || theme.includes('血統')) {
    return [
      {
        name: '母父ディープ×芝',
        conditions: [
          { field: 'broodmare_sire', operator: 'eq', value: 'ディープインパクト' },
          { field: 'surface', operator: 'eq', value: '芝' }
        ],
        hypothesis: 'ディープを母父に持つ馬は芝で期待値が高い',
        expected_outcome: '回収率120%以上、三着内率40%以上',
        reasoning: 'ディープは芝で圧倒的な成績を残しており、その血を引く馬は芝適性が高い傾向'
      },
      {
        name: '母父キンカメ×ダート',
        conditions: [
          { field: 'broodmare_sire', operator: 'eq', value: 'キングカメハメハ' },
          { field: 'surface', operator: 'eq', value: 'ダート' }
        ],
        hypothesis: 'キンカメを母父に持つ馬はダートで期待値が高い',
        expected_outcome: '回収率115%以上',
        reasoning: 'キンカメはパワー系の血統でダート適性が高い'
      }
    ];
  }
  
  if (theme.includes('枠') || theme.includes('waku')) {
    return [
      {
        name: '東京ダート1600m×1枠',
        conditions: [
          { field: 'place', operator: 'eq', value: '東京' },
          { field: 'surface', operator: 'eq', value: 'ダート' },
          { field: 'distance', operator: 'eq', value: 1600 },
          { field: 'waku', operator: 'eq', value: 1 }
        ],
        hypothesis: '東京ダート1600mは内枠有利',
        expected_outcome: '回収率110%以上',
        reasoning: '内枠からの先行が有利なコース形態'
      }
    ];
  }
  
  // 汎用デフォルト
  return [
    {
      name: '芝2000m',
      conditions: [
        { field: 'surface', operator: 'eq', value: '芝' },
        { field: 'distance', operator: 'between', value: [1800, 2200] }
      ],
      hypothesis: '芝中距離は安定した条件',
      expected_outcome: '回収率100%以上',
      reasoning: '最も一般的な距離帯でデータが豊富'
    }
  ];
}
