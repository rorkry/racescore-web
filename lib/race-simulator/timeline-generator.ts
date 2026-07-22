/**
 * TimelineGenerator
 * 
 * SimulationResultから3D描画用のキーフレームを生成
 * Phase境界と主要イベントのみを保存し、描画時に補間
 */

import type { SimulationResult, PhaseResult, HorseState, SimulationEvent } from '@/types/race-simulator';

export interface RaceTimelineKeyframe {
  time: number;
  phase: string;
  eventType?: string;
  eventReason?: string;
  
  horses: {
    horseNumber: number;
    horseName: string;
    
    currentDistance: number;
    currentVelocity: number;
    acceleration: number;
    
    lateralPosition: number;
    targetLateralPosition?: number;
    lateralVelocity?: number;
    
    position: number;
    distanceFromLeader: number;
    staminaRemaining: number;
    
    blocked: boolean;
    outerPath: boolean;
    laneChangeState?: string;
    accelerationStarted?: boolean;
  }[];
}

export interface RaceTimeline {
  raceKey: string;
  totalDuration: number;
  courseDistance: number;
  keyframes: RaceTimelineKeyframe[];
}

/**
 * シミュレーション結果からタイムラインを生成
 */
export function generateTimeline(result: SimulationResult): RaceTimeline {
  const keyframes: RaceTimelineKeyframe[] = [];
  
  console.log('[TimelineGenerator] === タイムライン生成開始 ===');
  
  const phases = ['start', 'formation', 'corner3_4', 'straight', 'goal'];
  
  // Phase境界のキーフレームを生成
  for (const phaseName of phases) {
    const phase = result.phases[phaseName as keyof typeof result.phases];
    if (!phase) continue;
    
    // Phase開始
    keyframes.push(createKeyframe(
      phase.timeRange.start,
      phase.phaseName,
      phase.horses,
      undefined,
      undefined
    ));
    
    // Phase内のイベントからキーフレームを生成
    if (phase.events && phase.events.length > 0) {
      const eventKeyframes = generateEventKeyframes(phase, phase.horses);
      keyframes.push(...eventKeyframes);
    }
    
    // Phase終了
    keyframes.push(createKeyframe(
      phase.timeRange.end,
      phase.phaseName,
      phase.horses,
      'phase_end',
      `${phase.phaseName}終了`
    ));
  }
  
  // 時系列でソート
  keyframes.sort((a, b) => a.time - b.time);
  
  // 重複除去（同じ時刻のキーフレームは最新のものを優先）
  const uniqueKeyframes = deduplicateKeyframes(keyframes);
  
  // 順位変動キーフレームを追加
  const positionChangeKeyframes = detectPositionChanges(uniqueKeyframes);
  uniqueKeyframes.push(...positionChangeKeyframes);
  uniqueKeyframes.sort((a, b) => a.time - b.time);
  
  const totalDuration = uniqueKeyframes.length > 0
    ? uniqueKeyframes[uniqueKeyframes.length - 1].time
    : 0;
  
  const courseDistance = result.phases.goal?.distanceRange.end || 1600;
  
  console.log(`[TimelineGenerator] キーフレーム生成完了: ${uniqueKeyframes.length}件`);
  console.log(`[TimelineGenerator] 総再生時間: ${totalDuration.toFixed(1)}秒`);
  console.log(`[TimelineGenerator] コース距離: ${courseDistance}m`);
  
  // キーフレーム診断ログ（馬1番について）
  if (uniqueKeyframes.length > 0) {
    const firstFrame = uniqueKeyframes[0];
    const midFrame = uniqueKeyframes[Math.floor(uniqueKeyframes.length / 2)];
    const lastFrame = uniqueKeyframes[uniqueKeyframes.length - 1];
    
    const horse1First = firstFrame.horses.find(h => h.horseNumber === 1);
    const horse1Mid = midFrame.horses.find(h => h.horseNumber === 1);
    const horse1Last = lastFrame.horses.find(h => h.horseNumber === 1);
    
    console.log('[TimelineGenerator] === キーフレーム診断（馬1番） ===');
    console.log('[TimelineGenerator] 先頭フレーム:', {
      time: firstFrame.time,
      horse1: horse1First ? {
        currentDistance: horse1First.currentDistance,
        currentVelocity: horse1First.currentVelocity,
        position: horse1First.position,
        distanceFromLeader: horse1First.distanceFromLeader
      } : 'NOT FOUND'
    });
    console.log('[TimelineGenerator] 中間フレーム:', {
      time: midFrame.time,
      horse1: horse1Mid ? {
        currentDistance: horse1Mid.currentDistance,
        currentVelocity: horse1Mid.currentVelocity,
        position: horse1Mid.position,
        distanceFromLeader: horse1Mid.distanceFromLeader
      } : 'NOT FOUND'
    });
    console.log('[TimelineGenerator] 最終フレーム:', {
      time: lastFrame.time,
      horse1: horse1Last ? {
        currentDistance: horse1Last.currentDistance,
        currentVelocity: horse1Last.currentVelocity,
        position: horse1Last.position,
        distanceFromLeader: horse1Last.distanceFromLeader
      } : 'NOT FOUND'
    });
  }
  
  return {
    raceKey: result.raceKey,
    totalDuration,
    courseDistance,
    keyframes: uniqueKeyframes,
  };
}

/**
 * Phase内のイベントからキーフレームを生成
 */
function generateEventKeyframes(
  phase: PhaseResult,
  horses: HorseState[]
): RaceTimelineKeyframe[] {
  const keyframes: RaceTimelineKeyframe[] = [];
  
  for (const event of phase.events) {
    // イベント時刻を推定（Phase内の相対位置から）
    const eventTime = estimateEventTime(event, phase);
    
    keyframes.push(createKeyframe(
      eventTime,
      phase.phaseName,
      horses,
      event.event,
      event.description
    ));
  }
  
  return keyframes;
}

/**
 * イベント発生時刻を推定
 */
function estimateEventTime(event: SimulationEvent, phase: PhaseResult): number {
  // イベントタイプに基づいて時刻を推定
  const phaseStart = phase.timeRange.start;
  const phaseEnd = phase.timeRange.end;
  const phaseDuration = phaseEnd - phaseStart;
  
  switch (event.event) {
    case 'accelerate':
      // 加速開始: Phase後半
      return phaseStart + phaseDuration * 0.7;
    
    case 'cut-in':
    case 'lane-change':
      // レーン変更: Phase中盤
      return phaseStart + phaseDuration * 0.5;
    
    case 'stamina-loss':
      // スタミナ低下: Phase中盤〜後半
      return phaseStart + phaseDuration * 0.6;
    
    default:
      // デフォルト: Phase中盤
      return phaseStart + phaseDuration * 0.5;
  }
}

/**
 * キーフレームを作成
 */
function createKeyframe(
  time: number,
  phase: string,
  horses: HorseState[],
  eventType?: string,
  eventReason?: string
): RaceTimelineKeyframe {
  return {
    time,
    phase,
    eventType,
    eventReason,
    horses: horses.map(h => ({
      horseNumber: h.horseNumber,
      horseName: h.horseName,
      currentDistance: h.currentDistance,
      currentVelocity: h.currentVelocity,
      acceleration: 0, // TODO: 前後のフレームから計算
      lateralPosition: h.lateralPosition,
      targetLateralPosition: h.targetLateralPosition,
      lateralVelocity: h.lateralVelocity,
      position: h.position,
      distanceFromLeader: h.distanceFromLeader,
      staminaRemaining: h.staminaRemaining,
      blocked: h.blocked,
      outerPath: h.outerPath,
      laneChangeState: h.laneChangeState,
      accelerationStarted: h.accelerationStarted,
    })),
  };
}

/**
 * 重複キーフレームを除去
 */
function deduplicateKeyframes(keyframes: RaceTimelineKeyframe[]): RaceTimelineKeyframe[] {
  const uniqueMap = new Map<number, RaceTimelineKeyframe>();
  
  for (const kf of keyframes) {
    const key = Math.round(kf.time * 10) / 10; // 0.1秒単位で丸める
    uniqueMap.set(key, kf); // 後の方を優先
  }
  
  return Array.from(uniqueMap.values()).sort((a, b) => a.time - b.time);
}

/**
 * 順位変動を検出してキーフレームを追加
 */
function detectPositionChanges(keyframes: RaceTimelineKeyframe[]): RaceTimelineKeyframe[] {
  const positionChangeKeyframes: RaceTimelineKeyframe[] = [];
  
  for (let i = 1; i < keyframes.length; i++) {
    const prev = keyframes[i - 1];
    const curr = keyframes[i];
    
    // 各馬の順位変動をチェック
    for (const currHorse of curr.horses) {
      const prevHorse = prev.horses.find(h => h.horseNumber === currHorse.horseNumber);
      if (!prevHorse) continue;
      
      if (currHorse.position !== prevHorse.position) {
        // 順位変動があった場合、中間地点にキーフレームを追加
        const midTime = (prev.time + curr.time) / 2;
        
        // 既存のキーフレームと重複しないか確認
        const existingMidpoint = keyframes.find(kf => Math.abs(kf.time - midTime) < 0.1);
        if (!existingMidpoint) {
          // 補間した状態を作成
          const midHorses = curr.horses.map(h => {
            const prevH = prev.horses.find(ph => ph.horseNumber === h.horseNumber);
            if (!prevH) return h;
            
            return {
              ...h,
              currentDistance: (prevH.currentDistance + h.currentDistance) / 2,
              currentVelocity: (prevH.currentVelocity + h.currentVelocity) / 2,
              lateralPosition: (prevH.lateralPosition + h.lateralPosition) / 2,
              staminaRemaining: (prevH.staminaRemaining + h.staminaRemaining) / 2,
            };
          });
          
          positionChangeKeyframes.push({
            time: midTime,
            phase: curr.phase,
            eventType: 'position_change',
            eventReason: `順位変動: ${currHorse.horseName} ${prevHorse.position}位→${currHorse.position}位`,
            horses: midHorses,
          });
        }
      }
    }
  }
  
  return positionChangeKeyframes;
}

/**
 * 時間補間: 前後のキーフレームから現在状態を計算
 */
export function interpolateTimeline(
  timeline: RaceTimeline,
  currentTime: number
): RaceTimelineKeyframe | null {
  if (timeline.keyframes.length === 0) return null;
  
  // 最初または最後のキーフレーム
  if (currentTime <= timeline.keyframes[0].time) {
    return timeline.keyframes[0];
  }
  if (currentTime >= timeline.keyframes[timeline.keyframes.length - 1].time) {
    return timeline.keyframes[timeline.keyframes.length - 1];
  }
  
  // 前後のキーフレームを検索
  let prevFrame = timeline.keyframes[0];
  let nextFrame = timeline.keyframes[1];
  
  for (let i = 0; i < timeline.keyframes.length - 1; i++) {
    if (currentTime >= timeline.keyframes[i].time && currentTime < timeline.keyframes[i + 1].time) {
      prevFrame = timeline.keyframes[i];
      nextFrame = timeline.keyframes[i + 1];
      break;
    }
  }
  
  // 補間係数（easeInOut）
  const duration = nextFrame.time - prevFrame.time;
  const rawT = duration > 0 ? (currentTime - prevFrame.time) / duration : 0;
  const t = easeInOut(rawT);
  
  // 各馬の状態を補間
  const interpolatedHorses = prevFrame.horses.map((prevHorse, idx) => {
    const nextHorse = nextFrame.horses.find(h => h.horseNumber === prevHorse.horseNumber);
    if (!nextHorse) return prevHorse;
    
    return {
      ...prevHorse,
      currentDistance: lerp(prevHorse.currentDistance, nextHorse.currentDistance, t),
      currentVelocity: lerp(prevHorse.currentVelocity, nextHorse.currentVelocity, t),
      
      // レーン変更中はeaseInOutで滑らかに
      lateralPosition: prevHorse.laneChangeState === 'moving'
        ? lerp(prevHorse.lateralPosition, nextHorse.lateralPosition, t)
        : lerp(prevHorse.lateralPosition, nextHorse.lateralPosition, rawT),
      
      staminaRemaining: lerp(prevHorse.staminaRemaining, nextHorse.staminaRemaining, t),
      
      // 離散状態は閾値で切り替え
      position: t < 0.5 ? prevHorse.position : nextHorse.position,
      blocked: t < 0.5 ? prevHorse.blocked : nextHorse.blocked,
      laneChangeState: t < 0.5 ? prevHorse.laneChangeState : nextHorse.laneChangeState,
      accelerationStarted: prevHorse.accelerationStarted || nextHorse.accelerationStarted,
    };
  });
  
  return {
    time: currentTime,
    phase: prevFrame.phase,
    eventType: nextFrame.eventType,
    eventReason: nextFrame.eventReason,
    horses: interpolatedHorses,
  };
}

/**
 * easeInOut補間
 */
function easeInOut(t: number): number {
  return t < 0.5
    ? 2 * t * t
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * 線形補間
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
