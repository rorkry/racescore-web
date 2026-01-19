import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { toHalfWidth } from '@/utils/parse-helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const results: Record<string, unknown> = {};
  
  try {
    // 0. wakujunテーブルのスキーマ確認
    results.step0_wakujunSchema = 'checking...';
    const schemaRows = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'wakujun'
      ORDER BY ordinal_position
    `);
    results.step0_wakujunSchema = schemaRows;  // db.query()は直接配列を返す

    // 1. wakujunの最新のレースサンプルを取得
    results.step1_wakujunSample = 'checking...';
    const sampleRows = await db.query(`
      SELECT date, place, race_number, year, umamei
      FROM wakujun
      WHERE year = '2026'
      ORDER BY date DESC
      LIMIT 3
    `);
    results.step1_wakujunSample = sampleRows;

    // 2. saga-aiと同じ条件でwakujunを取得
    results.step2_sagaAiQuery = 'checking...';
    // wakujunテーブルのdateは"0118"形式（MMDD）
    // step1で取得した実際の日付形式を使用
    const actualDate = sampleRows.length > 0 ? (sampleRows[0] as any).date : '0118';
    const testDate = actualDate;  // 実際のDB形式を使用
    const testPlace = '中山';
    const testRaceNumber = '9';
    const testYear = '2026';
    
    const sagaRows = await db.query(`
      SELECT * FROM wakujun
      WHERE date = $1 AND place = $2 AND race_number = $3 AND year = $4
      ORDER BY umaban::INTEGER
      LIMIT 5
    `, [testDate, testPlace, testRaceNumber, testYear]);
    results.step2_sagaAiQuery = {
      params: { date: testDate, place: testPlace, race_number: testRaceNumber, year: testYear },
      count: sagaRows.length,
      sample: sagaRows.slice(0, 2)
    };

    // 3. umadataを取得（saga-aiと同じクエリ）
    results.step3_getUmadata = 'checking...';
    if (sagaRows.length > 0) {
      const firstHorse = sagaRows[0] as any;
      // saga-aiと同じnormalizeHorseName処理: $, *, スペースを除去
      const rawHorseName = (firstHorse.umamei || '').trim();
      const horseNameForUmadata = rawHorseName
        .replace(/^[\$\*＄＊\s　]+/, '')
        .replace(/[\s　]+$/, '')
        .trim();
      
      // saga-aiと同じクエリ: horse_nameカラムを使用
      // passing_orderカラムは存在しない可能性があるので除外
      const umadataRows = await db.query(`
        SELECT race_id, horse_name, finish_position, date, lap_time
        FROM umadata
        WHERE TRIM(horse_name) = $1
        ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
        LIMIT 3
      `, [horseNameForUmadata]);
      results.step3_getUmadata = {
        rawHorseName: rawHorseName,
        normalizedHorseName: horseNameForUmadata,
        count: umadataRows.length,
        sample: umadataRows
      };
    } else {
      results.step3_getUmadata = 'skipped - no wakujun data';
    }

    // 4. レースレベルキャッシュを確認
    results.step4_raceLevelCache = 'checking...';
    const raceLevelRows = await db.query(`
      SELECT race_id, level, level_label, calculated_at
      FROM race_levels
      ORDER BY calculated_at DESC
      LIMIT 5
    `);
    results.step4_raceLevelCache = {
      count: raceLevelRows.length,
      sample: raceLevelRows
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
    const testRaceRows = await db.query(`
      SELECT race_id, date, place, class_name
      FROM umadata
      WHERE SUBSTRING(race_id, 1, 8)::INTEGER < 20260118
        AND SUBSTRING(race_id, 1, 8)::INTEGER > 20251101
      LIMIT 1
    `);
    
    if (testRaceRows.length > 0) {
      const testRace = testRaceRows[0] as any;
      
      // 上位3頭取得テスト
      const top3Rows = await db.query(`
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
        top3Count: top3Rows.length,
        top3: top3Rows,
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
