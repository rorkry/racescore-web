/**
 * 時計比較チェックAPI（軽量版）
 * レース一覧で優秀な時計の馬がいるレースにマークを表示するため
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRawDb } from '../../../lib/db';
import { toHalfWidth } from '../../../utils/parse-helpers';

interface TimeCheckResult {
  raceNumber: string;
  hasExcellentTime: boolean;  // 上位クラスと同等以上
  hasGoodTime: boolean;       // 0.5秒以内
  bestTimeDiff: number | null;
}

// クラスレベルを数値化
function getClassLevel(className: string): number {
  if (!className) return 0;
  const c = className.trim();
  if (/G[1１]|Ｇ[1１]/i.test(c)) return 10;
  if (/G[2２]|Ｇ[2２]/i.test(c)) return 9;
  if (/G[3３]|Ｇ[3３]/i.test(c)) return 8;
  if (/OP|オープン|ｵｰﾌﾟﾝ/i.test(c)) return 7;
  if (/3勝|1600万/i.test(c)) return 6;
  if (/2勝|1000万/i.test(c)) return 5;
  if (/1勝|500万/i.test(c)) return 4;
  if (/未勝利/i.test(c)) return 3;
  if (/新馬/i.test(c)) return 2;
  return 1;
}

// 馬場状態を数値化
function getTrackConditionLevel(condition: string): number {
  if (!condition) return 0;
  if (condition.includes('良')) return 0;
  if (condition.includes('稍')) return 1;
  if (condition.includes('重')) return 2;
  if (condition.includes('不')) return 3;
  return 0;
}

// 馬場状態が比較可能か（1段階差まで）
function isTrackConditionComparable(cond1: string, cond2: string): boolean {
  const level1 = getTrackConditionLevel(cond1);
  const level2 = getTrackConditionLevel(cond2);
  return Math.abs(level1 - level2) <= 1;
}

// 馬名を正規化
function normalizeHorseName(name: string): string {
  return name
    .replace(/^[\$\*＄＊\s　]+/, '')
    .replace(/[\s　]+$/, '')
    .trim();
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');  // "0111" 形式
  const place = searchParams.get('place'); // "京都" など
  const year = searchParams.get('year') || '2026';

  if (!date || !place) {
    return NextResponse.json({ error: 'Missing date or place' }, { status: 400 });
  }

  try {
    const db = getRawDb();

    // wakujunはyear + dateの組み合わせで検索する必要がある場合がある
    // その日のレース一覧を取得（GROUP BYでユニーク化）
    const races = await db.prepare(`
      SELECT race_number
      FROM wakujun
      WHERE date = $1 AND place = $2 AND year = $3
      GROUP BY race_number
      ORDER BY race_number::INTEGER
    `).all(date, place, year) as { race_number: string }[];  // yearは文字列として渡す

    const results: TimeCheckResult[] = [];

    for (const race of races) {
      const raceNumber = race.race_number;
      
      // そのレースの出走馬を取得
      const horses = await db.prepare(`
        SELECT umamei FROM wakujun
        WHERE date = $1 AND place = $2 AND race_number = $3 AND year = $4
      `).all(date, place, raceNumber, year) as { umamei: string }[];  // yearは文字列として渡す

      let hasExcellentTime = false;
      let hasGoodTime = false;
      let bestTimeDiff: number | null = null;

      for (const horse of horses) {
        if (hasExcellentTime) break; // 既に優秀な馬が見つかっていればスキップ
        
        const horseName = normalizeHorseName(horse.umamei || '');
        if (!horseName) continue;

        // 過去3走を取得
        const pastRaces = await db.prepare(`
          SELECT date, place, distance, class_name, finish_time, track_condition
          FROM umadata
          WHERE TRIM(horse_name) = $1
          ORDER BY date DESC
          LIMIT 3
        `).all(horseName) as any[];

        for (const pastRace of pastRaces) {
          if (!pastRace.finish_time || !pastRace.class_name) continue;
          
          const pastTime = parseInt(toHalfWidth(pastRace.finish_time || '0'), 10);
          if (pastTime <= 0) continue;

          const pastClassLevel = getClassLevel(pastRace.class_name);
          const pastCondition = pastRace.track_condition || '良';

          // 同じコース・距離の上位クラスの勝ち時計を検索
          // 日付フォーマット対応
          const cleanedDate = (pastRace.date || '').replace(/\s+/g, '').replace(/[\/\-]/g, '.');
          const dateParts = cleanedDate.split('.');
          if (dateParts.length !== 3) continue;

          const [y, m, d] = dateParts.map(Number);
          const raceDate = new Date(y, m - 1, d);
          
          const prevDate = new Date(raceDate);
          prevDate.setDate(prevDate.getDate() - 1);
          const nextDate = new Date(raceDate);
          nextDate.setDate(nextDate.getDate() + 1);

          const formatDateSpaced = (dt: Date) => 
            `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, ' ')}.${String(dt.getDate()).padStart(2, ' ')}`;
          const formatDatePadded = (dt: Date) => 
            `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;

          const dateRange = [
            formatDateSpaced(prevDate), formatDateSpaced(raceDate), formatDateSpaced(nextDate),
            formatDatePadded(prevDate), formatDatePadded(raceDate), formatDatePadded(nextDate),
          ];

          const normalizedPlace = (pastRace.place || '').replace(/^[0-9０-９]+/, '').replace(/[0-9０-９]+$/, '').trim();

          // 上位クラスの勝ち馬時計を取得
          const comparisonRaces = await db.prepare(`
            SELECT class_name, finish_time, track_condition
            FROM umadata
            WHERE date IN ($1, $2, $3, $4, $5, $6)
              AND place LIKE $7
              AND distance = $8
              AND finish_position = '１'
          `).all(
            ...dateRange,
            `%${normalizedPlace}%`,
            pastRace.distance
          ) as any[];

          for (const compRace of comparisonRaces) {
            const compClassLevel = getClassLevel(compRace.class_name);
            
            // 上位クラスでない場合はスキップ
            if (compClassLevel <= pastClassLevel) continue;
            
            // 馬場状態が2段階以上違う場合はスキップ
            if (!isTrackConditionComparable(pastCondition, compRace.track_condition)) continue;

            const compTime = parseInt(toHalfWidth(compRace.finish_time || '0'), 10);
            if (compTime <= 0) continue;

            // 時計差を計算（秒単位、0.1秒 = 1）
            const timeDiff = (pastTime - compTime) / 10;

            if (bestTimeDiff === null || timeDiff < bestTimeDiff) {
              bestTimeDiff = timeDiff;
            }

            if (timeDiff <= 0) {
              hasExcellentTime = true;
              hasGoodTime = true;
              break;
            } else if (timeDiff <= 0.5) {
              hasGoodTime = true;
            }
          }

          if (hasExcellentTime) break;
        }
      }

      results.push({
        raceNumber,
        hasExcellentTime,
        hasGoodTime,
        bestTimeDiff,
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Time check error:', error);
    const errorDetails = error instanceof Error 
      ? { message: error.message, stack: error.stack?.slice(0, 500) }
      : 'Unknown';
    return NextResponse.json({ 
      error: 'Internal error',
      details: errorDetails,
      params: { date, place, year }
    }, { status: 500 });
  }
}
