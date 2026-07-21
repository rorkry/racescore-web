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
3. サンプル数が確保できる条件にする（最低30件以上）
4. 再現性のある条件にする（偶然ではない）
5. 有望な条件が見つかったら、類似条件や掛け合わせで深掘りする

【評価基準】
- 回収率だけでなく、三着内率とサンプル数を重視
- 高回収率でもサンプル数が少ない条件は信頼度が低い
- 三着内率30%以上 × 複勝回収率105%以上 × サンプル50件以上 = 有望
- 単独条件で有望なものは、さらに掛け合わせて精度を上げる

【利用可能なフィールド（実際のDBカラム名）】
🔥 独自指数（最優先・高精度）:
  - makikaeshi: 巻き返し指数（0.0〜10.0、負けた後に巻き返す傾向）
  - potential: ポテンシャル指数（0.0〜10.0、馬の潜在能力）
  - L4F: Last 4F（0.0〜10.0、上がり4ハロン評価）
  - T2F: Time 2F（0.0〜10.0、タイム評価）
  - revouma: レボウマ（0.0〜10.0）
  - cushion: クッション値（0.0〜10.0）

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
- 巻き返し指数（makikaeshi）とポテンシャル指数（potential）は最も重要な指標
- 血統タイプ（sire_type, dam_type）や母父（broodmare_sire）は使用しないこと
- sire（父名）のみ使用可能
- 条件は実際にDBに存在するカラムのみを使用すること
- 指数を使った条件を優先的に検証すること

【条件生成のポイント】
- 1つの条件は1-3個のフィールドを組み合わせる
- あまりに限定的な条件は避ける（サンプル数確保）
- 仮説の根拠を明確にする
- 独自指数（makikaeshi, potential）を積極的に活用する
- 指数 × コース、指数 × 人気、指数 × 枠番などの組み合わせを試す
- 有望な条件が見つかったら、距離帯・競馬場・馬場状態で細分化して検証する

【重要: 曖昧な条件は避ける】
❌ 悪い例:
  - "人気"（上位人気か人気薄か不明）
  - "枠番"（内枠か外枠か不明）
  
✅ 良い例:
  - "1-3番人気" → popularity <= 3
  - "人気薄（7番人気以下）" → popularity >= 7
  - "単勝10倍以上" → win_odds >= 10.0（推奨）
  - "内枠（1-3枠）" → waku <= 3
  - "外枠（6-8枠）" → waku >= 6

【オッズベースの条件を推奨】
人気順位ではなくオッズで条件を指定する方が、出走頭数に依存せず明確:
  - win_odds >= 10.0（単勝10倍以上）
  - win_odds <= 3.0（単勝3倍以下）
  - place_odds_low >= 5.0（複勝下限5倍以上）
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
  // 自動研究モードかどうかを判定
  const isAutoMode = theme.theme.includes('AIが利用可能なカラムを自動で組み合わせて');
  
  if (isAutoMode) {
    return `
【自動研究モード】
あなたは競馬研究の自律エージェントです。利用可能なすべてのカラムから、有望な条件を自動的に探索してください。

【研究戦略】
1. まず独自指数（makikaeshi, potential）を中心とした条件を優先的に検証
2. 有望な指数条件が見つかったら、コース・人気・枠番との掛け合わせを試す
3. サンプル数が十分（50件以上）で、三着内率30%以上の条件を探す
4. 回収率だけでなく、再現性と信頼度を重視

【重点的に検証すべき条件】
- 巻き返し指数（makikaeshi）の閾値を変えて試す（2.0, 3.0, 4.0, 5.0）
- ポテンシャル指数（potential）の閾値を変えて試す（3.0, 4.0, 5.0, 6.0）
- 指数 × 人気（例: popularity >= 5 かつ makikaeshi >= 4.0 で穴馬候補）
- 指数 × オッズ（例: win_odds >= 8.0 かつ potential >= 5.0 で高配当期待）
- 指数 × 枠番（例: waku <= 3 かつ potential >= 4.0 で内枠有利）
- 指数 × コース（芝・ダート・距離帯との相性）
- 指数 × 斤量（例: weight_carried <= 54 かつ makikaeshi >= 3.0）

【必須: 条件は常に具体的な演算子と値を指定】
- ❌ 「人気」「枠番」だけ → 曖昧で意味不明
- ✅ 「popularity <= 3」「waku >= 6」 → 明確で検証可能

このテーマに関連する検証すべき条件を${count}個生成してください。

【条件の形式】
各条件には以下を含めてください:
1. name: 条件名（30文字以内）
2. conditions: フィールドと値の配列
3. hypothesis: 仮説（なぜこの条件が有効だと考えるか、50文字以内）
4. expected_outcome: 期待される結果（例: 三着内率35%以上、複勝回収率110%以上）
5. reasoning: 根拠（この仮説を立てた理由、80文字以内）

【条件の例】
例1: 指数×コース
{
  "name": "巻き返し指数3.0以上×芝",
  "conditions": [
    { "field": "makikaeshi", "operator": "gte", "value": 3.0 },
    { "field": "distance", "operator": "contains", "value": "芝" }
  ],
  "hypothesis": "巻き返し指数が高い馬は芝で好走する",
  "expected_outcome": "三着内率40%以上、複勝回収率115%以上",
  "reasoning": "巻き返し指数は負けた後の巻き返し力を示し、芝は能力が反映されやすい"
}

例2: 指数×人気（明確な範囲指定）
{
  "name": "人気薄（7番人気以下）×高ポテンシャル",
  "conditions": [
    { "field": "popularity", "operator": "gte", "value": 7 },
    { "field": "potential", "operator": "gte", "value": 5.0 }
  ],
  "hypothesis": "人気薄でもポテンシャル指数が高ければ穴馬候補",
  "expected_outcome": "単勝回収率150%以上",
  "reasoning": "人気に反映されていない能力を指数で検出"
}

例3: 指数×オッズ（推奨）
{
  "name": "単勝10倍以上×高巻き返し指数",
  "conditions": [
    { "field": "win_odds", "operator": "gte", "value": 10.0 },
    { "field": "makikaeshi", "operator": "gte", "value": 4.0 }
  ],
  "hypothesis": "オッズが高くても巻き返し指数が高ければ期待値がある",
  "expected_outcome": "単勝回収率180%以上",
  "reasoning": "オッズで直接判定し、出走頭数に依存しない条件"
}

【出力形式】
必ずJSON形式で以下の構造で返してください：
{
  "conditions": [条件の配列]
}
`.trim();
  }
  
  // 手動モード
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
  "name": "ディープ産駒×芝2000m",
  "conditions": [
    {
      "field": "sire",
      "operator": "eq",
      "value": "ディープインパクト"
    },
    {
      "field": "distance",
      "operator": "contains",
      "value": "芝"
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
  if (theme.includes('指数') || theme.includes('ポテンシャル')) {
    return [
      {
        name: '巻き返し指数高い馬',
        conditions: [
          { field: 'makikaeshi', operator: 'gte', value: 3.0 }
        ],
        hypothesis: '巻き返し指数が高い馬は前走負けても次走で好走する',
        expected_outcome: '三着内率40%以上、複勝回収率110%以上',
        reasoning: '巻き返し指数は負けた後の巻き返し傾向を示す独自指標'
      },
      {
        name: 'ポテンシャル×巻き返し',
        conditions: [
          { field: 'potential', operator: 'gte', value: 5.0 },
          { field: 'makikaeshi', operator: 'gte', value: 2.0 }
        ],
        hypothesis: 'ポテンシャルと巻き返し指数が共に高い馬は期待値が高い',
        expected_outcome: '三着内率50%以上、複勝回収率120%以上',
        reasoning: '潜在能力と巻き返し力の両方を持つ馬は信頼度が高い'
      }
    ];
  }
  
  if (theme.includes('枠') || theme.includes('waku')) {
    return [
      {
        name: '内枠×高指数（芝）',
        conditions: [
          { field: 'waku', operator: 'lte', value: 3 },
          { field: 'distance', operator: 'contains', value: '芝' },
          { field: 'potential', operator: 'gte', value: 4.0 }
        ],
        hypothesis: '芝コースでは内枠とポテンシャル指数の相乗効果がある',
        expected_outcome: '勝率20%以上、複勝回収率115%以上',
        reasoning: '内枠の位置取り有利性と能力の組み合わせ'
      }
    ];
  }
  
  if (theme.includes('血統') || theme.includes('sire')) {
    return [
      {
        name: 'ディープ産駒×芝',
        conditions: [
          { field: 'sire', operator: 'eq', value: 'ディープインパクト' },
          { field: 'distance', operator: 'contains', value: '芝' }
        ],
        hypothesis: 'ディープ産駒は芝で期待値が高い',
        expected_outcome: '回収率120%以上、三着内率40%以上',
        reasoning: 'ディープは芝で圧倒的な成績を残している'
      }
    ];
  }
  
  // 汎用デフォルト
  return [
    {
      name: '巻き返し指数高い馬',
      conditions: [
        { field: 'makikaeshi', operator: 'gte', value: 3.0 }
      ],
      hypothesis: '巻き返し指数が高い馬は前走負けても次走で好走する',
      expected_outcome: '三着内率40%以上、複勝回収率110%以上',
      reasoning: '巻き返し指数は負けた後の巻き返し傾向を示す独自指標'
    },
    {
      name: '人気薄（5番人気以下）×高指数',
      conditions: [
        { field: 'popularity', operator: 'gte', value: 5 },
        { field: 'potential', operator: 'gte', value: 5.0 }
      ],
      hypothesis: '人気薄でもポテンシャル指数が高ければ穴馬候補',
      expected_outcome: '単勝回収率150%以上（高配当狙い）',
      reasoning: '人気に反映されていない能力を指数で検出'
    },
    {
      name: '単勝10倍以上×高指数',
      conditions: [
        { field: 'win_odds', operator: 'gte', value: 10.0 },
        { field: 'makikaeshi', operator: 'gte', value: 4.0 }
      ],
      hypothesis: 'オッズが高くても巻き返し指数が高ければ期待値がある',
      expected_outcome: '単勝回収率180%以上',
      reasoning: 'オッズで直接判定し、出走頭数に依存しない条件'
    },
    {
      name: '芝中距離×高指数',
      conditions: [
        { field: 'distance', operator: 'contains', value: '芝' },
        { field: 'potential', operator: 'gte', value: 4.0 }
      ],
      hypothesis: '芝コースでポテンシャル指数が高い馬は安定',
      expected_outcome: '回収率105%以上',
      reasoning: '芝適性と能力の組み合わせ'
    }
  ];
}
