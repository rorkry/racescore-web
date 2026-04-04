import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export interface RaceEntrant {
  horse_name: string;
  finish_position: string;
  umaban: string;
  popularity: string;
}

// GET /api/race-entrants?raceId=202504040600701
// raceId は umadata.race_id（馬番なし）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const raceId = searchParams.get('raceId');

  if (!raceId) {
    return NextResponse.json({ error: 'raceId is required' }, { status: 400 });
  }

  try {
    const db = getDb();
    const entrants = await db.query<RaceEntrant>(
      `SELECT horse_name, finish_position, umaban, popularity
       FROM umadata
       WHERE race_id = $1
       ORDER BY
         CASE WHEN finish_position ~ '^[0-9]+$' THEN finish_position::INTEGER ELSE 999 END,
         CASE WHEN umaban ~ '^[0-9]+$' THEN umaban::INTEGER ELSE 99 END`,
      [raceId]
    );

    return NextResponse.json({ entrants });
  } catch (error) {
    console.error('[race-entrants] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
