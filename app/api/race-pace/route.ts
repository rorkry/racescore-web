import { NextRequest, NextResponse } from 'next/server';
import { getRawDb } from '@/lib/db-new';
import { predictRacePace } from '@/lib/race-pace-predictor';

// DBキャッシュから展開予想を取得
function getPaceFromDBCache(
  db: ReturnType<typeof getRawDb>,
  year: string,
  date: string,
  place: string,
  raceNumber: string
): any | null {
  try {
    const row = db.prepare(`
      SELECT prediction_json
      FROM race_pace_cache
      WHERE year = ? AND date = ? AND place = ? AND race_number = ?
    `).get(year, date, place, raceNumber) as { prediction_json: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.prediction_json);
  } catch (error) {
    console.error('[race-pace] DBキャッシュ読み込みエラー:', error);
    return null;
  }
}

// 展開予想をDBキャッシュに保存
function savePaceToDBCache(
  db: ReturnType<typeof getRawDb>,
  year: string,
  date: string,
  place: string,
  raceNumber: string,
  prediction: any
): void {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO race_pace_cache 
      (year, date, place, race_number, prediction_json, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(year, date, place, raceNumber, JSON.stringify(prediction));
    
    console.log(`[race-pace] DBキャッシュ保存: ${year}/${date}/${place}/${raceNumber}`);
  } catch (error) {
    console.error('[race-pace] DBキャッシュ保存エラー:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const date = searchParams.get('date');
    const place = searchParams.get('place');
    const raceNumber = searchParams.get('raceNumber');
    const forceRecalculate = searchParams.get('forceRecalculate') === 'true';
    const saveToDB = searchParams.get('saveToDB') === 'true';

    console.log('[api/race-pace] params:', { year, date, place, raceNumber });

    if (!year || !date || !place || !raceNumber) {
      console.error('[api/race-pace] Missing parameters:', { year, date, place, raceNumber });
      return NextResponse.json(
        { 
          error: 'Missing required parameters',
          received: { year, date, place, raceNumber }
        },
        { status: 400 }
      );
    }

    const db = getRawDb();

    // DBキャッシュチェック（強制再計算でない場合）
    if (!forceRecalculate) {
      const cached = getPaceFromDBCache(db, year, date, place, raceNumber);
      if (cached) {
        console.log(`[race-pace] DBキャッシュヒット: ${year}/${date}/${place}/${raceNumber}`);
        return NextResponse.json({ ...cached, fromCache: true });
      }
    }
    
    const prediction = predictRacePace(db, {
      year,
      date,
      place,
      raceNumber,
    });

    // DBキャッシュに保存（saveToDB指定時、または通常時）
    if (saveToDB || !forceRecalculate) {
      savePaceToDBCache(db, year, date, place, raceNumber, prediction);
    }

    return NextResponse.json(prediction);
  } catch (error: any) {
    console.error('[api/race-pace] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate race pace prediction',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
