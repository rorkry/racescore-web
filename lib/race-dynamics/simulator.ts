/**
 * race-dynamics / simulator
 *
 * 各馬が独立した raceProgress を持つ決定論シミュレーション。
 * 出力は raceProgress / lateralPosition / speed / rank / stamina / blocked / finished。
 * 3D座標化はしない（描画側で geometry と合成する）。
 *
 * finalSpeed =
 *   baseSpeed * abilityModifier * styleModifier * paceModifier
 *   * staminaModifier * trafficModifier * courseModifier * goingModifier
 */

import type {
  HorseInput,
  RaceDynamicsConfig,
  RaceDynamicsResult,
  RaceDynamicsFrame,
  HorseFrameState,
  PaceType,
} from './types';
import { horseRng, uniform, type Rng } from './seed';
import {
  styleParams,
  styleSpeedMultiplier,
} from './running-style';
import { staminaDrain, staminaSpeedMultiplier } from './stamina';
import { detectTraffic, type TrafficSnapshot } from './traffic';
import { computeRanks } from './ranking';

const BASE_SPEED = 16.0;      // m/s
const MAX_ACCEL = 4.0;        // m/s^2
const MAX_DECEL = 6.0;        // m/s^2
const MAX_LATERAL_SPEED = 1.2; // m/s
const RAIL_MARGIN = 1.0;      // m（ラチからの余白）
const MIN_LATERAL_SPACING = 1.4; // m（馬同士の最小横間隔）
const OVERLAP_PROGRESS_BAND = 2.0; // m（縦に近いとみなす）

interface HorseSim {
  input: HorseInput;
  horseNumber: number;
  rng: Rng;
  reactionDelay: number;
  abilityMod: number;
  drainFactor: number;
  // 動的状態
  raceProgress: number;
  speed: number;
  acceleration: number;
  lateralPosition: number;
  targetLateralPosition: number;
  stamina: number;
  rank: number;
  blocked: boolean;
  finished: boolean;
  finishTime?: number;
}

/** 隊列からペースを推定 */
export function estimatePace(horses: HorseInput[]): PaceType {
  const n = horses.length || 1;
  const front = horses.filter(
    (h) => h.runningStyle === 'escape' || h.runningStyle === 'front'
  ).length;
  const ratio = front / n;
  if (ratio >= 0.4) return 'high';
  if (ratio <= 0.2) return 'slow';
  return 'middle';
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function simulateRaceDynamics(
  horses: HorseInput[],
  config: RaceDynamicsConfig
): RaceDynamicsResult {
  const warnings: string[] = [];
  const dt = config.dt ?? 0.1;
  const frameInterval = config.frameInterval ?? 0.2;
  const raceDistance = config.raceDistance;
  const courseMod = config.courseModifier ?? 1;
  const goingMod = config.goingModifier ?? 1;
  const maxTime = config.maxTime ?? raceDistance / 8 + 60;
  const pace: PaceType = config.pace ?? estimatePace(horses);

  const n = horses.length;
  const halfWidth = Math.max(2, config.trackWidth / 2 - RAIL_MARGIN);
  const spacing = n > 1 ? Math.min((halfWidth * 2) / (n - 1), 2.0) : 0;
  const latStart = -((n - 1) / 2) * spacing;

  // 初期化（馬ごとの決定論ドロー）
  const sims: HorseSim[] = horses.map((input, i) => {
    const rng = horseRng(config.seed, input.horseId || input.horseNumber);
    const sp = styleParams(input.runningStyle);
    const reactionDelay =
      input.reactionDelay ?? Math.max(0.05, sp.reactionDelay + uniform(rng, -0.08, 0.08));
    const abilityMod = 0.95 + input.ability * 0.1 + uniform(rng, -0.008, 0.008);

    // ペースによるスタミナ消耗補正（ハイペースで先行馬が消耗）
    let drainFactor = sp.staminaDrain * (1.1 - input.ability * 0.2);
    if (pace === 'high' && (input.runningStyle === 'escape' || input.runningStyle === 'front')) {
      drainFactor *= 1.2;
    } else if (pace === 'slow' && input.runningStyle === 'closer') {
      drainFactor *= 1.05;
    }

    const staminaBase = input.staminaBase ?? 0.6 + input.ability * 0.3;

    // 枠順ベースの初期横位置（gate 0 = 最内 = 負側）
    const lateral0 = clamp(latStart + i * spacing, -halfWidth, halfWidth);
    const targetLat = clamp(sp.lateralBias * halfWidth * 0.5, -halfWidth, halfWidth);

    return {
      input,
      horseNumber: input.horseNumber,
      rng,
      reactionDelay,
      abilityMod,
      drainFactor,
      raceProgress: 0,
      speed: 0,
      acceleration: 0,
      lateralPosition: lateral0,
      targetLateralPosition: targetLat,
      stamina: clamp(staminaBase, 0, 1),
      rank: i + 1,
      blocked: false,
      finished: false,
      finishTime: undefined,
    };
  });

  const paceMod =
    pace === 'high' ? 1.008 : pace === 'slow' ? 0.994 : 1.0;

  const frames: RaceDynamicsFrame[] = [];
  let t = 0;
  let nextFrameAt = 0;

  const recordFrame = (time: number) => {
    computeRanks(sims);
    const hs: HorseFrameState[] = sims.map((s) => ({
      horseId: s.input.horseId,
      horseNumber: s.input.horseNumber,
      raceProgress: s.raceProgress,
      speed: s.speed,
      acceleration: s.acceleration,
      lateralPosition: s.lateralPosition,
      targetLateralPosition: s.targetLateralPosition,
      runningStyle: s.input.runningStyle,
      ability: s.input.ability,
      stamina: s.stamina,
      rank: s.rank,
      blocked: s.blocked,
      finished: s.finished,
      finishTime: s.finishTime,
    }));
    frames.push({ time: Number(time.toFixed(3)), horses: hs });
  };

  recordFrame(0);
  nextFrameAt = frameInterval;

  let allFinished = false;
  while (!allFinished && t < maxTime) {
    // ステップ開始時のスナップショット（trafficを順序非依存にする）
    const snapshot: TrafficSnapshot[] = sims.map((s) => ({
      raceProgress: s.raceProgress,
      lateralPosition: s.lateralPosition,
      speed: s.speed,
      finished: s.finished,
    }));

    const tNext = t + dt;

    for (let idx = 0; idx < n; idx++) {
      const s = sims[idx];
      if (s.finished) continue;

      const frac = clamp(s.raceProgress / raceDistance, 0, 1);
      const sp = styleParams(s.input.runningStyle);

      // traffic 判定（スナップショット基準）
      const others = snapshot.filter((_, j) => j !== idx);
      const traffic = detectTraffic(snapshot[idx], others);
      s.blocked = traffic.blocked;

      // 速度係数
      const styleMul = styleSpeedMultiplier(s.input.runningStyle, frac);
      const staMul = staminaSpeedMultiplier(s.stamina);
      const trafficMul = traffic.blocked ? 0.9 : 1.0;

      let desired =
        BASE_SPEED *
        s.abilityMod *
        styleMul *
        paceMod *
        staMul *
        trafficMul *
        courseMod *
        goingMod;

      // 反応遅れ: 立ち上がりを抑える
      if (t < s.reactionDelay) {
        desired *= 0.25;
      }

      // 加速度制限（序盤はスタートダッシュ係数）
      const accelCap = MAX_ACCEL * (t < 2 ? sp.startBoost : 1);
      let newSpeed: number;
      if (desired > s.speed) {
        newSpeed = Math.min(desired, s.speed + accelCap * dt);
      } else {
        newSpeed = Math.max(desired, s.speed - MAX_DECEL * dt);
      }
      newSpeed = Math.max(0, newSpeed);
      s.acceleration = (newSpeed - s.speed) / dt;
      s.speed = newSpeed;

      // 進行
      const prevProgress = s.raceProgress;
      let nextProgress = prevProgress + s.speed * dt;

      // スタミナ消耗
      s.stamina = clamp(
        s.stamina - staminaDrain(s.speed, BASE_SPEED, s.drainFactor, dt),
        0,
        1
      );

      // ゴール判定（補間して finishTime を求める）
      if (nextProgress >= raceDistance) {
        const remain = raceDistance - prevProgress;
        const dtToFinish = s.speed > 1e-6 ? remain / s.speed : dt;
        s.finished = true;
        s.finishTime = Number((t + dtToFinish).toFixed(3));
        nextProgress = raceDistance; // 超過禁止
      }
      s.raceProgress = nextProgress;

      // 横移動: 脚質ターゲット + 回避
      let target = s.targetLateralPosition;
      if (traffic.avoidDir !== 0) {
        target = clamp(
          s.lateralPosition + traffic.avoidDir * 2.5,
          -halfWidth,
          halfWidth
        );
      }
      s.targetLateralPosition = target;
      const latDelta = clamp(
        target - s.lateralPosition,
        -MAX_LATERAL_SPEED * dt,
        MAX_LATERAL_SPEED * dt
      );
      s.lateralPosition = clamp(s.lateralPosition + latDelta, -halfWidth, halfWidth);
    }

    // 重なり回避（縦に近い馬同士の横間隔を確保・決定論）
    resolveOverlaps(sims, halfWidth);

    t = tNext;

    // フレーム記録
    if (t >= nextFrameAt - 1e-9) {
      recordFrame(t);
      nextFrameAt += frameInterval;
    }

    allFinished = sims.every((s) => s.finished);
  }

  // 最終フレームを確実に記録
  recordFrame(t);

  if (!allFinished) {
    warnings.push(`maxTime(${maxTime}s)到達で未完走馬あり`);
    // 未完走馬も強制的に完走扱いにはしない（順位は progress で決まる）
  }

  computeRanks(sims);
  const finishOrder = [...sims]
    .filter((s) => s.finished)
    .sort((a, b) => (a.finishTime! - b.finishTime!) || (a.rank - b.rank))
    .map((s) => ({
      horseId: s.input.horseId,
      horseNumber: s.input.horseNumber,
      rank: s.rank,
      finishTime: s.finishTime!,
    }));

  return {
    frames,
    finishOrder,
    raceDistance,
    totalTime: Number(t.toFixed(3)),
    seed: config.seed,
    pace,
    warnings,
  };
}

/** 縦に近い馬同士が同座標に重ならないよう最小横間隔を確保する（決定論・対称push） */
function resolveOverlaps(sims: HorseSim[], halfWidth: number): void {
  const n = sims.length;
  for (let i = 0; i < n; i++) {
    if (sims[i].finished) continue;
    for (let j = i + 1; j < n; j++) {
      if (sims[j].finished) continue;
      const dp = Math.abs(sims[i].raceProgress - sims[j].raceProgress);
      if (dp > OVERLAP_PROGRESS_BAND) continue;
      const dl = sims[j].lateralPosition - sims[i].lateralPosition;
      const absDl = Math.abs(dl);
      if (absDl >= MIN_LATERAL_SPACING) continue;
      const push = (MIN_LATERAL_SPACING - absDl) / 2;
      const dir = dl >= 0 ? 1 : -1;
      sims[i].lateralPosition = clamp(
        sims[i].lateralPosition - dir * push,
        -halfWidth,
        halfWidth
      );
      sims[j].lateralPosition = clamp(
        sims[j].lateralPosition + dir * push,
        -halfWidth,
        halfWidth
      );
    }
  }
}
