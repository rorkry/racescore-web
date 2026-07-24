/**
 * umadata CSV から毛色（keiro / Excel BL列）を取り出す純粋ロジック。
 *
 * - Excel 列 BL = 64列目 = 0-based index 63（固定フォールバック）
 * - ヘッダー行があれば「毛色」「keiro」「毛」「BL」等を優先
 * - BOM / 全角空白を除去して照合
 * - 列が無い・空なら空文字（INSERT 側で空保存可）
 */

/** Excel BL列の 0-based index（A=0 … BL=63） */
export const KEIRO_CSV_INDEX_BL = 63;

const HEADER_ALIASES = [
  '毛色',
  'けいろ',
  'ケイロ',
  'keiro',
  'coat',
  'coatcolor',
  'coat_color',
  '毛',
  'bl',
];

function normalizeHeaderCell(raw: unknown): string {
  let s = String(raw ?? '');
  // UTF-8 BOM
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.normalize('NFKC').replace(/[\s\u3000\t\r\n]+/g, '').toLowerCase();
  return s;
}

/**
 * ヘッダー行から keiro 列 index を解決。見つからなければ null。
 */
export function resolveKeiroColumnIndex(headerRow: unknown[] | null | undefined): number | null {
  if (!Array.isArray(headerRow) || headerRow.length === 0) return null;
  for (let i = 0; i < headerRow.length; i++) {
    const cell = normalizeHeaderCell(headerRow[i]);
    if (!cell) continue;
    if (HEADER_ALIASES.includes(cell)) return i;
    // 「毛色（父系）」など注釈付き
    if (cell.startsWith('毛色') || cell.includes('keiro') || cell === '毛') return i;
  }
  return null;
}

/**
 * データ行から毛色文字列を取得。
 * headerIndex が有効ならそれを使い、無ければ BL 固定 index。
 * 行が短い場合は空文字。
 */
export function extractKeiroFromCsvRow(
  row: unknown[],
  headerIndex: number | null = null,
): string {
  if (!Array.isArray(row)) return '';
  const idx =
    headerIndex != null && headerIndex >= 0 && Number.isFinite(headerIndex)
      ? headerIndex
      : KEIRO_CSV_INDEX_BL;
  if (idx < 0 || idx >= row.length) return '';
  const raw = row[idx];
  if (raw == null) return '';
  let s = String(raw);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.trim();
}

/**
 * ヘッダー検証結果（ログ・テスト用）。
 */
export function describeKeiroColumnResolution(headerRow: unknown[] | null | undefined): {
  headerIndex: number | null;
  fallbackIndex: number;
  resolvedIndex: number;
  usedHeader: boolean;
  headerCell: string | null;
} {
  const headerIndex = resolveKeiroColumnIndex(headerRow);
  const usedHeader = headerIndex != null;
  const resolvedIndex = usedHeader ? headerIndex! : KEIRO_CSV_INDEX_BL;
  const headerCell =
    usedHeader && Array.isArray(headerRow) ? String(headerRow[headerIndex!] ?? '') : null;
  return {
    headerIndex,
    fallbackIndex: KEIRO_CSV_INDEX_BL,
    resolvedIndex,
    usedHeader,
    headerCell,
  };
}
