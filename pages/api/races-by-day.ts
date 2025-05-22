import type { NextApiRequest, NextApiResponse } from 'next';
import Database from 'better-sqlite3';

const db = new Database('races.db', { readonly: true, fileMustExist: true });

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { ymd } = req.query;
  if (!ymd || typeof ymd !== 'string') {
    return res.status(400).json({ error: 'ymd required' });
  }

  const rows = db.prepare(`
    SELECT course, raceNo
    FROM races
    WHERE ymd = ?
    ORDER BY course, raceNo
  `).all(ymd);

  const grouped: Record<string, number[]> = {};
  rows.forEach(r => ((grouped[r.course] ??= []).push(Number(r.raceNo))));
  res.status(200).json(grouped);
}