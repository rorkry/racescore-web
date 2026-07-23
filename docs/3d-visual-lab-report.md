# 3D競馬シミュレーター ビジュアル刷新 — 調査・監査・3案プロトタイプ報告

> ブランチ: `research/3d-visual-direction`（origin/main 起点）
> ステータス: **本番未統合 / main未変更 / push未実施**。比較用の独立サンドボックスのみ作成。
> Visual Lab: `/dev/race-visual-lab`（開発環境は常時、本番は `?debug=1` のときだけ表示）

---

## Phase 1: リサーチ（一次情報ベース）

### 1. 競馬ゲーム

- **Rival Stars Horse Racing（PikPok）** — 公式に「モーションキャプチャした走行アニメ」「シネマティックなレース」を機能として明記。
  - <https://pikpok.com/news/horse-racing-press-release/>
  - <https://store.steampowered.com/app/1166860/Rival_Stars_Horse_Racing_Desktop_Edition/>
  - VR版でも実馬のモーション/挙動をmocapで再現と明記: <https://rivalstarshorseracing.com/2024/11/06/rival-stars-horse-racing-vr-edition-developer-blog-inside-the-stable/>
  - **採用できる原則**: 「馬らしさ」は形状より**走行アニメ（脚運び・首・接地・騎手の上下動）**で決まる。静止モデルの作り込みだけでは高品質にならない。
  - **採用できない/コピー不可**: 同社のモデル・テクスチャ・mocapデータ・UIは著作物。参考にするのは「方針」まで。

- **ダービースタリオン2（Switch2, 2026-09-24発売, 開発ランド・ホー）** — 公式に **「3Dセルルック × トラッキング表示」** を掲げる。フォトリアルから一新し、視認性と臨場感の両立を目的。
  - Nintendo公式: <https://www.nintendo.com/jp/topics/article/7f47014c-52eb-4518-ac0e-0fd291a4fb5f>
  - PR TIMES（開発元プレス）: <https://prtimes.jp/main/html/rd/p/000000020.000022342.html>
  - **採用できる原則**: 「3Dセルルック（3DCGにアニメ調の影・輪郭線）」＋「位置関係を読ませるトラッキング表示」の併用。**本プロジェクトの案A方針を強く裏付ける一次情報**。
  - 3Dセルルックの定義（公式）: 「3DCGモデルに手描きアニメ風の影・輪郭線・色味を加える表現手法」。

- Winning Post系: レース演出は3D＋情報オーバーレイ（順位・脚色）が中心という一般的傾向。個別の公式技術仕様は本調査では確認できていない（**非公式扱い**）。

### 2. 競馬中継・JRAトラッキング

- **JRA競走馬トラッキングシステム** — ゼッケンにセンサー（左右2台/約100g）、**RTK-GNSSで0.1秒ごと**に緯度経度高度を測位、閉域網経由で受信→オーバーレイサーバが**中継映像に位置マーカー/タイム差を合成**。2023年春〜本格導入、対象レース拡大中。
  - JRA用語辞典: <https://own.jra.jp/kouza/yougo/w590.html>
  - 日経クロステック（仕組み詳細）: <https://xtech.nikkei.com/atcl/nxt/column/18/02692/121800003/>
  - MEEQ導入事例（設計思想）: <https://www.meeq.com/meeq/casestudy/0016.html>
  - 対象拡大: <https://www.sanspo.com/race/article/general/20260602-GZTMZJED3FNDLNNWMXU7A6RFSA/>
  - **決定的な裏付け（MEEQ記事）**: 「全体を映すと各馬が小さくなり、各馬にフォーカスすると位置関係が分からない。だから位置情報を重ねる」。
    → **3D映像だけで全頭識別を担わせず、情報層（番号・枠色・タイム差・トラッキング帯）を重ねる**設計が中継の実装根拠。

### 3. 動く対象のラベル配置（学術）

- フレーム単位の最適配置は**ちらつき・跳び**を生む。**時間的コヒーレンス**（連続的移動・ヒステリシス）が必須。
  - Vaaraniemi et al. 2012「Temporally Coherent Real-Time Labeling」（screen-space + force + 4-position）: <https://www.cs.cit.tum.de/fileadmin/w00cfj/cg/Research/Publications/2012/Force_Labeling/2012_Vaaraniemi_Temporally_Coherent_Real-Time_Labeling_of_Dynamic_Scenes.pdf>
  - Been et al. の要件（no-flicker/no-jump/monotonicity）を整理: <https://link.springer.com/article/10.1007/s00453-020-00694-7>
  - External Labeling Survey（分類）: <https://arxiv.org/pdf/1902.01454>
  - AR向け temporal coherence: <https://arbook.icg.tugraz.at/schmalstieg/Schmalstieg_303.pdf>
  - **採用できる原則**: screen-space配置／優先度選択／占有(矩形)衝突解消／**ヒステリシス（表示/非表示のバタつき抑制）**／位置の連続化。
  - **採用しない**: ML型/大規模最適化は過剰。まずは優先度＋占有＋ヒステリシスで十分（今回の `labels.ts` はこの最小実装）。

### 4. Web向け3D（Three.js）

- glTF/GLB は `GLTFLoader` + `AnimationMixer` で読み込み・再生可能。**GPUリソースは自動解放されない**——geometry/material/texture/`skeleton.boneTexture` を明示的に `dispose()`、参照も null 化。`renderer.info.memory` で監視。
  - Three.js Cleanup: <https://threejs.org/manual/en/cleanup.html>
  - dispose公式（Skinned Meshは`Skeleton.dispose()`）: <https://github.com/mrdoob/three.js/blob/dev/manual/en/how-to-dispose-of-objects.html>
  - 性能Tips（draw call<100目安, instancing, dispose, `texture.source.data.close()`）: <https://www.utsubo.com/blog/threejs-best-practices-100-tips>
  - **本プロジェクト特記**: レース切替のライフサイクルで過去に何度もクラッシュ実績あり。**glTF/skinned導入時は dispose 設計（AnimationMixer停止・boneTexture解放・参照null化）を先に固める**のが必須条件。
- **WebGLで現実的な品質ライン**: 14〜18頭 × 中程度ポリゴン + 1枚の影付きDirectionalLight + 低〜中解像度テクスチャで 60fps は十分射程。4Kテクスチャ多用や全頭リアルタイム影は要注意。

---

## Phase 2: 現状監査（`RaceSimulator3DProto.tsx` 静的計測）

現行の馬・コース・照明の構成をコードから確定（実測箇所を明記）。

| 項目 | 現状 | 該当箇所 |
|---|---|---|
| 馬モデル | **単一 `CapsuleGeometry(0.6, 2.5)` を寝かせただけ**。脚・頭・首・尾・騎手なし | `createHorses` L729-734 |
| 色 | `horseNumber % 8` で色分け（**枠色ロジックが実枠割りと不一致**） | L714-731 |
| 馬番 | 128px Canvas の白背景スプライト、常時全頭表示（重なり制御なし） | L737-756 |
| スケール | `HORSE_VISUAL_SCALE` で見た目のみ拡大 | L759 |
| アニメ | **脚運び・接地・首振りなし**（＝「滑る丸太」の主因） | — |
| 影 | **shadowMap無効**。`castShadow/receiveShadow` 設定なし | シーン全体 |
| 照明 | `AmbientLight(0.6)` + `DirectionalLight(0.8)` のみ、影なし | L302-305 |
| 地面 | 単色 `MeshStandardMaterial(0x3a5f3a, roughness1)`、テクスチャなし | L330 |
| コース | trackMaterial 1種、レール/ゴール板/ハロン棒などの作り込みは限定的 | L685 |
| dispose | 切替時に horseMeshes/track を解放（NaN・黒画面・切替クラッシュは別途対処済み） | L436-448 |

**「しょぼく見える」原因の分解（測定に基づく）**

- **silhouette**: 丸太1本。脚・首・頭・尾・騎手が無く、輪郭が「馬」に読めない。← 最大要因
- **animation**: gaitが無い。等速移動する剛体なので生物感ゼロ。← 同率で最大要因
- **materials**: フラットな単色 Standard。陰影の階調が乏しい。
- **lighting**: 影付き平行光が無く立体感・時間帯が出ない。
- **contact shadow**: 接地影ゼロ→馬が地面から浮いて見える。
- **track structure**: 芝の刈り目・走行帯・轍・柵支柱などの密度が低い。
- **typography**: 番号が白箱スプライトで枠色情報を持たず、密集時に重なる。
- **identification**: 全頭常時表示＋重なり制御/優先度/ヒステリシス無し。
- **camera / scale**: これは**単独の主因ではない**（方向契約は別途修正済み）。

> 結論: 品質の伸びしろは **silhouette と animation** に集中。カメラや拡大率の微調整では上限が上がらない。

---

## Phase 3-7: Visual Lab と 3 案

`/dev/race-visual-lab` に**同一条件**（同頭数8/14/18・同コース幅24m・同カメラプリセット・同密集配置・芝/ダート・静止/低速/通常）で切替可能な比較サンドボックスを実装。本番ロジック（timeline/dynamics/geometry）非依存の固定 fixture のみ使用。

構成ファイル:

- `app/dev/race-visual-lab/page.tsx` — ルート（本番ゲート）
- `app/components/visual-lab/VisualLabScene.tsx` — シーン・カメラ・照明・コース・ラベルDOM・性能HUD
- `app/components/visual-lab/fixtures.ts` — 14頭fixture・枠色・シナリオpose・カメラプリセット
- `app/components/visual-lab/horseModels.ts` — 3案の馬ビルダー + glTFロードフック + dispose
- `app/components/visual-lab/labels.ts` — screen-space優先度+占有+ヒステリシスのラベル管理

### 案の中身（Phase 4）

- **案A: Broadcast Cel** — `MeshToonMaterial`（3段トゥーン）＋ BackSide複製による**輪郭線**。関節脚・首・頭・耳・たてがみ・尾・**騎手（帽=枠色）**。接地は blob shadow。ダビスタ2方針に一致。
- **案B: Semi-Realistic** — `MeshStandardMaterial`（PBR風・roughness調整）、同じ関節骨格、影は**shadowMap（PCFSoft）**。芝/ダートで地面材質差。`loadGltfHorse()` で**リグ付きGLB差し込み口**を用意（資産未コミットのため既定はprocedural）。
- **案C: Data Visualization** — 簡略シルエット（本体＋進行方向チップ）＋**枠色リング/フィン**＋大きな番号。脚アニメは意図的に持たず、内外・順位・差の可読性を最優先。

### 馬モデル比較（Phase 5）

- **自作スタイライズ（procedural）**: 軽量・色変更容易・切替に強い（disposeが単純）。上限は「良質なローポリ〜セルルック」。関節gaitを入れれば「滑る丸太」からは明確に脱却。
- **リグ付きglTF**: 走行アニメの質が最上。ただし **①ライセンス確認 ②切替時dispose（mixer停止/boneTexture解放/参照null化）③14-18頭のskinning負荷** が前提条件。フックは実装済み（`loadGltfHorse`）。
- **本レポートでは自作primitiveに固定しない**。案Bは glTF を後から差し込める設計。

### コース比較（Phase 6）

各案でCanvasTextureの密度を変えて比較可能（芝の刈り目ストライプ＋色むら、ダートの粒＋轍）。柵/支柱/ゴール線/ゴール板/ハロン棒を配置。観客席は無し。**テクスチャだけで完成にせず**、shadow/接地とセットで評価する構成。

### 識別方式比較（Phase 7）

`labels.ts` で「全頭 / 先頭+選択 / 選択のみ / トラッキングストリップ」を切替。優先度（選択100 > 先頭50 > 通常）＋矩形占有回避＋**ヒステリシス ON/OFF** を切替可能。密集(pack)で重なり・ちらつきを目視比較できる。

---

## Phase 8: 比較の観点（Visual Labで実測・目視）

> スクリーンショット/動画は Visual Lab を起動して各シーンで取得してください（性能HUDは `renderer.info` の実測値をリアルタイム表示）。この環境では自動キャプチャができないため、下表は**評価軸と設計上の見込み**を示す。

| 観点 | 案A Cel | 案B Semi | 案C DataViz |
|---|---|---|---|
| 見た目の品質 | 高（中継アニメ調） | 最高（PBR+影） | 中（機能美） |
| 馬らしさ | 高 | 最高 | 低〜中（意図的簡略） |
| コースらしさ | 中〜高 | 高 | 中 |
| 個体識別（密集） | 高 | 中 | **最高** |
| 展開/隊列の読みやすさ | 高 | 中 | **最高** |
| アニメ品質 | 中〜高 | 最高（glTF時） | 低（静的） |
| performance | 高（軽量） | 中（影/PBR/skinning） | 最高 |
| asset制作量 | 中 | 大（モデル/mat/mocap） | 小 |
| 実装/保守リスク | 低〜中 | 高（dispose/ライセンス） | 低 |
| 品質の上限 | 高 | **最高** | 中 |

---

## Phase 9: 推奨と本番統合ロードマップ（提案・未実装）

### 推奨: **案A（Broadcast Cel）を土台に、案Cの情報層を統合**。案Bは将来オプション。

**理由**
- ダビスタ2の公式方針（3Dセルルック×トラッキング）とJRA中継の実装根拠（情報層を重ねる）に最も合致。
- WebGLで**14-18頭×60fpsを保ちやすい**（案Bの影/PBR/skinningより軽い）。
- 切替ライフサイクルの過去問題に対し、procedural中心で**disposeが単純**＝安全。
- 情報層（案C由来のラベル/枠色/ストリップ）は案Aへ重ねられ、識別と展開理解を底上げ。

**他案を主軸にしない理由**
- 案B単独: 品質上限は最高だが、リグ付きglTFの**ライセンス確認・dispose・skinning負荷**が未解決。過去のクラッシュ体質と相性が悪く、先に土台を固めるべき。→ 検証後の「上位モード」に回す。
- 案C単独: 読みやすさ最高だが「競馬中継として観たい」体験には映像品質が不足。→ 情報層として案Aに融合。

### 本番統合ロードマップ（承認後・別ブランチで段階実装）

1. 馬モデルを丸太→**関節セルルック**へ差し替え（`horseModels.buildCelHorse` 相当を本番の `createHorses` に適用）。gaitは速度連動。
2. **接地影（blob）** と **影付きDirectionalLight** を追加（切替時disposeを既存クリーンアップに接続）。
3. 地面/コースを **刈り目・走行帯・轍・柵支柱** 付きへ。
4. 番号表示を **枠色ラベル + 優先度/占有/ヒステリシス**（`labels.ts` 相当）へ。トラッキングストリップを下部に。
5. （任意・別フェーズ）案B: ライセンスクリアなリグ付きGLBを `loadGltfHorse` で「高品質モード」として追加。dispose検証必須。

**想定変更ファイル（本番）**: `app/components/RaceSimulator3DProto.tsx`（`createHorses`/`updateHorses`/lighting/track生成）、新規 `app/components/race3d/*`（モデル・ラベルの本番版）。timeline/race-dynamics/course-direction/start-marker/切替ライフサイクルは**変更しない**。

**リスク**: glTF導入時のメモリ/切替クラッシュ、密集時のラベル計算コスト、影の負荷。→ すべてVisual Labで事前計測してから本番へ。

---

### 確認事項

- main 未変更・push 未実施。作業はすべて `research/3d-visual-direction`。
- 本番 `RaceSimulator3DProto` 未統合。timeline/dynamics/geometry/start-marker/切替ライフサイクルは不変。
- 既存テスト17ファイル 全PASS、`npm run build` 成功。
