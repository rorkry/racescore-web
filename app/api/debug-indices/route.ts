/**
 * 指数取得デバッグAPI
 * 指数が正しく取得できるかを確認
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRawDb } from '@/lib/db-new';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const horseName = searchParams.get('horse') || 'ステアハート';
  
  try {
    const db = getRawDb();
    
    // 1. umadataから馬のデータを取得
    const umadataRows = await db.prepare(`
      SELECT race_id, umaban, horse_name, date, place, distance, finish_position
      FROM umadata
      WHERE horse_name LIKE $1
      ORDER BY date DESC
      LIMIT 10
    `).all(`%${horseName}%`) as any[];
    
    // 2. 各レースの指数を取得
    const results = [];
    for (const row of umadataRows) {
      const raceIdBase = row.race_id || '';
      const umaban = row.umaban || '';
      const horseNumStr = String(umaban).padStart(2, '0');
      
      // 異なる race_id フォーマットを試す
      const formats = {
        'base_only': raceIdBase,
        'base_with_umaban': `${raceIdBase}${horseNumStr}`,
        'umaban_raw': umaban,
      };
      
      const indicesResults: Record<string, any> = {};
      
      for (const [key, testId] of Object.entries(formats)) {
        if (!testId) continue;
        try {
          const idx = await db.prepare(`
            SELECT race_id, "L4F", "T2F", potential, makikaeshi
            FROM indices
            WHERE race_id = $1
          `).get(testId);
          indicesResults[key] = idx || null;
        } catch (e) {
          indicesResults[key] = { error: (e as Error).message };
        }
      }
      
      // indices テーブルで似た race_id を検索
      let similarIndices: any[] = [];
      try {
        similarIndices = await db.prepare(`
          SELECT race_id, "L4F", "T2F"
          FROM indices
          WHERE race_id LIKE $1
          LIMIT 5
        `).all(`${raceIdBase}%`) as any[];
      } catch (e) {
        similarIndices = [{ error: (e as Error).message }];
      }
      
      results.push({
        umadata: {
          race_id: raceIdBase,
          race_id_length: raceIdBase.length,
          umaban,
          horse_name: row.horse_name,
          date: row.date,
          place: row.place,
        },
        generated_ids: formats,
        indices_lookup: indicesResults,
        similar_indices: similarIndices,
      });
    }
    
    // 3. indices テーブルの最新データをサンプル取得
    const latestIndices = await db.prepare(`
      SELECT race_id, "L4F", "T2F", potential
      FROM indices
      ORDER BY race_id DESC
      LIMIT 5
    `).all() as any[];
    
    return NextResponse.json({
      success: true,
      searchedHorse: horseName,
      results,
      latestIndices,
      note: {
        umadata_race_id_format: 'YYYYMMDDVVRRDDRR (16桁, 馬番なし)',
        indices_race_id_format: 'YYYYMMDDVVRRDDRRHH (18桁, 馬番あり)',
        expected_conversion: 'umadata.race_id + umaban.padStart(2, "0")',
      },
    });
  } catch (error) {
    console.error('Debug indices error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
