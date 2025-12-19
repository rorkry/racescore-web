import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db-new';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, place } = req.query;

  try {
    const db = getRawDb();

    if (date && place) {
      // 特定の日付・場所のレース一覧を取得
      const races = db.prepare(`
        SELECT DISTINCT 
          date, 
          place, 
          race_number, 
          class_name_1 as class_name,
          track_type,
          distance,
          COUNT(*) as field_size
        FROM wakujun
        WHERE date = ? AND place = ?
        GROUP BY date, place, race_number
        ORDER BY CAST(race_number AS INTEGER)
      `).all(date, place);

      return res.status(200).json({ races });
    } else if (date) {
      // 特定の日付の全場所・全レースを取得
      const places = db.prepare(`
        SELECT DISTINCT place
        FROM wakujun
        WHERE date = ?
        ORDER BY place
      `).all(date);

      const result = places.map((p: any) => {
        const races = db.prepare(`
          SELECT DISTINCT 
            date, 
            place, 
            race_number, 
            class_name_1 as class_name,
            track_type,
            distance,
            COUNT(*) as field_size
          FROM wakujun
          WHERE date = ? AND place = ?
          GROUP BY date, place, race_number
          ORDER BY CAST(race_number AS INTEGER)
        `).all(date, p.place);

        return {
          place: p.place,
          races
        };
      });

      return res.status(200).json({ date, venues: result });
    } else {
      // 全日付を取得
      const dates = db.prepare(`
        SELECT DISTINCT date
        FROM wakujun
        ORDER BY date DESC
      `).all();

      return res.status(200).json({ dates });
    }
  } catch (error: any) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
