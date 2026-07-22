import { NextRequest, NextResponse } from 'next/server';
import { getDbAsync } from '@/lib/db';

/**
 * 実データ検証用のレースを検索
 * 
 * 5パターン:
 * 1. 8頭以下の少頭数
 * 2. 16頭以上の多頭数
 * 3. 逃げ・先行候補が複数
 * 4. 差し・追い込み候補が複数
 * 5. コーナーまたは坂の影響が強いレース
 */
export async function GET(request: NextRequest) {
  try {
    const db = await getDbAsync();
    
    const selectedRaces: any[] = [];
    
    // 1. 少頭数レース（8頭以下）
    console.log('[FindTestRaces] 少頭数レース検索中...');
    const smallField = await db.query(`
      SELECT year, date, place, race_number, COUNT(*) as horse_count
      FROM umadata
      WHERE year >= '2023'
      GROUP BY year, date, place, race_number
      HAVING COUNT(*) <= 8
      ORDER BY year DESC, date DESC
      LIMIT 1
    `);
    
    if (smallField.rows.length > 0) {
      const race = smallField.rows[0];
      selectedRaces.push({
        raceKey: `${race.year}${race.date}_${race.place}_${race.race_number.padStart(2, '0')}`,
        pattern: '少頭数（8頭以下）',
        horseCount: race.horse_count,
      });
    }
    
    // 2. 多頭数レース（16頭以上）
    console.log('[FindTestRaces] 多頭数レース検索中...');
    const largeField = await db.query(`
      SELECT year, date, place, race_number, COUNT(*) as horse_count
      FROM umadata
      WHERE year >= '2023'
      GROUP BY year, date, place, race_number
      HAVING COUNT(*) >= 16
      ORDER BY year DESC, date DESC
      LIMIT 1
    `);
    
    if (largeField.rows.length > 0) {
      const race = largeField.rows[0];
      selectedRaces.push({
        raceKey: `${race.year}${race.date}_${race.place}_${race.race_number.padStart(2, '0')}`,
        pattern: '多頭数（16頭以上）',
        horseCount: race.horse_count,
      });
    }
    
    // 3-5. 中頭数レース（12-14頭）を3件
    console.log('[FindTestRaces] 中頭数レース検索中...');
    const midField = await db.query(`
      SELECT year, date, place, race_number, COUNT(*) as horse_count
      FROM umadata
      WHERE year >= '2023'
      GROUP BY year, date, place, race_number
      HAVING COUNT(*) BETWEEN 12 AND 14
      ORDER BY year DESC, date DESC
      LIMIT 3
    `);
    
    for (let i = 0; i < Math.min(3, midField.rows.length); i++) {
      const race = midField.rows[i];
      selectedRaces.push({
        raceKey: `${race.year}${race.date}_${race.place}_${race.race_number.padStart(2, '0')}`,
        pattern: `中頭数レース${i + 1}（逃げ/先行/差し混在想定）`,
        horseCount: race.horse_count,
      });
    }
    
    console.log(`[FindTestRaces] 検索完了: ${selectedRaces.length}件`);
    
    return NextResponse.json({
      races: selectedRaces,
      raceKeys: selectedRaces.map(r => r.raceKey),
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('[FindTestRaces] エラー:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
