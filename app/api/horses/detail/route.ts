import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { toHalfWidth } from '@/utils/parse-helpers';

// 馬名正規化関数
function normalizeHorseName(name: string): string {
  if (!name) return '';
  return name
    .replace(/^[\$\*＄＊\s　]+/, '')
    .replace(/[\s　]+$/, '')
    .trim();
}

interface PastRace {
  date: string;
  distance: string;
  class_name: string;
  finish_position: string;
  finish_time: string;
  margin: string;
  track_condition: string;
  place: string;
  race_id?: string;
  surface?: string;
  indices?: {
    makikaeshi?: number;
    potential?: number;
  } | null;
  raceLevel?: {
    level: string;
    levelLabel: string;
    totalHorsesRun: number;
    goodRunCount: number;
    winCount: number;
    aiComment?: string;
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const horseName = searchParams.get('name');

  if (!horseName) {
    return NextResponse.json({ error: 'Horse name is required' }, { status: 400 });
  }

  try {
    const db = getDb();
    const normalizedName = normalizeHorseName(horseName);

    // umadataから過去走データを取得
    const pastRacesRaw = await db.prepare(`
      SELECT 
        race_id,
        date,
        place,
        course_type,
        distance,
        class_name,
        finish_position,
        finish_time,
        margin,
        track_condition,
        last_3f,
        horse_weight,
        jockey,
        popularity
      FROM umadata
      WHERE TRIM(horse_name) = $1
         OR REPLACE(REPLACE(horse_name, '*', ''), '$', '') = $1
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
      LIMIT 10
    `).all<any>(normalizedName);

    if (!pastRacesRaw || pastRacesRaw.length === 0) {
      return NextResponse.json({ 
        horseName: normalizedName,
        pastRaces: [],
        message: 'No race data found for this horse'
      });
    }

    // indicesとrace_levelsを取得
    const raceIds = pastRacesRaw.map(r => r.race_id).filter(Boolean);
    
    // indices取得（race_idは馬番付きの18桁形式）
    let indicesMap: Record<string, any> = {};
    if (raceIds.length > 0) {
      const placeholders = raceIds.map((_, i) => `$${i + 1}`).join(',');
      const indicesRaw = await db.prepare(`
        SELECT race_id, potential, makikaeshi
        FROM indices
        WHERE SUBSTRING(race_id, 1, 16) IN (${placeholders})
      `).all<any>(...raceIds);
      
      indicesRaw.forEach((idx: any) => {
        const baseRaceId = idx.race_id?.substring(0, 16);
        if (baseRaceId) {
          indicesMap[baseRaceId] = {
            potential: idx.potential,
            makikaeshi: idx.makikaeshi
          };
        }
      });
    }

    // race_levels取得
    let raceLevelsMap: Record<string, any> = {};
    if (raceIds.length > 0) {
      const placeholders = raceIds.map((_, i) => `$${i + 1}`).join(',');
      const raceLevelsRaw = await db.prepare(`
        SELECT race_id, level, level_label, total_horses_run, good_run_count, win_count
        FROM race_levels
        WHERE race_id IN (${placeholders})
      `).all<any>(...raceIds);
      
      raceLevelsRaw.forEach((rl: any) => {
        if (rl.race_id) {
          raceLevelsMap[rl.race_id] = {
            level: rl.level,
            levelLabel: rl.level_label || rl.level,
            totalHorsesRun: rl.total_horses_run || 0,
            goodRunCount: rl.good_run_count || 0,
            winCount: rl.win_count || 0
          };
        }
      });
    }

    // 過去走データを整形
    const pastRaces: PastRace[] = pastRacesRaw.map((race: any) => {
      const raceId = race.race_id || '';
      return {
        date: race.date || '',
        distance: race.distance || '',
        class_name: race.class_name || '',
        finish_position: toHalfWidth(race.finish_position || ''),
        finish_time: race.finish_time || '',
        margin: race.margin || '',
        track_condition: race.track_condition || '',
        place: race.place || '',
        race_id: raceId,
        surface: race.course_type?.includes('芝') ? '芝' : 'ダ',
        indices: indicesMap[raceId] || null,
        raceLevel: raceLevelsMap[raceId] || undefined
      };
    });

    // wakujunから最新の馬情報を取得（斤量、騎手など）
    const latestInfo = await db.prepare(`
      SELECT umaban, kinryo, kishu
      FROM wakujun
      WHERE TRIM(umamei) = $1
         OR REPLACE(REPLACE(umamei, '*', ''), '$', '') = $1
      ORDER BY year DESC, date DESC
      LIMIT 1
    `).get<any>(normalizedName);

    return NextResponse.json({
      horseName: normalizedName,
      umaban: latestInfo?.umaban || '',
      kinryo: latestInfo?.kinryo || '',
      kishu: latestInfo?.kishu || '',
      pastRaces,
      score: null, // スコアは動的計算が必要なのでnull
      hasData: pastRaces.length > 0
    });
  } catch (error) {
    console.error('Horse detail error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch horse detail',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
