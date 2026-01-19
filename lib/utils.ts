/**
 * Tailwind CSSクラスを結合するユーティリティ
 * シンプルな実装（clsx + tailwind-merge の代替）
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ');
}
