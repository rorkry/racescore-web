/**
 * CSV 1 行ぶんの汎用型。
 * キー: ヘッダ名（列名）
 * 値: 文字列（数値などもパース前の生文字列で保持）
 */
export type RecordRow = { [key: string]: string };
