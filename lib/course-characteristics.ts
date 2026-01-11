/**
 * コース特性データベース
 * 
 * 既存APIとの互換性を維持しながら、新しいコースデータを提供
 */

import { COURSE_DATABASE, getCourseData as getNewCourseData } from './course-data';
import type { CourseCharacteristics as NewCourseCharacteristics } from '@/types/course-characteristics';

// ========================================
// 既存インターフェース（互換性維持）
// ========================================

export interface CourseCharacteristics {
  place: string;
  distance: number;
  trackType: string;
  distanceToFirstCorner: number;
  straightLength: number;
  hasSlope: boolean;
  slopePosition?: string;
  innerFrameAdvantage: number;
  outerFrameAdvantage: number;
  turfStartDirt: boolean;
  tightCorner: boolean;
  paceTendency: 'high' | 'middle' | 'slow';
  favoredStyle: 'escape' | 'lead' | 'sashi' | 'oikomi' | 'balanced';
  notes?: string;
  // 新規フィールド
  characteristics?: string[];
  gateAdvantage?: string;
  runningStyleAdvantage?: string[];
  seasonalNotes?: { [month: string]: string };
}

// ========================================
// 枠順有利不利の変換
// ========================================

function convertGateAdvantage(
  gateAdvantage?: string
): { inner: number; outer: number } {
  if (!gateAdvantage) return { inner: 0, outer: 0 };
  
  // 完全一致 or 部分一致で判定
  if (gateAdvantage === '内枠有利') {
    return { inner: -1.0, outer: +0.8 };
  } else if (gateAdvantage === '内枠やや有利') {
    return { inner: -0.5, outer: +0.3 };
  } else if (gateAdvantage === '外枠有利') {
    return { inner: +0.5, outer: -1.0 };
  } else if (gateAdvantage === '外枠やや有利') {
    return { inner: +0.3, outer: -0.5 };
  }
  // 「良馬場時は外枠有利（重馬場では枠順影響少ない）」等のパターン
  // ※良馬場前提で外枠有利とする（重馬場時はバイアス調整で対応）
  else if (gateAdvantage.includes('外枠有利')) {
    return { inner: +0.5, outer: -1.0 };
  } else if (gateAdvantage.includes('内枠有利')) {
    return { inner: -1.0, outer: +0.8 };
  }
  return { inner: 0, outer: 0 };
}

// ========================================
// ペース傾向の変換
// ========================================

function convertPaceTendency(
  paceTendency?: string
): 'high' | 'middle' | 'slow' {
  if (!paceTendency) return 'middle';
  
  if (paceTendency.includes('ハイペース') || paceTendency.includes('前傾')) {
    return 'high';
  } else if (paceTendency.includes('スロー') || paceTendency.includes('後半勝負')) {
    return 'slow';
  }
  return 'middle';
}

// ========================================
// 脚質傾向の変換
// ========================================

function convertFavoredStyle(
  runningStyleAdvantage?: string[]
): 'escape' | 'lead' | 'sashi' | 'oikomi' | 'balanced' {
  if (!runningStyleAdvantage || runningStyleAdvantage.length === 0) {
    return 'balanced';
  }
  
  const first = runningStyleAdvantage[0];
  if (first === '逃げ') return 'escape';
  if (first === '先行') return 'lead';
  if (first === '差し') return 'sashi';
  if (first === '追込') return 'oikomi';
  return 'balanced';
}

// ========================================
// 坂位置の変換
// ========================================

function convertSlopePosition(
  slopeDescription?: string
): string | undefined {
  if (!slopeDescription) return undefined;
  
  if (slopeDescription.includes('直線')) {
    return 'finish';
  } else if (slopeDescription.includes('スタート') || slopeDescription.includes('3コーナー')) {
    return 'start';
  } else if (slopeDescription.includes('両方')) {
    return 'both';
  }
  return 'finish';
}

// ========================================
// 新しいデータから既存形式に変換
// ========================================

function convertToLegacyFormat(
  course: NewCourseCharacteristics
): CourseCharacteristics {
  const gateAdv = convertGateAdvantage(course.gateAdvantage);
  
  // 芝スタートかどうかは新データベースの turfStartDirt フィールドを参照
  const isTurfStartDirt = course.turfStartDirt ?? false;
  
  return {
    place: course.racecourse,
    distance: course.distance,
    trackType: course.surface === '芝' ? '芝' : 'ダ',
    distanceToFirstCorner: course.distanceToFirstCorner,
    straightLength: course.straightDistance || 350,
    hasSlope: course.hasSlope,
    slopePosition: convertSlopePosition(course.slopeDescription),
    innerFrameAdvantage: gateAdv.inner,
    outerFrameAdvantage: gateAdv.outer,
    turfStartDirt: isTurfStartDirt,
    tightCorner: course.distanceToFirstCorner < 300,
    paceTendency: convertPaceTendency(course.paceTendency),
    favoredStyle: convertFavoredStyle(course.runningStyleAdvantage),
    notes: course.notes,
    // 新規フィールド
    characteristics: course.characteristics,
    gateAdvantage: course.gateAdvantage,
    runningStyleAdvantage: course.runningStyleAdvantage,
    seasonalNotes: course.seasonalNotes,
  };
}

// ========================================
// 拡張コースデータベース（既存形式を含む）
// ========================================

export const COURSE_CHARACTERISTICS: Record<string, CourseCharacteristics> = {};

// 新しいデータベースからデータを変換して追加
for (const [key, course] of Object.entries(COURSE_DATABASE)) {
  // キーを既存形式に変換（例: "中山_芝_1200" → "中山_芝1200"）
  const legacyKey = `${course.racecourse}_${course.surface === '芝' ? '芝' : 'ダ'}${course.distance}`;
  
  // 内回り/外回りがある場合
  if (course.trackSize === '内回り' && key.includes('内')) {
    const innerKey = `${legacyKey}_内`;
    COURSE_CHARACTERISTICS[innerKey] = convertToLegacyFormat(course);
  } else if (course.trackSize === '外回り' && key.includes('外')) {
    const outerKey = `${legacyKey}_外`;
    COURSE_CHARACTERISTICS[outerKey] = convertToLegacyFormat(course);
  } else {
    COURSE_CHARACTERISTICS[legacyKey] = convertToLegacyFormat(course);
  }
}

// ========================================
// 既存API（互換性維持）
// ========================================

/**
 * コース特性を取得（既存API）
 */
export function getCourseCharacteristics(
  place: string,
  distance: number,
  trackType: string
): CourseCharacteristics | null {
  // まず既存形式のキーで検索
  const key = `${place}_${trackType}${distance}`;
  
  if (COURSE_CHARACTERISTICS[key]) {
    return COURSE_CHARACTERISTICS[key];
  }
  
  // 新形式で検索（内回り/外回りを含む）
  const surface = trackType === '芝' ? '芝' : 'ダート';
  const newCourse = getNewCourseData(place, surface as '芝' | 'ダート', distance);
  
  if (newCourse) {
    return convertToLegacyFormat(newCourse);
  }
  
  return null;
}

// ========================================
// 新規API
// ========================================

/**
 * コース特性を取得（新形式）
 */
export function getCourseInfo(
  place: string,
  distance: number,
  surface: '芝' | 'ダート' | '芝' | 'ダ',
  trackSize?: '内回り' | '外回り'
): NewCourseCharacteristics | null {
  const normalizedSurface = (surface === 'ダ' ? 'ダート' : surface) as '芝' | 'ダート';
  return getNewCourseData(place, normalizedSurface, distance, trackSize);
}

/**
 * コース特性の詳細テキストを取得
 */
export function getCourseDescription(
  place: string,
  distance: number,
  surface: '芝' | 'ダート' | 'ダ'
): string[] {
  const normalizedSurface = (surface === 'ダ' ? 'ダート' : surface) as '芝' | 'ダート';
  const course = getNewCourseData(place, normalizedSurface, distance);
  
  if (!course) {
    return [`${place}${surface}${distance}mのコース情報は登録されていません`];
  }
  
  return course.characteristics;
}

/**
 * コースのペース傾向テキストを取得
 */
export function getPaceTendencyText(
  place: string,
  distance: number,
  surface: '芝' | 'ダート' | 'ダ'
): string {
  const normalizedSurface = (surface === 'ダ' ? 'ダート' : surface) as '芝' | 'ダート';
  const course = getNewCourseData(place, normalizedSurface, distance);
  
  if (!course || !course.paceTendency) {
    return '標準的なペース配分';
  }
  
  return course.paceTendency;
}

/**
 * コースの枠順有利不利テキストを取得
 */
export function getGateAdvantageText(
  place: string,
  distance: number,
  surface: '芝' | 'ダート' | 'ダ'
): string {
  const normalizedSurface = (surface === 'ダ' ? 'ダート' : surface) as '芝' | 'ダート';
  const course = getNewCourseData(place, normalizedSurface, distance);
  
  if (!course || !course.gateAdvantage) {
    return '枠順影響少ない';
  }
  
  return course.gateAdvantage;
}

// ========================================
// 馬場状態を考慮した特性取得
// ========================================

import type { TrackCondition, ConditionNotes } from '@/types/course-characteristics';

/**
 * 馬場状態を考慮した枠順有利不利を取得
 */
export function getGateAdvantageForCondition(
  place: string,
  distance: number,
  surface: '芝' | 'ダート' | 'ダ',
  condition: TrackCondition
): { inner: number; outer: number; text: string } {
  const normalizedSurface = (surface === 'ダ' ? 'ダート' : surface) as '芝' | 'ダート';
  const course = getNewCourseData(place, normalizedSurface, distance);
  
  if (!course) {
    return { inner: 0, outer: 0, text: '枠順影響少ない' };
  }
  
  // 馬場状態別特性がある場合はそちらを優先
  const conditionNote = course.conditionNotes?.[condition];
  const gateAdvText = conditionNote?.gateAdvantage || course.gateAdvantage || '枠順影響少ない';
  
  // テキストから数値に変換
  let inner = 0;
  let outer = 0;
  
  if (gateAdvText === '内枠有利') {
    inner = -1.0; outer = +0.8;
  } else if (gateAdvText === '内枠やや有利') {
    inner = -0.5; outer = +0.3;
  } else if (gateAdvText === '外枠有利') {
    inner = +0.5; outer = -1.0;
  } else if (gateAdvText === '外枠やや有利') {
    inner = +0.3; outer = -0.5;
  } else if (gateAdvText.includes('外枠有利')) {
    inner = +0.5; outer = -1.0;
  } else if (gateAdvText.includes('内枠有利')) {
    inner = -1.0; outer = +0.8;
  }
  // 「枠順影響少ない」はinner=0, outer=0のまま
  
  return { inner, outer, text: gateAdvText };
}

/**
 * 馬場状態別のコース特性を取得
 */
export function getCourseCharacteristicsForCondition(
  place: string,
  distance: number,
  surface: '芝' | 'ダート' | 'ダ',
  condition: TrackCondition
): {
  characteristics: string[];
  notes: string;
  gateAdvantage: string;
} {
  const normalizedSurface = (surface === 'ダ' ? 'ダート' : surface) as '芝' | 'ダート';
  const course = getNewCourseData(place, normalizedSurface, distance);
  
  if (!course) {
    return {
      characteristics: [],
      notes: '',
      gateAdvantage: '枠順影響少ない'
    };
  }
  
  const conditionNote = course.conditionNotes?.[condition];
  
  if (conditionNote) {
    return {
      characteristics: conditionNote.characteristics || course.characteristics,
      notes: conditionNote.notes || course.notes || '',
      gateAdvantage: conditionNote.gateAdvantage || course.gateAdvantage || '枠順影響少ない'
    };
  }
  
  return {
    characteristics: course.characteristics,
    notes: course.notes || '',
    gateAdvantage: course.gateAdvantage || '枠順影響少ない'
  };
}

// ========================================
// エクスポート
// ========================================

export { COURSE_DATABASE } from './course-data';
export type { CourseCharacteristics as NewCourseCharacteristics, TrackCondition } from '@/types/course-characteristics';
