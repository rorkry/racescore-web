/**
 * レース関連のキー生成ユーティリティ
 *
 * DB保存形式との整合性を保つための変換関数群。
 * 既存データ保護のため、DB側のキー形式（MMDD_場_R）を維持している。
 */

/**
 * umadata の date カラム（例: "2024. 1. 5", "2024.01.05", "2024/1/5"）を MMDD 形式に変換
 * 例: "2024. 1. 5" -> "0105"
 *
 * DB の race_memos.race_key / predictions.race_key / baba_memos.date は MMDD 形式で保存されている
 * （app/card/page.tsx の raceKey 生成に合わせるため）
 */
export function pastDateToMMDD(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const cleaned = String(dateStr).replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length >= 3) {
    return parts[1].padStart(2, '0') + parts[2].padStart(2, '0');
  }
  // すでに MMDD 形式の可能性（長さ4）
  if (cleaned.length === 4 && /^\d{4}$/.test(cleaned)) return cleaned;
  return '';
}

/**
 * 過去走データから race_memos / predictions 用の race_key を生成
 * 形式: MMDD_場_R（既存DB互換）
 *
 * @param race 過去走オブジェクト
 */
export function buildPastRaceKey(race: { date?: string; place?: string; race_number?: string }): string | null {
  if (!race.date || !race.place || !race.race_number) return null;
  const mmdd = pastDateToMMDD(race.date);
  if (!mmdd) return null;
  return `${mmdd}_${race.place}_${race.race_number}`;
}
