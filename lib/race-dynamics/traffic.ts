/**
 * race-dynamics / traffic
 *
 * 前詰まり（blocked）判定と、回避のための横方向の希望シフト（純粋）。
 * 「同じ lane 帯・前方数m以内・前方馬が遅い」場合に blocked。
 */

export interface TrafficSnapshot {
  raceProgress: number;
  lateralPosition: number;
  speed: number;
  finished: boolean;
}

export interface TrafficResult {
  blocked: boolean;
  /** 回避のための横シフト方向（+1=外 / -1=内 / 0=不要） */
  avoidDir: -1 | 0 | 1;
}

const LOOK_AHEAD = 4.5; // m 前方
const LANE_BAND = 1.6;  // m 横の同帯幅
const SPEED_MARGIN = 0.15; // m/s 前方馬がこれ以上遅いと詰まり

export function detectTraffic(
  self: TrafficSnapshot,
  others: TrafficSnapshot[]
): TrafficResult {
  if (self.finished) return { blocked: false, avoidDir: 0 };

  let blocked = false;
  let innerBlocked = false;
  let outerBlocked = false;

  for (const o of others) {
    if (o === self) continue;
    const gap = o.raceProgress - self.raceProgress;
    if (gap <= 0 || gap > LOOK_AHEAD) continue;
    const dLat = o.lateralPosition - self.lateralPosition;
    if (Math.abs(dLat) > LANE_BAND) continue;
    if (o.speed < self.speed - SPEED_MARGIN) {
      blocked = true;
      // 前方馬が内寄りか外寄りかで、空いている側を判断
      if (dLat <= 0) innerBlocked = true;
      else outerBlocked = true;
    }
  }

  let avoidDir: -1 | 0 | 1 = 0;
  if (blocked) {
    if (outerBlocked && !innerBlocked) avoidDir = -1;
    else avoidDir = 1; // 既定は外へ持ち出す（差し・追込のセオリー）
  }
  return { blocked, avoidDir };
}
