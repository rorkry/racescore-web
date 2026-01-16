import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json({ horses: [] });
  }

  try {
    const db = getDb();

    // wakujunテーブルから馬名を検索（部分一致）
    const horses = db.prepare(`
      SELECT DISTINCT umamei as name
      FROM wakujun 
      WHERE umamei LIKE ?
      ORDER BY umamei
      LIMIT 20
    `).all(`%${query}%`) as { name: string }[];

    return NextResponse.json({ 
      horses: horses.map(h => h.name)
    });
  } catch (error) {
    console.error('Horse search error:', error);
    return NextResponse.json({ horses: [], error: 'Search failed' }, { status: 500 });
  }
}
