import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _req: Request,
  context: { params: Promise<{ raceKey: string }> }
) {
  const { raceKey } = await context.params;

  if (!/^\d{12}$/.test(raceKey)) {
    return NextResponse.json(
      { error: 'raceKey must be 12-digit YYYYMMDDJJRR' },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    
    // oddsテーブルからデータを取得
    const rows = db
      .prepare('SELECT horseNo, win, place FROM odds WHERE raceKey = ?')
      .all(raceKey);

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'Odds not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching odds:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
