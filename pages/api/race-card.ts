import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db-new';

/**
 * 日付文字列をYYYYMMDD形式の数値に変換（比較用）
 */
function parseDateToNumber(dateStr: string): number {
  if (!dateStr) return 0;
  const cleaned = dateStr.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return 0;
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;
  return year * 10000 + month * 100 + day;
}

/**
 * 現在のレース日付をYYYYMMDD形式の数値に変換
 */
function getCurrentRaceDateNumber(date: string, year: string | null): number {
  const dateStr = String(date).padStart(4, '0');
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  const currentYear = year ? parseInt(year, 10) : new Date().getFullYear();
  return currentYear * 10000 + month * 100 + day;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const db = getRawDb();
    const { date, place, raceNumber, year } = req.query;
    
    if (!date || !place || !raceNumber) {
      return res.status(400).json({
        success: false,
        error: 'date, place, raceNumber are required',
      });
    }
    
    // ========================================
    // 重要: 現在表示中のレース日付以前のデータのみを使用
    // ========================================
    const currentRaceDateNum = getCurrentRaceDateNumber(String(date), year as string | null);
    
    // wakujunテーブルから当日の出走馬リストを取得
    const raceCard = await db.prepare(`
      SELECT * FROM wakujun 
      WHERE date = $1 AND place = $2 AND race_number = $3
      ORDER BY CAST(umaban AS INTEGER)
    `).all(date, place, raceNumber);
    
    if (raceCard.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Race not found',
      });
    }
    
    // 各馬の過去走データを取得（日付フィルタリング適用）
    const firstHorse = raceCard[0] as any;
    const horsesWithHistory = await Promise.all(raceCard.map(async (horse: any) => {
      // 馬名の前後の空白を削除
      const horseName = horse.umamei.trim();
      
      // umadataテーブルから過去走データを取得（最新10走、日付フィルタ後に5走に絞る）
      const allHistory = await db.prepare(`
        SELECT * FROM umadata 
        WHERE horse_name = $1
        ORDER BY date DESC
        LIMIT 10
      `).all(horseName) as any[];
      
      // 現在のレース日付以前のデータのみをフィルタリング
      const history = allHistory.filter(
        (race: any) => parseDateToNumber(race.date) < currentRaceDateNum
      ).slice(0, 5);
      
      return {
        ...horse,
        history,
      };
    }));
    
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
