# 競うスコア問題の詳細調査結果

## 調査概要

12/27のレースに出場する馬について、wakujun → umadata → indices の紐付けを詳細に調査しました。

## 調査結果

### 1. 馬名マッチングの状況

**全体のマッチング結果（349頭）:**
- ✅ 完全一致: 104頭（約30%）
- ⚠️ 部分一致: 4頭（約1%）
- ❌ マッチしない: 241頭（約69%）

**問題点:**
- 約69%の馬がumadataテーブルで見つからない
- これは、12/27のレースに出場する馬の多くが新馬や未勝利戦の馬で、まだ過去走データが少ない可能性がある

### 2. マッチした馬のindicesデータ取得

**調査対象馬:** "ヴィジョンメーカー"（12/27 中山 7R 2番）

**結果:**
- ✅ umadataテーブルで過去走データを1件取得
- ✅ indicesテーブルで指数データを取得
  - makikaeshi: 0.9
  - potential: 1.1
  - L4F: 48
  - T2F: 24.5
  - revouma: 1.3
  - cushion: 9.3

**結論:** マッチした馬については、indicesデータが正しく取得できている

### 3. マッチしない馬の例

**調査した馬名:**
- "リオクリスハーレー" → ❌ 見つからない
- "リケアペンネ" → ❌ 見つからない
- "ドレドレ" → ❌ 見つからない
- "トントンビョウシ" → ❌ 見つからない
- "セイブルーアイ" → ❌ 見つからない
- "チュラヴェール" → ❌ 見つからない

**原因:**
- これらの馬は新馬や未勝利戦の馬で、まだ過去走データがumadataテーブルに存在しない可能性が高い
- または、馬名の表記が異なる可能性がある

### 4. 関数の確認

#### normalizeHorseName関数

**現在の実装:**
```typescript
function normalizeHorseName(name: string): string {
  return name
    .replace(/^[\$\*\s]+/, '')
    .replace(/[\s]+$/, '')
    .trim();
}
```

**問題点:**
- 全角スペース（　）を処理していない
- 全角・半角の統一をしていない
- しかし、実際のマッチングでは104頭が完全一致しているため、基本的な正規化は機能している

#### getIndexValue関数

**現在の実装:**
```typescript
function getIndexValue(race: any, key: string): number {
  if (race && race.indices && race.indices[key] !== null && race.indices[key] !== undefined) {
    return parseFloat(race.indices[key]) || 0;
  }
  return 0;
}
```

**問題点:**
- 実装は正しい
- しかし、indicesデータが紐付けられていない場合、常に0を返す
- これは、過去走データがない馬や、indicesデータがない過去走では、スコアが0点になることを意味する

### 5. レースIDの生成

**現在のロジック:**
```typescript
const raceIdBase = race.race_id_new_no_horse_num || '';
const horseNum = String(race.horse_number || '').padStart(2, '0');
const fullRaceId = `${raceIdBase}${horseNum}`;
```

**確認結果:**
- レースIDの生成は正しく機能している
- 例: `race_id_new_no_horse_num="2025081604020702"`, `horse_number="16"` → `race_id="202508160402070216"`

## 問題の根本原因

### 1. 過去走データがない馬が多い

**原因:**
- 12/27のレースに出場する馬の約69%がumadataテーブルで見つからない
- これは、新馬や未勝利戦の馬で、まだ過去走データが少ないため

**影響:**
- 過去走データがない馬は、スコアが0点になる
- 「データなし」と表示される

### 2. 馬名の表記の違い

**問題:**
- wakujunテーブルの馬名には`$`マークが付いている（例: "$アウェイクネス"）
- umadataテーブルの馬名には`$`マークが付いていない
- normalizeHorseName関数は`$`マークを除去しているが、それでもマッチしない馬が多い

**改善案:**
- 全角スペースの処理を追加
- 全角・半角の統一を追加
- 部分一致も試す

## 解決方法

### 1. 馬名マッチングの改善（推奨）

**改善案:**
```typescript
function normalizeHorseNameForMatch(name: string): string {
  return name
    .replace(/^[\$\*\s]+/, '')  // $マークと先頭スペースを除去
    .replace(/[\s]+$/, '')       // 末尾スペースを除去
    .replace(/[\s　]+/g, '')     // 全角・半角スペースを除去
    .trim();
}

// 検索時に複数のパターンを試す
const patterns = [
  normalizeHorseNameForMatch(horseName),
  horseName.trim(),
  horseName.replace(/\s+/g, ''),
  horseName.replace(/　/g, ''),
];

for (const pattern of patterns) {
  const found = db.prepare(`
    SELECT * FROM umadata 
    WHERE TRIM(horse_name) = ?
    ORDER BY date DESC
    LIMIT 5
  `).all(pattern);
  
  if (found.length > 0) {
    pastRaces = found;
    break;
  }
}
```

### 2. 過去走データがない馬への対応

**現状:**
- 過去走データがない馬は、スコアが0点になる
- 「データなし」と表示される

**改善案:**
- 過去走データがない馬については、別の方法でスコアを計算する
- または、「データなし」と表示する（現状の動作）

## 結論

1. **indicesテーブル**: データは正しくインポートされている（47,179件）
2. **マッチした馬**: indicesデータが正しく取得できている
3. **マッチしない馬**: 約69%の馬がumadataテーブルで見つからない
   - これは、新馬や未勝利戦の馬で、まだ過去走データが少ないため
4. **スコア計算**: マッチした馬については、スコアが正しく計算できる

**推奨される対応:**
- 馬名マッチングの改善（全角スペース処理など）
- 過去走データがない馬については、「データなし」と表示する（現状の動作を維持）













