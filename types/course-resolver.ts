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
// ResolvedCourse（resolver の最終出力）
// ===================================

/**
 * resolveCourseLayout の出力（Step 2 で本体実装）。
 * Step 1 では型のみ定義する。
 */
export interface ResolvedCourse {
  // 正規化済みキー
  place: string;
  trackType: 'turf' | 'dirt';
  distance: number;

  // 分離データ
  geometry: RacecourseGeometry;
  layout: RaceLayout;

  // 項目別 provenance
  geometryProvenance: GeometryProvenance;
  layoutProvenance: LayoutProvenance;

  // 互換合成 & 境界
  courseInfo: CourseInfo;          // 既存エンジン互換（geometry+layout から合成）
  boundaries: PhaseBoundaries;     // buildPhaseBoundaries の結果

  // 全体の代表 provenance（最弱値）
  provenance: DataProvenance;

  // generic 使用や推定の警告
  warnings: string[];
}
