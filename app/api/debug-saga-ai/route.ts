import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { toHalfWidth } from '@/utils/parse-helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const results: Record<string, unknown> = {};
  
  try {
    // 1. 最新のレースを取得
    results.step1_getLatestRace = 'checking...';
    const latestRaceQuery = await db.query(`
      SELECT DISTINCT race_id, date, place, race_number
      FROM wakujun
      WHERE year = 2026
      ORDER BY race_id DESC
      LIMIT 1
    `);
    const latestRace = latestRaceQuery.rows[0];
    results.step1_getLatestRace = latestRace || 'none';
    
    if (!latestRace) {
      return NextResponse.json({ error: 'No races found', results });
    }

    const { place, race_number, date } = latestRace;
    const year = 2026;
    const dateStr = '0118'; // テスト用

    // 2. wakujunからレースデータを取得
    results.step2_getWakujun = 'checking...';
    const wakujunQuery = await db.query(`
      SELECT * FROM wakujun
      WHERE date LIKE $1
        AND place = $2
        AND race_number = $3
        AND year = $4
      LIMIT 5
    `, [`%${dateStr}%`, place, race_number, year]);
    results.step2_getWakujun = {
      count: wakujunQuery.rows.length,
      sample: wakujunQuery.rows.slice(0, 2)
    };

    // 3. umadataを取得
    results.step3_getUmadata = 'checking...';
    if (wakujunQuery.rows.length > 0) {
      const firstHorse = wakujunQuery.rows[0];
      const horseNameForUmadata = (firstHorse.umamei || '').trim();
      
      const umadataQuery = await db.query(`
        SELECT race_id, umamei, finish_position, date, lap_time, passing_order
        FROM umadata
        WHERE umamei = $1
        ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
        LIMIT 3
      `, [horseNameForUmadata]);
      results.step3_getUmadata = {
        horseName: horseNameForUmadata,
        count: umadataQuery.rows.length,
        sample: umadataQuery.rows
      };
    }

    // 4. レースレベルキャッシュを確認
    results.step4_raceLevelCache = 'checking...';
    const raceLevelQuery = await db.query(`
      SELECT race_id, level, level_label, calculated_at
      FROM race_levels
      ORDER BY calculated_at DESC
      LIMIT 5
    `);
    results.step4_raceLevelCache = {
      count: raceLevelQuery.rows.length,
      sample: raceLevelQuery.rows
    };

    // 5. toHalfWidth関数テスト
    results.step5_toHalfWidthTest = {
      input1: '１２３',
      output1: toHalfWidth('１２３'),
      input2: '８',
      output2: toHalfWidth('８'),
      input3: '16',
      output3: toHalfWidth('16'),
    };

    // 6. 問題箇所特定テスト - analyzeRaceLevelで使うデータ
    results.step6_nextRaceTest = 'checking...';
    // 過去60日以内のレースから1つ選んでテスト
    const testRaceQuery = await db.query(`
      SELECT race_id, date, place, class_name
      FROM umadata
      WHERE SUBSTRING(race_id, 1, 8)::INTEGER < 20260118
        AND SUBSTRING(race_id, 1, 8)::INTEGER > 20251101
      LIMIT 1
    `);
    
    if (testRaceQuery.rows.length > 0) {
      const testRace = testRaceQuery.rows[0];
      const raceIdDatePart = testRace.race_id.substring(0, 8);
      
      // 上位3頭取得テスト
      const top3Query = await db.query(`
        SELECT horse_name, finish_position, umaban
        FROM umadata
        WHERE race_id = $1
          AND finish_position IS NOT NULL
          AND finish_position != ''
        ORDER BY TRANSLATE(finish_position, '０１２３４５６７８９', '0123456789')::INTEGER ASC
        LIMIT 3
      `, [testRace.race_id]);

      results.step6_nextRaceTest = {
        testRaceId: testRace.race_id,
        raceDate: testRace.date,
        top3Count: top3Query.rows.length,
        top3: top3Query.rows,
      };
    }

    return NextResponse.json({
      success: true,
      results
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
      results
    }, { status: 500 });
  }
}
