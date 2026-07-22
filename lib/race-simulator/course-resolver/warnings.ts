/**
 * CourseResolver - 警告収集（Step 2）
 *
 * 安定した warning code を持ち、同じ code の重複を排除するコレクタ。
 */

import type { CourseWarning, CourseWarningCode } from '@/types/course-resolver';

/** code → 既定の表示文 */
const DEFAULT_MESSAGES: Record<CourseWarningCode, string> = {
  GENERIC_MODEL_USED: '汎用モデルを使用しています（登録データがありません）',
  PLACE_UNRECOGNIZED: 'place が正式な競馬場名に一致しません',
  PARTIAL_REGISTRY_MATCH: 'geometry / layout の一部のみ登録データを使用しています',
  CORNERS_MISSING: 'コーナー情報が未登録です',
  CORNERS_DERIVED: 'コーナー形状は推定値です（公式の半径・角度ではありません）',
  SLOPES_MISSING: '坂の存在は既知ですが位置が未登録です',
  RAIL_UNKNOWN: '使用柵 / 1 周距離が不明です',
  DIRECTION_GENERIC: '回り方向が汎用値です',
};

/**
 * 警告を重複なく蓄積するコレクタ。
 */
export class WarningCollector {
  private readonly seen = new Set<CourseWarningCode>();
  private readonly items: CourseWarning[] = [];

  /**
   * 警告を追加する。同じ code は一度だけ保持する。
   * message 未指定時は既定文を使う。
   */
  add(code: CourseWarningCode, message?: string): void {
    if (this.seen.has(code)) return;
    this.seen.add(code);
    this.items.push({ code, message: message ?? DEFAULT_MESSAGES[code] });
  }

  has(code: CourseWarningCode): boolean {
    return this.seen.has(code);
  }

  /** 蓄積した警告のコピーを返す */
  list(): CourseWarning[] {
    return this.items.map((w) => ({ ...w }));
  }
}
