# 競馬教師パターン実装計画

## 概要

`data/keiba-teacher-patterns.json`から抽出したパターンを、現在のサイトのどの部分に、どのように実装するかをまとめる。

---

## 1. 展開予想パターン

### 1-1. 先行馬カウント機能

**実装場所**: `lib/race-pace-predictor.ts` + 新規関数追加

**使用カラム（umadata）**:
- `corner_2` - 2コーナー通過順位
- `corner_4` - 4コーナー通過順位

**ロジック**:
```typescript
// 先行馬の定義: 前走の通過順位に3番手以内があった馬
function isSenkouma(pastRace: PastRaceInfo): boolean {
  const corner2 = parseInt(pastRace.corner2 || '99', 10);
  const corner4 = parseInt(pastRace.corner4 || '99', 10);
  return corner2 <= 3 || corner4 <= 3;
}

// レースの先行馬率を計算
function calculateSenkoumaRate(horses: HorseData[]): number {
  const senkoumaCount = horses.filter(h => {
    const lastRace = h.pastRaces?.[0];
    return lastRace && isSenkouma(lastRace);
  }).length;
  return senkoumaCount / horses.length;
}
```

**UI表示**: レースカード上部に「先行馬率: 40% (6/15頭)」を表示

---

### 1-2. 逃げハサミ候補検出

**実装場所**: `lib/ai-chat/prediction-rules.ts` に新ルール追加

**使用カラム**:
- `waku` - 枠番（wakujun）
- `umaban` - 馬番（wakujun）
- `corner_2`, `corner_4` - 通過順位（umadata）

**ロジック**:
```typescript
NIGE_HASAMI: {
  id: 'nige_hasami',
  name: '逃げハサミ候補',
  type: 'ANA',
  category: 'pace',
  priority: 90,
  check: (horse, settings, allHorses) => {
    // 自身が差し馬（前走通過4番手以降）
    const lastRace = horse.pastRaces[0];
    if (!lastRace || getCornerPosition(lastRace) <= 3) return null;
    
    // 両隣の馬が先行馬かチェック
    const myNumber = horse.number;
    const leftNeighbor = allHorses.find(h => h.number === myNumber - 1);
    const rightNeighbor = allHorses.find(h => h.number === myNumber + 1);
    
    const leftIsSenko = leftNeighbor && isSenkouma(leftNeighbor.pastRaces[0]);
    const rightIsSenko = rightNeighbor && isSenkouma(rightNeighbor.pastRaces[0]);
    
    if (leftIsSenko && rightIsSenko) {
      return {
        reason: '両隣が先行馬、逃げハサミで前に行けるパターン',
        confidence: 'high',
        scoreAdjust: 8,
      };
    }
    return null;
  },
}
```

---

### 1-3. 先行馬率による展開判定

**実装場所**: `lib/ai-chat/prediction-rules.ts`

**ロジック**:
```typescript
// 先行馬率による展開連動ルール
PACE_SLOW_FRONT: {
  id: 'pace_slow_front',
  name: 'スロー想定・先行有利',
  type: 'POSITIVE',
  category: 'pace',
  priority: 80,
  check: (horse, settings, allHorses) => {
    const rate = calculateSenkoumaRate(allHorses);
    
    // 先行馬率30%未満 → スロー濃厚 → 先行馬有利
    if (rate < 0.30 && isSenkouma(horse.pastRaces[0])) {
      return {
        reason: `先行馬率${Math.round(rate*100)}%、スロー濃厚で先行有利`,
        confidence: 'high',
        scoreAdjust: 7,
      };
    }
    return null;
  },
},

PACE_FAST_CLOSER: {
  id: 'pace_fast_closer',
  name: 'ハイペース想定・差し有利',
  type: 'POSITIVE', 
  category: 'pace',
  priority: 80,
  check: (horse, settings, allHorses) => {
    const rate = calculateSenkoumaRate(allHorses);
    
    // 先行馬率60%以上 → ハイペース → 差し馬有利
    if (rate >= 0.60 && !isSenkouma(horse.pastRaces[0])) {
      return {
        reason: `先行馬率${Math.round(rate*100)}%、消耗戦で差し馬有利`,
        confidence: 'high',
        scoreAdjust: 7,
      };
    }
    return null;
  },
},
```

---

## 2. 期待値パターン

### 2-1. 前に行っていない馬が前に行けた

**実装場所**: `lib/ai-chat/prediction-rules.ts`

**使用カラム**:
- `corner_2` - 直近レースの通過順位
- 過去5走の通過順位履歴

**ロジック**:
```typescript
POSITION_IMPROVED: {
  id: 'position_improved',
  name: '位置取り改善（期待値大）',
  type: 'ANA',
  category: 'position',
  priority: 100,
  check: (horse, settings) => {
    if (horse.pastRaces.length < 2) return null;
    
    const lastRace = horse.pastRaces[0];
    const lastPos = getCornerPosition(lastRace);
    
    // 過去5走の平均位置取り
    const avgPos = horse.pastRaces.slice(1, 6)
      .map(r => getCornerPosition(r))
      .filter(p => p > 0)
      .reduce((a, b) => a + b, 0) / Math.max(1, horse.pastRaces.length - 1);
    
    // 前走で普段より3番手以上前に行けた
    if (avgPos - lastPos >= 3 && lastPos <= 5) {
      return {
        reason: `普段(${Math.round(avgPos)}番手)より前で競馬できた、位置取り改善で期待値大`,
        confidence: 'high',
        scoreAdjust: 9,
      };
    }
    return null;
  },
}
```

---

### 2-2. 上がり4位の馬（過小評価パターン）

**実装場所**: `lib/ai-chat/prediction-rules.ts`

**使用カラム**:
- `last_3f` - 上がり3F
- レース内での上がり順位（計算で導出）

**ロジック**:
```typescript
AGARI_4TH: {
  id: 'agari_4th',
  name: '上がり4位（過小評価）',
  type: 'ANA',
  category: 'form',
  priority: 70,
  check: (horse, settings, allHorses) => {
    const lastRace = horse.pastRaces[0];
    if (!lastRace?.ownLast3F) return null;
    
    // 上がり順位を計算（API側で付与するのが理想）
    const agariRank = calculateAgariRank(horse, allHorses);
    
    // 上がり4位は3位以内と遜色ない脚だが印象に残らない
    if (agariRank === 4) {
      return {
        reason: '上がり4位、3位以内と遜色ない脚だが印象に残りにくく過小評価',
        confidence: 'medium',
        scoreAdjust: 5,
      };
    }
    return null;
  },
}
```

---

### 2-3. 4着馬狙い

**実装場所**: `lib/ai-chat/prediction-rules.ts`

**使用カラム**:
- `finish_position` - 着順

**ロジック**:
```typescript
FOURTH_PLACE: {
  id: 'fourth_place',
  name: '4着（過小評価パターン）',
  type: 'POSITIVE',
  category: 'form',
  priority: 60,
  check: (horse, settings) => {
    const lastRace = horse.pastRaces[0];
    if (!lastRace) return null;
    
    // 前走4着で着差小さい
    if (lastRace.finishPosition === 4) {
      const margin = parseMargin(lastRace.margin);
      if (margin <= 0.5) {
        return {
          reason: '前走4着も着差僅差、3着馬と遜色なく過小評価されやすい',
          confidence: 'medium',
          scoreAdjust: 4,
        };
      }
    }
    return null;
  },
}
```

---

### 2-4. 位置取りを下げながら巻き返した馬

**実装場所**: `lib/ai-chat/prediction-rules.ts`

**使用カラム**:
- `corner_2`, `corner_4` - 通過順位
- `finish_position` - 着順

**ロジック**:
```typescript
POSITION_DROP_RECOVERY: {
  id: 'position_drop_recovery',
  name: '位置取り下げながら巻き返し',
  type: 'ANA',
  category: 'position',
  priority: 90,
  check: (horse, settings) => {
    const lastRace = horse.pastRaces[0];
    if (!lastRace) return null;
    
    const corner2 = parseInt(lastRace.corner2 || '0', 10);
    const corner4 = parseInt(lastRace.corner4 || '0', 10);
    
    // 4角で後退したが、着順はそこそこ
    if (corner4 > corner2 + 3 && lastRace.finishPosition <= 8) {
      return {
        reason: '道中位置を下げながらも粘り、脚を残していた可能性',
        confidence: 'medium',
        scoreAdjust: 6,
      };
    }
    return null;
  },
}
```

---

### 2-5. 下級条件での連続2着（マイナス評価）

**実装場所**: `lib/ai-chat/prediction-rules.ts`

**使用カラム**:
- `finish_position` - 着順
- `class_name` - クラス名

**ロジック**:
```typescript
CONSECUTIVE_SECOND_LOW_CLASS: {
  id: 'consecutive_second_low_class',
  name: '下級条件での連続2着（過信禁物）',
  type: 'NEGATIVE',
  category: 'form',
  priority: 70,
  check: (horse, settings) => {
    const lastTwo = horse.pastRaces.slice(0, 2);
    if (lastTwo.length < 2) return null;
    
    const bothSecond = lastTwo.every(r => r.finishPosition === 2);
    const isLowClass = lastTwo.every(r => 
      r.className?.includes('未勝利') || 
      r.className?.includes('1勝') ||
      r.className?.includes('新馬')
    );
    
    if (bothSecond && isLowClass) {
      return {
        reason: '下級条件での連続2着、力が抜けていれば勝っているはず',
        confidence: 'medium',
        scoreAdjust: -4,
      };
    }
    return null;
  },
}
```

---

## 3. コース特性パターン

### 3-1. 初角までの距離による内外有利

**実装場所**: `lib/ai-chat/system-prompt.ts` + コースマスターデータ

**データ追加**: `lib/saga-ai/course-master.ts`

```typescript
// コースマスターに初角距離を追加
export const COURSE_CORNER_DISTANCE: Record<string, number> = {
  '東京芝1600': 542,   // 長い → 内外差小
  '中山芝1200': 286,   // 短い → 内有利
  '阪神芝1600': 442,
  '京都ダート1800': 340,
  // ...
};

// 初角距離による判定
function getFirstCornerAdvantage(course: string): 'inner' | 'outer' | 'neutral' {
  const distance = COURSE_CORNER_DISTANCE[course];
  if (!distance) return 'neutral';
  if (distance < 300) return 'inner';  // 短い → 内有利
  return 'neutral';
}
```

---

### 3-2. 芝スタートダートコース判定

**実装場所**: `lib/saga-ai/course-master.ts`

```typescript
// 芝スタートのダートコース
export const TURF_START_DIRT_COURSES = [
  '東京ダート1600',
  '中京ダート1400',
  '中山ダート1200',
  // ...
];

// 芝スタートダートでは「前に行けた」が発生しやすい
function isTurfStartDirt(course: string): boolean {
  return TURF_START_DIRT_COURSES.includes(course);
}
```

**予想ルールへの反映**:
```typescript
TURF_START_DIRT_ADVANTAGE: {
  id: 'turf_start_dirt',
  name: '芝スタートダートで位置取り改善',
  type: 'POSITIVE',
  category: 'position',
  priority: 85,
  check: (horse, settings) => {
    const course = `${settings.place}${settings.surface}${settings.distance}`;
    if (!isTurfStartDirt(course)) return null;
    
    // 普段差し馬が今回前に行ける可能性
    const lastRace = horse.pastRaces[0];
    if (lastRace && getCornerPosition(lastRace) > 5) {
      return {
        reason: '芝スタートのダート、普段後方の馬が前に行ける可能性',
        confidence: 'medium',
        scoreAdjust: 5,
      };
    }
    return null;
  },
}
```

---

## 4. UI表示の追加

### 4-1. レースカードに展開情報表示

**実装場所**: `app/card/page.tsx`

```tsx
// レースカード上部に展開情報を表示
<div className="bg-slate-800 p-3 rounded-lg mb-4">
  <h3 className="text-gold-500 font-bold mb-2">📊 展開予想</h3>
  <div className="grid grid-cols-2 gap-4 text-sm">
    <div>
      <span className="text-slate-400">先行馬率:</span>
      <span className="ml-2 text-white font-bold">
        {senkoumaRate}% ({senkoumaCount}/{totalHorses}頭)
      </span>
    </div>
    <div>
      <span className="text-slate-400">想定ペース:</span>
      <span className={`ml-2 font-bold ${
        senkoumaRate < 30 ? 'text-blue-400' :
        senkoumaRate > 60 ? 'text-red-400' : 'text-green-400'
      }`}>
        {senkoumaRate < 30 ? 'スロー' : senkoumaRate > 60 ? 'ハイ' : 'ミドル'}
      </span>
    </div>
  </div>
</div>
```

---

### 4-2. AI予想の理由に新パターンを反映

**実装場所**: `lib/ai-chat/system-prompt.ts`

システムプロンプトに追加:
```
## 展開予想の考え方
- 先行馬の定義: 前走の通過順位に3番手以内があった馬
- 先行馬率30%未満: スロー濃厚 → 先行馬が有利（勝負レース候補）
- 先行馬率60%以上: 消耗戦 → 差し馬を狙う
- 逃げハサミ: 両隣が先行馬の差し馬は前に行ける可能性大

## 期待値が取れるパターン
- 「前に行っていない馬が前に行けた」= 最も期待値が取れる
- 上がり4位の馬 = 3位以内と遜色ないが過小評価
- 4着馬 = 3着馬ほど注目されず過小評価
- 位置取りを下げながら巻き返した馬 = 脚を残していた可能性

## 期待値が取りにくいパターン
- 下級条件での連続2着 = 力が抜けていれば勝っている
```

---

## 5. 実装優先順位

| 優先度 | 機能 | 工数 | 効果 |
|--------|------|------|------|
| 1 | 先行馬カウント・先行馬率表示 | 中 | 展開予想の基盤 |
| 2 | 逃げハサミ候補検出 | 中 | 穴馬発見に直結 |
| 3 | 位置取り改善パターン | 小 | 期待値最大パターン |
| 4 | 4着・上がり4位の過小評価 | 小 | 穴馬発見 |
| 5 | 下級条件連続2着のマイナス | 小 | 過信禁物フラグ |
| 6 | コース特性マスター拡充 | 大 | 長期的な精度向上 |

---

## 6. 必要なDBカラム確認

### umadataテーブルで使用するカラム

| カラム名 | 用途 | 備考 |
|---------|------|------|
| `corner_2` | 2コーナー通過順位 | 先行馬判定 |
| `corner_4` | 4コーナー通過順位 | 先行馬判定、位置取り変化 |
| `finish_position` | 着順 | 4着判定、好走判定 |
| `last_3f` | 上がり3F | 上がり順位計算 |
| `class_name` | クラス名 | 下級条件判定 |
| `distance` | 距離 | 距離短縮判定 |
| `margin` | 着差 | 僅差判定 |

### wakujunテーブルで使用するカラム

| カラム名 | 用途 | 備考 |
|---------|------|------|
| `waku` | 枠番 | 内外判定 |
| `umaban` | 馬番 | 隣接馬判定（逃げハサミ） |

---

## 7. 次のアクション

1. **Phase 1**: `lib/race-pace-predictor.ts`に先行馬カウント関数を追加
2. **Phase 2**: `lib/ai-chat/prediction-rules.ts`に新ルール5つを追加
3. **Phase 3**: レースカードUIに展開情報表示を追加
4. **Phase 4**: システムプロンプトに新パターンの説明を追加
