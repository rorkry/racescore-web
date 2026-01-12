/**
 * データパース用ヘルパー関数
 * 
 * 全角数字の半角変換、着順パースなど
 */

/**
 * 全角数字を半角に変換
 */
export function toHalfWidth(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/[１２３４５６７８９０]/g, (s) => {
      const map: Record<string, string> = { 
        '１':'1', '２':'2', '３':'3', '４':'4', '５':'5', 
        '６':'6', '７':'7', '８':'8', '９':'9', '０':'0' 
      };
      return map[s] || s;
    });
}

/**
 * 着順をパース（全角数字対応）
 * 「外」「止」「除」「取」「中」「失」「降」「競」などは99扱い
 */
export function parseFinishPosition(pos: string | number | null | undefined): number {
  if (pos === null || pos === undefined) return 99;
  const str = String(pos);
  // 異常終了系は99扱い
  if (/[外止除取中失降競落再]/.test(str)) return 99;
  const halfWidth = toHalfWidth(str);
  const num = parseInt(halfWidth.replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? 99 : num;
}

/**
 * 数値をパース（全角数字対応）
 */
export function parseNumber(val: string | number | null | undefined, defaultVal: number = 0): number {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'number') return val;
  const halfWidth = toHalfWidth(val);
  const num = parseFloat(halfWidth.replace(/[^\d.-]/g, ''));
  return isNaN(num) ? defaultVal : num;
}

/**
 * 好走判定（3着以内）
 */
export function isGoodPerformance(finishPosition: number | string | null | undefined): boolean {
  const pos = typeof finishPosition === 'number' ? finishPosition : parseFinishPosition(finishPosition);
  return pos >= 1 && pos <= 3;
}

/**
 * 馬場タイプを抽出（「芝1600」→「芝」）
 */
export function extractSurface(distance: string | null | undefined): '芝' | 'ダ' {
  if (!distance) return 'ダ';
  if (distance.includes('芝')) return '芝';
  return 'ダ';
}

/**
 * 距離を数値で抽出（「芝1600」→ 1600）
 */
export function extractDistance(distance: string | null | undefined): number {
  if (!distance) return 0;
  const match = distance.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}









