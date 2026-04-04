import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/race-winners?raceIds=id1,id2,id3
// 複数の raceId の1着馬を一括で返す
// Returns: { winners: { [raceId]: string } }
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const raceIdsParam = searchParams.get('raceIds');

  if (!raceIdsParam) {
    return NextResponse.json({ winners: {} });
  }

  const raceIds = raceIdsParam
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .slice(0, 20); // 最大20件

  if (raceIds.length === 0) {
    return NextResponse.json({ winners: {} });
  }

  try {
    const db = getDb();
    const placeholders = raceIds.map((_, i) => `$${i + 1}`).join(', ');
    const result = await db.query<{ race_id: string; horse_name: string }>(
      `SELECT DISTINCT ON (race_id) race_id, horse_name
       FROM umadata
       WHERE race_id IN (${placeholders})
         AND finish_position = '1'`,
      raceIds
    );

    const winners: Record<string, string> = {};
    for (const row of result.rows) {
      winners[row.race_id] = row.horse_name;
    }

    return NextResponse.json({ winners });
  } catch (error) {
    console.error('[race-winners] Error:', error);
    return NextResponse.json({ winners: {} });
  }
}
