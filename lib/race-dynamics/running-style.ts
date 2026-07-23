/**
 * race-dynamics / running-style
 *
 * 脚質ごとの挙動パラメータ（純粋）。
 *  escape : スタート反応速い / 序盤前 / 終盤スタミナ低下
 *  front  : 先団維持 / 逃げの後ろ
 *  stalker: 中団 / 終盤前から加速 / 前が詰まれば外
 *  closer : 序盤抑え / 最終区間で強く加速 / 外を回りがち
 */

import type { RunningStyle } from './types';

export interface StyleParams {
  /** 反応遅れの基準(s) */
  reactionDelay: number;
  /** スタートダッシュ係数（速度立ち上がり） */
  startBoost: number;
  /** 目標順位比（0=先頭, 1=最後方）の序盤値 */
  earlyTargetRankRatio: number;
  /** 目標順位比の終盤値 */
  lateTargetRankRatio: number;
  /** 序盤の速度係数 */
  earlySpeedMul: number;
  /** 終盤の速度係数 */
  lateSpeedMul: number;
  /** スタミナ消耗係数（大きいほど早く減る） */
  staminaDrain: number;
  /** 好む横バイアス（負=内, 正=外） */
  lateralBias: number;
}

const PARAMS: Record<RunningStyle, StyleParams> = {
  escape: {
    reactionDelay: 0.15,
    startBoost: 1.15,
    earlyTargetRankRatio: 0.05,
    lateTargetRankRatio: 0.15,
    earlySpeedMul: 1.035,
    lateSpeedMul: 0.965,
    staminaDrain: 1.25,
    lateralBias: -0.6, // 内ラチ寄り
  },
  front: {
    reactionDelay: 0.25,
    startBoost: 1.08,
    earlyTargetRankRatio: 0.2,
    lateTargetRankRatio: 0.25,
    earlySpeedMul: 1.015,
    lateSpeedMul: 0.995,
    staminaDrain: 1.05,
    lateralBias: -0.3,
  },
  stalker: {
    reactionDelay: 0.4,
    startBoost: 1.0,
    earlyTargetRankRatio: 0.55,
    lateTargetRankRatio: 0.35,
    earlySpeedMul: 0.985,
    lateSpeedMul: 1.02,
    staminaDrain: 0.95,
    lateralBias: 0.2,
  },
  closer: {
    reactionDelay: 0.55,
    startBoost: 0.92,
    earlyTargetRankRatio: 0.85,
    lateTargetRankRatio: 0.45,
    earlySpeedMul: 0.955,
    lateSpeedMul: 1.055,
    staminaDrain: 0.85,
    lateralBias: 0.5, // 外を回る
  },
};

export function styleParams(style: RunningStyle): StyleParams {
  return PARAMS[style];
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** 進行率(0..1)に応じた脚質の速度係数（序盤→終盤を滑らかに補間） */
export function styleSpeedMultiplier(style: RunningStyle, progressFrac: number): number {
  const p = clamp01(progressFrac);
  const s = PARAMS[style];
  // 終盤(残り1/3)で late 値へ寄せる
  const t = smoothstep(0.4, 0.85, p);
  return s.earlySpeedMul + (s.lateSpeedMul - s.earlySpeedMul) * t;
}

/** 進行率に応じた目標順位比 */
export function styleTargetRankRatio(style: RunningStyle, progressFrac: number): number {
  const p = clamp01(progressFrac);
  const s = PARAMS[style];
  const t = smoothstep(0.3, 0.8, p);
  return s.earlyTargetRankRatio + (s.lateTargetRankRatio - s.earlyTargetRankRatio) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
