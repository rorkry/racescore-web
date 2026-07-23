/**
 * race-dynamics / formation-adapter
 *
 * 既存レースカードの展開予想（脚質・想定隊列・能力スコア）を
 * race-dynamics の HorseInput へ変換する純粋アダプタ。
 *
 * 同じ展開計算を2D/3Dで二重実装しないため、UIや3Dはこのアダプタ経由で
 * 共通の HorseInput を得る。DB/Three.js には依存しない。
 */

import type { HorseInput, RunningStyle } from './types';

/** 日本語/別名の脚質 → RunningStyle */
const STYLE_ALIASES: Record<string, RunningStyle> = {
  逃げ: 'escape', escape: 'escape', 逃: 'escape',
  先行: 'front', front: 'front', lead: 'front', 先: 'front',
  差し: 'stalker', stalker: 'stalker', sashi: 'stalker', 差: 'stalker',
  追込: 'closer', 追い込み: 'closer', closer: 'closer', oikomi: 'closer', 追: 'closer',
};

export function normalizeRunningStyle(input: string | undefined): RunningStyle | null {
  if (!input) return null;
  const t = input.trim();
  if (STYLE_ALIASES[t]) return STYLE_ALIASES[t];
  for (const key of Object.keys(STYLE_ALIASES)) {
    if (t.includes(key)) return STYLE_ALIASES[key];
  }
  return null;
}

/**
 * 想定順位比（0=先頭, 1=最後方）から脚質を推定する。
 * 既存 estimateSimpleRunningStyle と同じ考え方。
 */
export function inferRunningStyleFromRankRatio(rankRatio: number): RunningStyle {
  const r = rankRatio < 0 ? 0 : rankRatio > 1 ? 1 : rankRatio;
  if (r < 0.15) return 'escape';
  if (r < 0.45) return 'front';
  if (r < 0.75) return 'stalker';
  return 'closer';
}

/** アダプタ入力（レースカード側から得られる最小情報） */
export interface RawFormationHorse {
  horseId?: string;
  horseNumber: number;
  /** 明示脚質（日本語可）。無ければ expectedRankRatio から推定 */
  runningStyle?: string;
  /** 想定順位比 0..1（先頭=0）。runningStyle が無い場合に使用 */
  expectedRankRatio?: number;
  /** 能力スコア。score が生値なら scoreRange で正規化 */
  ability?: number; // 0..1 に正規化済み
  score?: number;   // 生スコア（0..1でない場合）
  /** 0-based 枠順。無ければ配列順 */
  gateIndex?: number;
}

export interface AdaptFormationOptions {
  /** score の正規化レンジ（min,max）。指定時 ability を score から算出 */
  scoreRange?: { min: number; max: number };
}

/**
 * RawFormationHorse[] を HorseInput[] へ変換する。
 * ability は 0..1 に正規化（score があれば scoreRange で線形正規化、無ければ順位比の逆から仮設定）。
 */
export function adaptFormationToHorseInputs(
  raw: RawFormationHorse[],
  opts?: AdaptFormationOptions
): HorseInput[] {
  const n = raw.length;
  return raw.map((h, i) => {
    // 脚質
    let style = normalizeRunningStyle(h.runningStyle);
    if (!style) {
      const ratio =
        h.expectedRankRatio != null ? h.expectedRankRatio : n > 1 ? i / (n - 1) : 0.5;
      style = inferRunningStyleFromRankRatio(ratio);
    }

    // 能力 0..1
    let ability: number;
    if (h.ability != null) {
      ability = clamp01(h.ability);
    } else if (h.score != null && opts?.scoreRange) {
      const { min, max } = opts.scoreRange;
      ability = max > min ? clamp01((h.score - min) / (max - min)) : 0.5;
    } else {
      // 情報が無ければ中庸（順位比から緩く付与）
      const ratio = h.expectedRankRatio != null ? h.expectedRankRatio : n > 1 ? i / (n - 1) : 0.5;
      ability = clamp01(0.65 - ratio * 0.3);
    }

    return {
      horseId: h.horseId ?? String(h.horseNumber),
      horseNumber: h.horseNumber,
      runningStyle: style,
      ability,
      gateIndex: h.gateIndex ?? i,
    };
  });
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
