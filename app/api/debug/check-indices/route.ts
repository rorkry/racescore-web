import { NextRequest, NextResponse } from 'next/server';
import { getDbAsync } from '@/lib/db';
import { INDICES_SELECT_SQL } from '@/lib/indices-columns';

export async function GET(request: NextRequest) {
  const db = await getDbAsync();
  
  try {
    // indicesテーブルのサンプルデータ
    const indicesResult = await db.query(`
      SELECT race_id, ${INDICES_SELECT_SQL}
      FROM indices
      LIMIT 10
    `);
    
    // umadataのrace_idとhorse_name
    const umadataResult = await db.query(`
      SELECT DISTINCT race_id, horse_name
      FROM umadata
      LIMIT 5
    `);
    
    // race_idのパターン分析
    const raceIdPatterns = indicesResult.rows.map(row => ({
      race_id: row.race_id,
      length: row.race_id.length,
      pattern: row.race_id.includes('_') ? 'contains_underscore' : 'no_underscore'
    }));
    
    return NextResponse.json({
      success: true,
      indices_sample: indicesResult.rows,
      umadata_sample: umadataResult.rows,
      race_id_patterns: raceIdPatterns
    });
  } catch (error) {
    console.error('Error checking indices:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
