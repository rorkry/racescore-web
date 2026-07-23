/**
 * race-dynamics: 各馬が独立して走るレースダイナミクスの公開API。
 */

export * from './types';
export { mulberry32, hashString, horseRng, uniform, type Rng } from './seed';
export {
  styleParams,
  styleSpeedMultiplier,
  styleTargetRankRatio,
  type StyleParams,
} from './running-style';
export { staminaDrain, staminaSpeedMultiplier } from './stamina';
export { detectTraffic, type TrafficSnapshot, type TrafficResult } from './traffic';
export { computeRanks, type Rankable } from './ranking';
export { simulateRaceDynamics, estimatePace } from './simulator';
export {
  normalizeRunningStyle,
  inferRunningStyleFromRankRatio,
  adaptFormationToHorseInputs,
  type RawFormationHorse,
  type AdaptFormationOptions,
} from './formation-adapter';
