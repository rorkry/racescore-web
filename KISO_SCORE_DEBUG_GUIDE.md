# 競うスコア デバッグガイド

## 概要

競うスコアは複合的なロジックからなる点数ですが、各要素が正常に動作しているかを確認するためのデバッグ機能を追加しました。

---

## デバッグ機能の使い方

### 1. コード内でデバッグモードを使用

```typescript
import { computeKisoScore, KisoScoreBreakdown } from '@/utils/getClusterData';

// 通常の使用（数値のみ返す）
const score = computeKisoScore(horse, allHorses);
console.log('スコア:', score); // 例: 65.5

// デバッグモード（詳細情報を返す）
const breakdown = computeKisoScore(horse, allHorses, true) as KisoScoreBreakdown;
console.log('詳細:', breakdown);
```

### 2. デバッグ情報の構造

```typescript
interface KisoScoreBreakdown {
  total: number;                    // 合計スコア（0-100）
  comeback: number;                 // 巻き返し指数（35点満点）
  potential: number;                // ポテンシャル指数（15点満点）
  finish: number;                   // 着順（8点満点）
  margin: number;                   // 着差（8点満点）
  cluster: number;                  // クラスタタイム（6点満点）
  passing: number;                  // 通過順位×ペース（6点満点）
  positionImprovement: number;      // 位置取り改善（8点満点）
  paceSync: number;                 // 展開連動（6点満点）
  courseFit: number;                // コース適性（4点満点）
  penalty: number;                  // 減点（下級条件連続2着など）
  details: {
    comebackValues: {               // 巻き返し指数の元データ
      race1: number;                // 前走
      race2: number;                // 2走前
      race3: number;                // 3走前
    };
    potentialValues: {              // ポテンシャル指数の元データ
      race1: number;
      race2: number;
      race3: number;
      avg: number;                  // 平均値
      max: number;                  // 最高値
      combined: number;             // 総合評価値（平均80% + 最高20%）
    };
    lastPosition: number;           // 前走の通過順位
    avgPastPosition: number;        // 過去走の平均通過順位
    forwardRate: number | null;     // 先行馬率（%）、allHorsesがない場合はnull
    isTurfStartDirt: boolean;       // 芝スタートダートかどうか
    firstCornerDistance: number;     // 初角までの距離（m）
  };
}
```

---

## 各要素の確認方法

### 1. 巻き返し指数（35点満点）

```typescript
const breakdown = computeKisoScore(horse, allHorses, true) as KisoScoreBreakdown;

console.log('巻き返し指数スコア:', breakdown.comeback);
console.log('前走:', breakdown.details.comebackValues.race1);
console.log('2走前:', breakdown.details.comebackValues.race2);
console.log('3走前:', breakdown.details.comebackValues.race3);

// 計算式の確認
// 前走: (race1 / 10) * 25
// 2走前: (race2 / 10) * 6
// 3走前: (race3 / 10) * 4
// 合計 = 前走 + 2走前 + 3走前
```

**確認ポイント**:
- `comebackValues.race1`が0の場合は、前走の指数データがない
- 指数が10を超える場合は異常値（最大10まで）

---

### 2. ポテンシャル指数（15点満点）

```typescript
console.log('ポテンシャル指数スコア:', breakdown.potential);
console.log('平均値:', breakdown.details.potentialValues.avg);
console.log('最高値:', breakdown.details.potentialValues.max);
console.log('総合評価値:', breakdown.details.potentialValues.combined);

// 計算式の確認
// 総合評価値 = 平均値 * 0.8 + 最高値 * 0.2
// 基本点 = (総合評価値 / 10) * 12
// ボーナス = 総合評価値 >= 3.0 の場合、最大3点
// 合計 = 基本点 + ボーナス
```

**確認ポイント**:
- `potentialValues.avg`が0の場合は、3走とも指数データがない
- 指数が10を超える場合は異常値（最大10まで）

---

### 3. 位置取り改善（8点満点）

```typescript
console.log('位置取り改善スコア:', breakdown.positionImprovement);
console.log('前走の通過順位:', breakdown.details.lastPosition);
console.log('過去走の平均通過順位:', breakdown.details.avgPastPosition);

// 判定条件
// 1. 過去走（前走除く）の平均通過順位が頭数の50%より後ろ
// 2. 前走で5番手以内に位置取り
// 3. 改善幅が3番手以上 → 最大8点
//    改善幅が2番手以上 → 3点
//    改善幅が1番手以上 → 1点
```

**確認ポイント**:
- `lastPosition`が99の場合は、前走の通過順位データがない
- `avgPastPosition`が99の場合は、過去走の通過順位データがない
- 改善幅 = `avgPastPosition - lastPosition`

---

### 4. 展開連動（6点満点）

```typescript
console.log('展開連動スコア:', breakdown.paceSync);
console.log('先行馬率:', breakdown.details.forwardRate, '%');

// 判定条件
// 先行馬率30%未満 + 自身が先行馬 → +6点
// 先行馬率60%以上 + 自身が差し馬 → +6点
// 先行馬率30-40% + 自身が先行馬 → +3点
// 先行馬率50-60% + 自身が差し馬 → +3点
// 中間的な場合 → +1点
```

**確認ポイント**:
- `forwardRate`が`null`の場合は、`allHorses`が渡されていない
- 先行馬の定義: 前走の通過順位が3番手以内

---

### 5. コース適性（4点満点）

```typescript
console.log('コース適性スコア:', breakdown.courseFit);
console.log('芝スタートダート:', breakdown.details.isTurfStartDirt);
console.log('初角距離:', breakdown.details.firstCornerDistance, 'm');

// 判定条件
// 芝スタートダート + 普段後方 → +3点
// 芝スタートダート + 中団 → +1.5点
// 初角距離280m未満 + 内枠（1-3枠） → +1点
// 初角距離300m未満 + 最内枠（1-2枠） → +0.5点
```

**確認ポイント**:
- `firstCornerDistance`が999の場合は、コースデータがない
- `isTurfStartDirt`が`true`でもスコアが0の場合は、位置取り条件を満たしていない

---

## デバッグ例

### 例1: 全要素の確認

```typescript
const breakdown = computeKisoScore(horse, allHorses, true) as KisoScoreBreakdown;

console.log('=== 競うスコア詳細 ===');
console.log('合計:', breakdown.total);
console.log('');
console.log('【各要素のスコア】');
console.log('巻き返し指数:', breakdown.comeback, '/ 35');
console.log('ポテンシャル指数:', breakdown.potential, '/ 15');
console.log('着順:', breakdown.finish, '/ 8');
console.log('着差:', breakdown.margin, '/ 8');
console.log('クラスタタイム:', breakdown.cluster, '/ 6');
console.log('通過順位×ペース:', breakdown.passing, '/ 6');
console.log('位置取り改善:', breakdown.positionImprovement, '/ 8');
console.log('展開連動:', breakdown.paceSync, '/ 6');
console.log('コース適性:', breakdown.courseFit, '/ 4');
console.log('減点:', breakdown.penalty);
console.log('');
console.log('【詳細情報】');
console.log('前走通過順位:', breakdown.details.lastPosition);
console.log('過去走平均通過順位:', breakdown.details.avgPastPosition);
console.log('先行馬率:', breakdown.details.forwardRate, '%');
```

### 例2: 特定要素の確認

```typescript
// 位置取り改善が0点の理由を確認
if (breakdown.positionImprovement === 0) {
  console.log('位置取り改善が0点の理由:');
  console.log('- 前走通過順位:', breakdown.details.lastPosition);
  console.log('- 過去走平均通過順位:', breakdown.details.avgPastPosition);
  
  if (breakdown.details.lastPosition === 99) {
    console.log('→ 前走の通過順位データがない');
  } else if (breakdown.details.avgPastPosition === 99) {
    console.log('→ 過去走の通過順位データがない');
  } else {
    const improvement = breakdown.details.avgPastPosition - breakdown.details.lastPosition;
    console.log('- 改善幅:', improvement);
    if (improvement < 1) {
      console.log('→ 改善幅が1番手未満（条件未満）');
    }
  }
}
```

---

## APIでの使用

### 現在の実装

現在、APIではデバッグモードが有効になっていません。必要に応じて追加できます：

```typescript
// pages/api/race-card-with-score.ts
const debug = req.query.debug === 'true';

const score = computeKisoScore(
  { past: pastRaces, entry: entryRow }, 
  allHorseData,
  debug
);

if (debug) {
  return {
    ...horseData,
    score: typeof score === 'number' ? score : score.total,
    scoreBreakdown: typeof score === 'number' ? null : score,
  };
}
```

---

## トラブルシューティング

### 問題1: スコアが0点

**確認項目**:
1. `recent.length === 0` → 有効な過去走がない
2. 各要素のスコアがすべて0 → データ不足

### 問題2: 位置取り改善が0点

**確認項目**:
1. `lastPosition === 99` → 前走の通過順位データがない
2. `avgPastPosition === 99` → 過去走の通過順位データがない
3. 改善幅が1番手未満 → 条件未満

### 問題3: 展開連動が0点

**確認項目**:
1. `forwardRate === null` → `allHorses`が渡されていない
2. 先行馬率と自身の脚質が条件に合わない

### 問題4: コース適性が0点

**確認項目**:
1. `isTurfStartDirt === false` → 芝スタートダートではない
2. `firstCornerDistance === 999` → コースデータがない
3. 位置取り条件を満たしていない

---

## まとめ

デバッグ機能を使用することで、競うスコアの各要素が正常に動作しているかを個別に確認できます。特に、新規追加した要素（位置取り改善、展開連動、コース適性）の動作確認に有効です。
