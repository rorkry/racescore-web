import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db';
import { getRaceCardCacheRevisionString } from '../../lib/race-card-cache-revision';

/**
 * クライアント（IndexedDB）のレースカードがサーバの枠・馬番データと一致するか検証するための軽量API
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { date, place, raceNumber, year } = req.query;

  if (!date || !place || !raceNumber) {
    return res.status(400).json({ error: 'date, place, raceNumber are required' });
  }

  const yearFilter = year ? String(year) : null;

  try {
    const db = getRawDb();
    const revision = await getRaceCardCacheRevisionString(
      db,
      String(date),
      String(place),
      String(raceNumber),
      yearFilter
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ revision });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
