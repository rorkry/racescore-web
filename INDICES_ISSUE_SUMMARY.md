# 指数とスコアが表示されない問題 - 調査結果

## 問題の概要

レースカードは表示されるが、指数とスコアが表示されない。

## 調査結果

### 1. indicesテーブルの状態

**問題**: indicesテーブルが空（0件）

```sql
SELECT COUNT(*) FROM indices;
-- 結果: 0件
```

**影響**: 
- 巻き返し指数（makikaeshi）が取得できない
- ポテンシャル指数（potential）が取得できない
- その結果、競うスコアが0点になる

### 2. データの紐付けロジック

#### wakujun → umadata の紐付け

**現在のロジック**:
```typescript
const pastRacesRaw = db.prepare(`
  SELECT * FROM umadata
  WHERE TRIM(horse_name) = ?
  ORDER BY date DESC
  LIMIT 5
`).all(horseName);
```

**問題**: 
- テスト馬名「リオクリスハーレー」でumadataを検索しても0件
- 馬名の全角・半角、スペース、特殊文字の違いでマッチングが失敗している可能性

**確認結果**:
- wakujunテーブル: 349件（date='1227'）
- umadataテーブル: 3407件
- しかし、wakujunの馬名でumadataを検索しても見つからない

#### umadata → indices の紐付け

**現在のロジック**:
```typescript
const raceIdBase = race.race_id_new_no_horse_num || '';
const horseNum = String(race.horse_number || '').padStart(2, '0');
const fullRaceId = `${raceIdBase}${horseNum}`;

const indexData = db.prepare(`
  SELECT L4F, T2F, potential, revouma, makikaeshi, cushion
  FROM indices WHERE race_id = ?
`).get(fullRaceId);
```

**問題**: 
- indicesテーブルが空のため、常にnullが返される

### 3. 競うスコアの計算

**実装**: `utils/getClusterData.ts`の`computeKisoScore`関数

**計算ロジック**:
1. 巻き返し指数スコア（50点満点）: `indices.makikaeshi`を使用
2. ポテンシャル指数スコア（15点満点）: `indices.potential`を使用
3. 着順スコア（10点満点）
4. 着差スコア（10点満点）
5. クラスタタイムスコア（8点満点）
6. 通過順位×ペーススコア（7点満点）

**問題**: 
- indicesテーブルが空のため、巻き返し指数とポテンシャル指数が0になる
- その結果、スコアが大幅に低下する

## 解決方法

### 1. indicesテーブルにデータをインポート

**方法**: `tools/upload-indices.ts`を使用

```bash
npx ts-node tools/upload-indices.ts
```

または、Windowsの場合:
```bash
sync-indices.bat
```

**必要なCSVファイル**:
- `C:\競馬データ\L4F\2025\*.csv`
- `C:\競馬データ\T2F\2025\*.csv`
- `C:\競馬データ\ポテンシャル指数\2025\*.csv`
- `C:\競馬データ\レボウマ\2025\*.csv`
- `C:\競馬データ\巻き返し指数\2025\*.csv`
- `C:\競馬データ\クッション値\2025\*.csv`

### 2. wakujun → umadata の紐付け改善（オプション）

**問題**: 馬名のマッチングが失敗している

**改善案**:
1. 全角・半角を統一して比較
2. スペースを除去して比較
3. 部分一致も試す

**実装例**:
```typescript
function normalizeHorseNameForMatch(name: string): string {
  return name
    .replace(/[\s　]+/g, '')  // 全角・半角スペースを除去
    .replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))  // 全角→半角
    .trim();
}

const pastRacesRaw = db.prepare(`
  SELECT * FROM umadata
  WHERE TRIM(REPLACE(REPLACE(horse_name, '　', ''), ' ', '')) = ?
  ORDER BY date DESC
  LIMIT 5
`).all(normalizeHorseNameForMatch(horseName));
```

## 確認用SQLクエリ

### indicesテーブルの確認
```sql
-- 総件数
SELECT COUNT(*) FROM indices;

-- サンプルデータ
SELECT * FROM indices LIMIT 5;

-- 特定のrace_idで検索
SELECT * FROM indices WHERE race_id = '202512270605070101';
```

### 紐付けの確認
```sql
-- wakujunの馬名でumadataを検索
SELECT * FROM umadata 
WHERE TRIM(horse_name) = 'リオクリスハーレー'
LIMIT 5;

-- umadataのrace_id_new_no_horse_numとhorse_numberからrace_idを生成
SELECT 
  race_id_new_no_horse_num,
  horse_number,
  race_id_new_no_horse_num || LPAD(horse_number, 2, '0') as full_race_id
FROM umadata
LIMIT 5;

-- 生成されたrace_idでindicesを検索
SELECT * FROM indices 
WHERE race_id = '202512270605070101';
```

## 次のステップ

1. **indicesデータのインポート**: `tools/upload-indices.ts`を実行してindicesテーブルにデータを投入
2. **紐付けの確認**: インポート後、再度紐付けテストを実行
3. **スコア表示の確認**: ブラウザでレースカードを確認し、スコアが表示されるか確認











