import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// 馬名正規化関数
function normalizeHorseName(name: string): string {
  if (!name) return '';
  return name
    .replace(/^[\$\*＄＊\s　]+/, '')
    .replace(/[\s　]+$/, '')
    .trim();
}

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

    // 馬名を正規化して重複を除去
    const normalizedHorses = [...new Set(horses.map(h => normalizeHorseName(h.name)))].filter(Boolean);

    return NextResponse.json({ 
      horses: normalizedHorses
    });
  } catch (error) {
    console.error('Horse search error:', error);
    return NextResponse.json({ horses: [], error: 'Search failed' }, { status: 500 });
  }
}
