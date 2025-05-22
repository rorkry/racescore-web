// app/api/ymd-list/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/ymd-list
 * ----------------------------------------------------
 * 返り値: ["20250427", "20250420", …] 月日昇順
 *   ・過去365日
 *   ・同じ MMDD が複数年ある場合は最新年のみ残す
 */
export async function GET() {
  const db = getDb();

  /* ① 過去 1 年の開催日 (8桁) を取得 */
  const rows = db
    .prepare(`
      SELECT DISTINCT ymd
        FROM races
       WHERE length(ymd)=8
         AND date(substr(ymd,1,4)||'-'||substr(ymd,5,2)||'-'||substr(ymd,7,2))
             >= date('now','-365 day')
         AND EXISTS (      -- race_results が 1 件でもある開催日
               SELECT 1
                 FROM race_results rr
                WHERE rr.raceId LIKE ymd || '%'
                LIMIT 1
             )
    `)
    .all<{ ymd: string }>();

  /* ② MMDD ごとに最新年だけ残す */
  const latest: Record<string, string> = {};
  rows.forEach(({ ymd }) => {
    const mmdd = ymd.slice(4);          // "MMDD"
    if (!latest[mmdd] || ymd > latest[mmdd]) latest[mmdd] = ymd;
  });

  /* ③ 月日昇順で並べ替えて返す */
  const list = Object.values(latest).sort((a, b) =>
    a.slice(4).localeCompare(b.slice(4))
  );

  return NextResponse.json(list);
}