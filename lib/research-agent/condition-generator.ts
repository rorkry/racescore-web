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
🔥 **前走指数（最優先・高精度）**
  - makikaeshi: 前走巻き返し指数（0.0〜10.0、負けた後に巻き返す傾向）
  - potential: 前走ポテンシャル指数（0.0〜10.0、馬の潜在能力）
  - L4F: 前走Last 4F（0.0〜10.0、上がり4ハロン評価）
  - T2F: 前走Time 2F（0.0〜10.0、タイム評価）
  - revouma: 前走レボウマ（0.0〜10.0）
  - cushion: 前走クッション値（0.0〜10.0）
  
  ⚠️ 注意: これらは「前走の結果に基づく指数」です
  - 今走を予測する時点で、前走はすでに終わっているため使用可能
  - 例: 「前走で巻き返し指数4.0以上だった馬が、次走でどうなるか」

✅ 今走情報（レース前に分かる）:
コース・トラック:
  - place: 競馬場（例: "東京", "新潟", "中山"）
  - distance: 距離（"芝1600", "ダ1800"のような形式）
  - waku: 枠番（例: "1", "2", "3", "4", "5", "6", "7", "8"）
  - track_condition: 馬場状態（例: "良", "稍重", "重", "不良"）

馬・騎手・厩舎:
  - sire: 種牡馬名（例: "ディープインパクト"）
  - jockey: 騎手名（例: "武豊"）
  - trainer: 調教師名（例: "藤沢和雄"）
  - weight_carried: 斤量（例: "55", "54", "57"）
  - gender: 性別（例: "牡", "牝", "セ"）
  - age: 年齢（例: "3", "4", "5"）
  - popularity: 人気（例: "1", "2", "3"）
  - field_size: 頭数（例: "18", "16", "12"）

✅ 前走情報（前走が終わっているので使用可能）:
  - makikaeshi: 前走巻き返し指数
  - potential: 前走ポテンシャル指数
  - L4F, T2F, revouma, cushion: 前走パフォーマンス指数

❌ 今走の結果（レース後にのみ判明・予測には使用不可）:
  - finish_position: 今走着順
  - win_odds: 今走確定オッズ

【重要な注意事項】
🚨 **具体的な数値で条件を指定すること**
  - ❌ 抽象的: 「人気薄」「内枠」「外枠」「軽斤量」
  - ✅ 具体的: 「7番人気以下」「3枠以内」「6枠以上」「54kg以下」
  
🚨 **予測に使える情報のみを使用すること**
  - 前走の指数（makikaeshi, potential等）は使用可能
  - 今走の着順（finish_position）は使用不可（これが目的変数）
  
✅ **推奨される分析の流れ**
  1. 前走指数（makikaeshi, potential）を最優先で使用
  2. コース・トラック条件（芝/ダート、距離、競馬場）
  3. 血統（種牡馬）×コース適性
  4. 枠番（具体的な数値: 3枠以内、6枠以上）
  5. 人気（具体的な数値: 3番人気以内、7番人気以下）

【条件名の命名規則（必須）】
🚨 **条件名には必ず「前走」「今走」を明記すること**
  - ❌ 悪い例: "巻き返し指数4.0以上×ダート" → どちらの時点か不明
  - ✅ 良い例: "前走巻き返し指数4.0以上×今走ダート" → 明確
  
  - ❌ 悪い例: "ポテンシャル5.0以上×斤量54kg以下" → 不明確
  - ✅ 良い例: "前走ポテンシャル5.0以上×今走斤量54kg以下" → 明確
  
  - ❌ 悪い例: "ディープ産駒×芝×人気薄" → 不明確
  - ✅ 良い例: "今走ディープ産駒×今走芝×今走7番人気以下" → 明確

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
      
      // 重複排除: 同じフィールドを使った条件を除外
      const diverseConditions = ensureDiversity(conditions);
      
      return diverseConditions;
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
【実用的な馬券戦略発見モード】
あなたは実際の馬券で使える条件を発見する研究AIです。**ランダム検索は禁止**です。

【目的】
面白い条件ではなく、**実際の馬券で使える条件**を発見すること。

【評価基準（厳格）】
- 勝率: 10〜30%（理想範囲）
- 複勝率: 30〜45%（理想範囲）
- サンプル数: 100件以上必須
- ❌ 極端に低い勝率（<5%）で一撃の高配当だけの条件は除外
- ❌ 偶然性の高い条件（サンプル数が少ない、三着内率が低い）は除外

【研究方法（テーマベース探索）】
🚨 **各テーマで代表条件を1つだけ生成してください**

生成すべきテーマ（合計${count}個）：
1. **前走巻き返し指数系** (1個) - 前走で巻き返し力があった馬
2. **前走ポテンシャル指数系** (1個) - 前走でポテンシャルが高かった馬
3. **前走L4F系** (1個) - 前走で上がり4ハロンが良かった馬
4. **前走T2F系** (1個) - 前走でタイム評価が高かった馬
5. **血統系（父）** (2個) - 特定の種牡馬の適性
6. **コース系** (2個) - 特定の競馬場や距離での傾向
7. **枠番系** (1個) - 内枠または外枠の有利性
8. **斤量系** (1個) - 軽斤量または重斤量の影響
9. **騎手系** (1個) - 特定の騎手の得意条件
10. **人気系** (1個) - 上位人気または人気薄の期待値

🚨 **絶対に避けること**
- ❌ 同じテーマで閾値だけ変えた条件（例: 巻き返し3.0、4.0、5.0）
- ❌ ランダムな条件の羅列
- ❌ 類似条件の大量出力

✅ **正しい生成例**
- テーマ1: 前走巻き返し指数4.0以上×今走ダート
- テーマ2: 前走ポテンシャル5.0以上×今走3枠以内
- テーマ3: 前走L4F 5.0以上×今走芝
- テーマ4: 今走ディープ産駒×今走芝2000m以上
- テーマ5: 今走斤量54kg以下×今走1勝クラス

【重点的に検証すべき条件】
1. **前走指数 × 今走条件**（最優先・最も効果的）
   - 例: 前走makikaeshi >= 4.0 かつ 今走distance LIKE "ダ%" 
   - 例: 前走potential >= 5.0 かつ 今走waku <= 3 （3枠以内）
   - 例: 前走L4F >= 5.0 かつ 今走place = "東京"
   
2. **前走指数 × 今走人気**
   - 例: 前走makikaeshi >= 4.0 かつ 今走popularity >= 7 （7番人気以下）
   - 例: 前走potential >= 6.0 かつ 今走popularity <= 3 （3番人気以内）
   - 例: 前走makikaeshi >= 3.0 かつ 今走popularity BETWEEN 4 AND 6 （4-6番人気）
   
3. **今走種牡馬 × 今走コース × 前走指数**
   - 例: 今走sire = "ディープインパクト" かつ 今走distance LIKE "芝%" かつ 前走potential >= 4.0
   
4. **今走枠番 × 今走コース × 前走指数**
   - 例: 今走waku <= 3 （3枠以内） かつ 今走distance LIKE "芝%" かつ 前走makikaeshi >= 3.0
   - 例: 今走waku >= 6 （6枠以上） かつ 今走distance LIKE "ダ%" かつ 前走potential >= 4.0
   
5. **今走騎手・調教師 × 前走指数**
   - 例: 今走jockey = "武豊" かつ 前走potential >= 5.0

【必須: 抽象的な表現を使わず、具体的な数値を指定】
- ❌ 「人気薄」「内枠」「外枠」「軽斤量」 → 抽象的で不明確
- ✅ 「popularity >= 7」（7番人気以下）
- ✅ 「waku <= 3」（3枠以内）
- ✅ 「waku >= 6」（6枠以上）
- ✅ 「weight_carried <= 54」（54kg以下）

上記のテーマから**${count}個の代表条件**を生成してください。
各テーマで1つの条件のみを生成し、異なるテーマが並ぶようにしてください。

【期待される結果の基準】
- 勝率: 10〜30%
- 複勝率: 30〜45%
- サンプル数: 100件以上
- 単勝回収率: 90%以上
- 複勝回収率: 105%以上

【条件生成の注意事項】
🚨 **必ず守ること**
1. 各テーマで1つの条件のみ
2. 閾値は最適値を推測して設定（例: makikaeshi >= 4.0）
3. 条件名には「前走」「今走」を明記
4. サンプル数を確保できる条件にする（絞り込みすぎない）

❌ 絶対に避けること
- 同じテーマの複数条件（例: 巻き返し3.0、4.0、5.0）
- あまりに限定的な条件（例: ディープ産駒×東京芝2400m×斤量57kg）

【条件の形式】
各条件には以下を含めてください:
1. name: 条件名（30文字以内）
2. conditions: フィールドと値の配列
3. hypothesis: 仮説（なぜこの条件が有効だと考えるか、50文字以内）
4. expected_outcome: 期待される結果（例: 三着内率35%以上、複勝回収率110%以上）
5. reasoning: 根拠（この仮説を立てた理由、80文字以内）

【条件の例（前走指数を活用・具体的な数値で指定・前走/今走を明記）】
例1: 前走指数×今走コース
{
  "name": "前走巻き返し指数3.0以上×今走ダート",
  "conditions": [
    { "field": "makikaeshi", "operator": "gte", "value": 3.0 },
    { "field": "distance", "operator": "contains", "value": "ダ" }
  ],
  "hypothesis": "前走で巻き返し指数が高かった馬は今走ダートで好走する",
  "expected_outcome": "三着内率45%以上、複勝回収率120%以上",
  "reasoning": "巻き返し力がある馬はダートで能力を発揮しやすい"
}

例2: 前走指数×今走人気（具体的な番人気で指定）
{
  "name": "前走ポテンシャル5.0以上×今走7番人気以下",
  "conditions": [
    { "field": "potential", "operator": "gte", "value": 5.0 },
    { "field": "popularity", "operator": "gte", "value": 7 }
  ],
  "hypothesis": "前走でポテンシャルが高かった馬は今走7番人気以下でも期待値がある",
  "expected_outcome": "単勝回収率150%以上",
  "reasoning": "人気に反映されていない能力を前走指数で検出"
}

例3: 前走指数×今走枠番×今走コース（具体的な枠番で指定）
{
  "name": "前走ポテンシャル4.0以上×今走3枠以内×今走芝",
  "conditions": [
    { "field": "potential", "operator": "gte", "value": 4.0 },
    { "field": "waku", "operator": "lte", "value": 3 },
    { "field": "distance", "operator": "contains", "value": "芝" }
  ],
  "hypothesis": "前走でポテンシャルが高く、今走3枠以内を引いた馬は芝で有利",
  "expected_outcome": "勝率18%以上、複勝回収率115%以上",
  "reasoning": "能力と位置取りの相乗効果"
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

【条件の例（前走/今走を明記）】
{
  "name": "今走ディープ産駒×今走芝2000m",
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
  "hypothesis": "今走ディープ産駒は今走芝中距離で期待値が高い",
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
 * 条件の多様性を確保（重複排除）
 * 同じフィールドを使った条件が複数ある場合、最初の1つだけを残す
 */
function ensureDiversity(conditions: ConditionCandidate[]): ConditionCandidate[] {
  const seenFields = new Set<string>();
  const diverseConditions: ConditionCandidate[] = [];
  
  for (const condition of conditions) {
    // この条件で使われているフィールドを抽出
    const fields = condition.conditions.map(c => c.field);
    
    // 単独条件（1フィールド）の場合のみ重複チェック
    if (fields.length === 1) {
      const field = fields[0];
      
      // 既に同じフィールドを使った条件がある場合はスキップ
      if (seenFields.has(field)) {
        console.log(`[多様性確保] スキップ: ${condition.name} (フィールド "${field}" は既に使用済み)`);
        continue;
      }
      
      seenFields.add(field);
    }
    
    diverseConditions.push(condition);
  }
  
  console.log(`[多様性確保] ${conditions.length}個 → ${diverseConditions.length}個 (${conditions.length - diverseConditions.length}個削除)`);
  return diverseConditions;
}

/**
 * デフォルトの条件候補（フォールバック）
 */
export function getDefaultConditions(theme: string): ConditionCandidate[] {
  // テーマに応じたデフォルト条件（前走指数を活用・具体的な数値で指定・前走/今走を明記）
  if (theme.includes('指数') || theme.includes('ポテンシャル')) {
    return [
      {
        name: '前走巻き返し指数3.0以上',
        conditions: [
          { field: 'makikaeshi', operator: 'gte', value: 3.0 }
        ],
        hypothesis: '前走で巻き返し指数が高かった馬は次走で好走する',
        expected_outcome: '三着内率40%以上、複勝回収率115%以上',
        reasoning: '巻き返し力がある馬は継続して好走しやすい'
      },
      {
        name: '前走ポテンシャル5.0以上×今走ダート',
        conditions: [
          { field: 'potential', operator: 'gte', value: 5.0 },
          { field: 'distance', operator: 'contains', value: 'ダ' }
        ],
        hypothesis: '前走でポテンシャルが高かった馬は今走ダートで実力を発揮',
        expected_outcome: '三着内率45%以上、複勝回収率120%以上',
        reasoning: 'ポテンシャルの高い馬はダートで安定'
      }
    ];
  }
  
  if (theme.includes('枠') || theme.includes('waku')) {
    return [
      {
        name: '今走3枠以内×今走芝1600m',
        conditions: [
          { field: 'waku', operator: 'lte', value: 3 },
          { field: 'distance', operator: 'eq', value: '芝1600' }
        ],
        hypothesis: '今走芝1600mでは3枠以内が有利',
        expected_outcome: '勝率15%以上、複勝回収率105%以上',
        reasoning: '3枠以内の位置取り有利性'
      }
    ];
  }
  
  if (theme.includes('血統') || theme.includes('sire')) {
    return [
      {
        name: '今走ディープ産駒×今走芝',
        conditions: [
          { field: 'sire', operator: 'eq', value: 'ディープインパクト' },
          { field: 'distance', operator: 'contains', value: '芝' }
        ],
        hypothesis: '今走ディープ産駒は今走芝で期待値が高い',
        expected_outcome: '回収率120%以上、三着内率40%以上',
        reasoning: 'ディープは芝で圧倒的な成績を残している'
      }
    ];
  }
  
  // 汎用デフォルト（前走指数を活用・具体的な数値で指定・前走/今走を明記）
  return [
    {
      name: '前走巻き返し指数3.0以上×今走ダート',
      conditions: [
        { field: 'makikaeshi', operator: 'gte', value: 3.0 },
        { field: 'distance', operator: 'contains', value: 'ダ' }
      ],
      hypothesis: '前走で巻き返し指数が高かった馬は今走ダートで好走する',
      expected_outcome: '三着内率45%以上、複勝回収率120%以上',
      reasoning: '巻き返し力のある馬はダートで安定'
    },
    {
      name: '前走ポテンシャル5.0以上×今走3枠以内',
      conditions: [
        { field: 'potential', operator: 'gte', value: 5.0 },
        { field: 'waku', operator: 'lte', value: 3 }
      ],
      hypothesis: '前走でポテンシャルが高く、今走3枠以内を引いた馬は有利',
      expected_outcome: '勝率18%以上、複勝回収率115%以上',
      reasoning: '能力と位置取りの相乗効果'
    },
    {
      name: '前走L4F 5.0以上×今走芝',
      conditions: [
        { field: 'L4F', operator: 'gte', value: 5.0 },
        { field: 'distance', operator: 'contains', value: '芝' }
      ],
      hypothesis: '前走で上がりが良かった馬は今走芝で末脚を発揮',
      expected_outcome: '三着内率35%以上、複勝回収率110%以上',
      reasoning: '上がりの脚がある馬は芝で有利'
    },
    {
      name: '前走巻き返し指数4.0以上×今走7番人気以下',
      conditions: [
        { field: 'makikaeshi', operator: 'gte', value: 4.0 },
        { field: 'popularity', operator: 'gte', value: 7 }
      ],
      hypothesis: '前走で高い巻き返し指数を持つ馬は今走7番人気以下でも期待値がある',
      expected_outcome: '単勝回収率150%以上',
      reasoning: '人気に反映されていない巻き返し力'
    }
  ];
}
