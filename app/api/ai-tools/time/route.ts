/**
 * AI研究ツール: タイム補正
 * 走破タイムを馬場・斤量・ペースで補正
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const TOOL_VERSION = '1.0';

export async function POST(req: NextRequest) {
  try {
    const { horse_name, past_race_date, past_race_place, past_race_distance } = await req.json();
    
    if (!horse_name || !past_race_date || !past_race_place || !past_race_distance) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'All parameters are required'
      }, { status: 400 });
    }
    
    const db = getDb();
    
    // 過去走を取得
    const pastRace = await db.prepare(`
      SELECT finish_time, track_condition, distance, place, date
      FROM umadata
      WHERE horse_name = $1
        AND date LIKE $2
        AND place LIKE $3
        AND distance LIKE $4
      ORDER BY date DESC
      LIMIT 1
    `).get<any>(horse_name, `%${past_race_date.replace(/\./g, '')}%`, `%${past_race_place}%`, `%${past_race_distance}%`);
    
    if (!pastRace || !pastRace.finish_time) {
      return NextResponse.json({
        schema_version: TOOL_VERSION,
        error: 'Race not found',
        summary: `該当するレースデータが見つかりません`
      });
    }
    
    // タイムを秒に変換
    const timeMatch = pastRace.finish_time.match(/^(\d+):(\d+)\.(\d+)$/);
    let rawTimeSeconds = 0;
    if (timeMatch) {
      const min = parseInt(timeMatch[1], 10);
      const sec = parseInt(timeMatch[2], 10);
      const dec = parseInt(timeMatch[3], 10);
      rawTimeSeconds = min * 60 + sec + dec * 0.1;
    }
    
    // 簡易的な補正（馬場状態による）
    let correction = 0;
    const trackCondition = pastRace.track_condition || '良';
    if (trackCondition === '稍') correction = -0.5;
    else if (trackCondition === '重') correction = -1.0;
    else if (trackCondition === '不') correction = -1.5;
    
    const correctedTime = rawTimeSeconds + correction;
    
    // サマリー
    const summary = `${horse_name}の${past_race_date} ${past_race_place}${past_race_distance}は${rawTimeSeconds.toFixed(1)}秒。` +
      `馬場補正後は${correctedTime.toFixed(1)}秒相当。`;
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      raw_time: rawTimeSeconds,
      corrected_time: correctedTime,
      corrections: {
        track_condition: correction
      },
      summary
    });
    
  } catch (error) {
    console.error('[AI Tool: Time] Error:', error);
    return NextResponse.json({ 
      schema_version: TOOL_VERSION,
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
