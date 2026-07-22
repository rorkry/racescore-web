/**
 * indices テーブル（upload-indices で同期する独自指数）のカラム定義。
 *
 * 新しい対象フォルダを追加するときは、まずここを更新し、
 * この定数を参照している箇所（upload / SELECT / 型）を揃える。
 */

/** DB・CSV・API で共通のカラム名（race_id 以外） */
export const INDICES_VALUE_COLUMNS = [
  'L4F',
  'T2F',
  'potential',
  'revouma',
  'makikaeshi',
  'cushion',
  'pfs_past',
  'corner_lane',
  'revouma2',
] as const;

export type IndicesValueColumn = (typeof INDICES_VALUE_COLUMNS)[number];

/** 日本語ラベル（フォルダ名・画面表示用） */
export const INDICES_COLUMN_LABELS: Record<IndicesValueColumn, string> = {
  L4F: 'L4F',
  T2F: 'T2F',
  potential: 'ポテンシャル指数',
  revouma: 'レボウマ',
  makikaeshi: '巻き返し指数',
  cushion: 'クッション値',
  pfs_past: 'PFS過去',
  corner_lane: '4角位置',
  revouma2: 'レボウマ2',
};

/**
 * カラムの意味メモ（検索・保守用）
 * - pfs_past: 過去の先行力。数値が高いほど先行力が高い
 * - corner_lane: 4角のコース取り。0=最内〜4=大外（内側から何頭目か）
 * - revouma2: レボウマ2（revouma とは別カラム）
 */
export const INDICES_COLUMN_NOTES: Partial<Record<IndicesValueColumn, string>> = {
  pfs_past: '過去の先行力。高いほど先行力が高い',
  corner_lane: '4角位置。0=最内〜4=大外',
  revouma2: 'レボウマ2（revouma とは別）',
};

/** SQL SELECT 用（L4F/T2F は大文字のためクォート必須） */
export const INDICES_SELECT_SQL =
  '"L4F", "T2F", potential, revouma, makikaeshi, cushion, pfs_past, corner_lane, revouma2';

/** indices 行の値型（API・フロント共有） */
export interface IndicesValues {
  L4F: number | null;
  T2F: number | null;
  potential: number | null;
  revouma: number | null;
  makikaeshi: number | null;
  cushion: number | null;
  /** PFS過去: 過去の先行力（高いほど先行力高） */
  pfs_past: number | null;
  /** 4角位置: 0=最内〜4=大外 */
  corner_lane: number | null;
  /** レボウマ2（revouma とは別） */
  revouma2: number | null;
}

/** DB行から IndicesValues を組み立てる */
export function mapIndicesRow(row: Partial<IndicesValues> | null | undefined): IndicesValues {
  return {
    L4F: row?.L4F ?? null,
    T2F: row?.T2F ?? null,
    potential: row?.potential ?? null,
    revouma: row?.revouma ?? null,
    makikaeshi: row?.makikaeshi ?? null,
    cushion: row?.cushion ?? null,
    pfs_past: row?.pfs_past ?? null,
    corner_lane: row?.corner_lane ?? null,
    revouma2: row?.revouma2 ?? null,
  };
}
