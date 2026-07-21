# 自律型研究エージェント 設計書

## 🎯 ゴール

**「研究AIを、自律的に仮説を生成し検証するエージェントに進化させる」**

---

## 💡 コンセプト

### AIの役割

❌ **やらないこと**: 答えを当てる、統計計算
✅ **やること**: 仮説生成、結果解釈、次の条件提案

```
人間: 戦略設計、最終承認
  ↓
AI: 仮説生成、条件提案
  ↓
既存エンジン: 統計計算、データ分析
  ↓
AI: 結果解釈、次の手決定
  ↓
ループ継続...
```

---

## 🔄 研究ループ

### 自律研究の流れ

```
1. 初期化
   ├ DBから分析可能項目を読み込み
   └ 研究テーマを決定（AIが提案）

2. 単独条件の検証
   ├ AIが条件候補を生成（20-30個）
   ├ 各条件を既存エンジンで検証
   └ 有望な条件を抽出（期待値+、信頼度60%以上）

3. 掛け合わせ検証
   ├ 有望条件の組み合わせを生成（AIが提案）
   ├ 2条件、3条件の掛け合わせを検証
   └ 相乗効果のある組み合わせを抽出

4. 派生条件での再検証
   ├ 有望条件の類似パターンを生成（AIが提案）
   ├ 「前走A+」→「前走A以上」「前走S」など
   └ 偶然性を排除

5. ルール候補の保存
   ├ 統計的に有意な条件のみ
   ├ 期待値、サンプル数、信頼度を添付
   └ 人間の承認待ち

6. 次のテーマへ
   └ 研究テーマをローテーション
```

---

## 📋 研究戦略（固定）

### Phase 1: 単独条件の探索

**目的**: 各要素の影響を単独で測定

**AIが生成する条件例**:
```typescript
// 血統系
{ field: "sire", value: "ディープインパクト" }
{ field: "broodmare_sire", value: "サンデーサイレンス" }
{ field: "sire_type", value: "スピード系" }

// 前走成績系
{ field: "last_race_level", value: "A+" }
{ field: "last_finish_position", operator: "lte", value: 3 }
{ field: "last_margin", operator: "lte", value: 0.3 }

// コース系
{ field: "distance", operator: "between", value: [1800, 2200] }
{ field: "surface", value: "芝" }
{ field: "waku", value: 1 }

// 斤量系
{ field: "weight_carried", operator: "lte", value: 55 }
```

**評価基準**:
- 期待値差: +20円以上
- 信頼度: 60%以上
- サンプル数: 30走以上
- 三着内率: 10%以上（偶然排除）

---

### Phase 2: 掛け合わせの検証

**目的**: 相乗効果のある組み合わせを発見

**AIが生成する組み合わせ例**:
```typescript
// 2条件
[
  { field: "broodmare_sire", value: "ディープインパクト" },
  { field: "surface", value: "芝" }
]

// 3条件
[
  { field: "last_race_level", value: "A+" },
  { field: "last_margin", operator: "lte", value: 0.3 },
  { field: "distance", operator: "between", value: [1800, 2200] }
]
```

**相乗効果の判定**:
```typescript
// 単独A: 期待値 +30円
// 単独B: 期待値 +25円
// A AND B: 期待値 +70円 → 相乗効果あり（+15円）

if (combined_ev > (ev_a + ev_b + 10)) {
  // 有望な組み合わせ
}
```

---

### Phase 3: 派生条件での再検証

**目的**: 偶然性を排除し、条件の堅牢性を確認

**AIが生成する派生パターン**:
```typescript
// 元条件: 前走レースレベル A+
const variations = [
  { field: "last_race_level", value: "A+" },      // オリジナル
  { field: "last_race_level", value: "A" },       // 1段階緩和
  { field: "last_race_level", value: "S" },       // 1段階厳格化
  { field: "last_race_level", in: ["A+", "A"] },  // 範囲拡大
  { field: "last_race_level", in: ["S", "A+"] },  // 範囲拡大（上）
];

// すべてで期待値+なら → 堅牢な条件
// 一部だけなら → 偶然の可能性
```

---

## 🏗️ システムアーキテクチャ

### 1. 研究エージェントエンジン

```typescript
// lib/research-agent/autonomous-engine.ts

export class AutonomousResearchAgent {
  private openai: OpenAI;
  private analysisTools: AnalysisToolSet;
  
  /**
   * 自律研究の開始
   */
  async startResearch(theme?: string): Promise<ResearchSession> {
    // 1. テーマ決定
    const researchTheme = theme || await this.proposeTheme();
    
    // 2. 研究ループ実行
    const session = await this.executeResearchLoop(researchTheme);
    
    return session;
  }
  
  /**
   * 研究ループ
   */
  private async executeResearchLoop(theme: string): Promise<ResearchSession> {
    const session = this.createSession(theme);
    
    // Phase 1: 単独条件
    const candidates = await this.phase1_exploreConditions(theme);
    const promising = this.filterPromising(candidates);
    
    // Phase 2: 掛け合わせ
    const combinations = await this.phase2_combinePConditions(promising);
    const synergies = this.filterSynergies(combinations);
    
    // Phase 3: 派生検証
    const validated = await this.phase3_validateVariations(synergies);
    
    // ルール候補として保存
    await this.saveRuleCandidates(validated);
    
    return session;
  }
  
  /**
   * Phase 1: 単独条件の探索
   */
  private async phase1_exploreConditions(theme: string): Promise<Condition[]> {
    // AIに条件候補を生成させる
    const prompt = this.buildPhase1Prompt(theme);
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: RESEARCH_AGENT_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      tools: [CONDITION_GENERATOR_TOOL],
      tool_choice: 'auto'
    });
    
    // 生成された条件を既存エンジンで検証
    const conditions = this.parseConditions(response);
    const results = await Promise.all(
      conditions.map(c => this.evaluateCondition(c))
    );
    
    return results;
  }
  
  /**
   * 条件を既存エンジンで評価
   */
  private async evaluateCondition(condition: Condition): Promise<ConditionResult> {
    // 既存の分析ツールを使用
    const query = this.buildAnalysisQuery(condition);
    const result = await this.analysisTools.execute(query);
    
    return {
      condition,
      statistics: result.statistics,
      baseline_comparison: result.baseline_comparison,
      confidence: result.confidence,
      is_promising: this.isPromising(result)
    };
  }
  
  /**
   * 有望条件の判定
   */
  private isPromising(result: ConditionResult): boolean {
    return (
      result.statistics.sample_size >= 30 &&
      result.statistics.show_rate >= 0.1 &&
      result.baseline_comparison.expected_value_diff >= 20 &&
      result.confidence.confidence_level >= 60
    );
  }
}
```

---

### 2. AIプロンプト設計

```typescript
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

【出力形式】
JSON形式で条件を返してください。
`;

const CONDITION_GENERATOR_TOOL = {
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
              value: { type: 'any', description: '値' },
              reason: { type: 'string', description: 'この条件を試す理由' }
            }
          }
        }
      }
    }
  }
};
```

---

### 3. バックグラウンド実行

```typescript
// lib/research-agent/background-worker.ts

import { Queue, Worker } from 'bullmq';
import { AutonomousResearchAgent } from './autonomous-engine';

// Redisベースのジョブキュー
const researchQueue = new Queue('autonomous-research', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

// バックグラウンドワーカー
const worker = new Worker('autonomous-research', async (job) => {
  const { theme, user_id } = job.data;
  
  const agent = new AutonomousResearchAgent(user_id);
  const session = await agent.startResearch(theme);
  
  return session;
}, {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

// 定期実行（1時間ごと）
export async function scheduleAutonomousResearch() {
  // アクティブユーザーの自動研究を開始
  const users = await getActiveUsers();
  
  for (const user of users) {
    await researchQueue.add('auto-research', {
      user_id: user.id,
      theme: null  // AIが自動選択
    }, {
      repeat: {
        every: 3600000  // 1時間
      }
    });
  }
}
```

---

### 4. データベース拡張

```sql
-- ルール候補テーブル
CREATE TABLE rule_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  -- 基本情報
  name TEXT NOT NULL,
  description TEXT,
  
  -- 条件
  conditions JSONB NOT NULL,
  
  -- 統計データ
  statistics JSONB NOT NULL,
  baseline_comparison JSONB NOT NULL,
  confidence JSONB NOT NULL,
  
  -- 検証履歴
  validation_results JSONB NOT NULL,  -- 派生条件での検証結果
  
  -- 承認状態
  status TEXT DEFAULT 'pending',      -- pending, approved, rejected
  reviewed_at TIMESTAMP,
  
  -- メタ情報
  research_session_id TEXT,
  generated_by TEXT DEFAULT 'ai',     -- ai, human
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_candidates_user_status ON rule_candidates(user_id, status);
CREATE INDEX idx_candidates_session ON rule_candidates(research_session_id);

-- 研究セッション拡張
ALTER TABLE research_sessions ADD COLUMN is_autonomous BOOLEAN DEFAULT false;
ALTER TABLE research_sessions ADD COLUMN background_job_id TEXT;
```

---

## 🎨 UI設計

### 1. 研究ラボ（自動研究モード）

```tsx
// app/research-lab/page.tsx

<div className="space-y-6">
  {/* 自動研究セクション */}
  <div className="bg-white rounded-lg shadow-md p-6">
    <h2 className="text-xl font-bold mb-4">🤖 自動研究エージェント</h2>
    
    {isResearching ? (
      // 研究中
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="animate-spin size-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <span className="font-medium">研究中...</span>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>進捗: Phase {currentPhase}/3</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-blue-50 rounded text-sm">
          <div className="font-medium text-blue-900 mb-1">
            現在: {currentTask}
          </div>
          <div className="text-blue-700">
            検証済み: {testedConditions} 条件
            有望: {promisingConditions} 条件
          </div>
        </div>
      </div>
    ) : (
      // 開始前
      <div>
        <p className="text-gray-600 mb-4">
          AIが自律的に条件を探索し、有望なルールを提案します。
        </p>
        <button
          onClick={startAutonomousResearch}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700"
        >
          自動研究を開始
        </button>
      </div>
    )}
  </div>
  
  {/* ルール候補セクション */}
  <div className="bg-white rounded-lg shadow-md p-6">
    <h2 className="text-xl font-bold mb-4">📋 ルール候補（承認待ち）</h2>
    
    {ruleCandidates.map(candidate => (
      <div key={candidate.id} className="border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-bold text-lg">{candidate.name}</h3>
            <p className="text-sm text-gray-600">{candidate.description}</p>
          </div>
          <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">
            承認待ち
          </span>
        </div>
        
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div className="bg-green-50 p-2 rounded">
            <div className="text-xs text-gray-600">期待値</div>
            <div className="font-bold text-green-700">
              +{candidate.statistics.expected_value_diff.toFixed(1)}円
            </div>
          </div>
          <div className="bg-blue-50 p-2 rounded">
            <div className="text-xs text-gray-600">信頼度</div>
            <div className="font-bold text-blue-700">
              {candidate.confidence.confidence_level}%
            </div>
          </div>
          <div className="bg-purple-50 p-2 rounded">
            <div className="text-xs text-gray-600">サンプル</div>
            <div className="font-bold text-purple-700">
              {candidate.statistics.sample_size}走
            </div>
          </div>
          <div className="bg-orange-50 p-2 rounded">
            <div className="text-xs text-gray-600">三着内率</div>
            <div className="font-bold text-orange-700">
              {(candidate.statistics.show_rate * 100).toFixed(1)}%
            </div>
          </div>
        </div>
        
        {/* 検証履歴 */}
        <details className="mb-3">
          <summary className="text-sm text-gray-600 cursor-pointer">
            🔍 検証履歴を表示
          </summary>
          <div className="mt-2 space-y-1 text-xs">
            {candidate.validation_results.map((v, i) => (
              <div key={i} className="flex justify-between p-2 bg-gray-50 rounded">
                <span>{v.variation_name}</span>
                <span className={v.is_valid ? 'text-green-600' : 'text-red-600'}>
                  {v.is_valid ? '✅ 有効' : '❌ 無効'}
                </span>
              </div>
            ))}
          </div>
        </details>
        
        {/* 承認・却下ボタン */}
        <div className="flex gap-2">
          <button
            onClick={() => approveRule(candidate.id)}
            className="flex-1 bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
          >
            ✅ 承認してルール化
          </button>
          <button
            onClick={() => rejectRule(candidate.id)}
            className="flex-1 bg-red-100 text-red-700 py-2 px-4 rounded hover:bg-red-200"
          >
            ❌ 却下
          </button>
        </div>
      </div>
    ))}
  </div>
</div>
```

---

## 📊 完成形の動作フロー

### 1. 自動研究（バックグラウンド）

```
1時間ごと（または手動トリガー）
  ↓
AIが研究テーマを決定
  「今回は血統と距離の関係を調べよう」
  ↓
Phase 1: 単独条件（20-30個生成）
  ├ 母父ディープ × 芝
  ├ 母父キンカメ × ダート
  ├ 前走A+ × 0.3秒差以内
  └ ... 
  ↓ 既存エンジンで検証
  ↓
有望条件を抽出（5-10個）
  ↓
Phase 2: 掛け合わせ（10-20組）
  ├ 母父ディープ × 芝2000m
  ├ 前走A+ × 僅差負け × 距離延長なし
  └ ...
  ↓ 既存エンジンで検証
  ↓
相乗効果ありを抽出（2-5組）
  ↓
Phase 3: 派生検証
  各有望条件×5バリエーション
  ↓ 既存エンジンで検証
  ↓
堅牢性確認済み条件を抽出
  ↓
ルール候補として保存
```

---

### 2. 人間の承認

```
研究ラボを開く
  ↓
「新しいルール候補: 3件」
  ↓
各候補を確認
  ├ 条件内容
  ├ 統計データ
  ├ 検証履歴
  └ AI の推奨理由
  ↓
承認 or 却下
  ↓
承認したものがルールとして有効化
```

---

### 3. レース詳細での自動適用

```
レース詳細ページを開く
  ↓
承認済みルールを全馬に適用
  ↓
該当馬をマーキング
  🟢 3件該当 → ⭐⭐ 85点
  ↓
クリックで詳細表示
  ├ 該当ルール一覧
  ├ 各ルールの期待値
  ├ 総合期待値
  └ AIの分析コメント
  ↓
投資判断
```

---

## 🚀 実装ロードマップ

### Phase 1: 自律エンジンのコア（2週間）
- [ ] AutonomousResearchAgent クラス
- [ ] AIプロンプト設計
- [ ] 条件生成ロジック
- [ ] 既存エンジンとの連携

### Phase 2: 研究戦略の実装（2週間）
- [ ] Phase 1: 単独条件探索
- [ ] Phase 2: 掛け合わせ検証
- [ ] Phase 3: 派生条件検証
- [ ] 有望条件の判定ロジック

### Phase 3: ルール候補管理（1週間）
- [ ] rule_candidates テーブル
- [ ] 承認フロー
- [ ] ルール候補UI

### Phase 4: バックグラウンド実行（1週間）
- [ ] Job Queue 設定（Redis + Bull）
- [ ] 定期実行ロジック
- [ ] 進捗通知

### Phase 5: UI統合（1週間）
- [ ] 自動研究モードUI
- [ ] 進捗表示
- [ ] ルール候補承認UI
- [ ] レース詳細での自動適用

---

## 💡 重要なポイント

### AIの役割分担
```
AI:
  ✅ 仮説生成（「この条件を試してみよう」）
  ✅ 結果解釈（「期待値+だが信頼度低い」）
  ✅ 次の手提案（「類似条件で再検証すべき」）
  ❌ 統計計算（既存エンジンが担当）
  ❌ 確率予測（データに基づく仮説のみ）
```

### 偶然性の排除
```
1. サンプル数チェック（30走以上）
2. 三着内率チェック（10%以上）
3. 派生条件での再検証（5バリエーション）
4. すべてで期待値+ → 堅牢
   一部だけ → 偶然の可能性
```

### バックグラウンド実行
```
- Job Queue（推奨）: Redis + Bull
- または Cron: 定期実行
- 進捗通知: WebSocket or Polling
```

---

これで「研究AIから自律型研究エージェント」への進化が完成します。
