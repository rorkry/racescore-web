// utils/fetchOdds.ts
import type { OddsRow } from '@/types/odds';

/**
 * Next.js API ルート経由でオッズ JSON を取得する
 * @param raceKey 例: 202505040511
 * @returns OddsRow[] (馬番・単勝・複勝など) ※ 各行に raceKey を付与して返す
 */
export async function fetchOdds(raceKey: string): Promise<OddsRow[]> {
  // Next.js 組み込み API ルート経由で取得（同一オリジン）
  const url = `/api/odds/${raceKey}`;

  const res = await fetch(url);

  // 404 = CSV まだ未配信。空配列を返して呼び出し側でスキップさせる
  if (res.status === 404) {
    console.warn(`⚠️ odds CSV not yet available for ${raceKey}`);
    return [];
  }

  // 500 系などサーバー側の一時的な障害は「まだ取得不可」とみなしスキップ
  if (!res.ok) {
    console.warn(`⚠️ odds API error ${res.status} for ${raceKey}`);
    return [];
  }

  const json = await res.json();

  /* ---------- 正規化 & ログ ---------- */
  const rows = (json.horses as any[])
    .map((h) => {
      // 「馬番」は全角→半角化し、2桁ゼロ埋めの文字列で保持（例："５" → "05")
      const raw  = (h['馬番'] ?? '').toString().trim();
      const half = raw.replace(/[０-９]/g, (d: string) =>
        String.fromCharCode(d.charCodeAt(0) - 0xfee0),
      );
      const horseNo = half.padStart(2, '0');   // "" → "00" になるが後で除外

      return {
        raceKey,            // 12桁レースキー
        horseNo,            // 2桁・半角の文字列
        win:      Number(h['単勝'] ?? NaN),
        placeMin: Number(h['複勝下限'] ?? NaN),
        placeMax: Number(h['複勝上限'] ?? NaN),
      } as OddsRow;
    })
    // 馬番・単勝ともに有効なものだけ通す
    .filter((row): row is OddsRow => row.horseNo !== '00' && !isNaN(row.win));

  console.log('[fetchOdds] rows', raceKey, rows.length, rows.slice(0, 3));

  return rows;
}