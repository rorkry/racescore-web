import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/horse-past-races?horseName=xxx
// 指定した馬名の過去走一覧を返す（直近10走、PastRaceData互換形式）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const horseName = searchParams.get('horseName');

  if (!horseName) {
    return NextResponse.json({ error: 'horseName is required' }, { status: 400 });
  }

  try {
    const db = getDb();

    // 馬名で過去走を取得（DISTINCT ON race_id で重複排除、日付降順）
    const rows = await db.query<{
      race_id: string;
      date: string;
      place: string;
      distance: string;
      class_name: string;
      race_name: string;
      finish_position: string;
      finish_time: string;
      margin: string;
      popularity: string;
      corner_1: string;
      corner_2: string;
      corner_3: string;
      corner_4: string;
      pci: string;
      track_condition: string;
      umaban: string;
      jockey: string;
      lap_time: string;
    }>(
      `SELECT DISTINCT ON (race_id)
         race_id, date, place, distance, class_name, race_name,
         finish_position, finish_time, margin, popularity,
         corner_1, corner_2, corner_3, corner_4, pci,
         track_condition, umaban, jockey, lap_time
       FROM umadata
       WHERE TRIM(horse_name) = $1
       ORDER BY race_id DESC, id DESC`,
      [horseName.trim()]
    );

    // race_id の先頭8桁(YYYYMMDD)で日付降順ソート → 直近10走
    const sorted = rows
      .sort((a, b) => {
        const dA = a.race_id?.substring(0, 8) || '0';
        const dB = b.race_id?.substring(0, 8) || '0';
        return parseInt(dB) - parseInt(dA);
      })
      .slice(0, 10);

    // PastRaceData 互換形式にマッピング
    const pastRaces = sorted.map(row => {
      const raceId = row.race_id || '';
      const raceNumber = raceId.length >= 2 ? String(parseInt(raceId.slice(-2), 10)) : '';
      return {
        date: row.date || '',
        distance: row.distance || '',
        class_name: row.class_name || '',
        race_name: row.race_name || '',
        finish_position: row.finish_position || '',
        finish_time: row.finish_time || '',
        margin: row.margin || '',
        index_value: '',
        corner_1: row.corner_1 || '',
        corner_2: row.corner_2 || '',
        corner_3: row.corner_3 || '',
        corner_4: row.corner_4 || '',
        pci: row.pci || '',
        popularity: row.popularity || '',
        track_condition: row.track_condition || '',
        place: row.place || '',
        race_number: raceNumber,
        jockey: row.jockey || '',
        lap_time: row.lap_time || '',
        race_id: raceId,
      };
    });

    return NextResponse.json({ pastRaces });
  } catch (error) {
    console.error('[horse-past-races] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
