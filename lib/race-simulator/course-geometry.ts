/**
 * CourseGeometry
 * 
 * コース上の距離を3D座標へ変換
 */

import type { CourseInfo, Corner, Slope } from '@/types/race-simulator';

export interface TrackPosition {
  x: number;
  y: number;
  z: number;
  tangent: { x: number; y: number; z: number };
  elevation: number;
}

// fallback警告を初回のみ出力するためのフラグ
let fallbackWarningShown = false;

// デバッグ用：最後に使用した座標生成器
let lastGeometrySource: 'specific' | 'generic' | 'fallback' = 'fallback';

/**
 * 最後に使用した座標生成器を取得（デバッグ用）
 */
export function getLastGeometrySource(): string {
  return lastGeometrySource;
}

/**
 * コース上の距離とlateralPositionから3D座標を計算
 */
export function getTrackPosition(
  distance: number,
  lateralPosition: number,
  courseInfo: CourseInfo | null
): TrackPosition {
  // fallback: 直線コースとして扱う
  if (!courseInfo) {
    lastGeometrySource = 'fallback';
    if (!fallbackWarningShown) {
      console.warn('[CourseGeometry] CourseInfo未設定: fallback使用 (この警告は初回のみ表示)');
      console.warn('[CourseGeometry] fallback理由: courseInfo が null または undefined');
      fallbackWarningShown = true;
    }
    return getLinearTrackPosition(distance, lateralPosition, 1600);
  }
  
  // courseInfo があっても、実際の形状データがない場合は generic
  // （現状はすべて generic 扱い、将来的に hakodate などのspecific実装を追加）
  lastGeometrySource = 'generic';
  
  const totalDistance = courseInfo.distance;
  const straightStart = totalDistance - courseInfo.straightLength;
  
  let x = 0, y = 0, z = distance;
  let tangent = { x: 0, y: 0, z: 1 };
  let elevation = 0;
  
  // 直線部分
  if (distance >= straightStart) {
    // 最終直線
    const straightProgress = distance - straightStart;
    z = straightProgress;
    x = lateralPosition;
    tangent = { x: 0, y: 0, z: 1 };
  }
  // コーナー部分
  else if (courseInfo.corners && courseInfo.corners.length > 0) {
    // 3-4コーナーを検索
    const corner = courseInfo.corners.find(c => 
      c.name.includes('3') || c.name.includes('4')
    );
    
    if (corner && distance >= 600 && distance < straightStart) {
      // コーナー座標計算
      const cornerStart = 600;
      const cornerEnd = straightStart;
      const cornerProgress = distance - cornerStart;
      const cornerLength = cornerEnd - cornerStart;
      
      const radius = corner.radius;
      const angleRadians = (corner.angle * Math.PI) / 180;
      const progressAngle = (cornerProgress / cornerLength) * angleRadians;
      
      // 円弧上の座標
      const centerX = -radius;
      const centerZ = cornerStart;
      
      x = centerX + (radius + lateralPosition) * Math.cos(progressAngle);
      z = centerZ + (radius + lateralPosition) * Math.sin(progressAngle);
      
      // 接線（進行方向）
      tangent = {
        x: -(radius + lateralPosition) * Math.sin(progressAngle),
        y: 0,
        z: (radius + lateralPosition) * Math.cos(progressAngle),
      };
      
      // 正規化
      const length = Math.sqrt(tangent.x * tangent.x + tangent.z * tangent.z);
      if (length > 0) {
        tangent.x /= length;
        tangent.z /= length;
      }
    } else {
      // コーナー前: 直線
      z = distance;
      x = lateralPosition;
      tangent = { x: 0, y: 0, z: 1 };
    }
  } else {
    // コーナー情報なし: 直線として扱う
    z = distance;
    x = lateralPosition;
    tangent = { x: 0, y: 0, z: 1 };
  }
  
  // 高低差を取得
  if (courseInfo.slopes) {
    for (const slope of courseInfo.slopes) {
      if (distance >= slope.start && distance <= slope.end) {
        const slopeProgress = distance - slope.start;
        const slopeLength = slope.end - slope.start;
        const slopeHeight = (slope.gradient / 100) * slopeLength;
        
        elevation = (slopeProgress / slopeLength) * slopeHeight;
        
        if (slope.type === 'down') {
          elevation = -elevation;
        }
        
        y = elevation;
        break;
      }
    }
  }
  
  return { x, y, z, tangent, elevation };
}

/**
 * Fallback: 直線コースとして座標を計算
 */
function getLinearTrackPosition(
  distance: number,
  lateralPosition: number,
  totalDistance: number
): TrackPosition {
  return {
    x: lateralPosition,
    y: 0,
    z: distance,
    tangent: { x: 0, y: 0, z: 1 },
    elevation: 0,
  };
}

/**
 * コース境界を取得
 */
export function getCourseBounds(courseInfo: CourseInfo | null): {
  innerBound: number;
  outerBound: number;
  courseWidth: number;
} {
  const courseWidth = courseInfo?.courseWidth || 15;
  const innerSafety = courseInfo?.innerRailSafetyMargin || 1.5;
  const outerSafety = courseInfo?.outerRailSafetyMargin || 1.0;
  
  return {
    innerBound: -(courseWidth / 2 - innerSafety),
    outerBound: courseWidth / 2 - outerSafety,
    courseWidth,
  };
}
