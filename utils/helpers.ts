/**
 * レベル文字列（A～E）を星の数（1～5）に変換
 */
export function levelToStars(level: string): number {
  if (!level) return 0
  let ch = level.trim().charAt(0)
  const code = ch.charCodeAt(0)
  // 全角Ａ～Ｅ (U+FF21–FF25) → 半角A–E
  if (code >= 0xFF21 && code <= 0xFF25) {
    ch = String.fromCharCode(code - 0xFEE0)
  }
  switch (ch) {
    case 'A': return 5
    case 'B': return 4
    case 'C': return 3
    case 'D': return 2
    case 'E': return 1
    default:  return 0
  }
}

/**
 * 全角数字を半角に変換
 */
export function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
  );
}

/**
 * "1085" → "1.08.5"
 */
export function formatTime(t: string): string {
  if (!t) return ''
  const str = t.toString().padStart(4, '0')
  const m  = str.slice(0,1)
  const ss = str.slice(1,3)
  const d  = str.slice(3)
  return `${m}.${ss}.${d}`
}

/**
 * "mssd" を秒数に変換 (例: "2104" → 130.4 秒)
 */
export function toSec(t: string): number {
  const str = t.padStart(4, '0');
  const m = parseInt(str.slice(0,1), 10);
  const ss = parseInt(str.slice(1,3), 10);
  const d = parseInt(str.slice(3), 10);
  return m * 60 + ss + d / 10;
}

/**
 * クラス名をランク数値に変換
 */
export function classToRank(cls: string): number {
  // 1) 全角→半角変換
  let s = cls.replace(/[Ａ-Ｚ０-９]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  )
  // 2) ローマ数字 → 数字
  s = s.replace(/Ⅰ/g, '1').replace(/Ⅱ/g, '2').replace(/Ⅲ/g, '3')
  // 3) 大文字化 & 空白除去
  s = s.toUpperCase().trim()

  if (s.includes('新馬')) return 0
  if (s.includes('未勝利')) return 1
  if (/^[123]勝/.test(s)) {
    const num = parseInt(s.charAt(0), 10)
    return isNaN(num) ? 1 : num + 1        // 1勝→2, 2勝→3, 3勝→4
  }
  if (s.includes('OP') || s.includes('オープン') || s.includes('L')) return 5
  if (s.startsWith('G3') || s.includes('GⅢ') || s.includes('G3')) return 6
  if (s.startsWith('G2') || s.includes('GⅡ') || s.includes('G2')) return 7
  if (s.startsWith('G1') || s.includes('GⅠ') || s.includes('G1')) return 8
  return 1
}
