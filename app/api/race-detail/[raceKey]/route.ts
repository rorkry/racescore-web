import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ raceKey: string }> },
) {
  const { raceKey } = await params;          // params is a Promise in Next 15
  const key = raceKey?.trim();               // ← “%20” や改行を除去
  if (!/^\d{12}$/.test(key))
    return NextResponse.json({ error: 'invalid raceKey' }, { status: 400 });

  const db = await getDb();

  // ── 存在しない列は NULL で埋めておく ──
  const rows = db
    .prepare(
      `
      SELECT
        r.ymd,
        r.course,
        substr(rr.raceId,11,2) AS race_no,

        /* races テーブルに無い列は空文字でプレースホルダ */
        ''          AS race_name,
        r.grade     AS class_name,

        rr.horseNo,
        rr.frameNo,
        NULL        AS jockey,       -- ← 無いので NULL
        NULL        AS weight,
        rr.time     AS time_last,
        NULL        AS odds_win,

        h.name      AS horse_name,
        h.sex,
        strftime('%Y','now') - substr(h.birthYmd,1,4) AS age,
        h.trainer,
        ''          AS stable_area,

        NULL        AS distance,
        ''          AS surface
      FROM race_results rr
      JOIN races  r ON r.raceId  = rr.raceId
      JOIN horses h ON h.horseId = rr.horseId
      WHERE rr.raceId = ?
      ORDER BY CAST(rr.horseNo AS INTEGER);
    `,
    )
    .all(key);

  if (!rows.length)
    return NextResponse.json({ error: 'race not found' }, { status: 404 });

  const horses = rows.map((r: any) => ({
    日付: r.ymd.slice(4),
    開催地: r.course,
    R: r.race_no,
    レース名: r.race_name,
    クラス名: r.class_name,
    枠番: r.frameNo,
    馬番: r.horseNo,
    馬名: r.horse_name,
    性別: r.sex,
    馬齢: r.age,
    斤量: r.weight ?? '',
    騎手: r.jockey ?? '',
    馬場: r.surface,
    距離: r.distance ?? '',
    所属: r.stable_area,
    調教師: r.trainer,
    走破タイム: r.time_last ?? '',
    単勝: r.odds_win ?? null,
  }));

  const m = rows[0];
  return NextResponse.json({
    ymd: m.ymd,
    dateCode: m.ymd.slice(4),
    place: m.course,
    raceNo: m.race_no,
    horses,
  });
}