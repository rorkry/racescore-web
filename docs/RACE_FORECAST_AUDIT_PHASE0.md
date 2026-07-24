# 展開予想ロジック監査（PHASE 0〜1）

対象ブランチ: `feature/rebuild-race-forecast-logic`（作成時 main = `baa419e`）
監査日: 2026-07-25
検証スクリプト: `scripts/audit-forecast-logic.ts`（`npx tsx scripts/audit-forecast-logic.ts`）

> **本監査時点で本番経路のロジックは一切変更していない。**

---

## 0. 結論サマリ（最重要3点）

### (1) 能力値が全馬 100 に飽和し、指数の差が完全に消えている【実測確認済み】

`lib/race-simulator/capability-analyzer.ts` の全5能力関数が、末尾で
`score = score / weight * 100` を実行している（L106-108, 176-178, 246-248, 308-310, 369-371）。

`score` は既に「Σ(factorScore × weight)」＝加重和であるため、正しい加重平均は `score / weight` で
すでに 0〜100 スケールになっている。そこへ **さらに ×100** しているため、ほぼ全ケースで
1000〜16500 のような値になり `Math.min(100, ...)` で **100 に張り付く**。

実測（`scripts/audit-forecast-logic.ts` 検証1）:

| 入力 | startSpeed | cruiseSpeed | acceleration | stamina | cornerSkill | dynamics ability |
|---|---:|---:|---:|---:|---:|---:|
| S級 (T2F22.0 / potential9.5 / L4F50 / makikaeshi8.0) | 100 | 100 | 100 | 100 | 100 | 1.0000 |
| 平均 (T2F24.0 / potential5.0 / L4F46 / makikaeshi3.0) | 100 | 100 | 100 | 100 | 100 | 1.0000 |
| 最低 (T2F27.0 / potential1.0 / L4F40 / makikaeshi0.5) | 100 | 100 | 100 | 100 | 100 | 1.0000 |
| 過去走なし（全 null） | 50 | 50 | 50 | **100** | 50 | 0.5750 |

**帰結:**
- T2F・L4F・potential・makikaeshi・PFS の値は **予想着順に一切影響していない**（全馬同一値になる）。
- 能力差が残るのは「データが有るか無いか」の二値だけ。
- `stamina` は `raceCount` 分岐が常に `weight += 0.4` されるため（L305-306）、
  **過去走ゼロでも 100** になる。欠損馬が最も有利な扱いを受ける単独項目。

### (2) 指数欠損馬が、優秀馬より前の隊列を取る【実測確認済み】

`calculateLeadingIntention`（`lib/race-simulator/data-fetcher.ts:331-351`）:

```
score = 50                                  // default
if (indices.pfs !== null) score = indices.pfs   // 実データは 0〜10 スケール
if (corner1.length > 0) score = score * 0.7 + frontRatio * 30
```

コードは PFS を 0〜100 と仮定（`capability-analyzer.ts:74` に明記）しているが、
**実データは 0〜10**（`pages/api/race-card-with-score.regression.test.ts:535-541` の実測レンジ 1.8〜6.2、
`lib/research-agent/condition-generator.ts:32-38` も 0.0〜10.0 と記述）。

そのため「PFS 欠損 → default 50」の方が「PFS 実データ 8.0」より**大きい値**になる。

実測（検証5、startSpeed は全馬 100 に飽和済みとして `start-phase.ts:80-95` の式を適用）:

| シナリオ | leadingIntention | startDashScore |
|---|---:|---:|
| B: **PFS欠損** + 1角前(1,2,2) | **65.00** | **99.50** |
| A: PFS優秀8.0 + 1角前(1,2,2) | 35.60 | 90.68 |
| C: PFS欠損 + 1角中団(6,7,6) | 35.00 | 80.50 |
| D: PFS欠損 + 1角後方(14,15,13) | 35.00 | 80.50 |
| E: PFS優秀8.0 + 1角後方(14,15,13) | 5.60 | 71.68 |

**帰結:** 同じ先行実績でも PFS 欠損馬が優秀馬を **+8.82** 上回る。
「評価材料のない馬が1頭だけ突き抜ける」症状の主要因。
さらに C と D が同値（中団と後方が区別できない）— `frontRatio` は「1角3番手以内の回数比」だけを見るため、
6番手と14番手の差が消える。

### (3) 後半の追い上げモデルは計算後に破棄されている

`lib/race-simulator/engines/straight-phase.ts` は L54-183 で `finalChaseScore` を
（acceleration・スタミナ・ペース・トラックバイアス・坂から）約130行かけて算出するが、
距離更新は L206-213 で **全馬に同一の `straightRun` を加算**するだけ:

```206:213:lib/race-simulator/engines/straight-phase.ts
  const maxCornerDistance = Math.max(...horses.map(h => h.currentDistance));
  const straightRun = Math.max(0, endDistance - maxCornerDistance);

  for (const horse of horses) {
    horse.currentDistance = Math.min(endDistance, horse.currentDistance + straightRun);
  }
```

`finalChaseScore` は `currentVelocity`（表示用の数値）にしか反映されない（L188-196）。
**直線での差し・追い込みは着順に 0 の影響**。着順はコーナー終了時点の距離順で確定している。

---

## 1. 現在使われている全入力（PHASE 0 表）

「重み」は最終着順への実効的な影響。上記(1)の飽和により、**指数系はすべて実効 0**。

| 入力 | 正本フィールド | 有利方向 | 欠損時処理 | 使用箇所 | 現在の実効重み | 重複先 |
|---|---|---|---|---|---:|---|
| T2F | `indices."T2F"` → `avgData.T2F` | **小=速い**（正しく実装） | `\|\| null`（0もnull化）`data-fetcher.ts:220,231` | startSpeed 60%, cruiseSpeed 30% | **0**（飽和） | startSpeed / cruiseSpeed の2経路 |
| L4F | `indices."L4F"` → `avgData.L4F` | **コード上は大=良**（要確認・§4） | 同上 `data-fetcher.ts:221,232` | acceleration 60% | **0**（飽和） | acceleration → corner加速 → straight chase |
| potential | `indices.potential` | 大=良 | `filter(v => v !== null)` | cruiseSpeed 70%, stamina 60% | **0**（飽和） | **cruiseSpeed と stamina の2経路** |
| makikaeshi | `indices.makikaeshi` | 大=良 | 同上 | acceleration 40% | **0**（飽和） | acceleration経由でL4Fと合流 |
| pfs（過去先行力） | `indices.pfs_past`（SQLで `as pfs`） | 大=先行 | `avgData.pfs \|\| 50` `orchestrator:145` / `leadingIntention` default 50 | startSpeed 20%, leadingIntention, start-phase +8/+4 | **中（唯一の実効差別化要因だが逆方向）** | **3経路（§9）** |
| cushion | `indices.cushion`（前走のみ） | 大=良馬場向き | `\|\| null` | cornerSkill 30% | **0**（飽和） | — |
| revouma | `indices.revouma` | 不明 | `\|\| null` | **取得のみ・未使用** | 0 | — |
| corner_lane | `indices.corner_lane`（0内〜4外） | 小=内 | — | **simulator は未フェッチ** | 0 | — |
| revouma2 | `indices.revouma2` | 不明 | — | **simulator は未フェッチ** | 0 | — |
| 過去コーナー通過順 | `umadata.corner_1..corner_4` | 小=前 | `parseInt \|\| null`, 空配列 | cornerSkill 70%（飽和）, leadingIntention の frontRatio, `pastPositionPattern` → start +10 | **中（frontRatio のみ実効）** | cornerSkill / leadingIntention / pattern の3経路 |
| 頭数 | `umadata.field_size` | — | — | **simulator 未使用**（通過順を正規化していない） | 0 | — |
| 近走前半ペース | `umadata.pci`/`rpci`/`pci3`, `lap_time` | — | — | **simulator 未使用**（computeKisoScore と saga-ai のみ） | 0 | — |
| 近走後半ペース / 上がり3F | `umadata.last_3f` | 小=速い | — | **simulator 未使用** | 0 | — |
| 前走着順 | `umadata.finish_position` | 小=良 | — | **simulator 未使用**（competitionScore 内のみ） | 0 | — |
| 着差 | `umadata.margin` | 小=良 | — | **simulator 未使用** | 0 | — |
| クラスタタイム | `getClusterData()` | — | — | **未接続**（computeKisoScore の cluster は固定3点 `getClusterData.ts:463-464`） | 0 | — |
| 競うスコア | `computeKisoScore` → `HorseState.competitionScore` | 大=良 | undefined 維持 | **表示隊列補正のみ**（`ai-position-adjust.ts`） | 0（着順） | — |
| scoreDeviation | 同サービス | 大=良 | undefined | **未使用** | 0 | — |
| 枠順 | `wakujun.waku` | コース依存 | — | start-phase のタイブレーク（`waku*0.05`, `*0.08`, 内枠先処理） | **小（実効あり）** | — |
| 馬番 | `wakujun.umaban` | — | — | identity、`gateIndex = horseNumber - 1` `race-3d-integration.ts:438` | — | **waku ではなく umaban を横位置に使用** |
| 芝/ダート | `distance` 文字列先頭 | — | — | コース解決のみ | 0 | — |
| 距離 | `wakujun.distance` | — | — | コース解決、`avgData` の±200mフィルタ | 小 | — |
| 競馬場 | `wakujun.place` | — | — | コース解決 | 0（能力補正なし） | — |
| 内回り/外回り | `umadata.course_type`（「芝(内・外)」） | — | — | **simulator 未使用**（geometry は place+距離から推定） | 0 | — |
| 馬場状態 | `umadata.track_condition` | — | — | **simulator 未使用** | 0 | — |
| 脚質 | 導出値 | — | — | `inferRunningStyleFromRankRatio(start-phase position)` | 大（dynamics 挙動） | start-phase position に完全依存 |
| raceKey 由来乱数 | `hashString(sim.raceKey)` `race-3d-integration.ts:485` | — | — | — | **旧2D=0 / dynamics=±0.8%速度**（§7） | — |

---

## 2. 各入力の正本フィールド（DB → JS）

| DB | JS（simulator） | 備考 |
|---|---|---|
| `indices."T2F"` | `HorseIndices.avgData.T2F` / `.T2F`（前走） | `mapIndicesRow` は同名 1:1 `lib/indices-columns.ts:69-80` |
| `indices."L4F"` | `avgData.L4F` / `.L4F` | 同上 |
| `indices.potential` | `avgData.potential` | |
| `indices.makikaeshi` | `avgData.makikaeshi` | |
| `indices.pfs_past` | `avgData.pfs` / `.pfs` | **SQL で `pfs_past as pfs` にリネーム** `data-fetcher.ts:164,206` |
| `indices.cushion` | `.cushion`（**前走のみ・平均なし**） | |
| `indices.revouma` | `.revouma`（未使用） | |
| `umadata.corner_1..4` | `pastPositions.corner1..4[]`, `lastRace.corner1/2` | |
| `wakujun.waku/umaban/umamei/kinryo` | `HorseState` | |

**型定義の所在:** `HorseIndices` は `types/race-simulator.ts` ではなく
`lib/race-simulator/data-fetcher.ts:7-46` に定義されている。

---

## 3. PFS過去の正確なカラム名・算出式

| 項目 | 結論 |
|---|---|
| **DBカラム名** | **`indices.pfs_past`**（これが唯一のPFS系カラム。`pfs` という独立カラムは存在しない） |
| **JSプロパティ** | `IndicesValues.pfs_past`（`lib/indices-columns.ts:61`）/ simulator では `pfs`（SQLエイリアス） |
| **算出式** | **コードベース内に実装は存在しない。** 外部CSV（`C:\keiba_data\PFS過去`）から取込むだけ（`tools/upload-indices.ts:23`）。設計書 `docs/RACE_SIMULATOR_DESIGN.md:293-296` の `calculatePFS()` は未実装 |
| **値域** | **実データは 0〜10**（テスト実測 1.8〜6.2、research-agent の記述 0.0〜10.0） |
| **方向** | **大=先行力高**（`lib/indices-columns.ts:38-44`, `pages/api/upload-indices.ts:13-14`） |
| **使用走数** | `avgData.pfs` = 距離±200m・同馬場の過去走の平均（最大10走分の indices）。`indices.pfs` = **前走のみ** |
| **重大な不整合** | コードは 0〜100 前提（`capability-analyzer.ts:74-75`, `data-fetcher.ts:334-336`, `start-phase.ts:91-94` の閾値 60/80）。実データ 0〜10 のため **start-phase の +8/+4 加点は永久に発火しない**（検証4で確認） |
| **バグ** | `createEmptyIndices` が `PFS: null`（**大文字**）を返す（`data-fetcher.ts:261`）。正しくは `pfs`。結果、過去走なし馬の `indices.pfs` は `undefined` となり、`undefined !== null` が true → `score = undefined` → **`leadingIntention = NaN`**（検証3で確認） |

---

## 4. T2F / L4F の現在の方向・正規化

| | T2F | L4F |
|---|---|---|
| **意味（コード記述）** | 前半2Fラップ（秒）`data-fetcher.ts:12` | 後半4F指数 `data-fetcher.ts:13` |
| **正規化** | 絶対値の分段線形（22.0秒→100点 … 26.0秒→20点）`capability-analyzer.ts:52-64`。**レース内相対化なし** | 絶対値の分段線形（50→95点 … 42→30点）`capability-analyzer.ts:197-210`。**レース内相対化なし** |
| **方向（実装）** | **小=高スコア**（正しい） | **大=高スコア** |
| **方向（他モジュール）** | 小=速い（`lib/ai-chat/system-prompt.ts:20`）→ 一致 | **小=速い**（`lib/ai-chat/system-prompt.ts:27`）→ **矛盾** |

**未解決の要確認事項（実装前に必須）:** `indices."L4F"` の実体が
「後半4Fのラップ秒（小=速い）」なのか「指数化された値（大=良）」なのか。
capability-analyzer とテストフィクスチャは「大=良」、AIプロンプトは「小=速い」で解釈が割れている。
T2F が秒（22〜27の範囲）で L4F が 40〜50 の範囲であることから、
**L4F は後半4Fのラップ秒（46.0秒等）である可能性が高く、その場合は現在の方向が反転している**。
→ 実データの分布確認（PHASE 1 の未完タスク・§14のSQL）で確定させる。

---

## 5. 近走通過順位と前半ペースの取得状況

### 通過順位

| 項目 | 状況 |
|---|---|
| DBカラム | `umadata.corner_1`, `corner_2`, `corner_3`, `corner_4`（現行CSV取込 `app/api/upload-csv/route.ts:381-384`） |
| 旧/別形式 | `passing_order`（"5-4-3-2"）+ `corner_4_position`（`app/api/init-db/route.ts` 系） |
| パーサ | `utils/parse-helpers.ts:83-117` `parsePassingOrder`, `:125-149` `getCornerPositions`（両形式対応） |
| **simulator の取得** | `corner_1..4` を **直接 parseInt**（`data-fetcher.ts:127-157`）。**`getCornerPositions` を使っていない** → `passing_order` 形式のみのレコードでは欠損する |
| **頭数正規化** | **していない**。`field_size` は simulator では未取得。生の順位（1〜18）をそのまま閾値比較 |
| **重大バグ（配列desync）** | `corner1..4` を**それぞれ独立に** `filter(NaN除去)` している（`data-fetcher.ts:152-156`）ため、配列長が揃わず `corner1[0]` と `corner2[0]` が**同一レースを指す保証がない**。`getPastPositionPattern(…, raceIndex)` は index 横断で結合するため誤ったパターンを生成しうる（`data-fetcher.ts:319-322`） |

### 前半ペース

| 項目 | 状況 |
|---|---|
| 利用可能データ | `umadata.pci`, `rpci`, `pci3`, `lap_time`（ラップ列 "12.3-10.5-…"）, `last_3f` |
| 既存のペース判定実装 | ① PCIベース: `getPaceCat(surface, dist, pci)` → 超ハイ/ハイ/ミドル/スロー/超スロー（`utils/getClusterData.ts:28-54`）。② ラップ列ベース: `lib/saga-ai/lap-analyzer.ts:103-128`（前半2F/3F/4F・後半3F/4F/5F を算出）、`:296-336`（ペース判定） |
| **simulator での利用** | **ゼロ**。`lib/race-simulator/**` に `pci` / `lap_time` / `track_condition` / `margin` の参照なし |

**→ 「ハイペースを前方で追走できたか」の判定に必要なデータは既に揃っており、判定ロジックも他モジュールに実装済み。simulator が使っていないだけ。**

---

## 6. 現在の finalStandings 数式

```
finalStandings = structuredClone(straightPhaseResult.horses)        // orchestrator:318
straightPhaseResult.horses[i].position = i + 1  (sort desc currentDistance)  // straight-phase:218-223

currentDistance(straight終了) = min(endDistance, currentDistance(corner終了) + straightRun)
straightRun = max(0, endDistance - max(currentDistance(corner終了)))   // 全馬同一

∴ 着順 = corner終了時点の currentDistance 降順
```

さらに遡ると:

```
currentDistance(start) = max(0, startEnd - (position_start - 1) * 2.5)      // start-phase:229-231
position_start ← startDashScore による椅子取り（枠番昇順で処理）             // start-phase:66-183
startDashScore = startSpeed*0.7 + leadingIntention*0.3
                 + (pattern が 1-/2-/3- で始まる ? 10 : 0)
                 + (pfs>=80 ? 8 : pfs>=60 ? 4 : 0)     // ← 実データ0-10のため常に0

formation / pace = 全馬同一距離加算 → currentDistance 降順で position 再ソート
                   （leadingIntention による position ±1 は距離に反映されないため実質無効）
corner  = 1秒刻みタイムステップ。唯一「距離差を生む」フェーズ
          targetVelocity = 14.5 * (1 + (cornerSkill-50)/100*0.15)   // cornerSkill=100 → 1.075（全馬同一）
          加速開始後 *= (1 + acceleration/100*0.12)                  // acceleration=100 → 1.12（全馬同一）
goal    = 表示用の距離補正のみ（着順不変）
```

**実効的には:**
`startSpeed = 100`（全馬飽和）、`cornerSkill = acceleration = 100`（全馬飽和）のため、
**着順を決めているのは `leadingIntention` と `pastPositionPattern` と `waku` のみ**。
`leadingIntention` は §0(2) の通り欠損馬有利に歪んでいる。

---

## 7. 現在の乱数寄与

| 経路 | 乱数 | 振幅 | シード |
|---|---|---|---|
| 旧2D（finalStandings を決める経路） | **なし**（`Math.random` 0件） | **0** | — |
| race-dynamics（表示用） | `reactionDelay` ジッター | **U(−0.08, +0.08) 秒** | `horseRng(seed, horseId)` = mulberry32、`seed = hashString(raceKey)` |
| race-dynamics（表示用） | `abilityMod` ジッター | **U(−0.008, +0.008)** = 速度 **±0.8%** | 同上 |

**比較:**

| 要因 | 速度換算の効き |
|---|---|
| ability 差（0.575〜1.0 の実測レンジ） | **+4.25%** |
| **乱数（abilityMod）** | **±0.8%** |
| 脚質 early↔late 差（closer） | 最大 **±10.5%** |
| スタミナ枯渇 | 最大 **−20%** |
| 反応遅延中（t < reactionDelay） | **−75%** |

**評価:** 乱数そのものは小さい（±0.8%）。ただし
① 旧2D 着順は完全決定論であり乱数は着順に無関係、
② dynamics 側の着順は最終的に旧2D の finalStandings に上書きされる（§下記）ため、
**「乱数が突き抜けの原因」ではない。原因は §0(1)(2) の飽和と欠損fallback。**

---

## 8. 欠損 fallback 一覧

| 箇所 | 処理 | 欠損馬への影響 |
|---|---|---|
| `capability-analyzer.ts:36,121,188,259,323` | `score = 50` 初期値 | 全因子欠損 → 50。**データあり馬は 100 に飽和するため、実質「欠損=50 / 有=100」の二値** |
| `capability-analyzer.ts:305-306` | `raceCount` 分岐が**常に** `weight += 0.4`、実績0でも `raceCountScore = 40` | **stamina が過去走ゼロでも 100**。単独で最も有利な欠損扱い |
| `data-fetcher.ts:220-221` | `filter(v => v !== null && v > 0)` | T2F/L4F の 0 を欠損扱い |
| `data-fetcher.ts:231-237,240-242` | `\|\| null` | **数値 0 を null に変換**（potential/makikaeshi/pfs 含む） |
| `data-fetcher.ts:261` | **`PFS: null`（大文字typo）** | `indices.pfs = undefined` → `leadingIntention = NaN` |
| `data-fetcher.ts:332-337` | `score = 50` → `if (indices.pfs !== null) score = indices.pfs` | **欠損時 50 が実データ(0〜10)より高い＝欠損有利** |
| `simulation-orchestrator.ts:145` | `pfs = indices.avgData.pfs \|\| 50` | 同上。かつ `0` も 50 に化ける |
| `simulation-orchestrator.ts:122` | `parseFloat(kinryo) \|\| 55.0` | 斤量欠損 → 55kg |
| `race-3d-integration.ts:126-128,169-171,427-430` | `cap.* ?? 50` | 表示用のみ |
| `forecast-layout-to-3d.ts:196-197` | `scorePct/l4Pct ?? 50` | ゴール位置予測で中位扱い |
| `getClusterData.ts:463-464` | `cluster` スコア **固定3点** | 全馬同一（実装されていない） |

---

## 9. 重複加点一覧

| 指数 | 経路1 | 経路2 | 経路3 |
|---|---|---|---|
| **potential** | cruiseSpeed 70%（`capability-analyzer.ts:127-148`） | **stamina 60%**（`:265-283`） | — |
| **T2F** | startSpeed 60%（`:42-68`） | **cruiseSpeed 30%**（`:154-171`） | — |
| **L4F** | acceleration 60%（`:194-215`） | → corner 加速 `*0.12`（`corner-phase.ts:330`） | → straight `chaseScore` 基底（`straight-phase.ts:58`、**着順には無反映**） |
| **makikaeshi** | acceleration 40%（`:220-241`） | 上記 L4F 経路と合流 | — |
| **pfs** | startSpeed 20%（`:73-77`、avgData） | `leadingIntention`（`data-fetcher.ts:335`、**前走値**） → startDash 30% | start-phase 直接 +8/+4（`start-phase.ts:91-95`、avgData） |
| **過去コーナー通過順** | cornerSkill 70%（`:329-352`、corner2/3/4平均） | `leadingIntention` の frontRatio（corner1） | `pastPositionPattern` → start +10（`start-phase.ts:83-88`） |
| **競うスコア** | 表示隊列補正のみ（`ai-position-adjust.ts`） | — | — |

**注:** 現状は飽和により全経路が実効 0 のため「二重加点による歪み」は顕在化していないが、
飽和を修正した瞬間に **potential が cruise と stamina の両方に、T2F が start と cruise の両方に効く**
二重計上が顕在化する。新設計では成分を Phase へ排他配分する必要がある。

---

## 10. 極端な馬が1着になりうる経路

| # | 経路 | 機構 | 深刻度 |
|---|---|---|---|
| 1 | **PFS欠損 → leadingIntention default 50** | `data-fetcher.ts:332-337`。実データ 0〜10 より高い値になり、指数欠損馬が startDash で上位 → start 隊列前方 → corner 先頭維持 → **1着**（§0(2) 実測 +8.82） | **最重要** |
| 2 | **能力飽和で差がつかない** | `capability-analyzer.ts` の `/weight*100`。全馬 100 → corner での能力差ゼロ → start 隊列の順序がそのまま着順になる | **最重要** |
| 3 | **stamina が欠損馬でも 100** | `:305-306`。corner の `staminaFactor = 1/max(0.5, stamina/100)` が最良値、加速条件 `staminaRemaining > 25` も通りやすい | 高 |
| 4 | **直線の追い上げが着順に無反映** | `straight-phase.ts:206-213`。コーナーで前に居た低評価馬が **そのまま逃げ切る**。差し馬の巻き返しが構造的に発生しない | **最重要** |
| 5 | **formation の位置変更が無効化** | `formation-phase.ts:168-184`。`position ±1` の後に `currentDistance` 降順で再ソートするため、意図した隊列変更が消える | 中 |
| 6 | **`leadingIntention = NaN`** | `createEmptyIndices` の `PFS` typo。`startDashScore` が NaN → 全閾値比較が false → 特定分岐（`totalHorses*0.6`）に落ちる。決定論的だが説明不能 | 中 |
| 7 | **中団と後方が区別不能** | `frontRatio` は「1角3番手以内の比率」のみ。6番手と14番手が同値（検証5 の C/D） | 中 |
| 8 | **corner配列 desync** | `data-fetcher.ts:152-156`。`corner1[0]` と `corner2[0]` が別レースになり得る → 誤ったパターン → 誤った +10 加点 | 中 |
| 9 | **同距離タイの安定ソート** | `sort((a,b) => b.currentDistance - a.currentDistance)`。差 0 のとき入力配列順（馬番順）が残る | 低 |
| 10 | **表示側の強制収束** | `convergeFrameToPredictedFinish`（`forecast-layout-to-3d.ts:485-507`）が leaderProgress 0.90→1.00 で予想着順へ remap。dynamics と予想が乖離していると **最大でパック前後幅（数十m）の縦移動** | 高（見た目） |

---

## 11. 利用可能だが現在未使用の有効データ

| データ | 正本 | なぜ有効か | 既存実装の再利用先 |
|---|---|---|---|
| **`umadata.last_3f`（上がり3F）** | `umadata.last_3f` | **後半性能の最も直接的な実測値**。L4F の方向論争を回避できる | saga-ai |
| **`umadata.pci` / `rpci` / `pci3`** | 同 | 過去走の**前半ペース**判定（ハイ/スロー） | `getPaceCat`（`getClusterData.ts:28-54`） |
| **`umadata.lap_time`（ラップ列）** | 同 | 前半2F/3F/4F・後半3F/4F/5F を直接算出可能 | `lap-analyzer.ts:103-128, 296-336` |
| **`umadata.field_size`（頭数）** | 同 | 通過順位の正規化に必須（現在生順位のまま） | computeKisoScore `:477-482` |
| **`umadata.margin`（着差）** | 同 | 「ハイペース先行で小さな着差に耐えた」の判定 | computeKisoScore |
| **`umadata.finish_position`** | 同 | 前半→ゴールの順位変化（維持力） | computeKisoScore |
| **`umadata.track_condition`（馬場）** | 同 | 馬場適性補正 | race-level, horses/detail |
| **`umadata.course_type`（内・外）** | 同 | 内回り/外回り適性 | horses/detail |
| **`indices.corner_lane`（0内〜4外）** | 同 | 4角のコース取り（距離ロス） | upload-indices, research-agent |
| **`indices.revouma` / `revouma2`** | 同 | 取得済み（revouma）だが未使用 | research-agent |
| **`computeKisoScore` の breakdown** | `KisoScoreBreakdown` | **Phase への成分排他配分**に使える（comeback/potential/finish/margin/passing/positionImprovement/paceSync/courseFit/penalty + details.forwardRate 等） | `getClusterData.ts:321-342` |
| **`race_levels`** | `race_levels` テーブル | 過去走のレース質補正 | race-card, saga-ai |
| **racecourse-geometry** | `lib/racecourse-geometry/*` | 直線長・高低差・コーナー数・走路幅・回り・芝スタート区間（36 geometry / 10場） | 3D 描画で既に使用 |

---

## 12. 前半・道中・後半モデルの具体案

### 共通基盤（PHASE 8 の純粋関数）

```ts
// すべてレース内相対化。方向は「良い=1 / 悪い=0」に統一
normalizeLowerIsBetter(values, i)   // T2F, last_3f, margin など
normalizeHigherIsBetter(values, i)  // potential, makikaeshi, pfs など
weightedRecentAverage(samples, weights)  // recency weighting
reliabilityFromSampleSize(n)        // 1走=低, 5走=高
winsorizeWithinRace(values, p)      // 外れ値clamp（例 5/95 percentile）
neutralForMissing()                 // レース内 neutral = percentile 0.5 相当 + reliability 0
```

**recency weight（初期提案・要データ確認）:** 前走 1.00 / 2走前 0.75 / 3走前 0.55 / 4走前 0.35 / 5走前 0.20。
条件差（距離差・芝ダ差・馬場差・クラス差）で weight をさらに減衰させる乗算補正を持たせる。

**信頼度の持ち方:** 全 metric を `{ value: number /*0..1*/, reliability: number /*0..1*/ }` で保持。
欠損は `value = 0.5（neutral）, reliability = 0`。**欠損に default 50 を「値」として与えない**
（現行の最大の欠陥を構造的に排除）。

### PHASE 2: 前半位置取り `earlyPositionScore`

```
frontRatio_r  = 1 - (cornerPos_r - 1) / max(fieldSize_r - 1, 1)     // 1=前, 0=後
                cornerPos は corner_2 を主軸（1角は出遅れノイズが大きい）、
                欠損時 corner_1 → corner_3 の順にフォールバック
paceOfRace_r  = normalizedEarlyPace(pci_r or lap_time前半3F)         // 1=ハイペース
earlyPressure = Σ_r w_r · frontRatio_r · (0.6 + 0.4 · paceOfRace_r)  // ハイペース前方を加点、スロー前方は控えめ
                ただし frontRatio_r < 0.5（後方）の場合は paceOfRace を掛けない（先行力の証拠にしない）

earlyPositionScore =
    w1 · earlyPressure
  + w2 · normalizeLowerIsBetter(T2F)          // 小=速い（現行どおり）
  + w3 · normalizeHigherIsBetter(pfs_past)    // ★percentile化。絶対値0-100前提を廃止
  + w4 · recentStyleConsistency               // 脚質の一貫性（乖離が大きいほど reliability↓）
  + courseStartAdjustment(枠, 初角距離, 芝スタート区間)
```

各項は `clamp` し、単一 factor の最大寄与を上限化（PHASE 8）。

### PHASE 3: 道中維持力 `midRaceRetentionScore`

```
// 符号を明示: retention > 0 = 位置を維持/改善できた
retention_r = frontRatio_finish_r - frontRatio_early_r
              frontRatio_finish_r = 1 - (finish_position_r - 1)/(fieldSize_r - 1)
              frontRatio_early_r  = 上記 corner_2 由来

// 「ハイペースを先行して小さな着差に耐えた」を高評価
enduranceEvidence_r = frontRatio_early_r · paceOfRace_r · normalizeLowerIsBetter(margin_r)

midRaceRetentionScore =
    v1 · Σ_r w_r · retention_r
  + v2 · Σ_r w_r · enduranceEvidence_r
  + v3 · normalizeHigherIsBetter(potential)        // ★potential は道中に排他配分
  + v4 · distanceFit(過去走距離との差)
  + v5 · surfaceFit / trackConditionFit
  + courseRetentionAdjustment(高低差, ゴール前坂, コーナー数)
```

**「前半だけ速いが毎回止まる馬」対策:** `retention_r` が負の馬は `earlyPositionScore` が高くても
`midRaceRetentionScore` で相殺され、逃げ切り候補にならない。

### PHASE 4: 後半追い上げ `lateKickScore`

```
lateKickScore =
    u1 · normalizeLowerIsBetter(last_3f_補正済)   // ★上がり3F（DB実測値・方向が明確）
  + u2 · normalizeXIsBetter(L4F)                  // ★方向は §4 の確定後に決定
  + u3 · competitionLateComponent                 // 競うスコアの後半成分のみ（下記）
  + u4 · (1 - earlyEffortCost)                    // 前半消耗が大きいほど後半減衰
  + courseLateAdjustment(直線長, ゴール前坂)
```

**競うスコアの成分排他配分（二重加点防止）:**

| Phase | 使用する `KisoScoreBreakdown` 成分 |
|---|---|
| 前半 | `passing`, `paceSync`（通過順×ペース）, `details.forwardRate` |
| 道中 | `potential`, `positionImprovement`, `courseFit` |
| 後半 | `comeback`(makikaeshi), `margin`, `finish`, `cluster` |
| 全体信頼度のみ | `total`（= competitionScore）は**加点に使わず reliability の重みとしてのみ使用** |

→ `total` をそのまま重ねない。`breakdown` を simulator へ渡す必要があるため、
共有 competition score service から **internal-only の optional データ**として渡す
（公開 API 形式は不変・後方互換維持）。

### PHASE 6: 最終着順の生成

3 Phase スコア → dynamics パラメータへ写像し、**dynamics の実ゴール順を finalStandings とする（案B）**。

```
earlyPositionScore   → reactionDelay, startBoost, earlySpeedMul, 初期隊列目標
midRaceRetentionScore→ staminaBase, drainFactor, 中盤 targetSpeed
lateKickScore        → lateSpeedMul, 追い上げ開始地点, 1Fごとの進出量
courseAdjustment     → 各 Phase への乗算補正（設定テーブル分離）
```

---

## 13. A / B どちらの最終順位方式を推奨するか

## **案B を推奨**（新Phaseスコアを dynamics の能力・進出量へ反映し、dynamics の実ゴール順を finalStandings とする）

### 理由

1. **強制ワープの原因を構造的に消せる。**
   現在 `convergeFrameToPredictedFinish` が leaderProgress 0.90→1.00 で
   「順序統計量の再割当」を行い、乖離時に**最大でパック前後幅（数十m）の縦移動**を起こす
   （`forecast-layout-to-3d.ts:485-507`）。案B では finalStandings が dynamics 出力そのものなので、
   この収束は**恒等変換（no-op）**になり、最終100mのワープが原理的に発生しない。

2. **`unifyFinishOrderWithPrediction` の finishTime 差し替えが不要になる。**
   現在は dynamics の finishTime を昇順ソートして予想着順へ**割り当て直している**
   （`race-3d-integration.ts:526-534`）。案B では dynamics の finishTime がそのまま正本になり、
   「着順とタイムの整合」が自明に保たれる。

3. **説明可能性が高い。** 「なぜ3着か」を「前半◯番手→道中維持→直線で△m進出」という
   一本の物語で説明できる。案A は「スコアで先に順位を決め、あとで動きを合わせる」ため、
   表示とスコアの因果が逆転し、乖離時の説明が不可能。

4. **ユーザー要件との一致。** 「最終順位だけを別の配列で作り 90〜100%地点で強制収束させる構造は
   極端な突き抜けの原因になり得る」という指摘に対する直接的な解。

### 案B のリスクと対策

| リスク | 対策 |
|---|---|
| dynamics の決定論性が着順の正本になる | seed は `raceKey` 由来で固定（既に決定論）。乱数振幅を PHASE 7 の上限（総合5%以下）に制限し、**能力差を逆転できない**ことをテストで保証 |
| 既存テストが finalStandings 起点の finishTargets を検証している（`align-finish-and-gates.test.ts` 49件等） | `convergeFrameToPredictedFinish` は**残す**が、案B では入力が一致するため出力不変（恒等）。既存テストは「収束後も順位が finalStandings と一致」を検証しており、案B でも成立 |
| tracking / camera / display frame との整合 | `resolveDisplayFrame` が単一経路（`display-frame.ts:46-74`）であることを確認済み。案B は正本を一本化するので整合はむしろ単純化 |
| 3D 表示のない経路（旧2D の phases 出力を使う UI）がある | phases 出力は維持し、新ロジックは phases の**中身**を置き換える形にする |
| 新ロジック不調時に着順が出ない | feature flag `RACE_FORECAST_MODEL=v2` + 失敗時は旧ロジックへ fallback（理由を1回だけログ） |

**補足:** 予想着順（finalStandings）という API フィールドは**残す**。
中身の生成元が「別スコア配列」から「dynamics 実結果」に変わるだけで、公開形式は不変。

---

## 14. 過去レース検証に利用できるデータ量

### コードから確定できる数値

| 項目 | 値 | 出所 |
|---|---|---|
| umadata 行数（過去記録） | **47,179 行 / 11,808 頭 / 平均4.0走** | `PAST_RACES_ISSUE_RESOLVED.md:26-28,63-66`（SQLite時代の記録） |
| indices 取込下限年 | **2024年以降のみ** | `tools/upload-indices.ts:32`（`MIN_YEAR = 2024`） |
| スコア計算の使用走数 | 最大50走 / 指数は直近10走 | `lib/server/competition-score-service.ts:288-291` |

### 要確認（本番Postgresの実件数はコードから不明）

**未実行。実装前に要計測:**

```sql
SELECT COUNT(*) AS rows, COUNT(DISTINCT race_id) AS races,
       MIN(SUBSTRING(race_id,1,8)) AS min_date, MAX(SUBSTRING(race_id,1,8)) AS max_date
FROM umadata WHERE race_id ~ '^\d{8}';

-- 指数カバレッジ（新ロジックの入力充足率）
SELECT COUNT(*) FROM indices;
SELECT COUNT(DISTINCT SUBSTRING(race_id,1,16)) AS races_with_index FROM indices;

-- 各入力の充足率（新ロジックの設計判断に直結）
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE corner_2 ~ '^[0-9]+$')      AS has_corner2,
  COUNT(*) FILTER (WHERE field_size ~ '^[0-9]+$')    AS has_fieldsize,
  COUNT(*) FILTER (WHERE pci IS NOT NULL AND pci <> '')       AS has_pci,
  COUNT(*) FILTER (WHERE last_3f IS NOT NULL AND last_3f <> '') AS has_last3f,
  COUNT(*) FILTER (WHERE lap_time IS NOT NULL AND lap_time <> '') AS has_lap,
  COUNT(*) FILTER (WHERE margin IS NOT NULL AND margin <> '')     AS has_margin,
  COUNT(*) FILTER (WHERE track_condition IS NOT NULL AND track_condition <> '') AS has_baba
FROM umadata;

-- L4F/T2F の実分布（§4 の方向確定に必須）
SELECT MIN("L4F"), PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "L4F"), MAX("L4F"),
       MIN("T2F"), PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "T2F"), MAX("T2F"),
       MIN(pfs_past), PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pfs_past), MAX(pfs_past)
FROM indices;

-- バックテスト対象（全馬に着順+タイムがあるレース）
SELECT COUNT(DISTINCT race_id) FROM umadata
WHERE finish_position ~ '^[0-9]+$' AND finish_time IS NOT NULL AND finish_time <> '';
```

**見込み:** indices が 2024年以降限定のため、**指数を使う新ロジックのバックテストは実質2024年以降**に限られる。
2024〜2026 の3シーズン・複数開催であれば数千レース規模が見込めるが、**実測が必要**。

---

## 15. 実装予定ファイル

| Commit | ファイル | 内容 |
|---|---|---|
| **1** | `docs/RACE_FORECAST_AUDIT_PHASE0.md`（本書） | 監査資料 |
| 1 | `scripts/audit-forecast-logic.ts` | 監査検証スクリプト（済） |
| 1 | `lib/race-forecast/normalize.ts` | `normalizeLowerIsBetter` / `normalizeHigherIsBetter` / `winsorizeWithinRace` / `neutralForMissing` |
| 1 | `lib/race-forecast/reliability.ts` | `reliabilityFromSampleSize` / `weightedRecentAverage` |
| 1 | `lib/race-forecast/types.ts` | `MetricValue { value, reliability }`, `HorseRaceSample`, `ForecastInputs` |
| 1 | `lib/race-forecast/*.test.ts` | 正規化・信頼度の単体テスト（方向/neutral/外れ値/8頭18頭/shuffle耐性） |
| **2** | `lib/race-forecast/config/weights.ts` | 全係数の集約（ハードコード禁止） |
| 2 | `lib/race-forecast/config/course-adjustments.ts` | コース補正テーブル（PHASE 5） |
| 2 | `lib/race-forecast/early-position.ts` | `earlyPositionScore`（PHASE 2） |
| 2 | `lib/race-forecast/mid-retention.ts` | `midRaceRetentionScore`（PHASE 3） |
| 2 | `lib/race-forecast/late-kick.ts` | `lateKickScore`（PHASE 4） |
| 2 | `lib/race-forecast/explain.ts` | 全馬診断（PHASE 9） |
| 2 | `lib/race-forecast/sample-builder.ts` | umadata + indices → `HorseRaceSample[]`（pci/lap_time/last_3f/field_size/margin を新規に活用） |
| **3** | `scripts/backtest-forecast.ts` | 旧新比較（PHASE 10・レース日時以前のみ使用を保証） |
| **4** | `lib/race-simulator/simulation-orchestrator.ts` | feature flag 分岐（`RACE_FORECAST_MODEL=v2`）+ 旧 fallback |
| 4 | `lib/race-forecast/to-dynamics.ts` | 3 Phase スコア → `HorseInput`（案B） |
| **5** | `lib/race-simulator/race-3d-integration.ts` | 案B での finalStandings 一本化（converge は恒等化） |

**修正が必要な既存バグ（Commit 1 or 独立commit で扱う）:**

| # | ファイル | バグ |
|---|---|---|
| B1 | `capability-analyzer.ts:106-108, 176-178, 246-248, 308-310, 369-371` | `score / weight * 100` の飽和（`/ weight` が正しい） |
| B2 | `data-fetcher.ts:261` | `PFS:` → `pfs:`（typo → NaN 発生） |
| B3 | `data-fetcher.ts:332-337`, `orchestrator:145` | PFS 欠損 default 50（実データ0〜10と不整合） |
| B4 | `capability-analyzer.ts:305-306` | `raceCount` が常に weight 加算（欠損馬 stamina=100） |
| B5 | `data-fetcher.ts:152-156` | corner 配列を独立 filter（desync） |
| B6 | `straight-phase.ts:206-213` | `finalChaseScore` が着順に無反映 |
| B7 | `data-fetcher.ts:127-157` | `getCornerPositions` を使わず `corner_1..4` 直読み（`passing_order` 形式で欠損） |

**重要:** B1〜B4 を単体で「修正」すると、飽和が解けた瞬間に §9 の二重加点が顕在化し、
挙動が大きく変わる。**新ロジック（v2）側で正しく作り直し、feature flag で切り替える**方針とし、
旧ロジックには手を入れない（回帰リスク回避）。

---

## 16. リスク

| # | リスク | 深刻度 | 対策 |
|---|---|---|---|
| R1 | **L4F の方向が未確定**（§4）。誤ると後半評価が完全反転 | **高** | 実装前に `indices."L4F"` の実分布を計測（§14 SQL）。決着まで後半モデルは `last_3f` 主軸で組む |
| R2 | **indices が2024年以降のみ** | 高 | バックテスト範囲を明示。それ以前は umadata 由来指標（last_3f/pci/corner/margin）のみで動く設計にし、指数欠損時も reliability 低で成立させる |
| R3 | **PFS の算出式がコードに存在しない**（外部CSV依存） | 中 | PFS は percentile 化して使い、絶対スケール前提を持たない。欠損は neutral + reliability 0 |
| R4 | 飽和修正で挙動が激変し既存の見た目・テストが壊れる | 高 | 旧ロジックは触らず v2 を別実装 + feature flag。既存テスト（33ファイル）を回帰基準として維持 |
| R5 | umadata スキーマが3系統存在（`corner_1..4` vs `passing_order`） | 中 | `getCornerPositions` を必ず経由（B7）。本番 `information_schema` で実カラム確認 |
| R6 | 案B で dynamics が着順の正本になるため、dynamics の欠陥が直接着順に出る | 中 | dynamics に未接続の `cornerSkill`/`acceleration` を接続。乱数上限をテストで固定 |
| R7 | 係数の過学習 | 中 | 係数は `config/weights.ts` に分離。バックテストは開催・距離・馬場をまたいで評価。テスト対象レースへの直接フィッティング禁止 |
| R8 | `computeKisoScore` の `cluster` が固定3点（未実装） | 低 | 後半成分として使えない。`getClusterData()` の実クラスタタイム比較を接続するか、後半成分から外す |
| R9 | scoreBreakdown を simulator へ渡す際の API 互換 | 低 | internal-only の optional フィールドとして渡す。公開レスポンス形式は不変 |
| R10 | 表示側の強制収束（数十mワープ）が案B移行まで残る | 中 | Commit 5 で恒等化。それまでは現状維持（既存挙動を壊さない） |

---

## 付録: 現在の表示パイプライン（案B移行時の変更点把握用）

| # | 変換 | 窓 | 対象 |
|---|---|---|---|
| 0 | `interpolateDynamics` | 常時 | 全座標 |
| 1 | `blendFrameFromStartGate` | `time < 5.0s`（hold 1.0s） | progress, lateral |
| 2 | `applyFormationBonus`（競うスコア） | leaderProgress 0.05→0.62 で 0 に戻る | progress のみ（前方向） |
| 3 | `blendFrameTowardForecastLayouts` | 0.70→0.88 上昇 / 0.90→1.00 減衰 | progress, lateral |
| 4 | **`convergeFrameToPredictedFinish`** | **0.90→1.00** | **progress のみ（最大 ±パック幅）** |

`unifyFinishOrderWithPrediction`（`race-3d-integration.ts:497-537`）は
`finishOrder` / `finishTime` を予想着順へ差し替える（フレームは触らない）。

**単一経路の確認:** 馬メッシュ・tracking・先頭ラベル・follow/broadcast カメラは
すべて `resolveDisplayFrame` → `interpolateDynamicsForDisplay` を経由（`display-frame.ts:4-14, 46-74`）。
