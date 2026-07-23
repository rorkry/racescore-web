/**
 * TimelineValidation
 *
 * timeline（生成前のキーフレーム列 / 生成後の RaceTimeline）が
 * 3D 描画・再生に耐える契約を満たすかを判定する純粋関数群。
 *
 * 目的:
 *   - 空配列 / NaN / Infinity / 非単調 / duration不正 な timeline を
 *     3D へ渡す前に検出し、クラッシュ（timeline[0] 参照, NaN currentTime,
 *     NaN FOV/position など）を未然に防ぐ。
 *   - fallback でバグを隠さず、原因（errors）を呼び出し側へ返す。
 *
 * ※ React/Three.js に依存しない。単体テスト可能。
 */

import type { RaceTimeline } from './timeline-generator';

export interface TimelineValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 生成前後どちらでも使える「time を持つキーフレーム列」の契約検証。
 *
 * 契約:
 *   - frames.length >= 2
 *   - 全 time が有限
 *   - first.time === 0
 *   - last.time > 0
 *   - time が単調非減少
 */
export function validateTimelineKeyframes(
  frames: ReadonlyArray<{ time: number }> | null | undefined
): TimelineValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(frames)) {
    return { valid: false, errors: ['キーフレーム配列が存在しない'] };
  }
  if (frames.length < 2) {
    errors.push(`キーフレームが不足（${frames.length}件 / 最低2件）`);
  }

  const nonFinite = frames.filter((f) => !Number.isFinite(f.time)).length;
  if (nonFinite > 0) {
    errors.push(`非有限timeのキーフレーム ${nonFinite}件`);
  }

  if (frames.length > 0 && Number.isFinite(frames[0].time) && frames[0].time !== 0) {
    errors.push(`先頭キーフレームのtimeが0でない（${frames[0].time}）`);
  }

  if (frames.length > 0) {
    const last = frames[frames.length - 1];
    if (!(Number.isFinite(last.time) && last.time > 0)) {
      errors.push(`末尾キーフレームのtimeが正でない（${last.time}）`);
    }
  }

  let monotonic = true;
  for (let i = 1; i < frames.length; i++) {
    if (!(frames[i].time >= frames[i - 1].time)) {
      monotonic = false;
      break;
    }
  }
  if (!monotonic) {
    errors.push('timeが単調非減少でない');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 生成後の RaceTimeline（補間済み）の契約検証。
 *
 * 契約:
 *   - timeline != null
 *   - totalDuration が有限かつ正
 *   - keyframes 契約（validateTimelineKeyframes）を満たす
 *   - 全馬の currentDistance が有限
 */
export function validateInterpolatedTimeline(
  timeline: RaceTimeline | null | undefined
): TimelineValidationResult {
  if (!timeline) {
    return { valid: false, errors: ['timeline が null'] };
  }

  const errors: string[] = [];

  if (!Number.isFinite(timeline.totalDuration) || timeline.totalDuration <= 0) {
    errors.push(`総再生時間が不正（${timeline.totalDuration}）`);
  }

  const kf = validateTimelineKeyframes(timeline.keyframes);
  if (!kf.valid) {
    errors.push(...kf.errors);
  }

  if (Array.isArray(timeline.keyframes)) {
    const badDistance = timeline.keyframes.some((frame) =>
      Array.isArray(frame.horses) &&
      frame.horses.some((h) => !Number.isFinite(h.currentDistance))
    );
    if (badDistance) {
      errors.push('非有限 currentDistance の馬が存在');
    }
  }

  return { valid: errors.length === 0, errors };
}
