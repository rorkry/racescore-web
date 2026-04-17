import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export interface RaceTimeInfo {
  race_id: string;
  place: string;
  date: string;
  class_name: string;
  race_name: string;
  distance: string;
  winner_time: string;
  track_condition: string;
  lap_time: string;
}

export interface RaceTimeAnalysisResponse {
  baseRace: RaceTimeInfo;
  nearbyRaces: RaceTimeInfo[];
  sameCourseRaces: RaceTimeInfo[];
}

/**
 * GET /api/race-time-analysis?raceId=XXXXXXXXXXXXXXXX
 * race_id の前後10日同会場レース比較 と 同コース全期間比較を返す
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const raceId = searchParams.get('raceId');

  if (!raceId || raceId.length < 8) {
    return NextResponse.json({ error: 'raceId required' }, { status: 400 });
  }

  try {
    const db = getDb();

    // ベースレース情報（勝ち馬レコードから取得）
    const baseRows = await db.query<RaceTimeInfo>(`
      SELECT DISTINCT ON (race_id)
        race_id, place, date,
        COALESCE(class_name, '') AS class_name,
        COALESCE(race_name, '') AS race_name,
        COALESCE(distance, '') AS distance,
        finish_time AS winner_time,
        COALESCE(track_condition, '') AS track_condition,
        COALESCE(lap_time, '') AS lap_time
      FROM umadata
      WHERE race_id = $1
        AND finish_position IN ('1', '１')
      ORDER BY race_id, finish_time
    `, [raceId]);

    // 勝ち馬データがない場合は任意のレコードから基本情報を取得
    const base: RaceTimeInfo | null = baseRows[0] ?? await (async () => {
      const rows = await db.query<RaceTimeInfo>(`
        SELECT race_id, place, date,
          COALESCE(class_name,'') AS class_name,
          COALESCE(race_name,'') AS race_name,
          COALESCE(distance,'') AS distance,
          '' AS winner_time,
          COALESCE(track_condition,'') AS track_condition,
          COALESCE(lap_time,'') AS lap_time
        FROM umadata WHERE race_id = $1 LIMIT 1
      `, [raceId]);
      return rows[0] ?? null;
    })();

    if (!base) {
      return NextResponse.json({ error: 'Race not found' }, { status: 404 });
    }

    const dateYYYYMMDD = raceId.substring(0, 8); // "20260406"

    // 前後10日 同会場 勝ち馬時計
    const nearbyRows = await db.query<RaceTimeInfo>(`
      SELECT DISTINCT ON (race_id)
        race_id, place, date,
        COALESCE(class_name,'') AS class_name,
        COALESCE(race_name,'') AS race_name,
        COALESCE(distance,'') AS distance,
        finish_time AS winner_time,
        COALESCE(track_condition,'') AS track_condition,
        COALESCE(lap_time,'') AS lap_time
      FROM umadata
      WHERE place = $1
        AND finish_position IN ('1', '１')
        AND ABS(
          TO_DATE(SUBSTRING(race_id, 1, 8), 'YYYYMMDD') -
          TO_DATE($2, 'YYYYMMDD')
        ) <= 10
      ORDER BY race_id, finish_time
    `, [base.place, dateYYYYMMDD]);

    // 同コース全期間（同会場・同距離）勝ち馬時計 - 直近200件に制限しレスポンス肥大化を防ぐ
    const sameCourseRows = await db.query<RaceTimeInfo>(`
      SELECT * FROM (
        SELECT DISTINCT ON (race_id)
          race_id, place, date,
          COALESCE(class_name,'') AS class_name,
          COALESCE(race_name,'') AS race_name,
          COALESCE(distance,'') AS distance,
          finish_time AS winner_time,
          COALESCE(track_condition,'') AS track_condition,
          COALESCE(lap_time,'') AS lap_time
        FROM umadata
        WHERE place = $1
          AND distance = $2
          AND finish_position IN ('1', '１')
        ORDER BY race_id, finish_time
      ) AS t
      ORDER BY race_id DESC
      LIMIT 200
    `, [base.place, base.distance]);

    // 新しい順でソート
    const sortByDate = (a: RaceTimeInfo, b: RaceTimeInfo) =>
      b.race_id.localeCompare(a.race_id);

    return NextResponse.json({
      baseRace: base,
      nearbyRaces: [...nearbyRows].sort(sortByDate),
      sameCourseRaces: [...sameCourseRows].sort(sortByDate),
    } as RaceTimeAnalysisResponse);

  } catch (error) {
    console.error('[race-time-analysis] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
