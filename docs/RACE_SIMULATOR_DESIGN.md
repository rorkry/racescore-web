# レースシミュレーター設計書

## 📋 目次
1. [概要](#概要)
2. [現状分析](#現状分析)
3. [目標アーキテクチャ](#目標アーキテクチャ)
4. [データ構造](#データ構造)
5. [計算フロー](#計算フロー)
6. [実装ロードマップ](#実装ロードマップ)

---

## 概要

### ビジョン
簡易的な展開予想から、本格的なレースシミュレーターへ進化させる。

### 最終目標
- リアルタイムレースシミュレーション
- 3D可視化
- 全競馬場対応
- 馬場バイアス考慮
- 統計的精度の向上

---

## 現状分析

### 既存の強み
✅ T2F/L4F指数による先行力・追い込み力評価  
✅ makikaeshi/potential指数  
✅ 椅子取りゲーム方式の相対評価  
✅ 距離変更・逃げ経験の考慮  
✅ コース特性データベース（一部）  

### 不足している要素
❌ PFS（先行期待度：過去実績ベース）  
❌ 過去通過順位パターン（1-1, 2-2など）の活用  
❌ ユーザー入力の馬場状態・バイアス  
❌ 段階的シミュレーション（スタート→コーナー→直線→ゴール）  
❌ 坂・コーナー形状の詳細データ  
❌ 前走の並びによる追い込み難易度  

---

## 目標アーキテクチャ

### レイヤー構造

```
┌─────────────────────────────────┐
│   3D Rendering Engine (将来)   │
├─────────────────────────────────┤
│   Simulation Orchestrator       │  ← メインエンジン
│   (段階的計算の統括)             │
├─────────────────────────────────┤
│   Phase Engines                 │
│   ├─ StartPhase                 │  スタート〜隊列形成
│   ├─ FormationPhase             │  隊列確定
│   ├─ PacePhase                  │  ペース形成
│   ├─ CornerPhase (3-4C)         │  コーナー通過
│   ├─ StraitPhase                │  直線
│   └─ GoalPhase                  │  ゴール前
├─────────────────────────────────┤
│   Data Layer                    │
│   ├─ HorseCapabilityAnalyzer    │  馬の能力分析
│   ├─ CourseDatabase             │  コース情報
│   ├─ TrackBiasManager           │  馬場バイアス
│   └─ PFSCalculator              │  先行期待度計算
├─────────────────────────────────┤
│   Database (PostgreSQL)         │
│   ├─ umadata                    │
│   ├─ indices                    │
│   ├─ wakujun                    │
│   └─ course_info (新規)         │
└─────────────────────────────────┘
```

---

## データ構造

### 1. HorseState（各フェーズでの馬の状態）

```typescript
interface HorseState {
  horseNumber: number;
  horseName: string;
  
  // 位置情報
  position: number;           // 現在の順位
  internalLane: number;       // 内外ライン（1=最内, 8=最外）
  distanceFromLeader: number; // 先頭からの距離（メートル）
  
  // 能力値
  capabilities: {
    startSpeed: number;       // スタートダッシュ力 (0-100)
    cruiseSpeed: number;      // 巡航速度 (0-100)
    acceleration: number;     // 加速力 (0-100)
    stamina: number;          // スタミナ (0-100)
    cornerSkill: number;      // コーナリング (0-100)
  };
  
  // 意欲・戦略
  leadingIntention: number;   // 先行意欲 (0-100)
  pfs: number;                // 先行期待度（過去実績ベース）
  pastPositionPattern: string;// 過去通過順パターン "1-1-2" など
  
  // 状態
  stamina残量: number;        // 残スタミナ (0-100)
  blocked: boolean;           // 前が詰まっている
  outerPath: boolean;         // 外を回っている
  
  // 馬場・枠
  waku: number;
  weight: number;             // 斤量
  trackBiasEffect: number;    // 馬場バイアス効果 (-10 〜 +10)
}
```

### 2. CourseInfo（コース情報）

```typescript
interface CourseInfo {
  id: string;
  place: string;              // 競馬場名
  distance: number;           // 距離（m）
  trackType: 'turf' | 'dirt'; // 芝/ダート
  
  // コース形状
  straightLength: number;     // 直線距離（m）
  startToFirstCorner: number; // スタートから1コーナーまで（m）
  corners: Array<{
    name: string;             // "1コーナー", "3コーナー"
    position: number;         // スタートからの距離（m）
    radius: number;           // コーナー半径（m、小さい=急）
    slope: number;            // 傾斜（度）
  }>;
  
  slopes: Array<{
    start: number;            // 坂開始地点（m）
    end: number;              // 坂終了地点（m）
    gradient: number;         // 勾配（%）
    type: 'up' | 'down';
  }>;
  
  // 傾向
  innerAdvantage: number;     // 内有利度 (-5 〜 +5)
  outerAdvantage: number;     // 外有利度 (-5 〜 +5)
  paceTendency: 'slow' | 'middle' | 'high';
}
```

### 3. TrackBias（馬場バイアス：ユーザー入力）

```typescript
interface TrackBias {
  condition: 'firm' | 'good' | 'yielding' | 'soft' | 'heavy'; // 馬場状態
  innerBias: number;          // 内有利度 (-10 〜 +10)
  outerBias: number;          // 外有利度 (-10 〜 +10)
  frontBias: number;          // 前残り度 (-10 〜 +10)
  rearBias: number;           // 差し有利度 (-10 〜 +10)
  comment?: string;           // ユーザーコメント
}
```

### 4. SimulationResult

```typescript
interface SimulationResult {
  raceKey: string;
  phases: {
    start: PhaseResult;
    formation: PhaseResult;
    pace: PhaseResult;
    corner3_4: PhaseResult;
    straight: PhaseResult;
    goal: PhaseResult;
  };
  finalStandings: HorseState[];
  visualization?: {
    timeline: Array<{ time: number; horses: HorseState[] }>;
  };
}

interface PhaseResult {
  phaseName: string;
  horses: HorseState[];
  paceInfo: {
    averageSpeed: number;
    leadingHorses: number[];
    paceType: 'slow' | 'middle' | 'high';
  };
  events: Array<{
    horseNumber: number;
    event: string; // "cut-in", "blocked", "accelerate", etc.
  }>;
}
```

---

## 計算フロー

### Phase 1: スタート〜隊列形成（0-200m）

**入力:**
- 各馬の startSpeed, leadingIntention, waku, PFS

**計算:**
1. 内枠から順に処理（椅子取りゲーム）
2. startSpeed + leadingIntention でスタートダッシュ力計算
3. 前走1Cで1-3番手なら leadingIntention +20
4. PFS（過去の先行成功率）を考慮
5. 外枠で startSpeed が著しく高い場合、内に切れ込む

**出力:**
- 各馬の position, internalLane

---

### Phase 2: 隊列確定〜ペース形成（200m-600m）

**入力:**
- Phase 1 の position
- 各馬の cruiseSpeed, stamina

**計算:**
1. 先行馬の頭数カウント → ペース決定
2. ペースが「ハイ」の場合、先行馬の stamina消費 +30%
3. 後方馬は stamina温存
4. 距離延長馬は位置取り +1-2
5. 距離短縮馬は位置取り -1-2

**出力:**
- paceType: 'slow' | 'middle' | 'high'
- 各馬の stamina残量

---

### Phase 3: 3-4コーナー（600m-直線入口）

**入力:**
- Phase 2 の position, stamina残量
- CourseInfo の corners, slopes

**計算:**
1. コーナー radius が小さい → 内枠有利 +1
2. 坂あり → stamina消費 +15%
3. 外を回っている馬 → 距離ロス（position -0.5）
4. 馬場バイアス（内/外）を適用

**出力:**
- 直線入口での position, stamina残量

---

### Phase 4: 直線〜ゴール

**入力:**
- Phase 3 の position, stamina残量
- 各馬の acceleration, 能力偏差値
- 前の馬の並び状況

**計算:**
1. **前が詰まっている場合:**
   - position <= 5 で前に3頭以上 → acceleration -30%
   - 外に出す余地なし → 追い込み失敗
   
2. **ペース別調整:**
   - ペース「ハイ」: 前が止まる → 後方有利
   - ペース「スロー」: 前残り → 先行有利
   
3. **能力偏差値で追い上げ:**
   - 偏差値 70+ → position -3〜-5
   - 偏差値 50-60 → position -1〜-2
   - 偏差値 40- → position 変化なし or +1
   
4. **馬場バイアス（前残り/差し）を適用**

5. **スタミナ切れチェック:**
   - stamina残量 < 20 → position +5（失速）

**出力:**
- 最終 position（予想着順）

---

## 実装ロードマップ

### Phase 1: データ基盤整備（1-2週間）

#### 1.1 PFS計算機能
- [ ] 過去5走の2C通過順位を分析
- [ ] 「1-3番手率」を PFS として算出
- [ ] `calculatePFS()` 関数実装

#### 1.2 過去通過順パターン抽出
- [ ] `getPastPositionPattern()` 関数
- [ ] "1-1-2" のような文字列で返す

#### 1.3 コースデータベース拡張
- [ ] `course_info` テーブル作成
- [ ] 全JRA競馬場の詳細データ投入
- [ ] コーナー半径、坂情報を含める

#### 1.4 馬場バイアス入力UI
- [ ] レース詳細ページに入力フォーム追加
- [ ] 「内有利」「外有利」「前残り」スライダー

---

### Phase 2: シミュレーションエンジン構築（2-3週間）

#### 2.1 HorseCapabilityAnalyzer
- [ ] 既存の T2F, L4F, makikaeshi, potential を統合
- [ ] `capabilities` オブジェクト生成

#### 2.2 Phase別計算エンジン
- [ ] `StartPhaseEngine.ts`
- [ ] `FormationPhaseEngine.ts`
- [ ] `CornerPhaseEngine.ts`
- [ ] `StraightPhaseEngine.ts`

#### 2.3 SimulationOrchestrator
- [ ] 各 Phase を順次実行
- [ ] `HorseState` を引き継ぎながら計算

---

### Phase 3: UI改善（1-2週間）

#### 3.1 段階的表示
- [ ] Phase別の順位表示
- [ ] アニメーション（CSS Transition）

#### 3.2 詳細デバッグ情報
- [ ] 各Phaseでの判定理由表示
- [ ] "切れ込み", "外回り", "前が詰まっている" など

---

### Phase 4: 3D可視化（将来）

#### 4.1 Three.jsベース
- [ ] コース形状を3Dで描画
- [ ] 馬を点で表示
- [ ] アニメーション再生

#### 4.2 カメラワーク
- [ ] 俯瞰視点
- [ ] 追従視点

---

## 技術スタック

### 既存
- Next.js 14+
- TypeScript
- PostgreSQL
- Better-sqlite3

### 新規追加候補
- Three.js（3D描画）
- Framer Motion（アニメーション）
- Zustand（状態管理）

---

## 次のアクション

1. **PFS計算機能の実装**（最優先）
2. **コースデータベースの拡張**
3. **Phase別エンジンの設計＆実装**
4. **馬場バイアス入力UIの追加**

---

## 備考

- 既存の `race-pace-predictor.ts` は互換性維持のため残す
- 新しいシミュレーターは `race-simulator.ts` として別実装
- 段階的に移行（既存UIも動作し続ける）
