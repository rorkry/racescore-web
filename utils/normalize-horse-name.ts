/**
 * 馬名を正規化する共通関数
 * - 先頭の$マーク（半角/全角）を除去
 * - 先頭の*マーク（半角/全角）を除去
 * - 前後の空白を除去
 */
export function normalizeHorseName(name: string): string {
  if (!name) return '';
  return name
    .replace(/^[\$\*＄＊\s　]+/, '') // 半角/全角の$、*、スペースを先頭から除去
    .replace(/[\s　]+$/, '')         // 半角/全角の末尾スペースを除去
    .trim();
}
