/**
 * CourseResolver 用の型定義（Step 1）
 *
 * 設計方針:
 *  - 競馬場×馬場で共通の静的事実は RacecourseGeometry に持つ。
 *  - 距離×内外回りで決まるレイアウトは RaceLayout に持つ。
 *  - データ由来（provenance）は「全体値」だけでなく「項目別」にも保持する。
 *    公式値(verified)と推定値(derived)と汎用(generic)を区別する。
 *  - ResolvedCourse.provenance は全項目のうち最も弱い由来を代表値として返す。
 *  - 既存 CourseInfo は当面「互換合成型」として維持し、
 *    RacecourseGeometry + RaceLayout から toCourseInfo() で生成する。
 *
 * ※ Step 1 では resolveCourseLayout 本体（全結線）は実装しない。
 *    ここでは型と、generic モデル生成・正規化・provenance 判定・CourseInfo 合成の
 *    ビルディングブロックのみを提供する。
 */

import type { CourseInfo, Corner, Slope, PhaseBoundaries } from '@/types/race-simulator';

// ===================================
// データ由来（provenance）
// ===================================

/**
 * データ由来のランク
 *  - verified: 公式に確認できた値
 *  - derived:  公式値から計算・推定した形状
 *  - generic:  未登録時の汎用モデル
 */
export type DataProvenance = 'verified' | 'derived' | 'generic';

// ===================================
// 正規化済みの入力キー
// ===================================

/** resolver への入力（生値可） */
export interface CourseResolveInput {
  place: string;                  // 生値可（DB表記、別名を含む）
  trackType: string;              // '芝' | 'ダート' | 'ダ' | 'turf' | 'dirt' 可
  distance: number | string;      // 生値可（'1200m' 等の文字列可）
}

/** 正規化・検証済みのコースキー */
export interface NormalizedCourseKey {
  place: string;                  // 正規化済み競馬場名（日本語正式名 or 未知はそのまま）
  trackType: 'turf' | 'dirt';     // 正規化済み馬場
  distance: number;               // 正の有限数
  /** place が既知の正式名（別名テーブルに載っている / 正式名一覧に含まれる）か */
  placeRecognized: boolean;
}

// ===================================
// 柵位置と 1 周距離
// ===================================

/** 柵位置（A/B/C/D コース） */
export type RailPosition = 'A' | 'B' | 'C' | 'D';

/**
 * 1 周距離情報
 *  - v1 では全柵を必須にしない。
 *  - 使用柵が不明なら defaultRail または representative を使用する。
 *  - データが無い場合に A コースを決め打ちしない。
 */
export interface LapDistanceInfo {
  byRail?: Partial<Record<RailPosition, number>>; // 柵位置別の 1 周距離（m）
  defaultRail?: RailPosition;                      // 既定の柵位置（判明していれば）
  representative?: number;                         // 柵不明時の単一代表値（m）
}

// ===================================
// 回り方向
// ===================================

/** 回り方向コード（cw=右回り, ccw=左回り） */
export type TrackDirectionCode = 'cw' | 'ccw';

// ===================================
// RacecourseGeometry（競馬場×馬場で共通）
// ===================================

export interface RacecourseGeometry {
  place: string;
  trackType: 'turf' | 'dirt';
  direction: TrackDirectionCode;   // 回り方向
  lapDistance?: LapDistanceInfo;   // 芝/ダ別の 1 周距離
  courseWidth?: number;            // コース幅（m）
  elevationRange?: number;         // 高低差（m）
}

/** RacecourseGeometry の項目別 provenance */
export interface GeometryProvenance {
  direction: DataProvenance;
  lapDistance: DataProvenance;
  courseWidth: DataProvenance;
  elevationRange: DataProvenance;
}

// ===================================
// RaceLayout（距離×内外回り別）
// ===================================

export type TrackSizeCode = 'inner' | 'outer' | 'standard';

export interface RaceLayout {
  place: string;
  trackType: 'turf' | 'dirt';
  distance: number;
  trackSize: TrackSizeCode;        // 内回り/外回り/標準
  isStraightCourse: boolean;       // 直線競走か（例: 新潟芝1000）
  startToFirstCorner: number;      // スタート→1コーナー（m）
  straightLength: number;          // ゴール前直線長（m）
  corners: Corner[];               // 公式 or 推定
  slopes: Slope[];
}

/** RaceLayout の項目別 provenance */
export interface LayoutProvenance {
  startToFirstCorner: DataProvenance;
  straightLength: DataProvenance;
  corners: DataProvenance;
  slopes: DataProvenance;
  isStraightCourse: DataProvenance;
}

// ===================================
// generic モデル生成の返り値
// ===================================

export interface GenericGeometryResult {
  geometry: RacecourseGeometry;
  provenance: GeometryProvenance;
}

export interface GenericLayoutResult {
  layout: RaceLayout;
  provenance: LayoutProvenance;
}

// ===================================
// 警告（warning）
// ===================================

/** 安定した警告コード（表示文とは別に機械可読なコードを持つ） */
export type CourseWarningCode =
  | 'GENERIC_MODEL_USED'      // 完全な generic フォールバックを使用
  | 'PLACE_UNRECOGNIZED'      // place が正式名/別名に一致しない
  | 'PARTIAL_REGISTRY_MATCH'  // geometry か layout の片方のみ登録済み
  | 'CORNERS_MISSING'         // コーナーが未登録
  | 'CORNERS_DERIVED'         // コーナーを推定生成した
  | 'SLOPES_MISSING'          // 坂の存在は既知だが位置が未登録
  | 'RAIL_UNKNOWN'            // 使用柵 / 1 周距離が不明
  | 'DIRECTION_GENERIC';      // 回り方向が generic

export interface CourseWarning {
  code: CourseWarningCode;
  message: string;
}

// ===================================
// 解決ソース
// ===================================

/**
 * 解決の由来（provenance とは別軸）。
 *  - registry:         geometry / layout の両方が登録データから解決
 *  - registry-partial: 片方のみ登録データ、他方は generic 補完
 *  - generic:          両方とも未登録（完全 generic フォールバック）
 */
export type ResolutionSource = 'registry' | 'registry-partial' | 'generic';

// ===================================
// ResolvedCourseParts（境界生成前の中間結果）
// ===================================

/**
 * 境界生成前の解決結果。
 * buildPhaseBoundaries を呼ぶ前の状態であり、直線競走など境界が成立しない
 * ケースでもここまでは必ず生成できる（テストで layout を検証するために公開する）。
 */
export interface ResolvedCourseParts {
  place: string;
  trackType: 'turf' | 'dirt';
  distance: number;

  geometry: RacecourseGeometry;
  layout: RaceLayout;

  geometryProvenance: GeometryProvenance;
  layoutProvenance: LayoutProvenance;

  provenance: DataProvenance;         // 全体の代表 provenance（最弱値）
  resolutionSource: ResolutionSource; // 解決の由来
  warnings: CourseWarning[];
}

// ===================================
// ResolvedCourse（resolver の最終出力）
// ===================================

/**
 * resolveCourseLayout の出力。
 * ResolvedCourseParts に、互換合成した CourseInfo と PhaseBoundaries を加えたもの。
 */
export interface ResolvedCourse extends ResolvedCourseParts {
  courseInfo: CourseInfo;          // 既存エンジン互換（geometry+layout から合成）
  boundaries: PhaseBoundaries;     // buildPhaseBoundaries の結果（1回だけ生成）
}
