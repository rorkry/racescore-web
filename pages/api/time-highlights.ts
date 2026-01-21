/**
 * 時計優秀な馬がいるレースを検出するAPI
 * 
 * レース一覧で「時計優秀な上位勢がいる」レースに目印をつけるため
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db';
import { toHalfWidth } from '../../utils/parse-helpers';

interface TimeHighlight {
  raceNumber: string;
  place: string;
  hasTimeHighlight: boolean;
  highlightCount: number;  // 時計優秀な馬の数
  bestTimeDiff: number;    // 最も良い時計差（秒）
}

// クラスレベル（高いほど上位）
function getClassLevel(className: string): number {
  if (!className) return 0;
  const normalized = className
    .replace(/Ｇ１/g, 'G1').replace(/Ｇ２/g, 'G2').replace(/Ｇ３/g, 'G3')
    .replace(/ＯＰ/g, 'OP').replace(/ｵｰﾌﾟﾝ/g, 'OP')
    .replace(/OP\(L\)/g, 'OP').trim();

  const levels: { [key: string]: number } = {
    '新馬': 1, '未勝利': 1, '500万': 2, '1勝': 2,
    '1000万': 3, '2勝': 3, '1600万': 4, '3勝': 4,
    'OP': 5, '重賞': 5, 'G3': 6, 'G2': 7, 'G1': 8,
  };
  return levels[normalized] || 0;
}

// 時計を秒に変換
function timeToSeconds(time: number): number {
  if (!time || time <= 0) return 0;
  const timeStr = String(time).padStart(4, '0');
  const minutes = parseInt(timeStr.slice(0, -3), 10) || 0;
  const seconds = parseInt(timeStr.slice(-3, -1), 10) || 0;
  const tenths = parseInt(timeStr.slice(-1), 10) || 0;
  return minutes * 60 + seconds + tenths / 10;
}

// 馬場比較可能か
function isTrackConditionComparable(cond1: string, cond2: string): boolean {
  const getLevel = (c: string) => {
    const levels: { [key: string]: number } = { '良': 0, '稍': 1, '重': 2, '不': 3 };
    return levels[c?.charAt(0)] ?? 0;
  };
  return Math.abs(getLevel(cond1) - getLevel(cond2)) <= 1;
}

/**
 * 日付文字列をYYYYMMDD形式の数値に変換（比較用）
 */
function parseDateToNumber(dateStr: string): number {
  if (!dateStr) return 0;
  const cleaned = dateStr.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return 0;
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;
  return year * 10000 + month * 100 + day;
}

/**
 * 現在のレース日付をYYYYMMDD形式の数値に変換
 */
function getCurrentRaceDateNumber(date: string, year: string | null): number {
  const dateStr = String(date).padStart(4, '0');
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  const currentYear = year ? parseInt(year, 10) : new Date().getFullYear();
  return currentYear * 10000 + month * 100 + day;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { date, place, year } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }

  const db = getRawDb();
  
  // 現在表示中のレース日付を数値化（このレース以前のデータのみ使用）
  const currentRaceDateNum = getCurrentRaceDateNumber(String(date), year as string | null);

  try {
    // その日の出走馬リストを取得
    let raceQuery = `
      SELECT DISTINCT w.race_number, w.place, w.umamei, w.distance, w.track_type
      FROM wakujun w
      WHERE w.date = $1
    `;
    const params: any[] = [date];
    let paramIndex = 2;

    if (place) {
      raceQuery += ` AND w.place LIKE $${paramIndex}`;
      params.push(`%${place}%`);
      paramIndex++;
    }

    raceQuery += ` ORDER BY w.place, w.race_number::INTEGER`;

    const entries = await db.prepare(raceQuery).all(...params) as any[];

    if (!entries || entries.length === 0) {
      return res.json({ highlights: [] });
    }

    // レースごとにグループ化
    const raceMap = new Map<string, { place: string; horses: string[]; distance: string }>();
    for (const entry of entries) {
      const key = `${entry.place}_${entry.race_number}`;
      if (!raceMap.has(key)) {
        raceMap.set(key, {
          place: entry.place,
          horses: [],
          distance: entry.distance || entry.track_type || '',
        });
      }
      raceMap.get(key)!.horses.push(entry.umamei?.trim() || '');
    }

    const highlights: TimeHighlight[] = [];

    // 各レースの馬について時計比較チェック
    for (const [key, raceData] of raceMap.entries()) {
      const [racePlaceRaw, raceNumber] = key.split('_');

      let highlightCount = 0;
      let bestTimeDiff = Infinity;

      for (const horseName of raceData.horses) {
        if (!horseName) continue;

        // 馬名を正規化
        const cleanName = horseName.replace(/^[\$\*＄＊\s　]+/, '').trim();

        // 過去走を取得（直近5走）
        const allPastRaces = await db.prepare(`
          SELECT date, place, distance, class_name, finish_time, track_condition
          FROM umadata
          WHERE TRIM(horse_name) = $1
          ORDER BY date DESC
          LIMIT 20
        `).all(cleanName) as any[];

        // 現在のレース日付以前のデータのみをフィルタリング
        const pastRaces = allPastRaces.filter((race: any) => {
          const pastRaceDateNum = parseDateToNumber(race.date || '');
          return pastRaceDateNum < currentRaceDateNum;
        }).slice(0, 5);

        if (!pastRaces || pastRaces.length === 0) continue;

        // 各過去走で時計比較
        for (const race of pastRaces) {
          if (!race.finish_time || !race.class_name) continue;

          const raceTime = timeToSeconds(parseInt(toHalfWidth(race.finish_time), 10));
          if (raceTime <= 0) continue;

          const raceLevel = getClassLevel(race.class_name);
          if (raceLevel === 0) continue;

          // 同日前後の上位クラス勝ち時計を検索
          const cleanedDate = (race.date || '').replace(/\s+/g, '');
          const dateParts = cleanedDate.replace(/[\/\-]/g, '.').split('.');
          if (dateParts.length !== 3) continue;

          const [raceYear, month, day] = dateParts.map(Number);
          const raceDate = new Date(raceYear, month - 1, day);

          const prevDate = new Date(raceDate);
          prevDate.setDate(prevDate.getDate() - 1);
          const nextDate = new Date(raceDate);
          nextDate.setDate(nextDate.getDate() + 1);

          const formatSpaced = (d: Date) =>
            `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, ' ')}.${String(d.getDate()).padStart(2, ' ')}`;
          const formatPadded = (d: Date) =>
            `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

          // 6パターンの日付フォーマット（saga-ai.tsと同じ）
          const dateRange = [
            formatSpaced(prevDate),
            formatSpaced(raceDate),
            formatSpaced(nextDate),
            formatPadded(prevDate),
            formatPadded(raceDate),
            formatPadded(nextDate),
          ];

          const normalizedPlace = (race.place || '').replace(/^[0-9０-９]+/, '').replace(/[0-9０-９]+$/, '').trim();

          // 同コース・同距離の勝ち馬を検索（6日付パターン対応）
          const comparisons = await db.prepare(`
            SELECT class_name, finish_time, track_condition
            FROM umadata
            WHERE date IN ($1, $2, $3, $4, $5, $6)
              AND place LIKE $7
              AND distance = $8
              AND finish_position = '１'
          `).all(dateRange[0], dateRange[1], dateRange[2], dateRange[3], dateRange[4], dateRange[5], `%${normalizedPlace}%`, race.distance) as any[];

          // 上位クラスとの時計比較
          for (const comp of comparisons) {
            const compLevel = getClassLevel(comp.class_name);
            if (compLevel <= raceLevel) continue;
            if (!isTrackConditionComparable(race.track_condition, comp.track_condition)) continue;

            const compTime = timeToSeconds(parseInt(toHalfWidth(comp.finish_time), 10));
            if (compTime <= 0) continue;

            const timeDiff = raceTime - compTime;

            // 1.5秒以内なら時計優秀（俺AIと同じ基準）
            if (timeDiff <= 1.5) {
              highlightCount++;
              if (timeDiff < bestTimeDiff) {
                bestTimeDiff = timeDiff;
              }
              break; // この馬は時計優秀と判定
            }
          }

          if (highlightCount > 0) break; // 既に判定済み
        }
      }

      highlights.push({
        raceNumber,
        place: racePlaceRaw.replace(/^[0-9０-９]+/, '').replace(/[0-9０-９]+$/, '').trim(),
        hasTimeHighlight: highlightCount > 0,
        highlightCount,
        bestTimeDiff: bestTimeDiff === Infinity ? -1 : Math.round(bestTimeDiff * 10) / 10,
      });
    }

    // シングルトン接続は閉じない

    res.json({ highlights });
  } catch (error: any) {
    console.error('[time-highlights] Error:', error);
    res.status(500).json({ error: error.message });
  }
}




