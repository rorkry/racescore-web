// lib/fetchTrio.ts
import { getBaseURL } from '@/lib/getBaseURL';

/** /api/trio で返ってくる JSON の型 */
export interface TrioOddsResponse {
  raceKey: string;
  o6: Record<string, number>;   // "枠番3桁＋馬番3桁" → オッズ
  updated: string;              // ISO 形式
}

/**
 * 3連単オッズ JSON を取得するユーティリティ
 *
 * @param raceKey YYYYMMDDJJRR（12桁）
 * @param init    fetch の追加オプション
 * @returns TrioOddsResponse | null
 */
export async function fetchTrioOdds(
  raceKey: string,
  init: RequestInit = {},
): Promise<TrioOddsResponse | null> {
  /* ---------- バリデーション ---------- */
  if (!/^\d{12}$/.test(raceKey)) {
    throw new Error('raceKey must be 12 digits: YYYYMMDDJJRR');
  }

  /* ---------- API 叩く ---------- */
  const base = getBaseURL(); // '' (client) か 'http://…' (server)
  const url  = `${base}/api/trio?key=${raceKey}`;

  try {
    const res = await fetch(url, {
      cache: 'no-store',  // 常に最新
      ...init,
    });

    if (!res.ok) {
      // Bridge からの 404/500 など
      console.error(
        'fetchTrioOdds error',
        res.status,
        await res.text(),
      );
      return null;
    }

    return (await res.json()) as TrioOddsResponse;
  } catch (err) {
    // fetch 自体が失敗（ネットワーク等）
    console.error('fetchTrioOdds network error', err);
    return null;
  }
}