# 過去走データ取得問題の調査結果

## 調査概要

過去走が1走分しか読み込まれていない問題について、API、データベース、フロントエンドを調査しました。

## 調査結果

### 1. APIの過去走データ取得ロジック

**ファイル**: `pages/api/race-card-with-score.ts`

**コード（119-124行目）:**
```typescript
const pastRacesRaw = db.prepare(`
  SELECT * FROM umadata
  WHERE TRIM(horse_name) = ?
  ORDER BY date DESC
  LIMIT 5
`).all(horseName);
```

**確認結果:**
- ✅ `LIMIT 5`で最大5件の過去走を取得している
- ✅ 複数の過去走を取得するロジックは正しい

### 2. 実際のデータ確認

**調査対象馬**: "ミクニインスパイア"（過去走3件）

**umadataテーブル:**
- ✅ 過去走データ: 3件取得できている
- ✅ 各過去走にindicesデータも紐づけられている

**APIレスポンス構造:**
```typescript
{
  past_races: pastRacesWithIndices,  // 3件
  past_races_count: 3,
  past: pastRacesWithIndices,        // 3件
  hasData: true
}
```

**確認結果:**
- ✅ APIは複数の過去走を正しく返している
- ✅ `past`配列には3件のデータが含まれている

### 3. フロントエンド側の確認

**ファイル**: `app/page.tsx`

**型定義（59-70行目）:**
```typescript
interface Horse {
  umaban: string;
  waku: string;
  umamei: string;
  kishu: string;
  kinryo: string;
  score: number;
  hasData: boolean;
  past: PastRace[];  // 配列として定義されている
  indices: Indices | null;
  indexRaceId?: string;
}
```

**表示コンポーネント（576-670行目）:**
```typescript
const PastRaceDetail = ({ pastRaces }: { pastRaces: PastRace[] }) => {
  if (!pastRaces || pastRaces.length === 0) {
    return <div className="text-slate-500 text-sm p-4">過去走データなし</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-max text-sm border-collapse">
        <tbody>
          {pastRaces.map((race, idx) => {  // 全件をmapで表示
            // ...
          })}
        </tbody>
      </table>
    </div>
  );
};
```

**確認結果:**
- ✅ `PastRaceDetail`コンポーネントは`pastRaces.map`で全件を表示している
- ✅ 1件しか表示されない問題は、コンポーネント側にはない

### 4. マッチングロジックの確認

**コード（127-148行目）:**
```typescript
const pastRacesWithIndices = pastRacesRaw.map((race: any) => {
  const raceIdBase = race.race_id_new_no_horse_num || '';
  const horseNum = String(race.horse_number || '').padStart(2, '0');
  const fullRaceId = `${raceIdBase}${horseNum}`;
  
  let raceIndices = null;
  try {
    const indexData = db.prepare(`
      SELECT L4F, T2F, potential, revouma, makikaeshi, cushion
      FROM indices WHERE race_id = ?
    `).get(fullRaceId);
    if (indexData) raceIndices = indexData;
  } catch {
    // 指数データがない場合は無視
  }
  
  return {
    ...race,
    indices: raceIndices,
    indexRaceId: fullRaceId
  };
});
```

**確認結果:**
- ✅ 各過去走に対してindicesデータを紐づけている
- ✅ `map`関数を使用しているため、複数件が処理される

## 問題の可能性

### 1. APIレスポンスの受け取り方

**コード（202-215行目）:**
```typescript
const fetchRaceCard = async (place: string, raceNumber: string) => {
  try {
    setLoading(true);
    setError(null);
    const url = `/api/race-card-with-score?date=${date}&place=${encodeURIComponent(place)}&raceNumber=${raceNumber}`;
    console.log('fetchRaceCard URL:', url);
    const res = await fetch(url);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch race card: ${res.status}`);
    }
    const data = await res.json();
    console.log('fetchRaceCard response:', data);
    setRaceCard(data);
    setExpandedHorse(null);
  } catch (err: any) {
    console.error('fetchRaceCard error:', err);
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

**確認ポイント:**
- APIレスポンスをそのまま`setRaceCard(data)`で設定している
- `data.horses[].past`配列が正しく渡されているか確認が必要

### 2. データの変換処理

**コード（198-200行目）:**
```typescript
past_races: pastRacesWithIndices,
past_races_count: pastRaces.length,
past: pastRacesWithIndices,
```

**確認結果:**
- ✅ `past`配列には`pastRacesWithIndices`がそのまま設定されている
- ✅ `pastRacesWithIndices`は複数件の配列

## 推奨される確認方法

### 1. ブラウザのコンソールで確認

```javascript
// ブラウザの開発者ツールのコンソールで実行
const raceCard = /* APIレスポンス */;
console.log('過去走件数:', raceCard.horses[0].past.length);
console.log('過去走データ:', raceCard.horses[0].past);
```

### 2. APIレスポンスのログ確認

`fetchRaceCard`関数で既に`console.log('fetchRaceCard response:', data);`が追加されているので、ブラウザのコンソールで確認できます。

### 3. デバッグ用のログ追加

`app/page.tsx`の`PastRaceDetail`コンポーネントに以下を追加：

```typescript
const PastRaceDetail = ({ pastRaces }: { pastRaces: PastRace[] }) => {
  console.log('PastRaceDetail - pastRaces件数:', pastRaces?.length || 0);
  console.log('PastRaceDetail - pastRaces:', pastRaces);
  
  if (!pastRaces || pastRaces.length === 0) {
    return <div className="text-slate-500 text-sm p-4">過去走データなし</div>;
  }
  // ...
};
```

## 結論

1. **API側**: 複数の過去走を正しく取得・返却している（`LIMIT 5`）
2. **データベース**: 複数の過去走データが存在している
3. **フロントエンド**: `PastRaceDetail`コンポーネントは全件を表示するロジックになっている

**問題の可能性:**
- APIレスポンスが正しくフロントエンドに渡されていない
- または、特定の馬で過去走データが1件しかない

**次のステップ:**
1. ブラウザのコンソールで`fetchRaceCard response`を確認
2. `PastRaceDetail`コンポーネントにデバッグログを追加
3. 複数の過去走がある馬で実際に表示を確認




















