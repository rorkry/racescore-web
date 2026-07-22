/**
 * タイムライン生成器
 * 
 * フェーズ単位のシミュレーション結果から、
 * 3Dアニメーション用の細かい時系列データを生成
 */

import type { SimulationResult, HorseState, CourseInfo } from '@/types/race-simulator';

/**
 * タイムラインフレーム（特定時点での全馬の状態）
 */
export interface TimelineFrame {
  time: number;              // 経過時間（秒）
  distance: number;          // スタートからの距離（メートル）
  horses: HorsePositionFrame[];
}

/**
 * 特定時点での馬の位置情報
 */
export interface HorsePositionFrame {
  horseNumber: number;
  horseName: string;
  
  // 3D座標
  x: number;                 // 横位置（-10m 〜 +10m、内外を表現）
  y: number;                 // 高さ（アップダウン）
  z: number;                 // 進行方向の位置
  
  // 速度
  velocity: number;          // 現在速度（m/s）
  
  // 状態
  position: number;          // 順位
  staminaRemaining: number;  // 残スタミナ
  isAccelerating: boolean;   // 加速中か
  isBlocked: boolean;        // 前が詰まっているか
}

/**
 * タイムラインを生成
 * 
 * @param result シミュレーション結果
 * @param courseInfo コース情報
 * @param fps フレームレート（デフォルト: 10fps = 0.1秒ごと）
 * @returns タイムラインフレーム配列
 */
export function generateTimeline(
  result: SimulationResult,
  courseInfo: CourseInfo | null,
  fps: number = 10
): TimelineFrame[] {
  const frames: TimelineFrame[] = [];
  const frameInterval = 1 / fps; // 秒
  
  const distance = courseInfo?.distance || 1600;
  const avgSpeed = 16.0; // 平均速度 約16m/s（時速57km）
  const totalTime = distance / avgSpeed; // 総レース時間（秒）
  
  console.log(`[TimelineGenerator] タイムライン生成開始: ${distance}m, 約${totalTime.toFixed(1)}秒`);
  
  // ========================================
  // フェーズごとの時間・距離を定義
  // ========================================
  const phaseTimings = [
    { phase: 'start', distanceStart: 0, distanceEnd: 200, speedMultiplier: 1.1 },      // スタートダッシュ
    { phase: 'formation', distanceStart: 200, distanceEnd: 600, speedMultiplier: 1.0 }, // 隊列形成
    { phase: 'corner3_4', distanceStart: 600, distanceEnd: distance - 400, speedMultiplier: 0.95 }, // コーナー
    { phase: 'straight', distanceStart: distance - 400, distanceEnd: distance, speedMultiplier: 1.15 }, // 直線
  ];
  
  let currentTime = 0;
  
  for (const phaseTiming of phaseTimings) {
    const phaseDistance = phaseTiming.distanceEnd - phaseTiming.distanceStart;
    const phaseSpeed = avgSpeed * phaseTiming.speedMultiplier;
    const phaseTime = phaseDistance / phaseSpeed;
    
    // このフェーズの開始・終了状態を取得
    const phaseResult = getPhaseResult(result, phaseTiming.phase);
    if (!phaseResult) continue;
    
    // フェーズ内をフレーム分割
    const phaseFrameCount = Math.ceil(phaseTime / frameInterval);
    
    for (let i = 0; i <= phaseFrameCount; i++) {
      const frameTime = currentTime + i * frameInterval;
      const frameProgress = i / phaseFrameCount; // 0.0 〜 1.0
      const frameDistance = phaseTiming.distanceStart + phaseDistance * frameProgress;
      
      // この時点での各馬の位置を計算
      const horseFrames: HorsePositionFrame[] = [];
      
      for (const horse of phaseResult.horses) {
        // 順位に応じて前後位置を決定
        const positionOffset = (horse.position - 1) * 3; // 1馬身≒3m
        const horseZ = frameDistance - positionOffset;
        
        // 横位置（内外）
        const horseX = (horse.internalLane - 4.5) * 2; // 内枠=-9m, 外枠=+7m
        
        // 高さ（アップダウン）
        const horseY = calculateElevation(frameDistance, courseInfo);
        
        // 速度
        const velocity = phaseSpeed * (1 + (horse.capabilities.cruiseSpeed - 50) / 100);
        
        horseFrames.push({
          horseNumber: horse.horseNumber,
          horseName: horse.horseName,
          x: horseX,
          y: horseY,
          z: horseZ,
          velocity,
          position: horse.position,
          staminaRemaining: horse.staminaRemaining,
          isAccelerating: phaseTiming.phase === 'straight',
          isBlocked: horse.blocked,
        });
      }
      
      frames.push({
        time: frameTime,
        distance: frameDistance,
        horses: horseFrames,
      });
    }
    
    currentTime += phaseTime;
  }
  
  console.log(`[TimelineGenerator] タイムライン生成完了: ${frames.length}フレーム, ${currentTime.toFixed(1)}秒`);
  
  return frames;
}

/**
 * フェーズ結果を取得
 */
function getPhaseResult(result: SimulationResult, phaseName: string): any {
  switch (phaseName) {
    case 'start':
      return result.phases.start;
    case 'formation':
      return result.phases.formation;
    case 'corner3_4':
      return result.phases.corner3_4;
    case 'straight':
      return result.phases.straight;
    default:
      return null;
  }
}

/**
 * 指定距離地点での高さ（標高）を計算
 * 
 * @param distance スタートからの距離（m）
 * @param courseInfo コース情報
 * @returns 高さ（m）
 */
export function calculateElevation(
  distance: number,
  courseInfo: CourseInfo | null
): number {
  if (!courseInfo || !courseInfo.slopes || courseInfo.slopes.length === 0) {
    return 0; // 平坦
  }
  
  let elevation = 0;
  
  for (const slope of courseInfo.slopes) {
    if (distance >= slope.start && distance <= slope.end) {
      // 坂の範囲内
      const slopeProgress = (distance - slope.start) / (slope.end - slope.start);
      const slopeLength = slope.end - slope.start;
      
      // 勾配から高低差を計算
      // gradient（%）= 高低差 / 距離 × 100
      const heightDiff = (slope.gradient / 100) * slopeLength;
      
      if (slope.type === 'up') {
        elevation += heightDiff * slopeProgress;
      } else {
        elevation -= heightDiff * slopeProgress;
      }
    } else if (distance > slope.end) {
      // 坂を通過済み
      const slopeLength = slope.end - slope.start;
      const heightDiff = (slope.gradient / 100) * slopeLength;
      
      if (slope.type === 'up') {
        elevation += heightDiff;
      } else {
        elevation -= heightDiff;
      }
    }
  }
  
  return elevation;
}

/**
 * タイムラインを滑らかに補間
 * 
 * ベジェ曲線補間を使用して、より自然な動きを実現
 */
export function smoothTimeline(
  frames: TimelineFrame[],
  smoothingFactor: number = 0.3
): TimelineFrame[] {
  if (frames.length < 3) return frames;
  
  const smoothed: TimelineFrame[] = [];
  
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    
    if (i === 0 || i === frames.length - 1) {
      // 最初と最後はそのまま
      smoothed.push(frame);
      continue;
    }
    
    const prevFrame = frames[i - 1];
    const nextFrame = frames[i + 1];
    
    // 各馬の位置を補間
    const smoothedHorses: HorsePositionFrame[] = frame.horses.map((horse, idx) => {
      const prevHorse = prevFrame.horses[idx];
      const nextHorse = nextFrame.horses[idx];
      
      // 3点の加重平均で滑らかに
      const smoothedX = prevHorse.x * smoothingFactor +
                        horse.x * (1 - smoothingFactor * 2) +
                        nextHorse.x * smoothingFactor;
      
      const smoothedZ = prevHorse.z * smoothingFactor +
                        horse.z * (1 - smoothingFactor * 2) +
                        nextHorse.z * smoothingFactor;
      
      return {
        ...horse,
        x: smoothedX,
        z: smoothedZ,
      };
    });
    
    smoothed.push({
      ...frame,
      horses: smoothedHorses,
    });
  }
  
  return smoothed;
}

/**
 * タイムラインをJSON形式でエクスポート
 */
export function exportTimelineAsJSON(frames: TimelineFrame[]): string {
  return JSON.stringify({
    totalFrames: frames.length,
    duration: frames[frames.length - 1]?.time || 0,
    frames: frames.map(f => ({
      t: f.time.toFixed(2),
      d: f.distance.toFixed(1),
      horses: f.horses.map(h => ({
        n: h.horseNumber,
        p: [h.x.toFixed(1), h.y.toFixed(1), h.z.toFixed(1)],
        v: h.velocity.toFixed(1),
        pos: h.position,
      })),
    })),
  }, null, 2);
}
