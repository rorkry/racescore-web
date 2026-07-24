/**
 * racecourse-geometry / types
 *
 * JRA公式コースの「走路ジオメトリ」を表す描画・位置計算専用の型定義。
 *
 * 設計方針（重要）:
 *  - simulation（distance/timeline/phase）とは独立した「場所の正本」。
 *  - 芝とダート、内回り・外回り・直線は必ず別 centerline を持つ（色違い禁止）。
 *  - provenance を正直に持つ。推測を official-traced と偽らない。
 *  - THREE.js に依存しない純粋データ＋純粋関数（テスト容易性のため）。
 *    3D側で {x,y,z} を THREE.Vector3 へ変換して使う。
 */

/** 3D座標（純粋・THREE非依存） */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 走路の位相種別 */
export type RacecoursePathKind =
  | 'closed-loop'   // 周回路（芝main・内・外・ダート等）
  | 'open-path'     // 開いた経路（新潟芝直線1000など）
  | 'network-route'; // 共有区間・分岐・合流を持つ経路（将来拡張。現状は route ごとに独立 centerline）

/** 走路面 */
export type RacecourseSurface = 'turf' | 'dirt';

/** 経路種別 */
export type RacecourseRoute = 'main' | 'inner' | 'outer' | 'straight';

/** 進行方向 */
export type RacecourseDirection = 'clockwise' | 'counterclockwise' | 'straight';

/** ジオメトリの出所（正直に持つ） */
export type GeometrySource =
  | 'official-traced'    // 公式コース図を実トレース（±5m目標）
  | 'official-adjusted'  // 公式の数値（周回長・直線長等）に合わせて補正（±2m目標）
  | 'estimated-fallback'; // 推定・暫定（warning 必須）

export type MarkerConfidence = 'high' | 'medium' | 'fallback';

/** 距離別スタート地点 */
export interface StartMarker {
  /** レース距離(m) */
  raceDistance: number;
  /** centerline 上のスタート地点の弧長距離(m) */
  pathDistance: number;
  /** 使用する route の id */
  routeId: string;
  source: GeometrySource;
  sourceUrl: string;
  confidence: MarkerConfidence;
}

/** 高低差キーフレーム */
export interface ElevationKeyframe {
  /** centerline 上の弧長距離(m) */
  pathDistance: number;
  /** 標高(m)。基準面からの相対値 */
  elevation: number;
}

/** 1つの走路（芝main / 芝inner / dirt / straight など）を表すジオメトリ */
export interface RacecourseGeometry {
  /** 一意ID 例: "hakodate:turf:main" */
  id: string;
  /** 競馬場ID 例: "hakodate" */
  venue: string;
  surface: RacecourseSurface;
  route: RacecourseRoute;
  pathKind: RacecoursePathKind;
  direction: RacecourseDirection;

  /** centerline の制御点列（world座標, y は elevation 反映前の基準 0 でよい） */
  centerlinePoints: Vec3[];

  /** 周回路の総延長(m)。closed-loop のみ。open-path では undefined */
  loopLength?: number;
  /** centerline の弧長総延長(m)。closed-loop では loopLength と一致 */
  pathLength: number;
  /** ゴール板の弧長位置(m) */
  finishPathDistance: number;

  /** 走路幅(m)。距離ごとには分けず、競馬場・芝/ダート・内外区分の基本属性として1つ持つ（代表値） */
  trackWidth: number;
  /** 公式資料の幅員レンジ最小値(m)。範囲表記がある場合のみ */
  trackWidthMinMeters?: number;
  /** 公式資料の幅員レンジ最大値(m)。範囲表記がある場合のみ */
  trackWidthMaxMeters?: number;
  /** 幅員の採用根拠（公式値そのもの／レンジ中央値／既定値継続など） */
  trackWidthSourceNote?: string;
  /** ホームストレッチ長(m)（公式値） */
  homeStraightLength: number;
  /** 高低差(m)（公式値, 最高-最低） */
  elevationRange: number;
  /** 高低差プロファイル */
  elevationProfile: ElevationKeyframe[];

  /** 距離キー("1200"等) → StartMarker */
  startMarkers: Record<string, StartMarker>;

  sourceUrls: string[];
  provenance: GeometrySource;
  warnings: string[];
}

/** samplePathPose の戻り値 */
export interface PathPose {
  /** world座標（elevation 反映後） */
  position: Vec3;
  /** 進行方向の単位接線 */
  tangent: Vec3;
  /** 水平・外向きの単位法線 */
  normal: Vec3;
  /** 方位角 atan2(tangent.x, tangent.z) */
  heading: number;
}
