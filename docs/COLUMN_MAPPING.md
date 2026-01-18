# カラム名マッピング対応表

## umadataテーブル

### 新フォーマット (39列) - upload-csv APIで使用

| 列番号 | カラム名 | 説明 |
|--------|----------|------|
| 0 | race_id | レースID(馬番号あり 16桁) |
| 1 | date | 日付 |
| 2 | place | 場所 |
| 3 | course_type | 内/外回り |
| 4 | distance | 距離(芝2200等) |
| 5 | class_name | クラス |
| 6 | race_name | レース名 |
| 7 | gender_limit | 牝馬限定フラグ |
| 8 | age_limit | 2歳/3歳限定 |
| 9 | waku | 枠 |
| 10 | **umaban** | 馬番 |
| 11 | horse_name | 馬名 |
| 12 | corner_4_position | 4角位置 |
| 13 | track_condition | 馬場状態 |
| 14 | field_size | 頭数 |
| 15 | popularity | 人気 |
| 16 | finish_position | 着順 |
| 17 | last_3f | 上がり3F |
| 18 | weight_carried | 斤量 |
| 19 | horse_weight | 馬体重 |
| 20 | weight_change | 馬体重増減 |
| 21 | finish_time | 走破タイム |
| 22 | race_count | 休み明けから何戦目 |
| 23 | margin | 着差 |
| 24 | win_odds | 単勝オッズ |
| 25 | place_odds | 複勝オッズ |
| 26 | win_payout | 単勝配当 |
| 27 | place_payout | 複勝配当 |
| 28 | rpci | RPCI |
| 29 | pci | PCI |
| 30 | pci3 | PCI3 |
| 31 | horse_mark | 印 |
| 32 | passing_order | 通過順 (1-2-3-4形式) |
| 33 | gender_age | 性齢(牡3等) |
| 34 | jockey | 騎手 |
| 35 | trainer | 調教師 |
| 36 | sire | 種牡馬 |
| 37 | dam | 母馬名 |
| 38 | lap_time | ラップタイム |

### 旧フォーマットとの対応

| 旧カラム名 | 新カラム名 | 備考 |
|------------|------------|------|
| horse_number | **umaban** | 名前変更 |
| corner_2 | passing_order | 通過順から抽出必要 |
| corner_3 | passing_order | 通過順から抽出必要 |
| corner_4 | corner_4_position | 名前変更 |
| index_value | ❌ 廃止 | indicesテーブルで管理 |
| standard_time | ❌ 廃止 | |
| good_run | ❌ 廃止 | |
| affiliation | ❌ 廃止 | |
| multiple_entries | ❌ 廃止 | |
| jockey_weight | weight_carried | 名前変更 |

### 新規追加カラム

| カラム名 | 説明 |
|----------|------|
| course_type | 内/外回り |
| race_name | レース名 |
| gender_limit | 牝馬限定フラグ |
| age_limit | 2歳/3歳限定 |
| waku | 枠 |
| race_count | 休み明けから何戦目 |
| win_odds | 単勝オッズ |
| place_odds | 複勝オッズ |
| win_payout | 単勝配当 |
| place_payout | 複勝配当 |
| passing_order | 通過順 |
| gender_age | 性齢 |
| lap_time | ラップタイム |

---

## wakujunテーブル

| カラム名 | 説明 |
|----------|------|
| date | 日付 (MMDD) |
| year | 年 |
| place | 場所 |
| race_number | レース番号 |
| **umaban** | 馬番 |
| **umamei** | 馬名 |
| waku | 枠 |
| age | 年齢 |
| gender | 性別 |
| jockey | 騎手 |
| trainer | 調教師 |
| weight | 斤量 |
| distance | 距離 |
| track_type | 芝/ダート |
| ... | その他 |

---

## indicesテーブル

| カラム名 | 説明 | 注意 |
|----------|------|------|
| race_id | レースID (18桁 = umadata.race_id + umaban 2桁) | |
| "L4F" | 後半4F | **引用符必須** |
| "T2F" | 前半2F | **引用符必須** |
| potential | ポテンシャル指数 | |
| makikaeshi | 巻き返し指数 | |
| revouma | レボウマ | |
| cushion | クッション値 | |

---

## コード修正必須箇所

### 1. horse_number → umaban
- `pages/api/saga-ai.ts` ✅ 修正済み
- `pages/api/race-card-with-score.ts` ✅ 修正済み

### 2. corner_2, corner_3 → passing_orderから抽出
- 通過順 "5-4-3-2" から各コーナーを抽出するヘルパー関数が必要

### 3. 参照時のフォールバック
コード内でカラムを参照する際は、新旧両方をサポート：
```typescript
const umaban = race.umaban || race.horse_number || '';
const horseName = race.horse_name || race.umamei || '';
```
