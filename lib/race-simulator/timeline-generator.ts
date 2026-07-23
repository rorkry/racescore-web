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
  
  // 非有限 time のキーフレームを除外（NaN/Infinity）。
  // これを残すと dedup の Map キー(Math.round(NaN*10)/10=NaN)が衝突して全フレームが1件に潰れ、
  // totalDuration が NaN、補間0件になり 3D がクラッシュする（本番の 1000m 症状の直接原因）。
  const finiteKeyframes = keyframes.filter((k) => Number.isFinite(k.time));
  if (finiteKeyframes.length < keyframes.length) {
    console.error(
      `[TimelineGenerator] ❌ 非有限timeのキーフレームを${keyframes.length - finiteKeyframes.length}件除外（phase timeRangeにNaN/Infinityが混入）`
    );
  }
  
  // 時系列でソート
  finiteKeyframes.sort((a, b) => a.time - b.time);
  
  // 重複除去（同じ時刻のキーフレームは最新のものを優先）
  const uniqueKeyframes = deduplicateKeyframes(finiteKeyframes);
  
  // 順位変動キーフレームを追加
  const positionChangeKeyframes = detectPositionChanges(uniqueKeyframes);
  uniqueKeyframes.push(...positionChangeKeyframes);
  uniqueKeyframes.sort((a, b) => a.time - b.time);
  
  const lastTime = uniqueKeyframes.length > 0
    ? uniqueKeyframes[uniqueKeyframes.length - 1].time
    : 0;
  // 多重防御: 最終 time が非有限なら 0 とみなす（下流の frameCount 計算を壊さない）
  const totalDuration = Number.isFinite(lastTime) ? lastTime : 0;
  
  // レース距離は result.raceDistance から取得（fallbackなし）
  const courseDistance = result.raceDistance;
  
  // 整合性確認：ゴールフェーズの距離と一致するか
  if (
    result.phases.goal?.distanceRange.end != null &&
    result.phases.goal.distanceRange.end !== courseDistance
  ) {
    console.warn('[TimelineGenerator] ⚠️ ゴール距離不一致', {
      raceDistance: courseDistance,
      goalDistanceEnd: result.phases.goal.distanceRange.end,
      差: Math.abs(courseDistance - result.phases.goal.distanceRange.end)
    });
  }
  
  console.warn('[TimelineGenerator] ========== タイムライン生成完了 ==========');
  console.warn('[TimelineGenerator] 距離情報:', {
    raceDistance: result.raceDistance,
    goalDistanceRangeEnd: result.phases.goal?.distanceRange.end,
    courseDistance: courseDistance
  });
  console.warn('[TimelineGenerator] フェーズ別件数:', {
    start: result.phases.start?.horses?.length || 0,
    formation: result.phases.formation?.horses?.length || 0,
    pace: result.phases.pace?.horses?.length || 0,
    corner3_4: result.phases.corner3_4?.horses?.length || 0,
    straight: result.phases.straight?.horses?.length || 0,
    goal: result.phases.goal?.horses?.length || 0,
  });
  console.warn(`[TimelineGenerator] 元キーフレーム数: ${uniqueKeyframes.length}件`);
  console.warn(`[TimelineGenerator] 総再生時間: ${totalDuration.toFixed(1)}秒`);
  console.warn(`[TimelineGenerator] コース距離: ${courseDistance}m`);
  
  // ========================================
  // キーフレーム補間（10fps）
  // ========================================
  const interpolatedKeyframes = interpolateKeyframes(uniqueKeyframes, totalDuration);
  
  console.warn('[TimelineGenerator] 補間完了:', {
    元キーフレーム数: uniqueKeyframes.length,
    補間後キーフレーム数: interpolatedKeyframes.length,
    fps: 10
  });
  
  // 馬1番の距離変化を詳細確認
  if (interpolatedKeyframes.length > 0) {
    const horse1Frames = interpolatedKeyframes
      .map((f, idx) => ({ idx, horse: f.horses.find(h => h.horseNumber === 1), time: f.time }))
      .filter(x => x.horse);
    
    if (horse1Frames.length > 0) {
      const first = horse1Frames[0];
      const mid = horse1Frames[Math.floor(horse1Frames.length / 2)];
      const last = horse1Frames[horse1Frames.length - 1];
      
      // 10秒、20秒、30秒時点を探す
      const at10s = horse1Frames.find(x => x.time >= 10);
      const at20s = horse1Frames.find(x => x.time >= 20);
      const at30s = horse1Frames.find(x => x.time >= 30);
      
      console.warn('[TimelineGenerator] 馬1番の距離変化:', {
        先頭: first.horse?.currentDistance.toFixed(1) + 'm',
        中間: mid.horse?.currentDistance.toFixed(1) + 'm',
        最終: last.horse?.currentDistance.toFixed(1) + 'm',
        '10秒時点': at10s?.horse?.currentDistance.toFixed(1) + 'm' || 'N/A',
        '20秒時点': at20s?.horse?.currentDistance.toFixed(1) + 'm' || 'N/A',
        '30秒時点': at30s?.horse?.currentDistance.toFixed(1) + 'm' || 'N/A',
      });
      
      // 隣接フレーム間の距離差を確認（最初の10フレーム）
      const deltaCheck = horse1Frames.slice(0, Math.min(10, horse1Frames.length - 1)).map((frame, i) => {
        if (i === horse1Frames.length - 1) return null;
        const next = horse1Frames[i + 1];
        const delta = (next.horse?.currentDistance || 0) - (frame.horse?.currentDistance || 0);
        return delta;
      }).filter(d => d !== null);
      
      const allPositive = deltaCheck.every(d => d! > 0);
      const allZero = deltaCheck.every(d => d === 0);
      
      console.warn('[TimelineGenerator] 隣接フレーム間の距離差:', {
        最初の10フレーム: deltaCheck.map(d => d?.toFixed(2) + 'm').join(', '),
        全て正の値: allPositive ? 'YES ✓' : 'NO ❌',
        全てゼロ: allZero ? 'YES ❌' : 'NO ✓',
      });
    }
  }
  
  // キーフレーム診断ログ（補間後のデータで実行）
  if (interpolatedKeyframes.length === 0) {
    console.error('[TimelineGenerator] ❌ キーフレームが0件です！');
  } else {
    const firstFrame = interpolatedKeyframes[0];
    const midFrame = interpolatedKeyframes[Math.floor(interpolatedKeyframes.length / 2)];
    const lastFrame = interpolatedKeyframes[interpolatedKeyframes.length - 1];
    
    // 馬1番
    const horse1First = firstFrame.horses.find(h => h.horseNumber === 1);
    const horse1Mid = midFrame.horses.find(h => h.horseNumber === 1);
    const horse1Last = lastFrame.horses.find(h => h.horseNumber === 1);
    
    // 先頭馬（position === 1）
    const leaderFirst = firstFrame.horses.find(h => h.position === 1);
    const leaderMid = midFrame.horses.find(h => h.position === 1);
    const leaderLast = lastFrame.horses.find(h => h.position === 1);
    
    console.log('[TimelineGenerator] === キーフレーム診断 ===');
    
    // 同一参照チェック
    console.log('[TimelineGenerator] 同一参照チェック:', {
      horses配列: firstFrame.horses === midFrame.horses,
      馬1番: horse1First === horse1Mid,
      先頭馬: leaderFirst === leaderMid
    });
    
    console.log('[TimelineGenerator] 馬1番:');
    console.log('  先頭フレーム (t=' + firstFrame.time.toFixed(1) + 's):', horse1First ? {
      currentDistance: horse1First.currentDistance.toFixed(1),
      currentVelocity: horse1First.currentVelocity.toFixed(1),
      position: horse1First.position,
      distanceFromLeader: horse1First.distanceFromLeader.toFixed(1)
    } : 'NOT FOUND');
    
    console.log('  中間フレーム (t=' + midFrame.time.toFixed(1) + 's):', horse1Mid ? {
      currentDistance: horse1Mid.currentDistance.toFixed(1),
      currentVelocity: horse1Mid.currentVelocity.toFixed(1),
      position: horse1Mid.position,
      distanceFromLeader: horse1Mid.distanceFromLeader.toFixed(1)
    } : 'NOT FOUND');
    
    console.log('  最終フレーム (t=' + lastFrame.time.toFixed(1) + 's):', horse1Last ? {
      currentDistance: horse1Last.currentDistance.toFixed(1),
      currentVelocity: horse1Last.currentVelocity.toFixed(1),
      position: horse1Last.position,
      distanceFromLeader: horse1Last.distanceFromLeader.toFixed(1)
    } : 'NOT FOUND');
    
    console.log('[TimelineGenerator] 先頭馬 (position=1):');
    console.log('  先頭フレーム:', leaderFirst ? {
      horseNumber: leaderFirst.horseNumber,
      horseName: leaderFirst.horseName,
      currentDistance: leaderFirst.currentDistance.toFixed(1),
      distanceFromLeader: leaderFirst.distanceFromLeader.toFixed(1)
    } : 'NOT FOUND');
    
    console.log('  中間フレーム:', leaderMid ? {
      horseNumber: leaderMid.horseNumber,
      horseName: leaderMid.horseName,
      currentDistance: leaderMid.currentDistance.toFixed(1),
      distanceFromLeader: leaderMid.distanceFromLeader.toFixed(1)
    } : 'NOT FOUND');
    
    console.log('  最終フレーム:', leaderLast ? {
      horseNumber: leaderLast.horseNumber,
      horseName: leaderLast.horseName,
      currentDistance: leaderLast.currentDistance.toFixed(1),
      distanceFromLeader: leaderLast.distanceFromLeader.toFixed(1)
    } : 'NOT FOUND');
  }
  
  return {
    raceKey: result.raceKey,
    totalDuration,
    courseDistance,
    keyframes: interpolatedKeyframes, // 補間済みキーフレームを返す
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

/**
 * キーフレームを10fpsで補間
 */
function interpolateKeyframes(
  sourceKeyframes: TimelineFrame[],
  totalDuration: number
): TimelineFrame[] {
  if (sourceKeyframes.length === 0) {
    return [];
  }
  
  if (sourceKeyframes.length === 1) {
    return sourceKeyframes;
  }
  
  const fps = 10;
  // duration が非有限/非正だと frameCount が NaN/0 になり補間結果が0件 → 3Dが空配列を受け取り落ちる。
  // その場合は「動かないが有効な」ソースキーフレーム自体を返し（>=2件）、初期位置は表示できるようにする。
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    console.error(`[TimelineGenerator] ❌ totalDuration が不正(${totalDuration}) → 補間せずソースキーフレームを返す`);
    return sourceKeyframes;
  }
  const frameCount = Math.ceil(totalDuration * fps);
  if (!Number.isFinite(frameCount) || frameCount <= 0) {
    console.error(`[TimelineGenerator] ❌ frameCount が不正(${frameCount}) → ソースキーフレームを返す`);
    return sourceKeyframes;
  }
  const interpolatedFrames: TimelineFrame[] = [];
  
  for (let i = 0; i < frameCount; i++) {
    const currentTime = (i / fps);
    
    // 前後のキーフレームを探す
    let prevFrame = sourceKeyframes[0];
    let nextFrame = sourceKeyframes[sourceKeyframes.length - 1];
    
    for (let j = 0; j < sourceKeyframes.length - 1; j++) {
      if (sourceKeyframes[j].time <= currentTime && sourceKeyframes[j + 1].time >= currentTime) {
        prevFrame = sourceKeyframes[j];
        nextFrame = sourceKeyframes[j + 1];
        break;
      }
    }
    
    // 補間係数を計算
    const timeDiff = nextFrame.time - prevFrame.time;
    const t = timeDiff > 0 ? (currentTime - prevFrame.time) / timeDiff : 0;
    
    // 各馬を補間
    const interpolatedHorses = prevFrame.horses.map(prevHorse => {
      const nextHorse = nextFrame.horses.find(h => h.horseNumber === prevHorse.horseNumber);
      if (!nextHorse) {
        return prevHorse;
      }
      
      return {
        horseNumber: prevHorse.horseNumber,
        horseName: prevHorse.horseName,
        waku: prevHorse.waku,
        
        // 線形補間
        currentDistance: lerp(prevHorse.currentDistance, nextHorse.currentDistance, t),
        currentVelocity: lerp(prevHorse.currentVelocity, nextHorse.currentVelocity, t),
        acceleration: lerp(prevHorse.acceleration || 0, nextHorse.acceleration || 0, t),
        lateralPosition: lerp(prevHorse.lateralPosition, nextHorse.lateralPosition, t),
        distanceFromLeader: lerp(prevHorse.distanceFromLeader, nextHorse.distanceFromLeader, t),
        staminaRemaining: lerp(prevHorse.staminaRemaining, nextHorse.staminaRemaining, t),
        
        // boolean値は前後どちらか近い方
        blocked: t < 0.5 ? prevHorse.blocked : nextHorse.blocked,
        outerPath: t < 0.5 ? prevHorse.outerPath : nextHorse.outerPath,
        
        // position は補間後に再計算（暫定的に前の値を使用）
        position: prevHorse.position,
        
        // その他のフィールド
        internalLane: prevHorse.internalLane,
        capabilities: prevHorse.capabilities,
        leadingIntention: prevHorse.leadingIntention,
        pastPositionPattern: prevHorse.pastPositionPattern,
        runningStyle: prevHorse.runningStyle,
        baseSpeed: prevHorse.baseSpeed,
        laneChangeState: t < 0.5 ? prevHorse.laneChangeState : nextHorse.laneChangeState,
        accelerationStarted: prevHorse.accelerationStarted || nextHorse.accelerationStarted,
        weight: prevHorse.weight,
      };
    });
    
    // currentDistance でソートして position を再計算
    const sortedHorses = [...interpolatedHorses].sort((a, b) => b.currentDistance - a.currentDistance);
    sortedHorses.forEach((horse, index) => {
      horse.position = index + 1;
    });
    
    interpolatedFrames.push({
      time: currentTime,
      phase: prevFrame.phase,
      eventType: t < 0.5 ? prevFrame.eventType : nextFrame.eventType,
      eventReason: t < 0.5 ? prevFrame.eventReason : nextFrame.eventReason,
      horses: sortedHorses,
    });
  }
  
  return interpolatedFrames;
}
