import type { NextApiRequest, NextApiResponse } from 'next';
import Database from 'better-sqlite3';

const db = new Database('races.db', { readonly: true, fileMustExist: true });

/** GET /api/race-detail/:id   ─ id = 12桁 RaceID */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== 'string' || !/^\d{12}$/.test(id)) {
    return res.status(400).json({ error: 'invalid race id' });
  }

  /* ---------- 基本情報 ---------- */
  const race = db
    .prepare(`
      SELECT ymd, course, raceNo, raceName
        FROM races
       WHERE raceId = ?
    `)
    .get(id);
  if (!race) return res.status(404).json({ error: 'race not found' });

  /* ---------- 出走馬＋リザルト ---------- */
  const rows = db.prepare(`
      SELECT
        rr.horseNo, rr.frameNo, rr.position, rr.time, rr.odds_win,
        h.horseId, h.name, h.sex, h.birthYmd, h.trainer,
        r.distance, r.surface
      FROM race_results rr
      JOIN horses h ON h.horseId = rr.horseId
      JOIN races  r ON r.raceId  = rr.raceId       -- 距離・馬場を取得
      WHERE rr.raceId = ?
      ORDER BY rr.horseNo
  `).all(id);

  /* ---------- EntryTable が食べられる形に整形 ---------- */
  const horses = rows.map(r => ({
    entry: {
      日付: race.ymd.slice(4),      // "MMDD"
      開催地: race.course,          // "05" など
      R: race.raceNo,
      レース名: race.raceName,
      枠番: r.frameNo,
      馬番: r.horseNo,
      馬名: r.name,
      性別: r.sex,
      調教師: r.trainer,
      走破タイム: r.time,
      着順: r.position,
      距離: r.distance ?? '',
      馬場: r.surface ?? '',
      斤量: '',                 // 現状 DB に無いので空欄
      単勝: r.odds_win ?? null,
    },
    past: [],          // 過去5走は後で拡張可
  }));

  res.status(200).json({
    ymd: race.ymd,
    dateCode: race.ymd.slice(4), // "MMDD"
    place: race.course,
    raceNo: race.raceNo,
    horses,
  });
}