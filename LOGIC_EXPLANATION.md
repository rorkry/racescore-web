# 新要素の判定ロジック詳細

## 1. 位置取り判定ロジック

### 1-1. 通過順位の取得方法

```typescript
function getPassingPosition(race: RecordRow): number {
  // データソース: corner4（4角位置）を優先、なければcorner2（2角位置）
  const corner2 = toHalfWidth(GET(race, 'corner2', 'corner_2', '4角位置')).trim();
  const corner4 = toHalfWidth(GET(race, 'corner4', 'corner_4', '4角位置')).trim();
  
  const c2 = parseInt(corner2.replace(/[^0-9]/g, ''), 10);
  const c4 = parseInt(corner4.replace(/[^0-9]/g, ''), 10);
  
  // 優先順位: corner4 > corner2 > 99（データなし）
  if (!isNaN(c4) && c4 > 0) return c4;
  if (!isNaN(c2) && c2 > 0) return c2;
  return 99;  // データなしの場合は99を返す
}
```

**使用カラム**:
- `corner4` / `corner_4` - 4角位置（優先）
- `corner2` / `corner_2` - 2角位置（フォールバック）

**判定基準**:
- 4角位置があればそれを使用
- 4角位置がなければ2角位置を使用
- どちらもなければ99（データなし）を返す

---

### 1-2. 過去走の平均通過順位計算

```typescript
function getAveragePassingPosition(races: RecordRow[], excludeFirst: boolean = true): number {
  // excludeFirst=trueの場合、前走を除いて計算
  const targetRaces = excludeFirst ? races.slice(1) : races;
  
  // 各レースの通過順位を取得
  const positions = targetRaces
    .map(r => getPassingPosition(r))
    .filter(p => p > 0 && p < 99);  // 有効な位置のみ
  
  if (positions.length === 0) return 99;
  
  // 平均値を計算
  return positions.reduce((a, b) => a + b, 0) / positions.length;
}
```

**使用例**:
- `getAveragePassingPosition(recent, true)` - 前走を除く過去走の平均
- `getAveragePassingPosition(recent, false)` - 全過去走の平均

---

### 1-3. 位置取り改善の判定ロジック

```typescript
// 位置取り改善スコア（8点満点）
if (recent.length >= 2) {
  // 1. 前走の通過順位を取得
  const lastPosition = getPassingPosition(recent[0]);
  
  // 2. 過去走（前走を除く）の平均通過順位を計算
  const avgPastPosition = getAveragePassingPosition(recent, true);
  
  // 3. 出走頭数を取得
  const fieldSz = parseInt(GET(recent[0], 'fieldSize', '頭数') || '16', 10);
  
  // 4. 後方競馬かどうかを判定（頭数の50%より後ろ）
  const wasBackRunner = avgPastPosition > fieldSz * 0.5;
  
  // 5. 前走で前方に位置取りできたか（5番手以内）
  const movedForward = lastPosition <= 5;
  
  // 6. 位置の改善幅を計算
  const positionImprovement = avgPastPosition - lastPosition;
  
  // 7. スコア加点
  if (wasBackRunner && movedForward && positionImprovement >= 3) {
    // 大幅改善: 最大8点（改善幅×1.2）
    totalScore += Math.min(8, positionImprovement * 1.2);
  } else if (wasBackRunner && positionImprovement >= 2) {
    // 小幅改善: 3点
    totalScore += 3;
  } else if (wasBackRunner && positionImprovement >= 1) {
    // 微改善: 1点
    totalScore += 1;
  }
}
```

**判定条件**:
1. ✅ 過去走（前走除く）の平均通過順位が**頭数の50%より後ろ**（後方競馬）
2. ✅ 前走で**5番手以内**に位置取りできた
3. ✅ 改善幅が**3番手以上** → 最大8点
4. ✅ 改善幅が**2番手以上** → 3点
5. ✅ 改善幅が**1番手以上** → 1点

**具体例**:
```
出走頭数: 16頭
過去走平均: 10番手（後方競馬）
前走: 4番手（前方に位置取り）
改善幅: 10 - 4 = 6番手

→ 大幅改善（6番手）→ 6 × 1.2 = 7.2点 → 最大8点で加点
```

---

## 2. 先行馬判定ロジック（展開連動スコア）

### 2-1. 先行馬の定義

```typescript
// 展開連動スコア（6点満点）
if (allHorses && allHorses.length > 0) {
  let forwardRunnerCount = 0;
  
  // 全出走馬の前走をチェック
  for (const h of allHorses) {
    const hRecent = filterValidRaces(h.past).slice(0, 1);  // 前走のみ
    if (hRecent.length > 0) {
      const pos = getPassingPosition(hRecent[0]);
      
      // 前走の通過順位が3番手以内 = 先行馬
      if (pos <= 3) {
        forwardRunnerCount++;
      }
    }
  }
  
  // 先行馬率を計算
  const forwardRate = forwardRunnerCount / allHorses.length;
}
```

**先行馬の定義**:
- **前走の通過順位が3番手以内**の馬
- 使用データ: `corner4`（4角位置）または`corner2`（2角位置）

**先行馬率の計算**:
```
先行馬率 = 先行馬の頭数 / 全出走頭数
```

---

### 2-2. 展開連動スコアの判定ロジック

```typescript
// 自身の前走通過順位を取得
const myLastPosition = recent.length > 0 ? getPassingPosition(recent[0]) : 99;

// 自身の脚質を判定
const iAmForwardRunner = myLastPosition <= 3;  // 自身が先行馬
const iAmCloser = myLastPosition > 5;           // 自身が差し馬

// 展開連動スコアを加点
if (forwardRate < 0.30 && iAmForwardRunner) {
  // 先行馬率30%未満 + 自身が先行馬 → +6点
  totalScore += 6;
}
else if (forwardRate >= 0.60 && iAmCloser) {
  // 先行馬率60%以上 + 自身が差し馬 → +6点
  totalScore += 6;
}
else if (forwardRate < 0.40 && iAmForwardRunner) {
  // 先行馬率30-40% + 自身が先行馬 → +3点
  totalScore += 3;
}
else if (forwardRate >= 0.50 && iAmCloser) {
  // 先行馬率50-60% + 自身が差し馬 → +3点
  totalScore += 3;
}
else if (forwardRate < 0.45 && iAmForwardRunner) {
  // 中間的な場合でも小幅加点 → +1点
  totalScore += 1;
}
else if (forwardRate >= 0.55 && iAmCloser) {
  // 中間的な場合でも小幅加点 → +1点
  totalScore += 1;
}
```

**判定マトリクス**:

| 先行馬率 | 自身の脚質 | 加点 | 理由 |
|---------|-----------|------|------|
| 30%未満 | 先行馬 | +6点 | 先行馬が少ない → スロー想定 → 先行有利 |
| 60%以上 | 差し馬 | +6点 | 先行馬が多い → 消耗戦 → 差し有利 |
| 30-40% | 先行馬 | +3点 | やや先行有利 |
| 50-60% | 差し馬 | +3点 | やや差し有利 |
| 40-45% | 先行馬 | +1点 | 小幅有利 |
| 55-60% | 差し馬 | +1点 | 小幅有利 |

---

## 3. データソースの確認

### 使用カラム（umadataテーブル）

| カラム名 | 用途 | 備考 |
|---------|------|------|
| `corner4` / `corner_4` | 4角位置 | 優先的に使用 |
| `corner2` / `corner_2` | 2角位置 | 4角位置がない場合のフォールバック |
| `fieldSize` / `頭数` | 出走頭数 | 後方判定の基準（50%） |

### データ取得の優先順位

1. **4角位置（corner4）** - 最も正確な位置取りデータ
2. **2角位置（corner2）** - 4角位置がない場合の代替
3. **データなし（99）** - どちらもない場合は99を返し、判定から除外

---

## 4. 現在の実装の特徴

### ✅ 良い点

1. **4角位置を優先**: より正確な位置取りデータを使用
2. **フォールバック対応**: 4角位置がない場合も2角位置で判定可能
3. **後方判定が柔軟**: 頭数の50%を基準に判定（16頭なら8番手より後ろ）

### ⚠️ 注意点

1. **データの有無**: `corner4`/`corner2`が両方ない場合は判定できない（99を返す）
2. **先行馬の定義**: 現在は「3番手以内」で固定（変更可能）
3. **後方の定義**: 現在は「頭数の50%より後ろ」で固定（変更可能）

---

## 5. 改善の余地

### 提案1: 先行馬の定義を柔軟に

現在は「3番手以内」で固定ですが、以下のような柔軟な定義も可能：

```typescript
// 頭数に応じて先行馬の定義を変更
function isForwardRunner(position: number, fieldSize: number): boolean {
  // 16頭以上: 3番手以内
  if (fieldSize >= 16) return position <= 3;
  // 12-15頭: 2番手以内
  if (fieldSize >= 12) return position <= 2;
  // それ以下: 1-2番手
  return position <= 2;
}
```

### 提案2: 位置取り改善の判定を強化

現在は「頭数の50%より後ろ」で判定していますが、より細かく：

```typescript
// 後方の定義を段階的に
const wasBackRunner = avgPastPosition > fieldSz * 0.5;  // 現在
// 改善案: より後方の馬を重視
const wasVeryBackRunner = avgPastPosition > fieldSz * 0.7;  // 70%より後ろ
```

---

## 6. デバッグ用ログ出力例

```typescript
// 位置取り改善のデバッグ
console.log({
  horseName: horse.name,
  lastPosition,
  avgPastPosition,
  fieldSize: fieldSz,
  wasBackRunner,
  movedForward,
  positionImprovement,
  scoreAdded: improvementScore
});

// 展開連動のデバッグ
console.log({
  forwardRunnerCount,
  totalHorses: allHorses.length,
  forwardRate: (forwardRate * 100).toFixed(1) + '%',
  myLastPosition,
  iAmForwardRunner,
  iAmCloser,
  scoreAdded
});
```
