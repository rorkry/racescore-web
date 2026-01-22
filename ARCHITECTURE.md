# racescore-web アーキテクチャ図

## 依存関係グラフ

```mermaid
flowchart TB
    subgraph API["API Endpoints"]
        SAGA_API["pages/api/saga-ai.ts<br/>レースカード用おれAI"]
        HORSE_API["app/api/horses/detail/route.ts<br/>馬分析用おれAI"]
        LEVEL_API["app/api/race-level/route.ts<br/>レースレベル取得"]
    end

    subgraph SagaAI["lib/saga-ai/ (おれAI)"]
        BRAIN["saga-brain.ts<br/>SagaBrain<br/>メイン分析エンジン"]
        LAP["lap-analyzer.ts<br/>LapAnalyzer<br/>ラップ分析"]
        LEVEL["level-analyzer.ts<br/>analyzeRaceLevel<br/>レースレベル判定"]
        COURSE_M["course-master.ts<br/>COURSE_MASTER<br/>コース属性"]
    end

    subgraph CourseData["lib/course-data/"]
        COURSE_IDX["index.ts<br/>COURSE_DATABASE"]
        TURF_AB["turf-courses-ab.ts"]
        TURF_C["turf-courses-c.ts"]
        DIRT["dirt-courses.ts"]
    end

    subgraph Lib["lib/"]
        DB["db.ts<br/>PostgreSQL接続"]
        PREMIUM["premium.ts<br/>プレミアム判定"]
        RATE["rate-limit.ts<br/>レート制限"]
        COURSE_CHAR["course-characteristics.ts<br/>コース特性API"]
    end

    subgraph Utils["utils/"]
        PARSE["parse-helpers.ts<br/>データパース"]
        CLUSTER["getClusterData.ts<br/>競うスコア用"]
    end

    subgraph Types["types/"]
        COURSE_TYPE["course-characteristics.ts<br/>型定義"]
    end

    subgraph Database["Database (PostgreSQL)"]
        UMADATA[(umadata<br/>過去走)]
        WAKUJUN[(wakujun<br/>出馬表)]
        INDICES[(indices<br/>指数)]
        RACE_LEVELS[(race_levels<br/>レースレベル)]
        USERS[(users)]
        SUBSCRIPTIONS[(subscriptions)]
        APP_SETTINGS[(app_settings)]
    end

    %% API -> SagaAI
    SAGA_API --> BRAIN
    SAGA_API --> LAP
    SAGA_API --> LEVEL
    HORSE_API --> BRAIN
    HORSE_API --> LAP
    LEVEL_API --> LEVEL

    %% SagaBrain内部
    BRAIN --> LAP
    BRAIN --> COURSE_M

    %% コースマスター
    COURSE_M --> COURSE_IDX
    COURSE_CHAR --> COURSE_IDX
    COURSE_IDX --> TURF_AB
    COURSE_IDX --> TURF_C
    COURSE_IDX --> DIRT
    COURSE_IDX --> COURSE_TYPE

    %% Lib依存
    SAGA_API --> DB
    SAGA_API --> PREMIUM
    SAGA_API --> RATE
    HORSE_API --> DB
    PREMIUM --> DB

    %% Utils
    SAGA_API --> PARSE
    HORSE_API --> PARSE
    CLUSTER --> DB

    %% Database接続
    DB --> UMADATA
    DB --> WAKUJUN
    DB --> INDICES
    DB --> RACE_LEVELS
    DB --> USERS
    DB --> SUBSCRIPTIONS
    DB --> APP_SETTINGS
```

## SagaBrain処理フロー

```mermaid
flowchart LR
    INPUT["HorseAnalysisInput<br/>馬名/枠番/過去走/etc"]
    
    subgraph SagaBrain["SagaBrain.analyzeHorse()"]
        EVAL["evaluatePastRaces<br/>過去走評価"]
        TIME["analyzeTime<br/>時計評価"]
        LAP["analyzeLaps<br/>ラップ評価"]
        TAGS["generateTags<br/>特性タグ"]
        SUMMARY["generateAbilitySummary<br/>能力サマリー"]
    end

    OUTPUT["HorseAnalysisResult<br/>comments/warnings/tags<br/>timeEvaluation/lapEvaluation"]

    INPUT --> EVAL
    EVAL --> TIME
    EVAL --> LAP
    TIME --> TAGS
    LAP --> TAGS
    TAGS --> SUMMARY
    SUMMARY --> OUTPUT
```

## レースレベル判定ロジック

```mermaid
flowchart TD
    INPUT["NextRaceResult[]<br/>次走成績リスト"]
    
    COUNT["集計<br/>- 次走出走頭数<br/>- 好走数（3着以内）<br/>- 勝ち上がり数"]
    
    RATE["好走率計算<br/>= 好走数 / 出走頭数"]
    
    subgraph Level["レベル判定"]
        S["S: 80%以上"]
        A["A: 60%以上"]
        B["B: 40%以上"]
        C["C: 30%以上"]
        D["D: 20%以上"]
        LOW["LOW: 20%未満"]
        UNKNOWN["UNKNOWN: 母数1以下"]
    end

    PLUS["+ 判定<br/>勝ち上がり2頭→+<br/>3頭→++<br/>4頭→+++"]

    OUTPUT["RaceLevelResult<br/>level/levelLabel<br/>aiComment"]

    INPUT --> COUNT
    COUNT --> RATE
    RATE --> Level
    Level --> PLUS
    PLUS --> OUTPUT
```

## 年齢カテゴリ分類（ラップ比較用）

```mermaid
flowchart TD
    CLASS["class_name<br/>クラス名"]
    
    CHECK1{"'2歳'含む AND<br/>'新馬'含む?"}
    CHECK2{"'2歳' OR '3歳' OR<br/>'新馬' 含む?<br/>(3歳以上は除く)"}
    
    CAT1["2歳新馬"]
    CAT2["2・3歳"]
    CAT3["古馬<br/>(3歳以上/4歳以上/無指定)"]

    CLASS --> CHECK1
    CHECK1 -->|Yes| CAT1
    CHECK1 -->|No| CHECK2
    CHECK2 -->|Yes| CAT2
    CHECK2 -->|No| CAT3
```

## データフロー: レースカード → おれAI

```mermaid
sequenceDiagram
    participant Client as フロントエンド
    participant API as /api/saga-ai
    participant DB as PostgreSQL
    participant Brain as SagaBrain

    Client->>API: POST /api/saga-ai<br/>{raceKey, date, place, raceNo}
    API->>DB: wakujunから出走馬取得
    API->>DB: umadataから過去走取得
    API->>DB: indicesから指数取得
    API->>DB: race_levelsからキャッシュ取得
    
    loop 各馬
        API->>Brain: analyzeHorse(input)
        Brain->>Brain: evaluatePastRaces
        Brain->>Brain: analyzeTime
        Brain->>Brain: analyzeLaps<br/>(歴代比較)
        Brain->>Brain: generateTags
        Brain-->>API: HorseAnalysisResult
    end

    API-->>Client: 全馬の分析結果
```

## 主要用語対応表

| UI表示 | コード参照 | ファイル |
|--------|-----------|----------|
| おれAI | `SagaBrain` | lib/saga-ai/saga-brain.ts |
| レースレベル | `RaceLevelResult` | lib/saga-ai/level-analyzer.ts |
| ラップ分析 | `LapAnalyzer` | lib/saga-ai/lap-analyzer.ts |
| 時計評価 | `analyzeTime()` | lib/saga-ai/saga-brain.ts |
| 特性タグ | `generateTags()` | lib/saga-ai/saga-brain.ts |
| 競うスコア | `getClusterData()` | utils/getClusterData.ts |

## DBカラム対応表

| 項目 | 新フォーマット | 旧フォーマット |
|------|---------------|---------------|
| 馬番 | umaban | horse_number |
| 頭数 | field_size | number_of_horses |
| ラップ | lap_time | work_1s |
| 4角 | corner_4 | corner_4_position |
| 複勝下限 | place_odds_low | ― |
| 複勝上限 | place_odds_high | ― |
