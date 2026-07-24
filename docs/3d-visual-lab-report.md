# 3D競馬シミュレーター ビジュアル刷新 — 調査・監査・3案比較（中立版）

> ブランチ: `research/3d-visual-direction`（origin/main 起点） / **push済み・PR未作成・未merge**
> ステータス: **本番未統合 / main未変更**。比較用の独立サンドボックスと計測ハーネスのみ。
> Visual Lab: `/dev/race-visual-lab`（開発環境は常時、本番は `?debug=1` のときだけ表示）
> **推奨は単一案に絞らず、3軸で提示する（最終判断は実機比較後にユーザーが行う）。**

---

## 0. 起動と比較の手順（実機で見るための正本）

```bash
npm install
npm run dev
# ブラウザで:
#   http://localhost:3000/dev/race-visual-lab?debug=1
```

- **A/B/C切替**: 画面下の「ビジュアル案 (variant)」A:Cel / B:Semi / C:Data。切替でも**馬位置・カメラ・時刻・番号・枠色は変わらない**（変数はビジュアル方式だけ）。
- **プリセット**: P1〜P7 ボタン（下記）でワンクリック適用。
- **推奨viewport**: PC 1440×900 または 1280×720。モバイルは 390×844 で**レイアウト崩れの確認のみ**（情報量は無理に詰めない）。
- **静止再現**: `speed=0` で完全静止。スクリーンショットは speed=0 推奨。
- **固定URLコピー**: 「固定URLをコピー」ボタンで現在条件のURLを取得。同じURL=完全再現。

### 固定比較URL（例。`http://localhost:3000` を自分の環境に合わせる）

| プリセット | 条件 | URL |
|---|---|---|
| P1 | 芝14 直線密集 | `/dev/race-visual-lab?debug=1&variant=A&surface=turf&horses=14&scene=straight&speed=0&labels=all&hysteresis=1&selectedHorse=5&seed=1&view=default` |
| P2 | 芝14 コーナー | `...&scene=corner&...` |
| P3 | ダート14 ゴール前 | `...&surface=dirt&scene=finish&...` |
| P4 | 芝18 最大密集 | `...&horses=18&scene=dense&selectedHorse=9&...` |
| P5 | 拡大 側面 | `...&scene=straight&labels=selected&view=zoomSide` |
| P6 | 拡大 斜め前 | `...&view=zoomFront` |
| P7 | 拡大 斜め後ろ | `...&view=zoomRear` |

`variant=A|B|C` だけ差し替えれば、**同一条件で3案を撮り比べ**できる。

### URLパラメータ一覧

`variant=A|B|C` / `surface=turf|dirt` / `horses=8|14|18` / `scene=straight|corner|finish|dense` /
`speed=0|0.5|1` / `labels=all|selected|saddle|tracking` / `hysteresis=0|1` / `selectedHorse=<n>` /
`seed=<int>` / `view=default|zoomSide|zoomFront|zoomRear` / `benchmark=0|1` / `duration=<sec>` / `capture=0|1`

- 乱数は **seed固定の疑似乱数**（`Math.random` 不使用）。同一URLで world position / 番号 / 枠色 / 選択馬 / カメラ / FOV / 光源 / surface / animation phase が完全再現。

### 30秒ベンチ手順（実機）

1. 条件（variant/horses等）を設定。
2. 「30秒ベンチ（現在の頭数）」ボタン、または URL に `benchmark=1&duration=30`。
3. **最初の5秒はウォームアップ**（集計対象外）→ 30秒計測。
4. 終了後、**benchmark JSON** が textarea に出る（選択してコピー）。8/14/18 は `horses=` を変えて再実行すると JSON が配列で蓄積。

### 馬発見タスク手順

1. 「馬発見タスク開始」。上部に出る馬番を画面上でクリック。
2. 正解で次の問題へ。誤クリックは記録。最大8問（seed固定＝A/B/C同一出題順）。
3. 終了後に **タスクJSON**（average/median find time, wrong clicks, completion rate）。テスト中は対象馬を自動強調しない。
4. **相対比較用**であり厳密な学術実験ではない。

### スクリーンショット / 動画

- **単発**: 「現在の画面をPNG保存」（命名 `A-cel-straight-14.png` 等）。
- **captureモード**: HUD・操作・パネルを隠し、純粋な比較画像に（識別UIは案の一部として残す）。固定サイズボタン 1440×900 / 1280×720 / 390×844。
- **自動化（任意・未検証）**: `scripts/visual-lab-capture.mjs`。`npm i -D playwright && npx playwright install chromium` 後に `node scripts/visual-lab-capture.mjs`。出力は `visual-lab-output/{A,B,C,metrics,videos,console}`。`VIDEO=1` で録画。**Playwrightは依存に含めていない**（本体buildはPlaywright無しで成功）。

### headless FPS を正本にしない理由 / 実機条件の記録項目

- このリポジトリの CI やサンドボックスは **GPUが無く software rendering** になり得る。その FPS は実機WebGL性能と一致せず、比較を誤らせる。**FPSは必ず自分の実機ブラウザのHUD/JSONで測る**。
- `renderer.info.memory` の geometries/textures は three.js の管理数であり **GPUメモリ量ではない**（そう呼ばない）。GPUメモリは推測しない。
- 実機で記録すべき条件: **OS / ブラウザとversion / デバイス / CPU / GPU / devicePixelRatio / viewport / 省電力(power saving)の有無**。benchmark JSON には dpr/viewport を自動記録。残りは手記録。

---

## Phase 1: リサーチ（一次情報ベース）

### 競馬ゲーム
- **Rival Stars Horse Racing（PikPok）**: 公式に「モーションキャプチャ走行アニメ」「シネマティックなレース」。
  - <https://pikpok.com/news/horse-racing-press-release/> / <https://store.steampowered.com/app/1166860/Rival_Stars_Horse_Racing_Desktop_Edition/> / <https://rivalstarshorseracing.com/2024/11/06/rival-stars-horse-racing-vr-edition-developer-blog-inside-the-stable/>
  - 原則: 「馬らしさ」は形状より**走行アニメ**で決まる。コピー不可（モデル/テクスチャ/mocap/UI）。
- **ダービースタリオン2（Switch2, 2026-09-24, 開発ランド・ホー）**: 公式に **「3Dセルルック × トラッキング表示」**。
  - <https://www.nintendo.com/jp/topics/article/7f47014c-52eb-4518-ac0e-0fd291a4fb5f> / <https://prtimes.jp/main/html/rd/p/000000020.000022342.html>
  - 原則: 3Dセルルック（3DCG＋アニメ調の影・輪郭線）＋位置を読ませる情報表示。案A/案Cの併用方針を裏付ける。
- Winning Post系: 3D＋情報オーバーレイが一般的傾向（個別の公式技術仕様は未確認＝**非公式扱い**）。

### JRAトラッキング（中継）
- ゼッケンにセンサー（左右2台/約100g）、**RTK-GNSSで0.1秒**測位→オーバーレイで中継映像に位置/タイム差を合成。2023年春〜、対象拡大中。
  - <https://own.jra.jp/kouza/yougo/w590.html> / <https://xtech.nikkei.com/atcl/nxt/column/18/02692/121800003/> / <https://www.meeq.com/meeq/casestudy/0016.html> / <https://www.sanspo.com/race/article/general/20260602-GZTMZJED3FNDLNNWMXU7A6RFSA/>
  - 決定的根拠（MEEQ）: 「全体を映すと各馬が小さく、寄ると位置関係が分からない」→ **情報層を重ねる**。

### 動く対象のラベル配置（学術）
- フレーム単位最適化は**ちらつき/跳び**を生む→**時間的コヒーレンス/ヒステリシス**必須。
  - Vaaraniemi 2012 <https://www.cs.cit.tum.de/fileadmin/w00cfj/cg/Research/Publications/2012/Force_Labeling/2012_Vaaraniemi_Temporally_Coherent_Real-Time_Labeling_of_Dynamic_Scenes.pdf> / Been et al.整理 <https://link.springer.com/article/10.1007/s00453-020-00694-7> / Survey <https://arxiv.org/pdf/1902.01454>
  - 採用: screen-space / 優先度 / 占有衝突 / ヒステリシス / 位置連続化。ML型は過剰＝**不採用**。

### Web向け3D（Three.js）
- glTF/GLB は `GLTFLoader`+`AnimationMixer`。**GPUリソースは自動解放されない**（geometry/material/texture/`skeleton.boneTexture` を dispose、参照null化、`renderer.info.memory` 監視）。
  - <https://threejs.org/manual/en/cleanup.html> / <https://github.com/mrdoob/three.js/blob/dev/manual/en/how-to-dispose-of-objects.html> / <https://www.utsubo.com/blog/threejs-best-practices-100-tips>
  - 本プロジェクトは切替ライフサイクルで過去にクラッシュ実績→glTF導入は**dispose設計を先に固める**のが必須。

---

## Phase 2: 現状監査（`RaceSimulator3DProto.tsx` 静的計測）

| 項目 | 現状 | 該当箇所 |
|---|---|---|
| 馬モデル | 単一 `CapsuleGeometry(0.6,2.5)` を寝かせただけ（脚/頭/首/尾/騎手なし） | `createHorses` L729-734 |
| 色 | `horseNumber % 8`（**実枠割りと不一致**） | L714-731 |
| 馬番 | 128px Canvas 白背景スプライト、常時全頭・重なり制御なし | L737-756 |
| アニメ | **gaitなし**（滑る剛体） | — |
| 影 | shadowMap無効・cast/receiveなし | 全体 |
| 照明 | `Ambient0.6 + Directional0.8` のみ影なし | L302-305 |
| 地面/コース | 単色 `0x3a5f3a`、テクスチャ/作り込み限定 | L330,685 |

**「しょぼい」原因の分解**: 最大要因は **silhouette（丸太1本）** と **animation（無し）**。次いで materials / lighting / contact shadow / track structure / typography / identification。camera・scale は**単独主因ではない**。

---

## Phase 3-7: Visual Lab と 3 案（＋計測ハーネス）

構成:
- `app/dev/race-visual-lab/page.tsx` — ルート（本番ゲート）
- `app/components/visual-lab/VisualLabScene.tsx` — シーン/カメラ/照明/コース/ラベル/**URL再現・ベンチ・識別指標・発見タスク・captureモード**
- `app/components/visual-lab/fixtures.ts` — seed固定fixture/枠色/pose/カメラ（zoom含む）/URL対応
- `app/components/visual-lab/horseModels.ts` — 3案の馬ビルダー + glTFロードフック + dispose
- `app/components/visual-lab/labels.ts` — screen-space 優先度+占有+ヒステリシス
- `app/components/visual-lab/instrumentation.ts` — FPS統計/overlap/heap（純粋関数）

> **ハーネス上の中立的補正**: 全案共通で「馬を進行方向へ向ける」pose補正を入れた（従来は全案が横向きに滑走）。これは3案すべてに等しく適用され、特定案を有利にしない。3案のモデル/材質/照明/カメラのロジックは変更していない。

### プリセット
P1 芝14直線密集 / P2 芝14コーナー / P3 ダート14ゴール前 / P4 芝18最大密集 / P5 拡大側面 / P6 拡大斜め前 / P7 拡大斜め後ろ。各プリセットで A/B/C をワンクリック切替（条件不変）。

---

## Phase 8: 各案を同一粒度で（中立）

> スクショ/動画/実機FPSは**あなたの実機**で取得（本環境では代表値を出せない）。以下は設計事実に基づく整理で、優劣の結論は保留。

### 案A: Broadcast Cel（トゥーン＋輪郭線＋関節脚＋騎手 / 接地=blob）
- 強み: 小さくても馬に読めるシルエット、中継アニメ調、軽量、切替に強い（dispose単純）、ダビスタ2方針に合致。
- 弱み: 写実感は出ない。トゥーン品質は影・輪郭調整に依存。
- 最終品質の上限: 高（良質セルルック）。 現状prototype完成度: 中（gait/輪郭は簡易）。
- 本番完成までの追加作業: gait精緻化、輪郭線の安定化、騎手の作り込み、コース質感。
- asset依存: 低（procedural）。 animation依存: 中。 performanceリスク: 低。 ライセンスリスク: 低（自作）。 保守: 低〜中。 モバイル: 有利。

### 案B: Semi-Realistic（PBR風 StandardMaterial + shadowMap + 関節脚）
- 強み: 最も写実に伸ばせる。自然な接地影と材質差。
- 弱み: **現状は procedural placeholder**でリグ付きglTFは未使用（後述）。影/PBR/skinningで最も重い。
- 最終品質の上限: 最高（**ただしリグ付きglTF＋良質アニメが前提**）。 現状prototype完成度: 低〜中（見た目の上限を代表しない）。
- 本番完成までの追加作業: ライセンスクリアな馬GLB＋走行アニメ導入、dispose検証、LOD/instancing。
- asset依存: 高。 animation依存: 高。 performanceリスク: 中〜高。 ライセンスリスク: 中〜高。 保守: 高。 モバイル: 要検証。

### 案C: Premium Data Visualization（簡略シルエット＋枠色リング/フィン＋大番号）
- 強み: 内外/順位/差の可読性が最高。最軽量。枠色識別が明確。
- 弱み: 「競馬中継として観る」映像品質は低い。馬らしさは意図的に低い。
- 最終品質の上限: 中（機能美）。 現状prototype完成度: 高（意図通り）。
- 本番完成までの追加作業: 情報レイヤの洗練、リング/番号の視認調整。
- asset依存: 低。 animation依存: 低（静的）。 performanceリスク: 最低。 ライセンスリスク: 低。 保守: 低。 モバイル: 最有利。

### 計測で埋める欄（実機JSONを貼る）
benchmark JSON の avgFps / medianFps / minFps / low1Fps / avgFrameMs / p95 / p99 / dropped / long / calls / triangles / geometries / textures / avgVisible / avgOverlapPairs / relocationsPerSec を **8/14/18** で 3案分。発見タスク JSON の averageFindMs / medianFindMs / wrongClicks / completionRate も 3案分。

---

## Phase 7 詳細: glTF案（案B）の扱い — 明示

- **実際にリグ付きglTFを使用しているか**: **していない**。案Bは現状 **procedural placeholder（技術検証用）**。
- 使用asset/ライセンス/商用可否/再配布/attribution/クリップ内容/polygon数/texture解像度: **該当なし（未導入）**。
- 14/18頭時のskinned mesh負荷 / clone方式 / dispose方式: **未計測（未導入のため）**。`loadGltfHorse()` に読み込み口と dispose 設計（mixer停止・`skeleton.boneTexture`解放・参照null化）だけ用意。
- **結論**: 案Bの現状スクショ/性能を「セミリアル案の最終品質」として断定しない。正式に**ライセンスがクリアな**リグ付きGLBを入れて再評価するまで、上限は「見込み」に留める。**不明ライセンスの資産はコミットしない**。

---

## Phase 9: 推奨（3軸・保留付き）

単一の総合案に無理にまとめない。実機比較後にユーザーが決める前提で、軸ごとに提示:

- **見た目の最高品質**: 案B（**要**: ライセンスクリアなリグ付きglTF＋走行アニメ＋dispose検証）。現状placeholderのままなら評価保留。
- **位置関係の分かりやすさ**: 案C（枠色/番号/内外/差の可読性が最高）。案Aに情報層として重ねる価値も高い。
- **Web実装の現実性（14-18頭×実機60fps・切替安定・保守）**: 案A（procedural中心で軽量・disposeが単純・過去のクラッシュ体質に安全）。

> どれを本番へ入れるかは、**あなたの実機でP1〜P7とベンチ/発見タスクを見てから**決める段階。数値より「どれが最終品質へ伸ばせるか」を目で判断してよい。

---

## 確認事項
- main 未変更。作業は `research/3d-visual-direction` のみ（push済み）。PR未作成・未merge。
- 本番 `RaceSimulator3DProto` 未統合。timeline/dynamics/geometry/start-marker/切替ライフサイクル不変。
- 3案のモデル/材質/照明/カメラのロジックは不変（追加したのは共通ハーネス＝URL再現/ベンチ/指標/タスク/captureのみ）。
- 既存テスト全PASS、`npm run build` 成功（Playwright未導入でもbuild成功）。
