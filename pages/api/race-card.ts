import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db-new';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const db = getRawDb();
    const { date, place, raceNumber } = req.query;
    
    if (!date || !place || !raceNumber) {
      return res.status(400).json({
        success: false,
        error: 'date, place, raceNumber are required',
      });
    }
    
    // wakujunテーブルから当日の出走馬リストを取得
    const raceCard = db.prepare(`
      SELECT * FROM wakujun 
      WHERE date = ? AND place = ? AND race_number = ?
      ORDER BY CAST(umaban AS INTEGER)
    `).all(date, place, raceNumber);
    
    if (raceCard.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Race not found',
      });
    }
    
    // 各馬の過去走データを取得
    const firstHorse = raceCard[0] as any;
    const horsesWithHistory = raceCard.map((horse: any) => {
      // 馬名の前後の空白を削除
      const horseName = horse.umamei.trim();
      
      // umadataテーブルから過去走データを取得（最新5走）
      const history = db.prepare(`
        SELECT * FROM umadata 
        WHERE horse_name = ?
        ORDER BY date DESC
        LIMIT 5
      `).all(horseName);
      
      return {
        ...horse,
        history,
      };
    });
    
    res.status(200).json({
      success: true,
      raceInfo: {
        date: date as string,
        place: place as string,
        raceNumber: raceNumber as string,
        className: firstHorse?.class_name_1 || '',
        trackType: firstHorse?.track_type || '',
        distance: firstHorse?.distance || '',
        horseCount: raceCard.length,
      },
      horses: horsesWithHistory,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
}
