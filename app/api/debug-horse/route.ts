import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const name = searchParams.get('name');

  if (!name) {
    return NextResponse.json({ error: 'name parameter required' }, { status: 400 });
  }

  try {
    const db = getDb();
    
    // wakujunテーブル（検索元）
    const wakujunCount = await db.prepare(`
      SELECT COUNT(*) as count FROM wakujun WHERE umamei LIKE $1
    `).get<{ count: number }>(`%${name}%`);
    
    const wakujunSamples = await db.prepare(`
      SELECT DISTINCT umamei FROM wakujun WHERE umamei LIKE $1 LIMIT 10
    `).all<{ umamei: string }>(`%${name}%`);
    
    // umadataテーブル（過去走）
    const umadataCount = await db.prepare(`
      SELECT COUNT(*) as count FROM umadata WHERE horse_name LIKE $1
    `).get<{ count: number }>(`%${name}%`);
    
    const umadataSamples = await db.prepare(`
      SELECT DISTINCT horse_name FROM umadata WHERE horse_name LIKE $1 LIMIT 10
    `).all<{ horse_name: string }>(`%${name}%`);
    
    return NextResponse.json({
      query: name,
      wakujun: {
        count: wakujunCount?.count || 0,
        samples: wakujunSamples?.map(h => h.umamei) || [],
        note: wakujunCount?.count === 0 ? '❌ wakujunにデータなし → 検索に出てこない原因' : '✅ OK'
      },
      umadata: {
        count: umadataCount?.count || 0,
        samples: umadataSamples?.map(h => h.horse_name) || [],
        note: umadataCount?.count === 0 ? '過去走データなし' : '過去走データあり'
      }
    });
  } catch (error) {
    console.error('Debug horse error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
