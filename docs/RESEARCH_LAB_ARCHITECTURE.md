# 研究ラボ アーキテクチャ設計

## 🎯 設計思想

### 現状の問題点
- レース詳細ページに研究AIを配置
- 「このレースをどう買うか」に限定
- レースに紐づかない自由な研究ができない

### 新しい設計: 二層構造

```
┌─────────────────────────────────────┐
│    🔬 研究ラボ（独立ページ）           │
│    ━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│    【役割】知識を作る                 │
│                                     │
│    ・レースに紐づかない自由な研究      │
│    ・仮説検証                        │
│    ・条件の発見                      │
│    ・ナレッジの蓄積                   │
│                                     │
│    例:                              │
│    「東京ダート1600mで期待値がある    │
│     条件を探して」                   │
│    「母父○○ × 枠順1枠の組み合わせ」  │
└─────────────────────────────────────┘
              ↓ 条件を保存
┌─────────────────────────────────────┐
│    📊 レース詳細ページ                │
│    ━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│    【役割】知識を使う                 │
│                                     │
│    ・今回のレースに特化した分析        │
│    ・保存済み条件との照合              │
│    ・該当馬の表示                     │
│    ・実戦投入                        │
│                                     │
│    例:                              │
│    「保存済み条件に該当: 3番、7番」   │
│    「母父○○条件: 期待値+47円」       │
└─────────────────────────────────────┘
```

---

## 📁 ページ構成

### 1. 研究ラボページ（新規作成）

**URL**: `/research-lab`

**目的**: レースに紐づかない自由な研究

**機能**:
- ✅ 自由形式の研究クエリ
- ✅ 条件の組み合わせ検証
- ✅ 統計データの可視化
- ✅ 条件の保存（ナレッジベース）
- ✅ 過去の研究履歴

**UI構成**:
```
┌─────────────────────────────────────┐
│  🔬 研究ラボ                         │
├─────────────────────────────────────┤
│                                     │
│  【新規研究】                        │
│                                     │
│  研究テーマを入力:                   │
│  ┌─────────────────────────────┐   │
│  │ 東京ダート1600mで期待値がある   │   │
│  │ 条件を探して                   │   │
│  └─────────────────────────────┘   │
│                                     │
│  [ 研究開始 ]                       │
│                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│  【保存済み条件】                    │
│                                     │
│  ├ 母父ディープインパクト × 芝2000m  │
│  │  期待値: +47円, 信頼度: 85%      │
│  │  [ 詳細 ] [ 適用 ] [ 削除 ]      │
│  │                                 │
│  ├ 東京ダート1600m × 1枠           │
│  │  期待値: +32円, 信頼度: 72%      │
│  │  [ 詳細 ] [ 適用 ] [ 削除 ]      │
│  │                                 │
│  └ 斤量55kg以下 × 前走3着以内       │
│     期待値: +18円, 信頼度: 68%      │
│     [ 詳細 ] [ 適用 ] [ 削除 ]      │
│                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│  【研究履歴】                        │
│                                     │
│  ├ 2026/01/20: 血統タイプの相性分析  │
│  ├ 2026/01/18: 枠順と距離の関係     │
│  └ 2026/01/15: 脚質と馬場状態       │
│                                     │
└─────────────────────────────────────┘
```

---

### 2. レース詳細ページ（簡易版に変更）

**URL**: `/race/[raceKey]`

**目的**: 今回のレースに特化した分析

**機能**:
- ✅ クイック分析（1-2ステップ）
- ✅ 保存済み条件との照合
- ✅ 該当馬の表示
- ❌ 自由な研究（→研究ラボへ）

**UI構成**:
```
┌─────────────────────────────────────┐
│  2026年01月18日 中山 11R             │
├─────────────────────────────────────┤
│  📊 出走表 │ 🔍 クイック分析          │
├─────────────────────────────────────┤
│                                     │
│  【保存済み条件との照合】              │
│                                     │
│  ✅ 母父ディープ × 芝2000m → 3番    │
│     期待値: +47円, 信頼度: 85%      │
│                                     │
│  ✅ 1枠有利条件 → 1番               │
│     期待値: +32円, 信頼度: 72%      │
│                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│  【クイック分析】                    │
│                                     │
│  質問: 5番について調べて             │
│  [ 分析 ]                           │
│                                     │
│  → 血統: ○○産駒、距離適性あり       │
│  → 枠順: やや不利（外枠）            │
│  → 前走: レベルA+                   │
│                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│  より詳しく研究したい場合:            │
│  → [研究ラボで開く]                 │
│                                     │
└─────────────────────────────────────┘
```

---

## 🔧 技術設計

### データベース拡張

#### 1. `research_conditions` テーブル（新規）

```sql
CREATE TABLE research_conditions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  -- 条件内容
  title TEXT NOT NULL,              -- "母父ディープ × 芝2000m"
  description TEXT,
  
  -- 条件定義
  filters JSONB NOT NULL,           -- 複数条件の組み合わせ
  -- 例: [
  --   {"field": "broodmare_sire", "value": "ディープインパクト"},
  --   {"field": "surface", "value": "芝"},
  --   {"field": "distance", "range": [1800, 2200]}
  -- ]
  
  -- 統計データ
  statistics JSONB NOT NULL,
  -- {
  --   "sample_size": 150,
  --   "win_rate": 0.18,
  --   "place_return_rate": 142.5,
  --   "expected_value_diff": 47.2,
  --   "confidence_level": 85
  -- }
  
  -- ベースライン比較
  baseline_comparison JSONB,
  
  -- メタ情報
  tags TEXT[],                      -- ["血統", "芝", "中距離"]
  is_active BOOLEAN DEFAULT true,   -- アクティブな条件か
  
  -- 検証情報
  verified_count INTEGER DEFAULT 0, -- 検証回数
  last_verified_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conditions_user ON research_conditions(user_id);
CREATE INDEX idx_conditions_tags ON research_conditions USING GIN(tags);
CREATE INDEX idx_conditions_active ON research_conditions(user_id, is_active);
```

#### 2. `condition_matches` テーブル（新規）

```sql
CREATE TABLE condition_matches (
  id TEXT PRIMARY KEY,
  condition_id TEXT NOT NULL REFERENCES research_conditions(id),
  race_key TEXT NOT NULL,
  horse_number INTEGER NOT NULL,
  matched_at TIMESTAMP DEFAULT NOW(),
  
  -- マッチ時の詳細
  match_confidence FLOAT,           -- マッチの確からしさ
  expected_value FLOAT,             -- その時点での期待値
  
  -- 結果追跡（事後）
  actual_finish INTEGER,
  actual_odds FLOAT,
  actual_return FLOAT
);

CREATE INDEX idx_matches_condition ON condition_matches(condition_id);
CREATE INDEX idx_matches_race ON condition_matches(race_key);
```

---

### API設計

#### 研究ラボAPI

```typescript
// 自由研究実行
POST /api/research-lab/execute
{
  query: "東京ダート1600mで期待値がある条件を探して",
  context?: {
    surface?: "芝" | "ダート",
    distance_range?: [number, number],
    place?: string
  }
}

// 条件保存
POST /api/research-lab/conditions
{
  title: "母父ディープ × 芝2000m",
  filters: [...],
  statistics: {...}
}

// 条件一覧取得
GET /api/research-lab/conditions?user_id=xxx&active=true

// 条件削除・更新
DELETE /api/research-lab/conditions/:id
PATCH /api/research-lab/conditions/:id
```

#### レース照合API

```typescript
// レースに保存済み条件を適用
POST /api/race/match-conditions
{
  race_key: "202601180611",
  condition_ids?: string[]  // 省略時は全条件
}

// レスポンス
{
  matches: [
    {
      condition: {...},
      matched_horses: [
        {
          horse_number: 3,
          horse_name: "○○○",
          match_confidence: 0.95,
          expected_value: 47.2
        }
      ]
    }
  ]
}
```

---

### コンポーネント設計

```
app/
  research-lab/
    page.tsx                        # 研究ラボページ
    components/
      FreeResearchForm.tsx          # 自由研究フォーム
      SavedConditions.tsx           # 保存済み条件一覧
      ResearchHistory.tsx           # 研究履歴
      ConditionBuilder.tsx          # 条件ビルダー
  
  race/[raceKey]/
    page.tsx                        # レース詳細（簡易化）
    components/
      ConditionMatches.tsx          # 条件マッチ表示
      QuickAnalysis.tsx             # クイック分析

lib/research-lab/
  condition-matcher.ts              # 条件マッチング
  condition-builder.ts              # 条件構築
  free-research-engine.ts           # 自由研究エンジン
```

---

## 🎯 実装フェーズ

### Phase 1: 研究ラボページ作成
- [ ] `/research-lab` ページ作成
- [ ] 自由研究フォーム実装
- [ ] `research_conditions` テーブル追加
- [ ] 条件保存API実装

### Phase 2: 条件マッチング機能
- [ ] 条件→レース照合ロジック
- [ ] `condition_matches` テーブル追加
- [ ] レース詳細ページに条件マッチ表示

### Phase 3: レース詳細の簡易化
- [ ] 研究AIタブ → クイック分析タブに変更
- [ ] 自由研究は研究ラボへの導線
- [ ] 条件マッチを優先表示

### Phase 4: 条件ビルダー
- [ ] GUI形式の条件作成UI
- [ ] 複数条件の組み合わせ
- [ ] リアルタイムプレビュー

---

## 💡 ユースケース

### ケース1: 新しい条件を発見

```
1. 研究ラボを開く
2. 「母父ディープインパクトは芝2000mで期待値あるか？」を研究
3. AI が分析 → 期待値+47円、信頼度85%
4. 「保存」ボタン → 条件として保存
```

### ケース2: レースで条件を適用

```
1. レース詳細ページを開く
2. 自動で保存済み条件をチェック
3. 「母父ディープ条件: 3番が該当」と表示
4. 期待値+47円、信頼度85%も表示
5. ワンクリックで詳細確認
```

### ケース3: 条件の検証

```
1. レース終了後、結果を記録
2. 条件の実績を追跡
3. 「検証回数50回、実際の回収率138%」
4. 統計的信頼性が向上
```

---

## 🎨 UI/UX のポイント

### 研究ラボ
- ✅ 自由度の高いインターフェース
- ✅ 保存済み条件がすぐ見える
- ✅ 研究履歴から再実行可能

### レース詳細
- ✅ シンプル・直感的
- ✅ 条件マッチが目立つ
- ✅ クイック分析は補助的

### 導線
- レース詳細 → 研究ラボ（「詳しく研究」ボタン）
- 研究ラボ → レース詳細（「条件を適用」ボタン）

---

これで「知識を作る場」と「知識を使う場」が明確に分離され、より実戦的なシステムになります。
