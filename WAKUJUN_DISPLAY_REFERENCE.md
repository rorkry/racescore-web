# wakujunデータの表示で使用されている部分

## レースカード表示で使用されているフィールド

### app/page.tsx での使用箇所

1. **枠番 (waku)**
   - 行818-819: 枠番の表示と背景色の設定
   ```typescript
   <td className={`border border-slate-800 px-2 py-2 text-center ${getWakuColor(horse.waku)}`}>
     {horse.waku}
   </td>
   ```

2. **馬番 (umaban)**
   - 行822: 馬番の表示
   - 行826: 馬の展開/折りたたみのキーとして使用
   ```typescript
   <td className="border border-slate-800 px-2 py-2 text-center font-bold text-slate-800">
     {horse.umaban}
   </td>
   ```

3. **馬名 (umamei)**
   - 行829: 馬名の表示（normalizeHorseName関数で正規化）
   - 行849: 過去走詳細のタイトル
   ```typescript
   <span>{normalizeHorseName(horse.umamei)}</span>
   ```

4. **騎手 (kishu)**
   - 行836: 騎手名の表示（trim()で前後の空白を削除）
   ```typescript
   {horse.kishu.trim()}
   ```

5. **斤量 (kinryo)**
   - 行839: 斤量の表示（trim()で前後の空白を削除）
   ```typescript
   {horse.kinryo.trim()}
   ```

## データ取得元

データは `pages/api/race-card-with-score.ts` から取得されています。

### APIレスポンスの構造
```typescript
{
  raceInfo: {
    date: string;
    place: string;
    raceNumber: string;
    className: string;
    trackType: string;
    distance: string;
    fieldSize: number;
  },
  horses: [
    {
      waku: string;      // 枠番
      umaban: string;    // 馬番
      umamei: string;    // 馬名
      kishu: string;     // 騎手
      kinryo: string;    // 斤量
      // ... その他のフィールド
    }
  ]
}
```

## データベーススキーマ

wakujunテーブルの構造（drizzle/schema.tsより）:
- date: 日付（例: 1220）
- place: 場所（例: 中山）
- race_number: レース番号
- class_name_1: クラス名1
- class_name_2: クラス名2
- **waku: 枠番** ← 表示で使用
- **umaban: 馬番** ← 表示で使用
- **kinryo: 斤量** ← 表示で使用
- **umamei: 馬名** ← 表示で使用
- seibetsu: 性別
- nenrei: 年齢（数字）
- nenrei_display: 年齢表示
- **kishu: 騎手** ← 表示で使用
- blank_field: 空欄フィールド
- track_type: トラック種別
- distance: 距離
- tosu: 頭数
- shozoku: 所属
- chokyoshi: 調教師
- shozoku_chi: 所属地
- umajirushi: 馬印

## 現在の問題

データベースの実際のデータを確認したところ、列のマッピングがずれている可能性があります。
実際のCSVファイルの列順序と、インポートスクリプトのマッピングを確認する必要があります。











