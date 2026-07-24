/**
 * v2 予測モデルの全係数（設定として一箇所に集約）
 *
 * 各 Phase 関数にハードコードしないこと。
 * 過去レース検証（scripts/evaluate-race-forecast-v2.ts）で調整する対象はここだけ。
 * 検証対象レースへ直接フィッティングする過学習は禁止。
 */
import type { L4fDirection } from '../types';

// ============================================================
// 前半（位置取り）
// ============================================================
export interface EarlyWeights {
  /** ペース補正済みの通過順位（近走） */
  paceAdjustedFrontAbility: number;
  /** T2F（小さいほど速い） */
  t2f: number;
  /** 過去先行力 pfs_past（大きいほど先行） */
  historicalPfs: number;
  /** 前方追走の一貫性 */
  forwardConsistency: number;
  /** コース・枠による発走補正 */
  courseStart: number;
}

export const DEFAULT_EARLY_WEIGHTS: EarlyWeights = {
  paceAdjustedFrontAbility: 0.35,
  t2f: 0.3,
  historicalPfs: 0.2,
  forwardConsistency: 0.1,
  courseStart: 0.05,
};

// ============================================================
// 道中（維持力）
// ============================================================
export interface MidWeights {
  /** 前半位置 → ゴール位置の維持量 */
  positionRetention: number;
  /** ハイペースを前で受けて小さな着差に耐えた実績 */
  enduranceEvidence: number;
  /** potential（competitionScore の potential 成分と排他） */
  potential: number;
  /** 距離適性 */
  distanceFit: number;
  /** 馬場・コース適性 */
  surfaceCourseFit: number;
}

export const DEFAULT_MID_WEIGHTS: MidWeights = {
  positionRetention: 0.3,
  enduranceEvidence: 0.25,
  potential: 0.2,
  distanceFit: 0.15,
  surfaceCourseFit: 0.1,
};

// ============================================================
// 後半（追い上げ）
// ============================================================
export interface LateWeights {
  /** 上がり3F（充足率99.2%・主軸） */
  last3f: number;
  /** L4F（後半4Fの秒。DB実測で方向確定・補助） */
  l4f: number;
  /** 競うスコアの後半成分（makikaeshi / margin / finish / cluster） */
  competitionLate: number;
  /** makikaeshi 単体（breakdown が無い場合の代替） */
  makikaeshi: number;
  /** 着差（小さいほど良い） */
  margin: number;
  /** 前半消耗の少なさ（消耗が大きいと後半が伸びない） */
  freshness: number;
}

export const DEFAULT_LATE_WEIGHTS: LateWeights = {
  last3f: 0.3,
  l4f: 0.15,
  competitionLate: 0.2,
  makikaeshi: 0.1,
  margin: 0.1,
  freshness: 0.15,
};

// ============================================================
// 3 Phase の統合
// ============================================================
export interface PhaseBlendWeights {
  early: number;
  mid: number;
  late: number;
}

export const DEFAULT_PHASE_BLEND: PhaseBlendWeights = {
  early: 0.3,
  mid: 0.35,
  late: 0.35,
};

// ============================================================
// 極端値防止（PHASE 8）
// ============================================================
export interface ClampConfig {
  /** 1つの factor が Phase score へ与えられる最大寄与（絶対値） */
  maxFactorContribution: number;
  /** Phase score の下限・上限 */
  phaseScoreMin: number;
  phaseScoreMax: number;
  /** 総合スコアの下限・上限 */
  totalScoreMin: number;
  totalScoreMax: number;
  /** コース補正が Phase weight を変えられる最大倍率差 */
  maxCourseMultiplierDelta: number;
  /** 枠・コース補正の最大加算（[0,1]スケール） */
  maxGateAdjustment: number;
}

export const DEFAULT_CLAMPS: ClampConfig = {
  maxFactorContribution: 0.22,
  phaseScoreMin: 0.02,
  phaseScoreMax: 0.98,
  totalScoreMin: 0.02,
  totalScoreMax: 0.98,
  maxCourseMultiplierDelta: 0.25,
  maxGateAdjustment: 0.06,
};

// ============================================================
// 乱数（PHASE 7）
// ============================================================
export interface RandomConfig {
  /**
   * totalScore に対する最大寄与（片側）。
   * 初期 v2 は 0 で基礎検証し、検証後に小さく入れる方針。
   */
  maxContribution: number;
  /** 有効化フラグ */
  enabled: boolean;
}

export const DEFAULT_RANDOM: RandomConfig = {
  maxContribution: 0.0,
  enabled: false,
};

// ============================================================
// 指標の絶対妥当範囲（範囲外は欠損にする）
// DB実測（docs/RACE_FORECAST_V2_DATA_FINDINGS.md §5）に基づく
// ============================================================
export interface ValidRange {
  min: number;
  max: number;
}

export const VALID_RANGES: Record<string, ValidRange> = {
  /** 実測 min -13.60 / p01 22.40 / p99 27.50 / max 35.90 */
  t2fSeconds: { min: 18, max: 32 },
  /** 実測 min 10.70 / p01 44.30 / p99 56.10 / max 110.70 */
  l4fSeconds: { min: 38, max: 62 },
  /** 実測 p01 13.6（1F分の異常値）/ 中央 36.8 / p99 43.3 */
  last3fSeconds: { min: 30, max: 50 },
  /** 実測 min 3.00 / max 81.16 */
  pfsPast: { min: 0, max: 100 },
  /** 実測 0〜7.80 */
  potential: { min: 0, max: 12 },
  /** 実測 0〜10 */
  makikaeshi: { min: 0, max: 12 },
  /** 着差。勝ち馬は負値 */
  marginSeconds: { min: -5, max: 40 },
  /** 実測 min 2.80 / max 64.70 */
  pci: { min: 20, max: 80 },
  fieldSize: { min: 2, max: 28 },
  finishPosition: { min: 1, max: 28 },
};

// ============================================================
// ペース正規化（PCI → 「どれだけハイペースだったか」[0,1]）
//
// PCI は小さいほどハイペース（utils/getClusterData.ts:28-54 の getPaceCat と同じ向き）。
// 下の基準点は getPaceCat の閾値（超ハイ / 超スロー）をそのまま使い、
// カテゴリではなく連続値へ変換する。
// ============================================================
export interface PaceReference {
  /** この値以下なら完全にハイペース扱い（pace = 1） */
  highPci: number;
  /** この値以上なら完全にスローペース扱い（pace = 0） */
  slowPci: number;
}

export const PACE_REFERENCES: {
  turfShort: PaceReference;
  turfLong: PaceReference;
  dirtShort: PaceReference;
  dirtLong: PaceReference;
} = {
  /** 芝 ≤1600: getPaceCat 超ハイ≤46 / 超スロー≥52 */
  turfShort: { highPci: 46, slowPci: 52 },
  /** 芝 ≥1700: 超ハイ≤47.5 / 超スロー≥57 */
  turfLong: { highPci: 47.5, slowPci: 57 },
  /** ダ ≤1600: 超ハイ≤41 / 超スロー≥49 */
  dirtShort: { highPci: 41, slowPci: 49 },
  /** ダ ≥1700: 超ハイ≤44 / 超スロー≥49 */
  dirtLong: { highPci: 44, slowPci: 49 },
};

// ============================================================
// 前半モデル固有のパラメータ
// ============================================================
export interface EarlyModelConfig {
  /**
   * スローペースで前方にいた場合の割引率。
   * pace=1（ハイ）なら満額、pace=0（スロー）ならこの係数まで縮小する。
   * 「スロー逃げだけで過大評価しない」ための要件。
   */
  slowPaceFrontDiscount: number;
  /**
   * 前方判定のしきい値（frontRatio）。これ以上を「前方追走」とみなす。
   * これ未満（後方）はペースで増幅しない = 先行力の証拠として使わない。
   */
  forwardThreshold: number;
  /** 脚質帯の境界（frontRatio ベース・legacy の rankRatio 閾値と整合） */
  bandEdges: { escape: number; front: number; stalker: number };
  /** 過去脚質との乖離が大きいときの信頼度下限 */
  styleDivergenceReliabilityFloor: number;
}

export const DEFAULT_EARLY_MODEL: EarlyModelConfig = {
  slowPaceFrontDiscount: 0.55,
  forwardThreshold: 0.5,
  // frontRatio は「1=前」。legacy inferRunningStyleFromRankRatio(0.15/0.45/0.75) の裏返し
  bandEdges: { escape: 0.85, front: 0.55, stalker: 0.25 },
  styleDivergenceReliabilityFloor: 0.45,
};

// ============================================================
// 道中モデル固有
// ============================================================
export interface MidModelConfig {
  /**
   * retention の妥当レンジ（実測 p05 -0.714 / p75 +0.200 / p95 +0.556）。
   * この範囲で [0,1] へ線形化する。
   */
  retentionMin: number;
  retentionMax: number;
  /** 「前半だけ速く毎回止まる」判定に使う retention 閾値 */
  fadeThreshold: number;
  /** 距離適性: この差(m)以内を完全一致扱い */
  distanceFitTolerance: number;
  /** 距離適性: この差(m)で最低評価 */
  distanceFitMaxDiff: number;
}

export const DEFAULT_MID_MODEL: MidModelConfig = {
  retentionMin: -0.7,
  retentionMax: 0.55,
  fadeThreshold: -0.15,
  distanceFitTolerance: 200,
  distanceFitMaxDiff: 800,
};

// ============================================================
// 後半モデル固有
// ============================================================
export interface LateModelConfig {
  /** L4F の有利方向。DB実測で lower-is-better と確定済み */
  l4fDirection: L4fDirection;
  /** 追い上げ開始地点のレンジ（raceProgress 比）。後半力が高いほど早く動ける */
  kickStartProgressMin: number;
  kickStartProgressMax: number;
  /** 直線での最大進出量（レース距離に対する比） */
  maxLateGainFraction: number;
  /** 前半消耗の換算: earlyScore が高い(前で運ぶ)ほど消耗するという前提の強さ */
  earlyEffortCostFactor: number;
}

export const DEFAULT_LATE_MODEL: LateModelConfig = {
  l4fDirection: 'lower-is-better',
  kickStartProgressMin: 0.62,
  kickStartProgressMax: 0.82,
  maxLateGainFraction: 0.04,
  earlyEffortCostFactor: 0.5,
};

// ============================================================
// 全体設定
// ============================================================
export interface ForecastV2Config {
  early: EarlyWeights;
  mid: MidWeights;
  late: LateWeights;
  blend: PhaseBlendWeights;
  clamps: ClampConfig;
  random: RandomConfig;
  earlyModel: EarlyModelConfig;
  midModel: MidModelConfig;
  lateModel: LateModelConfig;
}

export const DEFAULT_FORECAST_V2_CONFIG: ForecastV2Config = {
  early: DEFAULT_EARLY_WEIGHTS,
  mid: DEFAULT_MID_WEIGHTS,
  late: DEFAULT_LATE_WEIGHTS,
  blend: DEFAULT_PHASE_BLEND,
  clamps: DEFAULT_CLAMPS,
  random: DEFAULT_RANDOM,
  earlyModel: DEFAULT_EARLY_MODEL,
  midModel: DEFAULT_MID_MODEL,
  lateModel: DEFAULT_LATE_MODEL,
};
