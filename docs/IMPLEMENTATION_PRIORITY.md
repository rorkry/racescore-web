# 実装優先順位リスト

## 🎯 最優先: Phase 1 - コア機能の完成

### 1.1 既存エンジンとの連携 ⭐⭐⭐⭐⭐
**期間**: 2-3日
**重要度**: 最高

**実装内容**:
- [ ] 既存分析ツールの呼び出しラッパー作成
- [ ] 条件→クエリ変換ロジック
- [ ] データベースからの統計取得

**ファイル**:
```typescript
// lib/research-agent/analysis-connector.ts

export class AnalysisConnector {
  /**
   * 条件を既存エンジンで評価
   */
  async evaluateCondition(conditions: RuleCondition[]): Promise<Statistics> {
    // 条件に応じて適切な分析ツールを選択
    if (isPedigreeCondition(conditions)) {
      return await this.callSireAnalysis(conditions);
    } else if (isLastRaceCondition(conditions)) {
      return await this.callLevelAnalysis(conditions);
    }
    // ...
  }
  
  private async callSireAnalysis(conditions: RuleCondition[]) {
    // /api/ai-tools/sire を呼び出し
  }
}
```

---

### 1.2 条件候補生成の実装 ⭐⭐⭐⭐⭐
**期間**: 2-3日
**重要度**: 最高

**実装内容**:
- [ ] OpenAI API呼び出しの実装
- [ ] レスポンスのパース
- [ ] エラーハンドリング
- [ ] リトライロジック

**ファイル**:
```typescript
// lib/research-agent/condition-generator.ts

export async function generateConditions(
  theme: ResearchTheme,
  count: number
): Promise<ConditionCandidate[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [...],
    tools: [CONDITION_GENERATOR_TOOL],
    tool_choice: 'auto'
  });
  
  // レスポンスをパース
  const toolCall = response.choices[0].message.tool_calls?.[0];
  if (!toolCall) {
    throw new Error('No tool call');
  }
  
  const args = JSON.parse(toolCall.function.arguments);
  return args.conditions.map(c => ({
    name: c.name,
    conditions: parseConditions(c),
    reason: c.reasoning,
    hypothesis: c.hypothesis,
    expected_outcome: c.expected_outcome
  }));
}
```

---

### 1.3 有望条件の判定ロジック ⭐⭐⭐⭐
**期間**: 1日
**重要度**: 高

**実装内容**:
- [ ] 判定基準の実装
- [ ] 統計的有意性のチェック
- [ ] 偶然性の排除

**基準**:
```typescript
function isPromising(result: ConditionResult): boolean {
  return (
    result.statistics.sample_size >= 30 &&           // サンプル数
    result.statistics.show_rate >= 0.1 &&            // 三着内率10%以上
    result.statistics.expected_value_diff >= 20 &&   // 期待値+20円以上
    result.confidence.confidence_level >= 60         // 信頼度60%以上
  );
}
```

---

### 1.4 AIの推論理由の保存 ⭐⭐⭐⭐⭐
**期間**: 1日
**重要度**: 最高（トレーサビリティ）

**実装内容**:
- [x] ConditionCandidate に hypothesis, expected_outcome 追加
- [x] ConditionResult に ai_interpretation 追加
- [ ] rule_candidates テーブルに ai_reasoning カラム追加
- [ ] UIで推論理由を表示

**保存する情報**:
```typescript
{
  hypothesis: "ディープインパクトを母父に持つ馬は、芝のレースで期待値が高い",
  expected_outcome: "回収率120%以上、三着内率40%以上",
  reasoning: "ディープは芝で圧倒的な成績を残しており、その血を引く馬は芝適性が高い傾向",
  interpretation: {
    summary: "母父ディープ×芝は期待値+47円で有望。仮説通り高成績。",
    matches_hypothesis: true,
    next_steps: ["距離帯で細分化", "父との組み合わせ検証"]
  },
  generated_at: "2026-07-21T15:00:00Z",
  model: "gpt-4o-mini"
}
```

**UI表示例**:
```
┌─────────────────────────────────────┐
│ ルール: 母父ディープ × 芝2000m      │
├─────────────────────────────────────┤
│ 【AIの仮説】                        │
│ ディープインパクトを母父に持つ馬は、│
│ 芝のレースで期待値が高い            │
│                                     │
│ 【検証結果】                        │
│ 期待値: +47円 ✅ 仮説通り           │
│ 信頼度: 85%                         │
│                                     │
│ 【AIの解釈】                        │
│ 母父ディープ×芝は期待値+47円で有望。│
│ 仮説通り高成績。                    │
│                                     │
│ 生成日: 2026-07-21 15:00            │
│ モデル: gpt-4o-mini                 │
└─────────────────────────────────────┘
```

---

## 📋 Phase 2 - 3段階戦略の実装

### 2.1 Phase 1: 単独条件（完全実装） ⭐⭐⭐⭐
**期間**: 2日

- [ ] 20-30個の条件生成
- [ ] 並列実行（Promise.all）
- [ ] 進捗表示
- [ ] エラーハンドリング

---

### 2.2 Phase 2: 掛け合わせ（完全実装） ⭐⭐⭐⭐
**期間**: 3日

- [ ] 組み合わせ生成ロジック
- [ ] 相乗効果の判定
- [ ] 単独条件の合計との比較

**相乗効果の判定**:
```typescript
function hasSynergy(
  combinedResult: ConditionResult,
  individualResults: ConditionResult[]
): boolean {
  const sumEV = individualResults.reduce(
    (sum, r) => sum + r.statistics.expected_value_diff,
    0
  );
  
  const bonus = 10; // ボーナス閾値
  return combinedResult.statistics.expected_value_diff > (sumEV + bonus);
}
```

---

### 2.3 Phase 3: 派生検証（完全実装） ⭐⭐⭐
**期間**: 2日

- [ ] 派生パターン生成
- [ ] 堅牢性の判定
- [ ] 偶然性の排除

**派生パターン例**:
```typescript
// 元: 前走レースレベル A+
const variations = [
  { value: "A+" },           // オリジナル
  { value: "A" },            // 1段階緩和
  { value: "S" },            // 1段階厳格化
  { in: ["A+", "A"] },       // 範囲拡大
  { in: ["S", "A+"] }        // 範囲拡大（上）
];
```

---

## 📊 Phase 3 - ルール候補管理

### 3.1 データベース実装 ⭐⭐⭐⭐
**期間**: 1日

**テーブル**:
```sql
CREATE TABLE rule_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  conditions JSONB NOT NULL,
  statistics JSONB NOT NULL,
  confidence JSONB NOT NULL,
  validation_results JSONB NOT NULL,
  
  -- AIの推論（重要）
  ai_reasoning JSONB NOT NULL,
  -- {
  --   hypothesis: "...",
  --   expected_outcome: "...",
  --   reasoning: "...",
  --   interpretation: {...},
  --   generated_at: "...",
  --   model: "gpt-4o-mini"
  -- }
  
  status TEXT DEFAULT 'pending',
  reviewed_at TIMESTAMP,
  research_session_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 3.2 承認フロー ⭐⭐⭐
**期間**: 2日

**API**:
```typescript
// ルール候補取得
GET /api/rule-candidates?status=pending

// 承認
POST /api/rule-candidates/:id/approve
{
  weight: 30  // 重み付け（人間が決定）
}

// 却下
POST /api/rule-candidates/:id/reject
{
  reason: "サンプル数不足"
}
```

---

### 3.3 UI実装 ⭐⭐⭐
**期間**: 2日

- [ ] ルール候補一覧
- [ ] AIの推論理由表示
- [ ] 承認・却下ボタン
- [ ] 検証履歴の表示

---

## 🔄 Phase 4 - バックグラウンド実行

### 4.1 Job Queue セットアップ ⭐⭐
**期間**: 2日

**必要な環境**:
- Redis（Railway でアドオン追加）
- Bull or BullMQ

**実装**:
```typescript
// lib/research-agent/queue.ts

import { Queue, Worker } from 'bullmq';

const researchQueue = new Queue('autonomous-research', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

export async function enqueueResearch(userId: string, theme?: string) {
  await researchQueue.add('auto-research', {
    user_id: userId,
    theme
  });
}
```

---

### 4.2 定期実行 ⭐⭐
**期間**: 1日

**Cron設定**:
```typescript
// lib/research-agent/scheduler.ts

import cron from 'node-cron';

// 1時間ごと
cron.schedule('0 * * * *', async () => {
  const activeUsers = await getActiveUsers();
  
  for (const user of activeUsers) {
    await enqueueResearch(user.id);
  }
});
```

---

### 4.3 進捗通知 ⭐
**期間**: 1日

- [ ] WebSocket or Polling
- [ ] 進捗率の計算
- [ ] リアルタイム更新

---

## 🎨 Phase 5 - UI統合

### 5.1 自動研究モードUI ⭐⭐⭐
**期間**: 2日

- [ ] 開始ボタン
- [ ] 進捗バー
- [ ] 現在のタスク表示
- [ ] 検証済み条件数

---

### 5.2 ルール候補承認UI ⭐⭐⭐
**期間**: 2日

- [ ] カード形式の一覧
- [ ] AIの推論理由の展開表示
- [ ] 承認・却下ボタン
- [ ] 検証履歴の詳細

---

## 📅 実装スケジュール（推奨）

### Week 1-2: Phase 1（最優先）
- Day 1-3: 既存エンジン連携
- Day 4-6: 条件候補生成
- Day 7: 有望条件判定
- Day 8: AIの推論理由保存

### Week 3-4: Phase 2
- Day 9-10: 単独条件
- Day 11-13: 掛け合わせ
- Day 14-15: 派生検証

### Week 5: Phase 3
- Day 16: データベース
- Day 17-18: 承認フロー
- Day 19-20: UI実装

### Week 6: Phase 4（オプショナル）
- Day 21-22: Job Queue
- Day 23: 定期実行
- Day 24: 進捗通知

### Week 7: Phase 5
- Day 25-26: 自動研究UI
- Day 27-28: 承認UI

---

## 🎯 マイルストーン

### Milestone 1: 手動研究が動く（Week 2終了時）
- 研究ラボで「研究開始」ボタンを押すと動作
- AIが条件を20個生成
- 既存エンジンで検証
- 有望条件が抽出される
- AIの推論理由が保存される

### Milestone 2: 3段階戦略が動く（Week 4終了時）
- 単独条件 → 掛け合わせ → 派生検証
- ルール候補が生成される

### Milestone 3: 承認フローが動く（Week 5終了時）
- ルール候補一覧が見える
- 承認・却下ができる
- 承認したルールが有効化される

### Milestone 4: バックグラウンド実行（Week 6終了時）
- 定期的に自動研究
- 進捗通知

### Milestone 5: 完全自律（Week 7終了時）
- 人間は承認するだけ
- AIが自律的に研究
- レース詳細で自動適用

---

## 💡 開発のコツ

### 段階的な実装
1. まず手動モードで動かす
2. 1条件ずつ検証できるようにする
3. 徐々に並列化
4. 最後にバックグラウンド化

### テスト
- 少ない条件数（3-5個）でテスト
- 実際のデータで動作確認
- AIのレスポンスをログ出力

### デバッグ
- 各フェーズの結果を保存
- AIの推論を必ず記録
- エラー時も部分結果を保存

---

この順序で実装すれば、2ヶ月以内に完全な自律型研究エージェントが完成します。
