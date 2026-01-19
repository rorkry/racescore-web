# 出馬表ページの調査結果

## 📁 関連ファイル

### メインページ
1. **`app/page.tsx`** - メインの出馬表ページ（現在使用中）
   - wakujunデータを使用
   - `/api/race-card-with-score` APIを呼び出し

2. **`app/race/[raceKey]/page.tsx`** - 個別レース詳細ページ（別システム）
   - race_results/races/horsesテーブルを使用
   - `/api/race-detail/[raceKey]` APIを呼び出し
   - ⚠️ このページは**別のデータベース構造**を使用

3. **`app/races/[ymd]/page.tsx`** - 日別レース一覧ページ
   - `/api/races-by-day` APIを呼び出し

---

## 🔑 raceKeyの生成方法

### 2つの異なるシステム

#### 1️⃣ **現在の出馬表システム** (`app/page.tsx`)
**raceKeyは使用していません**

代わりに以下のパラメータでデータを取得：
```typescript
// API呼び出し
const url = `/api/race-card-with-score?date=${date}&year=${selectedYear}&place=${encodeURIComponent(place)}&raceNumber=${raceNumber}`;

// パラメータ:
// - date: "1227" (MMDD形式)
// - year: "2025" または "2026"
// - place: "中山", "阪神", "京都" (日本語の競馬場名)
// - raceNumber: "1", "2", "3"... (レース番号)
```

#### 2️⃣ **別の出馬表システム** (`app/race/[raceKey]/page.tsx`)
**raceKeyを使用**

```typescript
// raceKey形式: YYYYMMDDCCNN (12桁)
// - YYYYMMDD: 年月日 (例: 20251227)
// - CC: 競馬場コード (01-10)
// - NN: レース番号 (01-12)

// 例: 202512270601 = 2025年12月27日 中山 1R

// 競馬場コードマッピング
const COURSE_NAME: Record<string, string> = {
  '01': '札幌', '02': '函館', '03': '福島', '04': '新潟',
  '05': '東京', '06': '中山', '07': '中京', '08': '京都',
  '09': '阪神', '10': '小倉',
};

// raceKey生成 (app/races/[ymd]/page.tsx より)
const raceKey = `${ymd}${course.padStart(2, '0')}${String(no).padStart(2, '0')}`;
// 例: 202512270601
```

---

## 🗄️ wakujunからデータを取得するクエリ

### 1. `/api/races` (pages/api/races.ts)

#### 年の日付一覧を取得
```sql
SELECT DISTINCT date
FROM wakujun
WHERE year = ? AND date GLOB '[0-9][0-9][0-9][0-9]'
ORDER BY date DESC
```

#### 特定日の競馬場一覧を取得
```sql
SELECT DISTINCT place
FROM wakujun
WHERE date = ? AND year = ?
ORDER BY place
```

#### 特定日・競馬場のレース一覧を取得
```sql
SELECT DISTINCT 
  date, 
  place, 
  race_number, 
  class_name_1 as class_name,
  track_type,
  distance,
  COUNT(*) as field_size
FROM wakujun
WHERE date = ? AND place = ? AND year = ?
GROUP BY date, place, race_number
ORDER BY CAST(race_number AS INTEGER)
```

### 2. `/api/race-card-with-score` (pages/api/race-card-with-score.ts)

#### 特定レースの全出走馬を取得
```sql
SELECT * FROM wakujun
WHERE date = ? AND place = ? AND race_number = ? AND year = ?
ORDER BY CAST(umaban AS INTEGER)
```

**パラメータ例:**
- `date`: "1227"
- `place`: "中山"
- `race_number`: "3"
- `year`: 2025

**取得データ:**
- `umaban` (馬番)
- `waku` (枠番)
- `umamei` (馬名)
- `kishu` (騎手)
- `kinryo` (斤量)
- `track_type` (芝/ダート)
- `distance` (距離)
- `class_name_1` (クラス名)
- `tosu` (頭数)
- その他...

---

## 📊 データフロー

```
ユーザー操作
    ↓
app/page.tsx
    ↓ (年・日付選択)
GET /api/races?year=2025
    ↓ (wakujun から DISTINCT date)
利用可能な日付リスト表示
    ↓ (日付選択: 1227)
GET /api/races?date=1227&year=2025
    ↓ (wakujun から競馬場とレース一覧)
競馬場・レース選択肢表示
    ↓ (中山 3R 選択)
GET /api/race-card-with-score?date=1227&year=2025&place=中山&raceNumber=3
    ↓ (wakujun から出走馬取得)
    ↓ (umadata から各馬の過去走取得)
    ↓ (indices から指数取得)
    ↓ (スコア計算)
出馬表表示
```

---

## ⚠️ 注意点

1. **2つの独立したシステム**が存在する：
   - **wakujun系**: 現在使用中。日本語の競馬場名、年+MMDD形式
   - **race_results系**: `/app/race/[raceKey]`で使用。12桁raceKey形式

2. **wakujun系では競馬場名が日本語**:
   - "中山", "阪神", "京都"など
   - コード変換が必要な場合は手動マッピング

3. **年情報が重要**:
   - wakujunテーブルに`year`列を追加済み
   - 12月と1月を区別するために必須

4. **インデックスが効いている**:
   - `idx_wakujun_year_date` (year, date)
   - 検索パフォーマンス向上


















