/**
 * 過去走のペースを [0,1] へ正規化する（純粋関数）
 *
 * 1 = ハイペース（前半が速い） / 0 = スローペース
 *
 * PCI は「小さいほどハイペース」。基準点は既存の
 * utils/getClusterData.ts:28-54 getPaceCat の閾値（超ハイ / 超スロー）をそのまま採用し、
 * 5段階カテゴリではなく連続値へ変換する（境界での不連続を避けるため）。
 */
import { clamp01, isValidNumber, rejectOutOfRange, NEUTRAL } from './normalization';
import { PACE_REFERENCES, VALID_RANGES, type PaceReference } from './config/weights';
import type { PastRaceSample, Surface } from './types';

/** 馬場と距離から PCI の基準点を選ぶ */
export function paceReferenceFor(surface: Surface | null, distanceMeters: number | null): PaceReference {
  const long = isValidNumber(distanceMeters) ? distanceMeters >= 1700 : false;
  if (surface === 'ダ') return long ? PACE_REFERENCES.dirtLong : PACE_REFERENCES.dirtShort;
  // surface 不明時は芝側を既定にする（芝の方が閾値が緩く、過大評価しにくい）
  return long ? PACE_REFERENCES.turfLong : PACE_REFERENCES.turfShort;
}

/**
 * PCI → 「どれだけハイペースだったか」[0,1]。
 * 欠損・範囲外は null（呼び出し側で neutral 扱い）。
 */
export function normalizedEarlyPace(
  pci: number | null | undefined,
  surface: Surface | null,
  distanceMeters: number | null
): number | null {
  const v = rejectOutOfRange(pci ?? null, VALID_RANGES.pci.min, VALID_RANGES.pci.max);
  if (v == null) return null;
  const ref = paceReferenceFor(surface, distanceMeters);
  const span = ref.slowPci - ref.highPci;
  if (!(span > 0)) return NEUTRAL;
  // highPci 以下 → 1（超ハイ） / slowPci 以上 → 0（超スロー）
  return clamp01(1 - (v - ref.highPci) / span);
}

/** 過去走サンプルからペースを取る（pci → rpci の順にフォールバック） */
export function paceOfSample(sample: PastRaceSample): number | null {
  const fromPci = normalizedEarlyPace(sample.pci, sample.surface, sample.distanceMeters);
  if (fromPci != null) return fromPci;
  return normalizedEarlyPace(sample.rpci, sample.surface, sample.distanceMeters);
}
