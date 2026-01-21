import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const db = getRawDb();
    const raceId = req.query.raceId as string || '2025121406050412';
    
    const result = await db.prepare('SELECT * FROM umadata WHERE race_id = $1').all(raceId);
    
    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
}
