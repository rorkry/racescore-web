import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * /api/races-by-day?ymd=YYYYMMDD
 *
 * その開催日に存在するコース別レース番号一覧を返す。
 * レスポンス: { [courseCode: string]: number[] }
 * 例: { "05": [1,2,3,...,12], "06": [1,2,...,11] }
 */

const PLACE_TO_CODE: Record<string, string> = {
  '札幌': '01', '函館': '02', '福島': '03', '新潟': '04',
  '東京': '05', '中山': '06', '中京': '07', '京都': '08',
  '阪神': '09', '小倉': '10',
};

interface RaceRow {
  place: string;
  race_number: string;
}

export async function GET(request: NextRequest) {
  try {
    const ymd = request.nextUrl.searchParams.get('ymd');
    if (!ymd || !/^\d{8}$/.test(ymd)) {
      return NextResponse.json({ error: 'ymd (YYYYMMDD) required' }, { status: 400 });
    }

    const year = ymd.slice(0, 4);
    const dateForDb = ymd.slice(4, 8); // MMDD形式

    const db = getDb();

    const rows = await db
      .prepare(
        `SELECT DISTINCT place, race_number
         FROM wakujun
         WHERE year = $1 AND date = $2
         ORDER BY place, race_number::INTEGER`
      )
      .all<RaceRow>(year, dateForDb);

    // place → courseCode → raceNumbers[]
    const courseMap: Record<string, number[]> = {};
    for (const row of rows) {
      const place = (row.place || '').trim();
      const code = PLACE_TO_CODE[place];
      if (!code) continue;
      const raceNo = parseInt(row.race_number, 10);
      if (isNaN(raceNo)) continue;
      if (!courseMap[code]) courseMap[code] = [];
      if (!courseMap[code].includes(raceNo)) courseMap[code].push(raceNo);
    }

    // 各コースのレース番号をソート
    for (const code of Object.keys(courseMap)) {
      courseMap[code].sort((a, b) => a - b);
    }

    return NextResponse.json(courseMap, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[races-by-day] Error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
