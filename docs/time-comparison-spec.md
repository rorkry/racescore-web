# 俺AI タイム比較機能 実装仕様書

## 概要

競馬レース予想システム「俺AI」において、馬の過去走時計を上位/下位クラスの勝ち時計と比較し、能力を評価する機能を実装する。

---

## 現状の実装状況

### 完了している部分

1. **軽量時計チェックAPI** (`app/api/time-check/route.ts`)
   - レース一覧で ⏱️ マークを表示するための軽量API
   - 各レースに「時計優秀な馬がいるか」だけを判定
   - 動作確認済み

2. **SagaBrain 時計比較メソッド** (`lib/saga-ai/saga-brain.ts`)
   - `analyzeTimeComparison()` メソッドを実装済み
   - プラス評価（上位クラスより速い）とマイナス評価（下位クラスより遅い）のロジック追加済み
   - `timeEvaluation` フィールドを `SagaAnalysis` インターフェースに追加済み

3. **UI表示** (`app/components/SagaAICard.tsx`)
   - 【タイム】セクションを【能力】の下に追加済み

### 問題点・未解決課題

1. **俺AI API の 404 エラー**
   - `/api/saga-ai` が 404 を返す
   - App Router (`app/api/saga-ai/route.ts`) に移行済みだが、動作していない可能性
   - 原因: サーバー再起動が完了していない、またはルートが認識されていない

2. **時計比較データが表示されない**
   - `SagaAICard` で `timeEvaluation` が表示されていない
   - APIから `timeComparisonData` が正しく返っていない可能性

---

## データベース構造

### `umadata` テーブル（過去走データ）

```sql
-- 主要カラム
horse_name TEXT      -- 馬名
date TEXT            -- 日付 "2026. 1. 5" または "2026.01.05"
place TEXT           -- 競馬場 "京都", "中山" など
distance TEXT        -- 距離 "芝1600", "ダ1800" など
class_name TEXT      -- クラス "1勝", "2勝", "G1", "OP" など
finish_time TEXT     -- 走破時計 "1345" = 1分34秒5
finish_position TEXT -- 着順 "１", "２" など（全角）
track_condition TEXT -- 馬場状態 "良", "稍", "重", "不"
```

### `wakujun` テーブル（出走表）

```sql
date TEXT           -- 日付 "0111" 形式
place TEXT          -- 競馬場
race_number TEXT    -- レース番号
umamei TEXT         -- 馬名
umaban TEXT         -- 馬番
```

### `indices` テーブル（指数データ）

```sql
race_id TEXT        -- レースID
L4F REAL            -- 後半4F速度指数
T2F REAL            -- 前半2F速度指数
potential REAL      -- ポテンシャル指数
makikaeshi REAL     -- 巻き返し指数
```

---

## 時計比較ロジック仕様

### 1. 比較対象レースの取得

馬の過去走について、同じ「競馬場 + 距離」で「前日・当日・翌日」に行われた他のレースの勝ち時計を取得する。

```typescript
// 日付フォーマットの対応
// DBには "2026. 1. 5"（スペース入り）と "2026.01.05"（ゼロパディング）の両方が存在
const dateRange = [
  formatDateSpaced(prevDate),   // "2026. 1. 4"
  formatDateSpaced(raceDate),   // "2026. 1. 5"
  formatDateSpaced(nextDate),   // "2026. 1. 6"
  formatDatePadded(prevDate),   // "2026.01.04"
  formatDatePadded(raceDate),   // "2026.01.05"
  formatDatePadded(nextDate),   // "2026.01.06"
];
```

### 2. クラスレベルの数値化

```typescript
const CLASS_LEVELS = {
  '新馬': 1, '未勝利': 1,
  '1勝': 2, '500万': 2,
  '2勝': 3, '1000万': 3,
  '3勝': 4, '1600万': 4,
  'OP': 5, 'オープン': 5,
  'G3': 6, 'JG3': 6,
  'G2': 7, 'JG2': 7,
  'G1': 8, 'JG1': 8,
};
```

### 3. 馬場状態の比較可能性

```typescript
// 馬場状態レベル
const TRACK_LEVELS = { '良': 0, '稍': 1, '重': 2, '不': 3 };

// 1段階差までは比較可能
function isTrackConditionComparable(cond1, cond2) {
  return Math.abs(TRACK_LEVELS[cond1] - TRACK_LEVELS[cond2]) <= 1;
}
```

### 4. プラス評価（上位クラスより速い・同等）

```
調整後時計差 = 実際の時計差 - (馬場差 × 0.5秒)

| 調整後時計差 | スコアボーナス | タグ     |
|-------------|---------------|----------|
| ≤ 0.0秒     | +15〜18       | 時計◎◎   |
| ≤ 0.5秒     | +12〜14       | 時計◎    |
| ≤ 1.0秒     | +8〜10        | 時計○    |
| ≤ 1.5秒     | +4〜5         | 時計△    |

※ 2段階以上上のクラスとの比較はボーナス増
```

### 5. マイナス評価（同クラス以下より遅い）

```
| 調整後時計差 | スコアペナルティ | タグ     |
|-------------|-----------------|----------|
| ≥ 3.0秒     | -8〜12          | 時計疑問  |
| ≥ 2.0秒     | -5〜8           | 時計遅め  |
| ≥ 1.5秒     | -3〜5           | 時計やや遅 |

※ 前走のみ対象（直近の時計が遅いことを問題視）
```

### 6. 減衰率（古い走は評価を下げる）

```
前走〜3走前: 100%
4走前: 70%
5走前: 50%
```

---

## 実装すべきこと

### 課題1: `/api/saga-ai` の 404 解消

**現状:**
- `app/api/saga-ai/route.ts` が存在するが 404 を返す

**確認ポイント:**
1. ファイルが正しく保存されているか
2. `export async function POST(req: Request)` の形式になっているか
3. `.next` キャッシュを削除してサーバー再起動したか

**期待する動作:**
- POST `/api/saga-ai` が 200 を返し、分析結果を JSON で返す

### 課題2: 時計比較データの取得と表示

**現状:**
- `getTimeComparisonRaces()` 関数は実装済み
- `input.timeComparisonData` に過去走ごとの比較データを格納する設計
- `SagaBrain.analyzeTimeComparison()` で評価を行い `analysis.timeEvaluation` に結果を格納

**確認ポイント:**
1. APIで `timeComparisonData` が正しく構築されているか
2. `SagaBrain` に渡される `HorseAnalysisInput` に `timeComparisonData` が含まれているか
3. `analyzeTimeComparison()` が正しく呼ばれているか
4. 結果が `analysis.timeEvaluation` に入っているか

**デバッグ方法:**
```typescript
console.log(`[時計比較] ${input.horseName}: timeComparisonData=`, 
  input.timeComparisonData?.length || 0, '件');
```

### 課題3: UIでの表示

**現状:**
- `SagaAICard.tsx` に【タイム】セクションを追加済み

**確認ポイント:**
1. `analysis.timeEvaluation` が存在するか
2. 表示条件が正しいか

```tsx
{/* タイム評価（2行目） */}
{analysis.timeEvaluation && (
  <div className="text-slate-300 leading-relaxed mt-1">
    <span className="text-amber-400 font-medium">【タイム】</span>
    {analysis.timeEvaluation}
  </div>
)}
```

---

## 期待する最終出力例

### プラス評価の例

```
【タイム】⏱️優秀: 前走1勝で1.35.2、2勝の1.35.0と0.2秒差。上位クラスでも十分通用。
```

### マイナス評価の例

```
【タイム】⚠️時計疑問: 前走1勝で1.38.5、同クラス1勝の1.35.2から3.3秒遅い。着順は良いが時計面から能力に疑問。
```

### 複合評価の例

```
【タイム】⏱️優秀: 2走前1勝で1.34.8、2勝の1.35.0を上回る。能力は侮れない。前走も好時計。
```

---

## ファイル構成

```
racescore-web/
├── app/
│   ├── api/
│   │   ├── saga-ai/
│   │   │   └── route.ts        ← 俺AI APIエンドポイント（要修正）
│   │   └── time-check/
│   │       └── route.ts        ← 軽量時計チェックAPI（動作中）
│   ├── components/
│   │   └── SagaAICard.tsx      ← 俺AI表示コンポーネント
│   └── page.tsx                ← メインページ
├── lib/
│   └── saga-ai/
│       └── saga-brain.ts       ← 分析ロジック本体
└── docs/
    └── time-comparison-spec.md ← この仕様書
```

---

## テスト手順

1. サーバーを起動: `npm run dev`
2. ブラウザで `http://localhost:3000` を開く
3. 会場を選択（例: 京都）
4. レースボタンに ⏱️ マークが表示されることを確認
5. レースをクリックして俺AIカードを展開
6. 【タイム】セクションが表示されることを確認
7. コンソールに `[時計比較]` ログが出力されることを確認

---

## 注意事項

- 馬名の正規化: `$`, `*`, 全角スペースを除去してから検索
- 日付フォーマット: スペース入りとゼロパディングの両方に対応
- 着順の全角対応: `parseFinishPosition()` で変換
- クラス名の表記揺れ: `Ｇ１` → `G1`, `ｵｰﾌﾟﾝ` → `OP` など正規化









