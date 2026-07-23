/**
 * race-dynamics / stamina
 *
 * スタミナ消耗と、残スタミナによる速度低下（純粋）。
 * - 速度が高いほど消耗
 * - 序盤に飛ばすほど終盤へ影響
 * - 馬ごとに消耗係数を変える（全馬同時失速を避ける）
 */

/**
 * このステップでのスタミナ消耗量を返す。
 * baseSpeed に対する超過分を二乗で効かせ、飛ばすほど急に減るようにする。
 */
export function staminaDrain(
  speed: number,
  baseSpeed: number,
  drainFactor: number,
  dt: number
): number {
  const ratio = baseSpeed > 0 ? speed / baseSpeed : 1;
  // 基礎消耗 + 超過分の二乗
  const excess = Math.max(0, ratio - 0.9);
  const rate = 0.004 + 1.2 * excess * excess;
  return rate * drainFactor * dt;
}

/** 残スタミナ(0..1)から速度係数（枯れると顕著に落ちる） */
export function staminaSpeedMultiplier(stamina: number): number {
  const s = stamina < 0 ? 0 : stamina > 1 ? 1 : stamina;
  // s=1 → 1.0, s=0.2 → ~0.9, s=0 → ~0.8
  return 0.8 + 0.2 * smooth(s);
}

function smooth(s: number): number {
  return s * s * (3 - 2 * s);
}
