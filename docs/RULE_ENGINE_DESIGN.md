# ルールエンジン設計書

## 🎯 コンセプト

**「発見した条件を、自動適用できるルールに変える」**

```
研究ラボで発見
  ↓
ルールとして保存（重み付け）
  ↓
レース詳細で自動適用
  ↓
該当馬を自動マーキング
  ↓
AI期待値スコア表示
```

---

## 💡 使用例

### ステップ1: 条件を発見（研究ラボ）

```
研究テーマ:
「前走レースレベルA以上で、0.3秒差以内で負けた馬の次走成績は？」

AI分析結果:
━━━━━━━━━━━━━━━━━━━━━━━
サンプル: 180走
勝率: 22.3%
複勝回収率: 138.5%
期待値: +38.5円/100円
信頼度: 82%

✅ ベースラインより +45% 回収率UP
━━━━━━━━━━━━━━━━━━━━━━━

→ この条件は有効！
```

---

### ステップ2: ルールとして保存

```
┌─────────────────────────────────┐
│ この条件をルールとして保存       │
├─────────────────────────────────┤
│ ルール名:                       │
│ [前走A+僅差負け]                │
│                                 │
│ 重み(スコア):                   │
│ [30] 点                         │
│                                 │
│ 条件:                           │
│ ✓ 前走レースレベル: A以上        │
│ ✓ 前走着差: 0.3秒以内           │
│ ✓ 前走着順: 2着以下             │
│                                 │
│ [ 保存 ]                        │
└─────────────────────────────────┘
```

---

### ステップ3: レース詳細で自動適用

**出走表の表示**:

```
┌─────────────────────────────────────────────┐
│ 馬番 │ 馬名    │ 該当ルール │ AI期待値スコア │
├─────┼─────────┼──────────┼───────────────┤
│  1  │ ○○○   │ 🟢 2件    │ ⭐ 55点      │ ← クリック可能
│  2  │ △△△   │           │               │
│  3  │ □□□   │ 🟢 3件    │ ⭐⭐ 85点   │
│  4  │ ◇◇◇   │ 🟡 1件    │ 20点          │
│  5  │ ☆☆☆   │           │               │
└─────────────────────────────────────────────┘

🟢 = 高期待値（50点以上）
🟡 = 中期待値（20-49点）
```

---

### ステップ4: クリックでポップアップ

```
┌─────────────────────────────────────┐
│ 1番 ○○○                            │
│ AI期待値スコア: ⭐ 55点             │
├─────────────────────────────────────┤
│                                     │
│ 【該当ルール】                       │
│                                     │
│ ✅ 前走A+僅差負け (+30点)           │
│    前走: レベルA+, 2着, 0.2秒差     │
│    期待値: +38.5円                  │
│    信頼度: 82%                      │
│                                     │
│ ✅ 母父ディープ×芝2000m (+25点)    │
│    期待値: +47.2円                  │
│    信頼度: 85%                      │
│                                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━     │
│ 総合期待値: +85.7円/100円           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                     │
│ [ 詳細を見る ]                      │
└─────────────────────────────────────┘
```

---

## 🏗️ データ構造

### 1. ルール定義

```typescript
interface Rule {
  id: string;
  user_id: string;
  
  // 基本情報
  name: string;                    // "前走A+僅差負け"
  description?: string;
  
  // 重み付け
  weight: number;                  // 30点
  
  // 条件定義（複数条件のAND）
  conditions: RuleCondition[];
  
  // 統計データ
  statistics: {
    sample_size: number;
    place_return_rate: number;
    expected_value_diff: number;
    confidence_level: number;
  };
  
  // メタ情報
  is_active: boolean;              // アクティブか
  category: string;                // "前走", "血統", "枠順"など
  
  created_at: Date;
  updated_at: Date;
}

interface RuleCondition {
  field: string;                   // "race_level", "margin", "broodmare_sire"
  operator: 'eq' | 'gte' | 'lte' | 'between' | 'in';
  value: any;                      // "A", 0.3, ["ディープ", "キンカメ"]
  
  // 前走データの場合
  target?: 'last_race' | 'last_2_race';
}
```

**条件例**:

```typescript
// ルール: 前走A+僅差負け
{
  name: "前走A+僅差負け",
  weight: 30,
  conditions: [
    {
      field: "race_level",
      operator: "in",
      value: ["A+", "A", "S"],
      target: "last_race"
    },
    {
      field: "margin",
      operator: "lte",
      value: 0.3,
      target: "last_race"
    },
    {
      field: "finish_position",
      operator: "gte",
      value: 2,
      target: "last_race"
    }
  ]
}

// ルール: 母父ディープ × 芝2000m
{
  name: "母父ディープ×芝2000m",
  weight: 25,
  conditions: [
    {
      field: "broodmare_sire",
      operator: "eq",
      value: "ディープインパクト"
    },
    {
      field: "surface",
      operator: "eq",
      value: "芝"
    },
    {
      field: "distance",
      operator: "between",
      value: [1800, 2200]
    }
  ]
}
```

---

### 2. マッチング結果

```typescript
interface RuleMatch {
  rule_id: string;
  rule_name: string;
  weight: number;
  expected_value_diff: number;
  confidence_level: number;
  
  // マッチした条件の詳細
  matched_conditions: {
    field: string;
    actual_value: any;        // 実際の値
    required_value: any;      // 要求値
    matched: boolean;
  }[];
}

interface HorseEvaluation {
  horse_number: number;
  horse_name: string;
  
  // マッチしたルール
  matched_rules: RuleMatch[];
  
  // 総合スコア
  total_score: number;        // 合計点
  total_expected_value: number; // 合計期待値
  avg_confidence: number;     // 平均信頼度
  
  // 評価ランク
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
}
```

---

## 🎨 UI設計

### 1. 出走表の拡張

**現在の出走表に追加**:

```tsx
<EntryTable
  horses={horses}
  ruleMatches={ruleMatches}  // NEW: ルールマッチング結果
  onHorseClick={showRulePopup}  // NEW: クリックでポップアップ
/>
```

**表示例**:

```
┌──────────────────────────────────────────────┐
│ 馬番 │ 馬名 │ ルール │ AIスコア │ ... │ 予想 │
├──────┼──────┼────────┼──────────┼─────┼──────┤
│  1   │ ○○ │ 🟢 2   │ ⭐ 55   │ ... │  ◎  │
│      │      │ [詳細]  │          │     │      │
└──────────────────────────────────────────────┘
```

---

### 2. ルール詳細ポップアップ

```tsx
<RuleMatchPopup
  horse={horse}
  matches={matches}
  onClose={() => setPopup(null)}
/>
```

**デザイン**:

```
┌─────────────────────────────────────┐
│ [✕] 1番 ○○○                        │
│                                     │
│ 🎯 AI期待値スコア                   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│ ⭐⭐ 55点（ランク: A）              │
│ 総合期待値: +85.7円/100円           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│ 【該当ルール（2件）】                │
│                                     │
│ ┌─────────────────────────────┐ │
│ │ ✅ 前走A+僅差負け         +30点│ │
│ │                               │ │
│ │ 前走データ:                   │ │
│ │ ・レースレベル: A+            │ │
│ │ ・着順: 2着                   │ │
│ │ ・着差: 0.2秒                 │ │
│ │                               │ │
│ │ 統計:                         │ │
│ │ ・期待値: +38.5円             │ │
│ │ ・信頼度: 82%                 │ │
│ │ ・サンプル: 180走             │ │
│ └─────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────┐ │
│ │ ✅ 母父ディープ×芝2000m  +25点│ │
│ │                               │ │
│ │ 血統:                         │ │
│ │ ・母父: ディープインパクト    │ │
│ │ ・距離: 芝2000m               │ │
│ │                               │ │
│ │ 統計:                         │ │
│ │ ・期待値: +47.2円             │ │
│ │ ・信頼度: 85%                 │ │
│ └─────────────────────────────┘ │
│                                     │
│ [ 研究ラボで編集 ]                  │
└─────────────────────────────────────┘
```

---

### 3. 条件ビルダー（研究ラボ）

**GUI形式で条件を組み立て**:

```
┌─────────────────────────────────────┐
│ 🔧 条件ビルダー                     │
├─────────────────────────────────────┤
│                                     │
│ ルール名: [前走A+僅差負け]          │
│ 重み: [30] 点                       │
│                                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│ 【条件】（AND条件）                  │
│                                     │
│ 条件1:                              │
│ ┌ 前走 ▼┐ レースレベル ▼│ A以上 ▼│ │
│ │                                 │ │
│                                     │
│ 条件2:                              │
│ ┌ 前走 ▼┐ 着差 ▼│ 0.3秒以内 ▼│    │
│ │                                 │ │
│                                     │
│ 条件3:                              │
│ ┌ 前走 ▼┐ 着順 ▼│ 2着以下 ▼│      │
│ │                                 │ │
│                                     │
│ [ + 条件を追加 ]                    │
│                                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│ [ プレビュー ] [ 保存 ]             │
└─────────────────────────────────────┘
```

**選択可能なフィールド**:

```
前走データ:
  ・レースレベル
  ・着順
  ・着差（秒）
  ・人気
  ・オッズ
  ・距離

血統:
  ・種牡馬
  ・種牡馬タイプ
  ・母父
  ・母父タイプ

今回のレース:
  ・競馬場
  ・距離
  ・芝/ダート
  ・枠順
  ・斤量
```

---

## 🔧 実装詳細

### 1. ルールエンジン

```typescript
// lib/rule-engine/matcher.ts

export class RuleMatcher {
  /**
   * 全馬にルールを適用
   */
  async evaluateRace(
    raceKey: string,
    horses: any[],
    rules: Rule[]
  ): Promise<HorseEvaluation[]> {
    const evaluations: HorseEvaluation[] = [];
    
    for (const horse of horses) {
      const matches = await this.matchRules(horse, rules);
      const totalScore = matches.reduce((sum, m) => sum + m.weight, 0);
      const totalEV = matches.reduce((sum, m) => sum + m.expected_value_diff, 0);
      const avgConf = matches.length > 0
        ? matches.reduce((sum, m) => sum + m.confidence_level, 0) / matches.length
        : 0;
      
      evaluations.push({
        horse_number: horse.umaban,
        horse_name: horse.umamei,
        matched_rules: matches,
        total_score: totalScore,
        total_expected_value: totalEV,
        avg_confidence: avgConf,
        rank: this.calculateRank(totalScore)
      });
    }
    
    return evaluations;
  }
  
  /**
   * 1頭に対してルールマッチング
   */
  private async matchRules(
    horse: any,
    rules: Rule[]
  ): Promise<RuleMatch[]> {
    const matches: RuleMatch[] = [];
    
    for (const rule of rules) {
      if (!rule.is_active) continue;
      
      const allConditionsMet = rule.conditions.every(condition => 
        this.checkCondition(horse, condition)
      );
      
      if (allConditionsMet) {
        matches.push({
          rule_id: rule.id,
          rule_name: rule.name,
          weight: rule.weight,
          expected_value_diff: rule.statistics.expected_value_diff,
          confidence_level: rule.statistics.confidence_level,
          matched_conditions: rule.conditions.map(c => ({
            field: c.field,
            actual_value: this.getValue(horse, c),
            required_value: c.value,
            matched: true
          }))
        });
      }
    }
    
    return matches;
  }
  
  /**
   * 条件チェック
   */
  private checkCondition(horse: any, condition: RuleCondition): boolean {
    const actualValue = this.getValue(horse, condition);
    
    switch (condition.operator) {
      case 'eq':
        return actualValue === condition.value;
      case 'gte':
        return actualValue >= condition.value;
      case 'lte':
        return actualValue <= condition.value;
      case 'between':
        return actualValue >= condition.value[0] && actualValue <= condition.value[1];
      case 'in':
        return condition.value.includes(actualValue);
      default:
        return false;
    }
  }
  
  /**
   * ランク計算
   */
  private calculateRank(score: number): 'S' | 'A' | 'B' | 'C' | 'D' {
    if (score >= 80) return 'S';
    if (score >= 60) return 'A';
    if (score >= 40) return 'B';
    if (score >= 20) return 'C';
    return 'D';
  }
}
```

---

### 2. API設計

```typescript
// ルール適用API
POST /api/race/evaluate
{
  race_key: "202601180611",
  rule_ids?: string[]  // 省略時は全アクティブルール
}

// レスポンス
{
  evaluations: [
    {
      horse_number: 1,
      horse_name: "○○○",
      matched_rules: [...],
      total_score: 55,
      rank: "A"
    }
  ]
}
```

---

## 📋 実装フェーズ

### Phase 1: ルール保存機能
- [ ] `rules` テーブル作成
- [ ] ルール保存API
- [ ] 条件ビルダーUI（簡易版）

### Phase 2: マッチングエンジン
- [ ] RuleMatcher クラス実装
- [ ] 評価API実装
- [ ] 出走表に該当ルール表示

### Phase 3: UI強化
- [ ] ルール詳細ポップアップ
- [ ] AIスコア表示
- [ ] ハイライト・バッジ

### Phase 4: 高度な機能
- [ ] 条件ビルダー（GUI完全版）
- [ ] ルールの有効性追跡
- [ ] 自動重み付け調整

---

これで「発見→保存→自動適用→スコア化」の完全な流れが実現します。
