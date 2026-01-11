# wakujunテーブル 確認用SQLクエリ

## 1. 総データ件数
```sql
SELECT COUNT(*) as count FROM wakujun;
```

## 2. 日付別データ件数
```sql
SELECT date, COUNT(*) as count
FROM wakujun
GROUP BY date
ORDER BY date DESC;
```

## 3. 場所別データ（date='1227'）
```sql
SELECT place, COUNT(DISTINCT race_number) as race_count, COUNT(*) as horse_count
FROM wakujun
WHERE date = '1227'
GROUP BY place
ORDER BY place;
```

## 4. 特定レースのデータ確認
```sql
SELECT date, place, race_number, waku, umaban, umamei, kishu, kinryo
FROM wakujun
WHERE date = '1227' AND place = '中山' AND race_number = '1'
ORDER BY CAST(umaban AS INTEGER);
```

## 5. 列マッピング確認（最初の1件）
```sql
SELECT * FROM wakujun WHERE date = '1227' LIMIT 1;
```

## 6. APIで取得されるべきデータ（date=1227）
```sql
-- 場所一覧
SELECT DISTINCT place
FROM wakujun
WHERE date = '1227'
ORDER BY place;

-- 各場所のレース一覧
SELECT DISTINCT race_number, COUNT(*) as horse_count
FROM wakujun
WHERE date = '1227' AND place = '中山'
GROUP BY race_number
ORDER BY CAST(race_number AS INTEGER);
```

## 7. データの整合性チェック
```sql
-- 4桁形式の日付のみが存在するか確認
SELECT COUNT(*) as count
FROM wakujun
WHERE date GLOB '[0-9][0-9][0-9][0-9]';

-- 18桁形式（レースID）が混在していないか確認
SELECT COUNT(*) as count
FROM wakujun
WHERE LENGTH(date) = 18;
```













