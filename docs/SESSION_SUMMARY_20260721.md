# 研究AI実装 セッション進捗報告（2026/07/21）

## 📋 実装完了項目

### 1. データソースの確認と修正
**課題**: オッズデータの取得方法が不明確だった
**対応**: 
- umadataテーブルの実際のオッズデータ（win_odds, place_odds_low, place_odds_high）を使用
- 人気からの推定は予備手段に変更
- performance-calculator.ts を修正

**データソース確認**:
- CSV: `C:\競馬データ\umadataall.csv`
- テーブル: umadata（47列）
- 着順: finish_position
- オッズ: win_odds, place_odds_low, place_odds_high
- 人気: popularity

---

### 2. 血統データ拡張
**課題**: 母父データがなかった
**対応**:
- umadataテーブルに4カラム追加
  - sire_type (BH列): 父タイプ名
  - dam_type (BI列): 母タイプ名
  - broodmare_sire (BJ列): 母父馬
  - broodmare_sire_type (BK列): 母父タイプ名
- テーブル定義: 43列に拡張
- アップロードスクリプト修正: scripts/upload-umadata-direct.ts

**新規実装**:
- 母父分析ツール（broodmare_sire_analysis）
- 父×母父の相性（ニックス）判定
- 血統分析ツールの強化（TOOL_VERSION 1.2）

**ドキュメント**:
- docs/PEDIGREE_DATA_STRUCTURE.md 作成

---

### 3. 研究AI強化計画の策定
**ユーザーフィードバック**:
1. 条件同士の比較機能（最重要）
2. 指標フォーマットの統一と統計的信頼性
3. ナレッジベース機能

**対応**:
- docs/RESEARCH_AI_ENHANCEMENT_PLAN.md 作成
- ベースライン比較機能の設計
  - lib/research/baseline-calculator.ts 作成
  - リフト率、期待値差の計算
- 統計的信頼性の実装
  - lib/research/statistical-confidence.ts 作成
  - 信頼度、信頼区間、警告メッセージ
- StandardAnalysisResult 型定義

**主な機能**:
```typescript
// ベースライン比較
{
  baseline: {...},          // 全体平均
  lift: {
    return_rate_lift: +49.5%,  // 改善率
    expected_value_diff: +47.2円
  },
  is_better: true
}

// 統計的信頼性
{
  confidence_level: 85,     // 信頼度
  is_significant: true,     // 統計的有意性
  confidence_interval: {...},
  warnings: []
}
```

---

### 4. UI統合
**対応**:
- レース詳細ページに「🔬 研究AI」タブを追加
- タブ切り替え機能実装
- 研究パネル（ResearchPanel.tsx）の統合
- 期待値スコア表示の強化
  - 信頼性・収益性・総合スコア
  - 競争成績・投資成績の詳細表示

**アクセス方法**:
```
レース一覧 → レース詳細 → 🔬 研究AIタブ
```

---

### 5. 二層構造への設計変更
**ユーザーフィードバック**:
- レース詳細だけに研究AIを置くのはもったいない
- レースに紐づかない自由な研究ができる場所が必要
- 「知識を作る場」と「知識を使う場」を分離

**対応**:
- docs/RESEARCH_LAB_ARCHITECTURE.md 作成
- 研究ラボページ作成（/research-lab）
  - app/research-lab/page.tsx
  - 自由研究フォーム
  - 保存済み条件の管理
  - 研究履歴
- レース詳細を「クイック分析」に変更
  - 「🔬 研究AI」→「🔍 クイック分析」
  - 保存済み条件との照合セクション準備
  - 研究ラボへの導線追加

**二層構造**:
```
研究ラボ（/research-lab）
  ↓ 知識を作る
  ・自由な研究
  ・条件発見
  ・条件保存
  ↓
レース詳細
  ↓ 知識を使う
  ・条件マッチング
  ・該当馬表示
  ・実戦投入
```

---

### 6. ルールエンジン設計
**ユーザー要望**:
- 発見した条件を場限りで終わらせない
- ルールとして保存し自動適用
- 該当馬を自動マーキング
- AI期待値スコア表示

**対応**:
- docs/RULE_ENGINE_DESIGN.md 作成
- ルール型定義（types/rule.ts）
- RuleMatcher クラス実装（lib/rule-engine/matcher.ts）

**主な機能**:
```
1. 条件を発見（研究ラボ）
   「前走A+ × 0.3秒差以内」

2. ルールとして保存
   名前: 前走A+僅差負け
   スコア: 30点
   期待値: +38.5円

3. レース詳細で自動適用
   全馬にルールマッチング

4. 該当馬を自動マーキング
   🟢 2件該当 → ⭐ 55点

5. クリックで詳細表示
   該当ルール一覧
   総合期待値
   信頼度
```

**ルールの重み付け**:
```
ルール1: 前走A+ × 0.3秒差以内 → 30点
ルール2: 母父○○ × 芝2000m → 25点
ルール3: 1枠 × ダート1600m → 15点

該当馬: 1番（ルール1+2該当） → 55点
```

---

### 7. ヘッダーメニューへの追加
**対応**:
- ユーザー名クリック時のドロップダウンメニューに「🔬 研究ラボ」を追加
- マイメモと予想成績の間に配置

**メニュー構成**:
```
マイページ
馬分析
マイメモ
🔬 研究ラボ     ← 追加
予想成績
バッジ
ログアウト
```

---

## 📁 作成・修正ファイル一覧

### 新規作成
```
docs/
  AI_RESEARCH_PROGRESS.md            # 進捗報告書
  PEDIGREE_DATA_STRUCTURE.md         # 血統データ構造
  RESEARCH_AI_ENHANCEMENT_PLAN.md    # 強化計画
  RESEARCH_LAB_ARCHITECTURE.md       # 研究ラボ設計
  RULE_ENGINE_DESIGN.md              # ルールエンジン設計
  HOW_TO_USE_RESEARCH_AI.md          # 使い方ガイド

lib/research/
  baseline-calculator.ts             # ベースライン比較
  statistical-confidence.ts          # 統計的信頼性
  performance-calculator.ts          # 期待値評価（拡張）

lib/rule-engine/
  matcher.ts                         # ルールマッチングエンジン

types/
  rule.ts                           # ルール型定義

app/research-lab/
  page.tsx                          # 研究ラボページ

app/api/ai-tools/broodmare-sire/
  route.ts                          # 母父分析ツール
```

### 修正
```
app/api/recreate-umadata/route.ts   # テーブル定義更新（43列）
scripts/upload-umadata-direct.ts    # CSVアップロード更新
app/components/Header.tsx            # メニューに研究ラボ追加
app/race/[raceKey]/page.tsx         # クイック分析に変更
app/api/ai-tools/sire/route.ts      # 血統詳細情報追加
app/api/ai-tools/waku/route.ts      # オッズデータ使用
app/api/ai-tools/course/route.ts    # オッズデータ使用
app/api/ai-tools/level/route.ts     # オッズデータ使用
lib/research/tools-registry.ts      # 母父分析ツール追加
lib/research/research-engine.ts     # ツールパスマッピング修正
types/research.ts                   # 母父分析追加
```

---

## 🚀 次に必要な実装（優先順位順）

### Phase 1: データベース構築（最優先）
```sql
-- 1. ベースライン統計テーブル
CREATE TABLE baseline_stats (
  id TEXT PRIMARY KEY,
  surface TEXT NOT NULL,           -- 芝/ダート
  distance_min INTEGER,
  distance_max INTEGER,
  sample_size INTEGER NOT NULL,
  win_rate FLOAT NOT NULL,
  place_return_rate FLOAT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. ルールテーブル
CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  weight INTEGER NOT NULL,
  conditions JSONB NOT NULL,
  statistics JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 研究セッション・ステップ（既存）
-- research_sessions
-- research_steps
```

---

### Phase 2: ベースライン統計の計算
```bash
# 1. ベースライン計算スクリプト作成
scripts/calculate-baselines.ts

# 実行内容:
# - 芝/ダート別
# - 距離帯別（1000-1400, 1400-1800, 1800-2200, 2200-2600, 2600+）
# - 全体統計を計算してbaseline_statsに保存
```

---

### Phase 3: 分析ツールへのベースライン比較統合
```typescript
// 各分析ツール（sire, waku, course, level）に追加

// 1. ベースライン取得
const baseline = await getBaselineStats('芝', 1800, 2200);

// 2. 比較計算
const comparison = compareToBaseline(condition, baseline);

// 3. レスポンスに追加
return {
  ...existing_fields,
  baseline_comparison: {
    baseline: baseline,
    lift: comparison.lift,
    expected_value_diff: comparison.expected_value_diff,
    summary: formatComparisonSummary(comparison)
  }
}
```

---

### Phase 4: ルール保存・マッチング機能
```typescript
// 1. ルール保存API
POST /api/rules
{
  name: "前走A+僅差負け",
  weight: 30,
  conditions: [...],
  statistics: {...}
}

// 2. ルール適用API
POST /api/race/evaluate
{
  race_key: "202601180611"
}

// レスポンス:
{
  evaluations: [
    {
      horse_number: 1,
      matched_rules: [...],
      total_score: 55,
      rank: "A"
    }
  ]
}
```

---

### Phase 5: UI実装
```tsx
// 1. 出走表の拡張
<EntryTable
  horses={horses}
  ruleMatches={ruleMatches}  // ルールマッチング結果
  onHorseClick={showPopup}   // ポップアップ表示
/>

// 2. ルール詳細ポップアップ
<RuleMatchPopup
  horse={horse}
  matches={matches}
/>

// 3. 条件ビルダー（研究ラボ）
<ConditionBuilder
  onSave={saveRule}
/>
```

---

## ⚠️ 残っている課題

### 1. データアップロード
**課題**: 新しいumadata.csv（血統情報追加版）をアップロードする必要がある

**手順**:
```powershell
# 1. テーブル再作成
https://your-app.railway.app/api/recreate-umadata?secret=recreate-umadata-2026

# 2. CSVアップロード
cd C:\keiba_data\racescore-web
npx ts-node scripts/upload-umadata-direct.ts
```

---

### 2. 前走データの取得ロジック
**課題**: ルールエンジンで前走データを取得する仕組みが未実装

**必要な実装**:
```typescript
// horse に past_races を追加
interface HorseWithPastRaces {
  umaban: number;
  umamei: string;
  past_races: Array<{
    race_level: string;
    finish_position: number;
    margin: number;
    // ... 他の前走データ
  }>;
}

// 前走データ取得関数
async function fetchPastRaces(horse_name: string): Promise<any[]> {
  // umadata から前走を取得
  // race_levels から前走レースレベルを取得
}
```

---

### 3. レースレベルデータとの連携
**課題**: 独自実装のレースレベル（race_levels テーブル）をルールエンジンで使えるようにする

**必要な実装**:
```typescript
// race_levels テーブルからデータ取得
const raceLevel = await db.prepare(`
  SELECT level, level_label
  FROM race_levels
  WHERE race_id = $1
`).get(pastRaceId);

// 前走データに含める
past_race.race_level = raceLevel?.level || 'UNKNOWN';
```

---

### 4. 研究ラボAPIの実装
**課題**: 研究ラボで自由研究を実行するAPIが未実装

**必要な実装**:
```typescript
// POST /api/research-lab/execute
// 自由形式のクエリを受け取り、AIが分析

// POST /api/research-lab/conditions
// 条件を保存

// GET /api/research-lab/conditions
// 保存済み条件一覧を取得
```

---

### 5. 認証とプレミアム制限
**課題**: 研究AI機能へのアクセス制限が必要

**現在の状態**:
- `/api/research` にプレミアムチェックあり
- 研究ラボページにはチェックなし

**必要な対応**:
- 研究ラボページにも認証チェック追加
- または初期表示は可能、実行時のみプレミアム必要

---

## 📊 今後の開発スケジュール（提案）

### 今週
1. ベースライン統計の計算スクリプト作成
2. 主要ツール（血統・母父・枠順）にベースライン比較を統合
3. UI上でリフト率表示

### 来週
1. ルールテーブル作成
2. ルール保存API実装
3. ルールマッチングAPI実装

### 再来週
1. 出走表にルールマッチ結果表示
2. ポップアップ実装
3. 条件ビルダー（簡易版）

### 次月以降
1. 条件ビルダー（GUI完全版）
2. 研究履歴機能
3. ナレッジベース機能
4. 自動レコメンド

---

## 💡 実装のポイント

### ベースライン統計
- 日次バッチで更新
- Redis等でキャッシュ推奨
- リアルタイム計算は重い

### ルールエンジン
- 前走データの取得を効率化
- キャッシュ活用
- 複雑な条件は段階的に実装

### UI/UX
- ロード時間に注意
- 段階的なデータ表示
- スケルトン・ローディング

### パフォーマンス
- N+1クエリに注意
- バッチ処理推奨
- インデックス最適化

---

## 🎯 最終目標

**「発見した条件を資産化し、レースで自動活用できるシステム」**

```
研究ラボ
  ↓ 条件発見
  ↓ ルール保存
  ↓
レース詳細
  ↓ 自動マッチング
  ↓ 該当馬表示
  ↓ AIスコア表示
  ↓
投資判断
  ↓ 実戦投入
  ↓
結果追跡
  ↓ ルールの有効性検証
  ↓
知見の蓄積
```

---

以上、2026/07/21 セッションの進捗報告
