// utils/time.ts
/**
 * "mssd" 形式 (例: "1345" → 1分34.5秒) を秒数に変換
 */
export function toSec(t: string): number {
    const str = t.padStart(4, '0');
    const m  = parseInt(str.slice(0, 1), 10);
    const ss = parseInt(str.slice(1, 3), 10);
    const d  = parseInt(str.slice(3), 10);
    return m * 60 + ss + d / 10;
  }
  
  /**
   * "1345" → "1.34.5" の表示フォーマット
   */
  export function formatTime(t: string): string {
    if (!t) return '';
    const str = t.padStart(4, '0');
    const m  = str.slice(0, 1);
    const ss = str.slice(1, 3);
    const d  = str.slice(3);
    return `${m}.${ss}.${d}`;
  }