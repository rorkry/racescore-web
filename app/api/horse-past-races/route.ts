import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/horse-past-races?horseName=xxx
// 指定した馬名の過去走一覧を返す（直近20走、PastRaceData互換形式）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const horseName = searchParams.get('horseName');

  if (!horseName) {
    return NextResponse.json({ error: 'horseName is required' }, { status: 400 });
  }

  try {
    const db = getDb();

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
      weight_carried: string;
      horse_weight: string;
      weight_change: string;
      gender: string;
      age: string;
    }>(
      `SELECT DISTINCT ON (race_id)
         race_id, date, place, distance, class_name, race_name,
         finish_position, finish_time, margin, popularity,
         corner_1, corner_2, corner_3, corner_4, pci,
         track_condition, umaban, jockey, lap_time,
         COALESCE(weight_carried, '') AS weight_carried,
         COALESCE(horse_weight, '') AS horse_weight,
         COALESCE(weight_change, '') AS weight_change,
         COALESCE(gender, '') AS gender,
         COALESCE(age, '') AS age
       FROM umadata
       WHERE TRIM(horse_name) = $1
       ORDER BY race_id DESC, id DESC`,
      [horseName.trim()]
    );

    const sorted = rows
      .sort((a, b) => {
        const dA = a.race_id?.substring(0, 8) || '0';
        const dB = b.race_id?.substring(0, 8) || '0';
        return parseInt(dB) - parseInt(dA);
      })
      .slice(0, 20);

    const raceIds = [...new Set(sorted.map(r => r.race_id).filter(id => id && id.length >= 16))];
    const raceLevelMap = new Map<string, {
      level: string;
      levelLabel: string;
      totalHorsesRun: number;
      firstRunGoodCount: number;
      winCount: number;
      aiComment: string;
    }>();

    if (raceIds.length > 0) {
      const placeholders = raceIds.map((_, i) => `$${i + 1}`).join(',');
      const levels = await db.query<{
        race_id: string;
        level: string;
        level_label: string | null;
        total_horses_run: number | null;
        first_run_good_count: number | null;
        win_count: number | null;
        ai_comment: string | null;
      }>(
        `SELECT race_id, level, level_label, total_horses_run, first_run_good_count, win_count, ai_comment
         FROM race_levels WHERE race_id IN (${placeholders})`,
        raceIds
      );
      for (const lv of levels) {
        raceLevelMap.set(lv.race_id, {
          level: lv.level || '',
          levelLabel: lv.level_label || lv.level || '',
          totalHorsesRun: lv.total_horses_run ?? 0,
          firstRunGoodCount: lv.first_run_good_count ?? 0,
          winCount: lv.win_count ?? 0,
          aiComment: lv.ai_comment || '',
        });
      }
    }

    const pastRaces = sorted.map(row => {
      const raceId = row.race_id || '';
      const raceNumber = raceId.length >= 2 ? String(parseInt(raceId.slice(-2), 10)) : '';
      const rl = raceLevelMap.get(raceId);
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
        weight_carried: row.weight_carried || '',
        horse_weight: row.horse_weight || '',
        weight_change: row.weight_change || '',
        gender: row.gender || '',
        age: row.age || '',
        raceLevel: rl ?? null,
      };
    });

    return NextResponse.json({ pastRaces });
  } catch (error) {
    console.error('[horse-past-races] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
