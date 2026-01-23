# カラム名チェック結果

## ✅ 修正完了

### 1. 通過順位取得関数の修正

**修正前**:
```typescript
const corner2 = toHalfWidth(GET(race, 'corner2', 'corner_2', '4角位置')).trim();
const corner4 = toHalfWidth(GET(race, 'corner4', 'corner_4', '4角位置')).trim();
```

**問題点**:
- `'4角位置'`は内外位置（0-4）を示すもので、通過順位ではない
- `corner_4_position`（新フォーマット）がフォールバックに含まれていない

**修正後**:
```typescript
const corner2 = toHalfWidth(GET(race, 'corner2', 'corner_2')).trim();
const corner4 = toHalfWidth(GET(race, 'corner4', 'corner_4', 'corner_4_position')).trim();
```

**マッピング済みキー**:
- `corner4`, `corner2` - `mapUmadataToRecordRow`で設定済み
- フォールバック: `corner_4`, `corner_4_position`, `corner_2`

---

### 2. 頭数カラム名の強化

**修正箇所**: コース適性スコア計算部分（2箇所）

**修正前**:
```typescript
const fieldSz = parseInt(GET(horse.entry, 'tosu', '頭数') || '16', 10);
```

**修正後**:
```typescript
const fieldSz = parseInt(GET(horse.entry, 'tosu', '頭数', 'fieldSize', 'field_size') || '16', 10);
```

**理由**:
- wakujunテーブル: `tosu` → `頭数`にマッピング済み
- umadataテーブル: `field_size` → `fieldSize`, `頭数`にマッピング済み
- 念のため両方のフォールバックを追加

---

## ✅ 確認済み（問題なし）

### 1. その他のカラム名

| カラム | 使用箇所 | フォールバック | 状態 |
|--------|---------|---------------|------|
| `place` | コース適性 | `'place', '場所', '場所_1'` | ✅ OK |
| `surface` | コース適性 | `'surface', 'トラック種別', 'track_type'` | ✅ OK |
| `distance` | コース適性 | `'distance', '距離'` | ✅ OK |
| `waku` | コース適性 | `'waku', '枠番'` | ✅ OK |
| `fieldSize` | 位置取り改善 | `'fieldSize', '頭数'` | ✅ OK |
| `pci` | 通過順位×ペース | `'pci', 'PCI'` | ✅ OK |

---

## 📋 カラム名マッピング一覧

### umadataテーブル → RecordRow

| DBカラム名 | RecordRowキー | 備考 |
|-----------|--------------|------|
| `corner_4` | `corner4` | マッピング済み |
| `corner_4_position` | `corner4` | マッピング済み（新フォーマット） |
| `corner_2` | `corner2` | マッピング済み |
| `field_size` | `fieldSize`, `頭数` | マッピング済み |
| `number_of_horses` | `fieldSize`, `頭数` | マッピング済み（旧フォーマット） |

### wakujunテーブル → RecordRow

| DBカラム名 | RecordRowキー | 備考 |
|-----------|--------------|------|
| `tosu` | `頭数` | マッピング済み |
| `waku` | `waku`, `枠番` | マッピング済み |
| `distance` | `distance`, `距離` | マッピング済み |
| `track_type` | `surface`, `トラック種別` | マッピング済み |

---

## 🔍 データ取得の優先順位

### 通過順位（corner4）

1. **`corner4`** - マッピング済みキー（優先）
2. **`corner_4`** - 旧フォーマット
3. **`corner_4_position`** - 新フォーマット
4. **99** - データなし

### 通過順位（corner2）

1. **`corner2`** - マッピング済みキー（優先）
2. **`corner_2`** - 旧フォーマット
3. **99** - データなし

### 頭数（fieldSize）

1. **`tosu`** - wakujunテーブル（今回のレース）
2. **`頭数`** - マッピング済みキー
3. **`fieldSize`** - マッピング済みキー
4. **`field_size`** - DBカラム名（念のため）
5. **`16`** - デフォルト値

---

## ✅ エラー対策

### 1. データなしの場合

- `getPassingPosition()` → **99を返す**（判定から除外）
- `getAveragePassingPosition()` → **99を返す**（判定から除外）
- 頭数 → **16をデフォルト値**として使用

### 2. フォールバック処理

- `GET()`関数が複数のキーを試行
- マッピング済みキーを優先
- DBカラム名もフォールバックとして追加

---

## 🎯 結論

**すべてのカラム名参照は正しく、エラーは発生しない想定です。**

- ✅ マッピング済みキーを優先使用
- ✅ 新旧フォーマット両対応
- ✅ 適切なフォールバック処理
- ✅ データなしの場合のデフォルト値設定
