/**
 * coat-normalize（毛色テキストの正規化・1か所集約）
 *
 * DB の生データは書き換えない。表示・マテリアル割当時のみ正規化する。
 * Math.random は使わない（未知は null → 呼び出し側が決定的 fallback）。
 */

export type NormalizedCoatColor =
  | 'bay'
  | 'darkBay'
  | 'black'
  | 'chestnut'
  | 'darkChestnut'
  | 'gray'
  | 'white';

/** 正規化済み毛色 → パレット index（broadcast-cel-horse.COAT_PALETTE と対応） */
export const COAT_PALETTE_INDEX: Record<NormalizedCoatColor, number> = {
  bay: 0,
  darkBay: 1,
  black: 2,
  chestnut: 3,
  darkChestnut: 5, // 追加スロット（無ければ chestnut に近い色）
  gray: 4,
  white: 6,
};

/**
 * 生文字列を正規化して NormalizedCoatColor へ。
 * null/undefined/空/未知 → null。
 */
export function normalizeCoatColor(raw: unknown): NormalizedCoatColor | null {
  if (raw == null) return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;

  // Unicode 正規化 + BOM + 空白・改行・タブ除去
  let s = String(raw).normalize('NFKC');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.replace(/[\s\u3000\t\r\n]+/g, '');
  // 括弧注釈を除去（例: 鹿毛（濃）→ 鹿毛、鹿毛（父系）→ 鹿毛）
  s = s.replace(/[（(][^）)]*[）)]/g, '');
  if (!s) return null;

  const lower = s.toLowerCase();

  // 英語（実データに存在し得る場合のみ）
  if (lower === 'bay') return 'bay';
  if (lower === 'darkbay' || lower === 'dark_bay' || lower === 'brown') return 'darkBay';
  if (lower === 'black') return 'black';
  if (lower === 'chestnut') return 'chestnut';
  if (lower === 'darkchestnut' || lower === 'liverchestnut') return 'darkChestnut';
  if (lower === 'gray' || lower === 'grey' || lower === 'roan') return 'gray';
  if (lower === 'white') return 'white';

  // 日本語（長い一致を先に）
  if (s.includes('青鹿')) return 'darkBay'; // 青鹿毛 → darkBay 寄り
  if (s.includes('黒鹿')) return 'darkBay';
  if (s.includes('栃栗')) return 'darkChestnut';
  if (s.includes('青毛')) return 'black';
  if (s.includes('白毛') || s === '白') return 'white';
  if (s.includes('芦') || s.includes('葦')) return 'gray';
  if (s.includes('栗')) return 'chestnut';
  if (s.includes('鹿')) return 'bay'; // 「鹿毛」「鹿」
  if (s.includes('黒') && !s.includes('鹿')) return 'black';

  return null;
}
