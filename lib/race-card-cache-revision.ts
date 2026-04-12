/**
 * レースカードのキャッシュ無効化用リビジョン。
 * wakujun / umadata フォールバックの枠・馬番・馬名の集合が変われば文字列が変わる。
 */
import { createHash } from 'crypto';
import { getRawDb } from './db';

type Db = ReturnType<typeof getRawDb>;

function normalizeHorseNameForRevision(name: string): string {
  return name
    .replace(/^[\$\*＄＊\s　]+/, '')
    .replace(/[\s　]+$/, '')
    .trim();
}

function hashSortedParts(parts: string[]): string {
  return createHash('sha256').update(parts.join('>'), 'utf8').digest('hex').slice(0, 32);
}

/** wakujun 行（枠・馬番・馬名）からリビジョン文字列 */
export function revisionFromWakujunRows(
  rows: Array<{ waku?: unknown; umaban?: unknown; umamei?: unknown }>
): string {
  const parts = rows.map((h) => {
    const waku = String(h.waku ?? '').trim();
    const uma = String(h.umaban ?? '').trim();
    const mei = normalizeHorseNameForRevision(String(h.umamei ?? ''));
    return `${waku}|${uma}|${mei}`;
  }).sort();
  return `w:${hashSortedParts(parts)}`;
}

/** umadata フォールバック行からリビジョン文字列 */
export function revisionFromUmadataFallbackRows(
  rows: Array<{ horse_name?: unknown; waku?: unknown; umaban?: unknown }>
): string {
  const parts = rows.map((h) => {
    const hn = normalizeHorseNameForRevision(String(h.horse_name ?? ''));
    const waku = String(h.waku ?? '').trim();
    const uma = String(h.umaban ?? '').trim();
    return `${hn}|${waku}|${uma}`;
  }).sort();
  return `u:${hashSortedParts(parts)}`;
}

/**
 * DB から現在のソースリビジョンのみ取得（クライアントの IndexedDB 検証用）
 * race-card-with-score の出走馬解決順と同じく、wakujun → year なし → umadata フォールバック
 */
export async function getRaceCardCacheRevisionString(
  db: Db,
  date: string,
  place: string,
  raceNumber: string,
  yearFilter: string | null
): Promise<string> {
  const paramsWithYear = yearFilter
    ? [date, place, raceNumber, yearFilter]
    : [date, place, raceNumber];

  const sqlWithYear = `
    SELECT waku, umaban, umamei FROM wakujun
    WHERE date = $1 AND place = $2 AND race_number = $3 ${yearFilter ? 'AND year = $4' : ''}
    ORDER BY CASE WHEN umaban ~ '^[0-9]+$' THEN umaban::INTEGER ELSE 9999 END, umamei
  `;

  let rows = (await db.prepare(sqlWithYear).all(...paramsWithYear)) as Array<{
    waku?: unknown;
    umaban?: unknown;
    umamei?: unknown;
  }>;

  if (!rows?.length) {
    const sqlNoYear = `
      SELECT waku, umaban, umamei FROM wakujun
      WHERE date = $1 AND place = $2 AND race_number = $3
      ORDER BY CASE WHEN umaban ~ '^[0-9]+$' THEN umaban::INTEGER ELSE 9999 END, umamei
    `;
    rows = (await db.prepare(sqlNoYear).all(date, place, raceNumber)) as typeof rows;
  }

  if (rows?.length) {
    return revisionFromWakujunRows(rows);
  }

  const currentYear = yearFilter ? parseInt(yearFilter, 10) : new Date().getFullYear();
  const dateStr = String(date).padStart(4, '0');
  const yyyymmdd = `${currentYear}${dateStr}`;
  const raceNumPadded = String(raceNumber).padStart(2, '0');

  const umadataRows = (await db.prepare(`
    SELECT DISTINCT ON (horse_name)
      horse_name, waku, umaban
    FROM umadata
    WHERE SUBSTRING(race_id, 1, 8) = $1
      AND place = $2
      AND RIGHT(race_id, 2) = $3
    ORDER BY horse_name ASC
  `).all(yyyymmdd, place, raceNumPadded)) as Array<{
    horse_name?: unknown;
    waku?: unknown;
    umaban?: unknown;
  }>;

  if (!umadataRows?.length) {
    return 'none';
  }
  return revisionFromUmadataFallbackRows(umadataRows);
}
