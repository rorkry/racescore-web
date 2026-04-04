import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export interface RaceEntrant {
  horse_name: string;
  finish_position: string;
  umaban: string;
  popularity: string;
  win_odds: string;
  margin: string;
  weight_carried: string;
  finish_time: string;
  last_3f: string;
  jockey: string;
}

// 全角数字→半角変換
function toHalfNum(str: string): string {
  return (str || '').replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).trim();
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

    // DISTINCT ON で重複排除 → CTE で着順ソート
    const entrants = await db.query<RaceEntrant>(
      `WITH deduped AS (
         SELECT DISTINCT ON (umaban)
           horse_name, finish_position, umaban, popularity,
           win_odds, margin, weight_carried, finish_time, last_3f, jockey
         FROM umadata
         WHERE race_id = $1
         ORDER BY umaban, id DESC
       )
       SELECT * FROM deduped
       ORDER BY
         CASE WHEN finish_position ~ '^[0-9]+$' THEN finish_position::INTEGER ELSE 999 END,
         CASE WHEN umaban ~ '^[0-9]+$' THEN umaban::INTEGER ELSE 99 END`,
      [raceId]
    );

    // 全角数字対応で再ソート（DBに全角で入っている場合の保険）
    const sorted = [...entrants].sort((a, b) => {
      const posA = parseInt(toHalfNum(a.finish_position)) || 999;
      const posB = parseInt(toHalfNum(b.finish_position)) || 999;
      if (posA !== posB) return posA - posB;
      const umaA = parseInt(toHalfNum(a.umaban)) || 99;
      const umaB = parseInt(toHalfNum(b.umaban)) || 99;
      return umaA - umaB;
    });

    return NextResponse.json({ entrants: sorted });
  } catch (error) {
    console.error('[race-entrants] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
