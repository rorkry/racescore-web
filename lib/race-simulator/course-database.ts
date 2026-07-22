/**
 * レースシミュレーター用コースデータベース
 * 
 * 既存の course-characteristics.ts を拡張し、
 * より詳細なコース形状データを提供
 */

import type { CourseInfo, Corner, Slope } from '@/types/race-simulator';
import { getCourseCharacteristics } from '../course-characteristics';

/**
 * trackType を 'turf' | 'dirt' に正規化する
 *
 * DBの track_type は '芝' / 'ダート'（'ダ'）などの日本語表記のことがあるため、
 * エンジン内部で使う 'turf' / 'dirt' へ統一する。
 * 未対応の値の場合は null を返す。
 */
export function normalizeTrackType(raw: string): 'turf' | 'dirt' | null {
  if (raw === '芝' || raw === 'turf') return 'turf';
  if (raw === 'ダート' || raw === 'ダ' || raw === 'dirt') return 'dirt';
  return null;
}

/**
 * コース情報を取得（シミュレーター用拡張版）
 */
export function getCourseInfo(
  place: string,
  distance: number,
  trackType: 'turf' | 'dirt'
): CourseInfo | null {
  // 既存のコース特性を取得
  const legacy = getCourseCharacteristics(place, distance, trackType === 'turf' ? '芝' : 'ダート');
  
  if (!legacy) {
    return null;
  }
  
  // 詳細コース情報を構築
  const corners = generateCorners(place, distance, trackType);
  const slopes = generateSlopes(place, distance, trackType);
  
  return {
    id: `${place}_${distance}_${trackType}`,
    place,
    distance,
    trackType,
    straightLength: legacy.straightLength,
    startToFirstCorner: legacy.distanceToFirstCorner,
    
    // 【Phase 4.1改善】コースジオメトリ
    courseWidth: 15, // JRA標準: 約15m
    innerRailSafetyMargin: 1.5, // 内柵から1.5m
    outerRailSafetyMargin: 1.0, // 外柵から1.0m
    clockwise: false, // JRAは左回り
    
    corners,
    slopes,
    innerAdvantage: legacy.innerFrameAdvantage,
    outerAdvantage: legacy.outerFrameAdvantage,
    paceTendency: legacy.paceTendency,
  };
}

/**
 * コーナー情報を生成
 * 
 * TODO: JRA公式データから正確な値を取得する
 * 現在は推定値を使用
 */
function generateCorners(
  place: string,
  distance: number,
  trackType: 'turf' | 'dirt'
): Corner[] {
  const corners: Corner[] = [];
  
  // =========================================
  // 東京競馬場（芝）
  // =========================================
  if (place === '東京' && trackType === 'turf') {
    if (distance >= 2400) {
      // 2400m以上: 4コーナー
      corners.push(
        { name: '1コーナー', position: 600, radius: 120, angle: 90 },
        { name: '2コーナー', position: 1000, radius: 120, angle: 90 },
        { name: '3コーナー', position: 1800, radius: 120, angle: 90 },
        { name: '4コーナー', position: 2200, radius: 120, angle: 90 }
      );
    } else if (distance >= 1600) {
      // 1600-2000m: 3,4コーナー
      corners.push(
        { name: '3コーナー', position: distance * 0.6, radius: 120, angle: 90 },
        { name: '4コーナー', position: distance * 0.85, radius: 120, angle: 90 }
      );
    } else {
      // 1400m以下: 直線的
      // コーナーほぼなし
    }
  }
  
  // =========================================
  // 中山競馬場（芝）
  // =========================================
  else if (place === '中山' && trackType === 'turf') {
    if (distance >= 2200) {
      // 2200m以上: 4コーナー
      corners.push(
        { name: '1コーナー', position: 500, radius: 80, angle: 90 },  // タイト
        { name: '2コーナー', position: 900, radius: 80, angle: 90 },
        { name: '3コーナー', position: 1600, radius: 80, angle: 90 },
        { name: '4コーナー', position: 2000, radius: 80, angle: 90 }
      );
    } else if (distance >= 1600) {
      corners.push(
        { name: '3コーナー', position: distance * 0.55, radius: 80, angle: 90 },
        { name: '4コーナー', position: distance * 0.8, radius: 80, angle: 90 }
      );
    }
  }
  
  // =========================================
  // 京都競馬場（芝）
  // =========================================
  else if (place === '京都' && trackType === 'turf') {
    if (distance >= 2400) {
      corners.push(
        { name: '1コーナー', position: 650, radius: 130, angle: 90 },  // ゆったり
        { name: '2コーナー', position: 1100, radius: 130, angle: 90 },
        { name: '3コーナー', position: 1900, radius: 130, angle: 90 },
        { name: '4コーナー', position: 2300, radius: 130, angle: 90 }
      );
    } else if (distance >= 1600) {
      corners.push(
        { name: '3コーナー', position: distance * 0.6, radius: 130, angle: 90 },
        { name: '4コーナー', position: distance * 0.85, radius: 130, angle: 90 }
      );
    }
  }
  
  // =========================================
  // 阪神競馬場（芝）
  // =========================================
  else if (place === '阪神' && trackType === 'turf') {
    if (distance >= 2400) {
      corners.push(
        { name: '1コーナー', position: 600, radius: 110, angle: 90 },
        { name: '2コーナー', position: 1050, radius: 110, angle: 90 },
        { name: '3コーナー', position: 1850, radius: 110, angle: 90 },
        { name: '4コーナー', position: 2250, radius: 110, angle: 90 }
      );
    } else if (distance >= 1600) {
      corners.push(
        { name: '3コーナー', position: distance * 0.58, radius: 110, angle: 90 },
        { name: '4コーナー', position: distance * 0.83, radius: 110, angle: 90 }
      );
    }
  }
  
  // =========================================
  // その他の競馬場はデフォルト値
  // =========================================
  else {
    if (distance >= 2000) {
      const quarterDist = distance / 4;
      corners.push(
        { name: '1コーナー', position: quarterDist, radius: 100, angle: 90 },
        { name: '2コーナー', position: quarterDist * 2, radius: 100, angle: 90 },
        { name: '3コーナー', position: quarterDist * 3 - 200, radius: 100, angle: 90 },
        { name: '4コーナー', position: distance - 200, radius: 100, angle: 90 }
      );
    } else if (distance >= 1400) {
      corners.push(
        { name: '3コーナー', position: distance * 0.6, radius: 100, angle: 90 },
        { name: '4コーナー', position: distance - 200, radius: 100, angle: 90 }
      );
    }
  }
  
  return corners;
}

/**
 * 坂情報を生成
 * 
 * JRA公式情報を基に実装
 */
function generateSlopes(
  place: string,
  distance: number,
  trackType: 'turf' | 'dirt'
): Slope[] {
  const slopes: Slope[] = [];
  
  // =========================================
  // 東京競馬場
  // =========================================
  if (place === '東京') {
    // 向正面に下り坂
    slopes.push({ start: 800, end: 1200, gradient: -1.5, type: 'down' });
    // 直線入口に上り坂
    slopes.push({ start: distance - 400, end: distance - 200, gradient: 2.0, type: 'up' });
  }
  
  // =========================================
  // 中山競馬場
  // =========================================
  else if (place === '中山') {
    // 2コーナー過ぎから上り
    slopes.push({ start: 1000, end: 1300, gradient: 1.8, type: 'up' });
    // 直線入口に急坂
    slopes.push({ start: distance - 300, end: distance - 100, gradient: 2.5, type: 'up' });
  }
  
  // =========================================
  // 京都競馬場
  // =========================================
  else if (place === '京都') {
    // 向正面に緩やかな下り
    slopes.push({ start: 900, end: 1400, gradient: -1.0, type: 'down' });
    // 直線入口に上り
    slopes.push({ start: distance - 350, end: distance - 150, gradient: 1.5, type: 'up' });
  }
  
  // =========================================
  // 阪神競馬場
  // =========================================
  else if (place === '阪神') {
    // 向正面に緩やかな上り
    slopes.push({ start: 800, end: 1200, gradient: 1.2, type: 'up' });
    // 直線はフラット（坂なし）
  }
  
  // =========================================
  // 新潟競馬場
  // =========================================
  else if (place === '新潟') {
    // 直線コース（坂なし）
    // slopes は空配列
  }
  
  // =========================================
  // 中京競馬場
  // =========================================
  else if (place === '中京') {
    // 向正面に緩やかな上り
    slopes.push({ start: 700, end: 1100, gradient: 1.0, type: 'up' });
  }
  
  // =========================================
  // 小倉競馬場
  // =========================================
  else if (place === '小倉') {
    // 3-4コーナーにかけて上り
    slopes.push({ start: distance * 0.6, end: distance * 0.75, gradient: 1.5, type: 'up' });
  }
  
  // =========================================
  // 札幌競馬場
  // =========================================
  else if (place === '札幌') {
    // 向正面に緩やかな上り
    slopes.push({ start: 600, end: 1000, gradient: 1.0, type: 'up' });
  }
  
  // =========================================
  // 函館競馬場
  // =========================================
  else if (place === '函館') {
    // 向正面からゴールまで全体的に緩やかな上り
    slopes.push({ start: 500, end: distance - 100, gradient: 0.8, type: 'up' });
  }
  
  // =========================================
  // 福島競馬場
  // =========================================
  else if (place === '福島') {
    // 直線入口に上り
    slopes.push({ start: distance - 400, end: distance - 200, gradient: 1.3, type: 'up' });
  }
  
  return slopes;
}

/**
 * 全競馬場一覧を取得
 */
export function getAllPlaces(): string[] {
  return [
    '東京', '中山', '京都', '阪神', '中京',
    '新潟', '小倉', '札幌', '函館', '福島'
  ];
}

/**
 * 競馬場の特徴を取得（デバッグ用）
 */
export function getCourseFeatures(place: string): {
  hasSlope: boolean;
  tightCorner: boolean;
  longStraight: boolean;
} {
  const features = {
    hasSlope: false,
    tightCorner: false,
    longStraight: false,
  };
  
  switch (place) {
    case '東京':
      features.hasSlope = true;
      features.longStraight = true; // 525.9m
      break;
    case '中山':
      features.hasSlope = true;
      features.tightCorner = true;
      break;
    case '京都':
      features.hasSlope = true;
      features.longStraight = true; // 404m
      break;
    case '阪神':
      features.hasSlope = true;
      break;
    case '新潟':
      features.longStraight = true; // 直線1000m
      break;
    default:
      break;
  }
  
  return features;
}
