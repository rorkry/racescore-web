/**
 * コース補正（設定テーブル + 純粋関数）
 *
 * 既存の lib/racecourse-geometry のデータだけを使い、独自のコース定数は持たない。
 *   homeStraightLength / elevationRange / trackWidth / direction / route / startMarkers
 *   surface-profiles（芝スタートダートの芝区間・provenance付き）
 *
 * 方針:
 *  - 補正は小さくクランプする（単一のコース補正だけで順位が大逆転しない）
 *  - provenance が estimated のデータは official より弱く効かせる
 *  - 各 Phase 関数にコース定数をハードコードしない
 */
import { clamp, clamp01, smoothstep } from './normalization';
import { DEFAULT_CLAMPS, type ClampConfig } from './config/weights';
import type { Surface } from './types';

/** コース補正の効き方を決める設定（調整対象はここだけ） */
export interface CourseAdjustmentConfig {
  /** 直線が短い判定(m)。これ以下で前半・道中を重くする */
  shortStraightMeters: number;
  /** 直線が長い判定(m)。これ以上で後半を重くする */
  longStraightMeters: number;
  /** 長い直線での late 倍率の最大増分 */
  longStraightLateBoost: number;
  /** 短い直線での early / mid 倍率の最大増分 */
  shortStraightEarlyBoost: number;
  shortStraightMidBoost: number;
  /** 急坂判定(m)。elevationRange がこれ以上で維持力を重くする */
  steepElevationMeters: number;
  /** 急坂での mid 倍率の最大増分 */
  steepElevationMidBoost: number;
  /** 芝スタートダートで最外枠が得る前半加算の最大値 */
  turfStartOuterGateBonus: number;
  /** 初角が近いコースで最内枠が得る前半加算の最大値 */
  innerGateBonusMax: number;
  /** 初角までが「近い」判定(m) */
  shortFirstCornerMeters: number;
  /** 初角までが「遠い」判定(m)。これ以上なら枠の影響を無視 */
  longFirstCornerMeters: number;
  /** provenance が estimated のときに補正へ掛ける係数 */
  estimatedProvenanceFactor: number;
  /** provenance が documented-secondary のときの係数 */
  secondaryProvenanceFactor: number;
}

export const DEFAULT_COURSE_ADJUSTMENT_CONFIG: CourseAdjustmentConfig = {
  shortStraightMeters: 320,
  longStraightMeters: 480,
  longStraightLateBoost: 0.18,
  shortStraightEarlyBoost: 0.15,
  shortStraightMidBoost: 0.12,
  steepElevationMeters: 3.0,
  steepElevationMidBoost: 0.15,
  turfStartOuterGateBonus: 0.05,
  innerGateBonusMax: 0.04,
  shortFirstCornerMeters: 250,
  longFirstCornerMeters: 600,
  estimatedProvenanceFactor: 0.4,
  secondaryProvenanceFactor: 0.75,
};

/** geometry / surface-profile から抽出したコース特性（v2 が必要とする分だけ） */
export interface CourseFeaturesV2 {
  geometryId: string | null;
  venue: string | null;
  surface: Surface;
  /** main / inner / outer / straight */
  route: string | null;
  direction: 'clockwise' | 'counterclockwise' | 'straight' | null;
  distanceMeters: number;
  /** ホームストレッチ長(m)。公式値 */
  homeStraightLength: number | null;
  /** 高低差(m)。公式値 */
  elevationRange: number | null;
  trackWidth: number | null;
  /** 発走から最初のコーナーまでの距離(m) */
  firstCornerDistance: number | null;
  /** コーナー数 */
  cornerCount: number | null;
  /** 芝スタートダート: 内ラチ側の芝区間長(m) */
  turfLeadInnerMeters: number | null;
  /** 芝スタートダート: 外ラチ側の芝区間長(m)。内外差がある場合のみ */
  turfLeadOuterMeters: number | null;
  /** 芝区間データの出所 */
  turfLeadProvenance: 'official' | 'documented-secondary' | 'estimated' | null;
  /** geometry 自体の出所 */
  geometryProvenance: string | null;
}

/** コース補正の結果 */
export interface CourseAdjustmentV2 {
  /** Phase weight の倍率（1.0 が基準） */
  phaseMultipliers: { early: number; mid: number; late: number };
  /** 芝スタートダートの外枠有利度 [0,1]（0 = 該当なし） */
  turfStartOuterAdvantage: number;
  /** 初角が近いことによる内枠有利度 [0,1]（0 = 該当なし） */
  innerGateAdvantage: number;
  /** ゴール前坂の厳しさ [0,1] */
  finishSlopeSeverity: number;
  /** 直線の長さ [0,1]（0 = 短い / 1 = 長い） */
  straightLengthNorm: number;
  /** 説明用のメモ（explainability で使う） */
  notes: string[];
}

/** provenance に応じた減衰係数 */
function provenanceFactor(
  p: CourseFeaturesV2['turfLeadProvenance'],
  cfg: CourseAdjustmentConfig
): number {
  if (p === 'estimated') return cfg.estimatedProvenanceFactor;
  if (p === 'documented-secondary') return cfg.secondaryProvenanceFactor;
  if (p === 'official') return 1;
  return 0;
}

/**
 * コース特性 → Phase weight 倍率と枠有利度。
 * すべての増分は maxCourseMultiplierDelta 内にクランプする。
 */
export function computeCourseAdjustment(
  features: CourseFeaturesV2,
  cfg: CourseAdjustmentConfig = DEFAULT_COURSE_ADJUSTMENT_CONFIG,
  clamps: ClampConfig = DEFAULT_CLAMPS
): CourseAdjustmentV2 {
  const notes: string[] = [];
  let early = 1;
  let mid = 1;
  let late = 1;

  // ---- 直線の長さ ----
  let straightNorm = 0.5;
  if (features.homeStraightLength != null && Number.isFinite(features.homeStraightLength)) {
    const s = features.homeStraightLength;
    straightNorm = clamp01(
      (s - cfg.shortStraightMeters) / Math.max(1, cfg.longStraightMeters - cfg.shortStraightMeters)
    );

    // 長い直線 → 後半（追い上げ）を重く
    const longW = smoothstep(cfg.shortStraightMeters, cfg.longStraightMeters, s);
    if (longW > 0) {
      late += cfg.longStraightLateBoost * longW;
      if (longW > 0.5) notes.push(`直線${Math.round(s)}m（長い）→ 後半性能を重視`);
    }

    // 短い直線・小回り → 前半位置と道中維持を重く
    const shortW = 1 - smoothstep(cfg.shortStraightMeters, cfg.longStraightMeters, s);
    if (shortW > 0) {
      early += cfg.shortStraightEarlyBoost * shortW;
      mid += cfg.shortStraightMidBoost * shortW;
      if (shortW > 0.5) notes.push(`直線${Math.round(s)}m（短い）→ 前半位置・コーナー維持を重視`);
    }
  }

  // ---- 高低差・ゴール前坂 ----
  let slopeSeverity = 0;
  if (features.elevationRange != null && Number.isFinite(features.elevationRange)) {
    slopeSeverity = clamp01(features.elevationRange / Math.max(0.1, cfg.steepElevationMeters * 1.5));
    const steepW = smoothstep(cfg.steepElevationMeters * 0.5, cfg.steepElevationMeters * 1.5, features.elevationRange);
    if (steepW > 0) {
      mid += cfg.steepElevationMidBoost * steepW;
      if (steepW > 0.5) notes.push(`高低差${features.elevationRange.toFixed(1)}m → 維持力・スタミナを重視`);
    }
  }

  // ---- 芝スタートダート（外枠ほど芝区間が長い） ----
  let turfStartOuter = 0;
  if (features.turfLeadInnerMeters != null && features.turfLeadOuterMeters != null) {
    const diff = features.turfLeadOuterMeters - features.turfLeadInnerMeters;
    if (diff > 0) {
      // 内外差 30m を基準に正規化し、provenance で弱める
      const raw = clamp01(diff / 30);
      turfStartOuter = clamp01(raw * provenanceFactor(features.turfLeadProvenance, cfg));
      if (turfStartOuter > 0) {
        notes.push(
          `芝スタートダート（内${Math.round(features.turfLeadInnerMeters)}m/外${Math.round(
            features.turfLeadOuterMeters
          )}m・${features.turfLeadProvenance}）→ 外枠の位置取りに小さくプラス`
        );
      }
    }
  } else if (features.turfLeadInnerMeters != null && features.turfLeadInnerMeters > 0) {
    // 内外差の資料が無い芝スタートダート。枠差は付けないが記録は残す
    notes.push(
      `芝スタート区間${Math.round(features.turfLeadInnerMeters)}m（内外差の資料なし・${features.turfLeadProvenance}）`
    );
  }

  // ---- 初角までの距離（近いほど枠の影響が大きい） ----
  let innerGate = 0;
  if (features.firstCornerDistance != null && Number.isFinite(features.firstCornerDistance)) {
    const d = features.firstCornerDistance;
    innerGate = 1 - smoothstep(cfg.shortFirstCornerMeters, cfg.longFirstCornerMeters, d);
    if (innerGate > 0.5) {
      notes.push(`初角まで${Math.round(d)}m（近い）→ 内枠の位置取りが有利`);
    }
  }

  // ---- 倍率のクランプ ----
  const d = clamps.maxCourseMultiplierDelta;
  early = clamp(early, 1 - d, 1 + d);
  mid = clamp(mid, 1 - d, 1 + d);
  late = clamp(late, 1 - d, 1 + d);

  return {
    phaseMultipliers: { early, mid, late },
    turfStartOuterAdvantage: turfStartOuter,
    innerGateAdvantage: innerGate,
    finishSlopeSeverity: slopeSeverity,
    straightLengthNorm: straightNorm,
    notes,
  };
}

/** 補正なし（geometry 解決に失敗した場合の安全な既定値） */
export function neutralCourseAdjustment(): CourseAdjustmentV2 {
  return {
    phaseMultipliers: { early: 1, mid: 1, late: 1 },
    turfStartOuterAdvantage: 0,
    innerGateAdvantage: 0,
    finishSlopeSeverity: 0,
    straightLengthNorm: 0.5,
    notes: [],
  };
}

/**
 * 枠番から前半スコアへの加算量を求める。
 *
 * - 芝スタートダートで内外差がある場合: 外枠ほどプラス
 * - 初角が近い場合: 内枠ほどプラス
 * - 両者は相殺しうる（東京ダ1600 のように外枠が芝を長く走るが距離ロスもある）
 * - 合計は maxGateAdjustment にクランプ（単独で順位を大逆転させない）
 *
 * gateNumber は枠番(1..8)。null の場合は 0。
 */
export function gateEarlyAdjustment(
  adj: CourseAdjustmentV2,
  gateNumber: number | null,
  fieldSize: number,
  clamps: ClampConfig = DEFAULT_CLAMPS,
  cfg: CourseAdjustmentConfig = DEFAULT_COURSE_ADJUSTMENT_CONFIG
): number {
  if (gateNumber == null || !Number.isFinite(gateNumber) || fieldSize < 2) return 0;

  // 枠位置を [0,1] に（0 = 最内, 1 = 最外）。JRA の枠は最大8
  const maxGate = 8;
  const outerness = clamp01((gateNumber - 1) / (maxGate - 1));
  const innerness = 1 - outerness;

  let a = 0;
  // 芝スタートダート: 外枠有利
  a += adj.turfStartOuterAdvantage * cfg.turfStartOuterGateBonus * outerness;
  // 初角が近い: 内枠有利
  a += adj.innerGateAdvantage * cfg.innerGateBonusMax * innerness;

  return clamp(a, -clamps.maxGateAdjustment, clamps.maxGateAdjustment);
}
