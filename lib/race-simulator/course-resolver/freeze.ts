/**
 * CourseResolver - 不変性ユーティリティ（Step 2）
 *
 * registry データを呼び出し側から変更できないようにするための再帰 freeze。
 */

/**
 * オブジェクト/配列を再帰的に凍結する（deep freeze）。
 * プリミティブや null はそのまま返す。
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj;

  Object.freeze(obj);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}
