import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db-new';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, place, year } = req.query;

  try {
    const db = getRawDb();

    if (date && place) {
      // 特定の日付・場所のレース一覧を取得
      const yearFilter = year ? parseInt(year as string, 10) : null;
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
        WHERE date = ? AND place = ? ${yearFilter ? 'AND year = ?' : ''}
        GROUP BY date, place, race_number
        ORDER BY CAST(race_number AS INTEGER)
      `).all(...(yearFilter ? [date, place, yearFilter] : [date, place]));

      return res.status(200).json({ races });
    } else if (date) {
      // 特定の日付の全場所・全レースを取得
      const dateStr = String(date).trim();
      const yearFilter = year ? parseInt(year as string, 10) : null;
      console.log(`[api/races] date parameter: "${dateStr}", year: ${yearFilter}`);
      
      const places = db.prepare(`
        SELECT DISTINCT place
        FROM wakujun
        WHERE date = ? ${yearFilter ? 'AND year = ?' : ''}
        ORDER BY place
      `).all(...(yearFilter ? [dateStr, yearFilter] : [dateStr]));

      console.log(`[api/races] found places: ${places.length}`, places.map((p: any) => p.place));

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
          WHERE date = ? AND place = ? ${yearFilter ? 'AND year = ?' : ''}
          GROUP BY date, place, race_number
          ORDER BY CAST(race_number AS INTEGER)
        `).all(...(yearFilter ? [dateStr, p.place, yearFilter] : [dateStr, p.place]));

        return {
          place: p.place,
          races
        };
      });

      console.log(`[api/races] returning venues: ${result.length}`);
      return res.status(200).json({ date: dateStr, venues: result });
    } else if (year) {
      // 特定の年の全日付を取得
      const yearFilter = parseInt(year as string, 10);
      const datesForYear = db.prepare(`
        SELECT DISTINCT date
        FROM wakujun
        WHERE year = ? AND date GLOB '[0-9][0-9][0-9][0-9]'
        ORDER BY date DESC
      `).all(yearFilter);

      return res.status(200).json({ dates: datesForYear });
    } else {
      // 利用可能な年を取得
      const years = db.prepare(`
        SELECT DISTINCT year
        FROM wakujun
        WHERE year IS NOT NULL
        ORDER BY year DESC
      `).all();

      return res.status(200).json({ years });
    }
  } catch (error: any) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
