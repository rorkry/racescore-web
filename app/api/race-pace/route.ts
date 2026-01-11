import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { predictRacePace } from '@/lib/race-pace-predictor';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const date = searchParams.get('date');
    const place = searchParams.get('place');
    const raceNumber = searchParams.get('raceNumber');

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

    // SQLiteデータベース
    const db = new Database('./races.db', { readonly: true });
    
    const prediction = predictRacePace(db, {
      year,
      date,
      place,
      raceNumber,
    });

    db.close();

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

