# 研究AI 強化計画

ユーザーフィードバックに基づく、実戦で使える研究システムへの進化計画。

---

## 🎯 3つの重要な追加機能

### 1. 条件比較機能（最重要）

#### 現状の問題
- 単体の数字のみ（例: 勝率15%, 回収率120%）
- **「この条件を使うことで期待値がどれだけ上がったか」が分からない**
- 複数条件の掛け合わせ効果が測れない

#### 改善案

**ベースライン比較**:
```json
{
  "condition": {
    "sample_size": 150,
    "win_rate": 0.18,
    "place_return_rate": 142.5
  },
  "baseline": {
    "sample_size": 3000,
    "win_rate": 0.12,
    "place_return_rate": 95.3
  },
  "improvement": {
    "win_rate_lift": "+50%",      // (0.18 - 0.12) / 0.12
    "return_lift": "+49.5%",       // (142.5 - 95.3) / 95.3
    "expected_value": "+47.2円"    // 100円購入あたりの期待値差
  }
}
```

**複数条件の掛け合わせ**:
```
条件A: 母父○○    → 回収率 110%
条件B: タイム上位 → 回収率 115%
A AND B:          → 回収率 135% (相乗効果あり)
```

#### 実装方針

1. **全体統計の事前計算**
   - `baseline_stats` テーブル作成
   - 芝/ダート、距離帯別のベースライン
   - 定期的に更新

2. **performance-calculator.ts に追加**
   ```typescript
   export function compareToBaseline(
     condition: PerformanceData,
     baseline: PerformanceData
   ): ComparisonResult {
     // リフト率、改善度、期待値差分を計算
   }
   ```

3. **ツールレスポンスに追加**
   ```typescript
   {
     competition_performance: {...},
     investment_performance: {...},
     baseline_comparison: {      // NEW
       baseline: {...},
       lift: {...},
       expected_value_diff: 47.2
     }
   }
   ```

---

### 2. 指標フォーマット統一 & 統計的信頼性

#### 現状の問題
- ツールごとに返す指標がバラバラ
- サンプル数が少ない場合でも高スコアが出る（ラッキーパンチ）
- 統計的有意性の判定がない

#### 改善案

**必須指標の統一**:
```typescript
interface StandardAnalysisResult {
  // 必須フィールド（全ツール共通）
  schema_version: string;
  
  // 統計データ（必須）
  statistics: {
    sample_size: number;
    confidence_level: number;        // 信頼度 (0-100)
    statistical_significance: boolean; // 統計的有意性
    min_sample_threshold: number;     // 最小サンプル閾値
  };
  
  // 競争成績（必須）
  competition_performance: {
    sample_size: number;
    win_rate: number;
    place_rate: number;
    show_rate: number;
    avg_finish: number;
  };
  
  // 投資成績（必須）
  investment_performance: {
    win_return_rate: number;
    place_return_rate: number;
    total_investment: number;
    total_return: number;
    profit: number;
    confidence_interval?: {         // 信頼区間
      lower: number;
      upper: number;
    };
  };
  
  // ベースライン比較（必須）
  baseline_comparison: {
    baseline: {...};
    lift: {...};
    expected_value_diff: number;
  };
  
  // 期待値評価（必須）
  performance_score: {
    total_score: number;
    reliability_score: number;
    profitability_score: number;
    statistical_confidence: number;  // NEW
    evaluation: string;
  };
  
  // サマリー（必須）
  summary: string;
  
  // ツール固有データ（オプション）
  tool_specific?: any;
}
```

**統計的信頼性の計算**:
```typescript
export function calculateStatisticalConfidence(
  sampleSize: number,
  showRate: number,
  returnRate: number
): {
  confidence_level: number;
  is_significant: boolean;
  confidence_interval: { lower: number; upper: number };
} {
  // サンプル数による信頼度
  const sampleConfidence = Math.min(100, (sampleSize / 100) * 100);
  
  // 出走率による安定性
  const stabilityFactor = showRate > 0.1 ? 1.0 : showRate * 10;
  
  // 信頼区間の計算（簡易版）
  const margin = 1.96 * Math.sqrt((returnRate * (100 - returnRate)) / sampleSize);
  
  return {
    confidence_level: sampleConfidence * stabilityFactor,
    is_significant: sampleSize >= 30 && showRate >= 0.05,
    confidence_interval: {
      lower: returnRate - margin,
      upper: returnRate + margin
    }
  };
}
```

#### 実装方針

1. **`lib/research/standard-result.ts` 作成**
   - 標準レスポンス型定義
   - バリデーション関数

2. **全ツールを統一フォーマットに移行**
   - 段階的に移行
   - 下位互換性維持

3. **統計的信頼性チェックの追加**
   - 最小サンプル数: 30走
   - 最小出走率: 5%
   - 信頼区間の表示

---

### 3. ナレッジベース機能

#### 現状の問題
- 研究結果が毎回リセットされる
- 過去の気づきを再利用できない
- 研究が積み上がらない

#### 改善案

**ナレッジの保存**:
```typescript
interface ResearchInsight {
  id: string;
  user_id: string;
  created_at: Date;
  
  // 発見内容
  title: string;              // "母父○○は芝2000mで期待値高い"
  description: string;
  
  // 条件
  conditions: {
    field: string;            // "broodmare_sire"
    value: string;            // "ディープインパクト"
    surface?: string;         // "芝"
    distance_range?: string;  // "1800-2200"
  }[];
  
  // 統計データ
  statistics: {
    sample_size: number;
    win_rate: number;
    place_return_rate: number;
    baseline_lift: number;    // ベースラインとの改善度
    confidence_level: number;
  };
  
  // メタ情報
  tags: string[];            // ["母父", "中距離", "芝"]
  verified: boolean;         // 統計的有意性
  source_session_id?: string; // 元の研究セッションID
  
  // 再現性
  last_verified_at?: Date;
  verification_count: number;
}
```

**ナレッジの活用**:
```typescript
// 研究開始時に関連ナレッジを提示
GET /api/research/insights?target_type=race&target_id=...

// 研究終了時に保存を提案
POST /api/research/insights
{
  title: "自動生成タイトル",
  conditions: [...],
  statistics: {...}
}
```

#### 実装方針

1. **テーブル追加**
   ```sql
   CREATE TABLE research_insights (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     title TEXT NOT NULL,
     description TEXT,
     conditions JSONB NOT NULL,
     statistics JSONB NOT NULL,
     tags TEXT[],
     verified BOOLEAN DEFAULT false,
     source_session_id TEXT,
     last_verified_at TIMESTAMP,
     verification_count INTEGER DEFAULT 0,
     created_at TIMESTAMP DEFAULT NOW()
   );
   
   CREATE INDEX idx_insights_user ON research_insights(user_id);
   CREATE INDEX idx_insights_tags ON research_insights USING GIN(tags);
   CREATE INDEX idx_insights_conditions ON research_insights USING GIN(conditions);
   ```

2. **API実装**
   - `POST /api/research/insights` - 保存
   - `GET /api/research/insights` - 検索
   - `GET /api/research/insights/suggestions` - レコメンド

3. **UI実装**
   - 研究結果の保存ボタン
   - ナレッジ一覧表示
   - タグフィルター

---

## 📋 実装優先順位

### Phase 1: 比較機能（最優先）
- [ ] baseline_stats テーブル作成
- [ ] ベースライン統計の計算スクリプト
- [ ] compareToBaseline 関数実装
- [ ] 全ツールにベースライン比較を追加
- [ ] UI: リフト率の表示

**期待効果**: 「この条件は期待値がある」が一目で分かる

### Phase 2: 統計的信頼性
- [ ] 統計的信頼性計算関数
- [ ] 標準レスポンス型の定義
- [ ] 全ツールの段階的移行
- [ ] UI: 信頼度・有意性の表示

**期待効果**: ラッキーパンチ指標を排除、信頼できる分析のみ提示

### Phase 3: ナレッジベース
- [ ] research_insights テーブル
- [ ] 保存API実装
- [ ] 検索・レコメンドAPI
- [ ] ナレッジ管理UI
- [ ] 自動タグ付け

**期待効果**: 研究が積み上がり、知見が資産化される

---

## 🎯 最終的なユーザー体験

### Before（現状）
```
AIが分析 → 単体の数字が出る → 良いのか悪いのか判断つかない
```

### After（改善後）
```
AIが分析 
  ↓
ベースラインとの比較表示
  「この条件は全体より+47%回収率UP（信頼度: 85%）」
  ↓
過去のナレッジと照合
  「前回の研究で似た条件が見つかっています」
  ↓
研究結果を保存
  「母父○○ × 芝2000m は期待値条件として保存しました」
  ↓
次回の研究で自動提案
  「保存済みの期待値条件が該当します」
```

---

## 💡 実装のコツ

### 1. ベースライン統計は事前計算
- リアルタイム計算は重い
- 日次バッチで更新
- Redis等でキャッシュ

### 2. 段階的な移行
- いきなり全ツール変更しない
- 1つずつ標準フォーマットに移行
- 下位互換性を維持

### 3. ナレッジは自動化重視
- 手動保存だと使われない
- 研究終了時に自動提案
- タグも自動生成

---

## 📁 新規ファイル構成

```
lib/research/
  ├── baseline-calculator.ts      # ベースライン統計
  ├── statistical-confidence.ts   # 統計的信頼性
  ├── standard-result.ts          # 標準レスポンス型
  └── insight-matcher.ts          # ナレッジマッチング

app/api/
  ├── baseline-stats/route.ts     # ベースライン取得
  └── research/
      └── insights/
          ├── route.ts            # ナレッジCRUD
          └── suggestions/route.ts # レコメンド

scripts/
  └── calculate-baselines.ts      # ベースライン計算バッチ

types/
  └── insight.ts                  # ナレッジ型定義
```

---

これらを実装すれば、単なる「分析ツール」から「実戦で使える武器」に進化します。
