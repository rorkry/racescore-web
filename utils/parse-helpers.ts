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

/**
 * 通過順文字列からコーナー位置を抽出
 * 
 * 通過順形式: "5-4-3-2" (1コーナー-2コーナー-3コーナー-4コーナー)
 * または "5-4-3" (3コーナーまで)
 * 
 * @param passingOrder 通過順文字列
 * @returns { corner1, corner2, corner3, corner4 }
 */
export function parsePassingOrder(passingOrder: string | null | undefined): {
  corner1?: number;
  corner2?: number;
  corner3?: number;
  corner4?: number;
} {
  if (!passingOrder) return {};
  
  const parts = toHalfWidth(passingOrder).split(/[-ー－]/);
  const result: {
    corner1?: number;
    corner2?: number;
    corner3?: number;
    corner4?: number;
  } = {};
  
  if (parts.length >= 1 && parts[0]) {
    const val = parseInt(parts[0], 10);
    if (!isNaN(val)) result.corner1 = val;
  }
  if (parts.length >= 2 && parts[1]) {
    const val = parseInt(parts[1], 10);
    if (!isNaN(val)) result.corner2 = val;
  }
  if (parts.length >= 3 && parts[2]) {
    const val = parseInt(parts[2], 10);
    if (!isNaN(val)) result.corner3 = val;
  }
  if (parts.length >= 4 && parts[3]) {
    const val = parseInt(parts[3], 10);
    if (!isNaN(val)) result.corner4 = val;
  }
  
  return result;
}

/**
 * レースデータからコーナー位置を取得（新旧フォーマット両対応）
 * 
 * 新フォーマット: passing_order + corner_4_position
 * 旧フォーマット: corner_1, corner_2, corner_3, corner_4
 */
export function getCornerPositions(race: Record<string, unknown>): {
  corner1?: number;
  corner2?: number;
  corner3?: number;
  corner4?: number;
} {
  // 旧フォーマット（直接カラムがある場合）
  if (race.corner_2 || race.corner_3 || race.corner_4) {
    return {
      corner1: race.corner_1 ? parseNumber(race.corner_1 as string) : undefined,
      corner2: race.corner_2 ? parseNumber(race.corner_2 as string) : undefined,
      corner3: race.corner_3 ? parseNumber(race.corner_3 as string) : undefined,
      corner4: race.corner_4 ? parseNumber(race.corner_4 as string) : undefined,
    };
  }
  
  // 新フォーマット（passing_orderから抽出）
  const fromPassingOrder = parsePassingOrder(race.passing_order as string);
  
  // corner_4_positionがある場合は優先
  if (race.corner_4_position) {
    fromPassingOrder.corner4 = parseNumber(race.corner_4_position as string);
  }
  
  return fromPassingOrder;
}













