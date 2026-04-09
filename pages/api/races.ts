import type { NextApiRequest, NextApiResponse } from 'next';
import { getRawDb } from '../../lib/db';

// ========================================
// サーバーサイドメモリキャッシュ（レース一覧）
// ========================================
interface CacheEntry {
  data: any;
  timestamp: number;
}

declare global {
  var _racesCache: Map<string, CacheEntry> | undefined;
}

if (!globalThis._racesCache) {
  globalThis._racesCache = new Map();
}

const CACHE_TTL = 10 * 60 * 1000; // 10分間キャッシュ有効

function getCachedRaces(key: string): any | null {
  const entry = globalThis._racesCache?.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    globalThis._racesCache?.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedRaces(key: string, data: any): void {
  if (globalThis._racesCache && globalThis._racesCache.size >= 100) {
    const firstKey = globalThis._racesCache.keys().next().value;
    if (firstKey) globalThis._racesCache.delete(firstKey);
  }
  globalThis._racesCache?.set(key, { data, timestamp: Date.now() });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, place, year } = req.query;
  
  // キャッシュキー生成
  const cacheKey = `races_${date || 'null'}_${place || 'null'}_${year || 'null'}`;
  const cached = getCachedRaces(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    const db = getRawDb();

    if (date && place) {
      // 特定の日付・場所のレース一覧を取得
      const yearFilter = year ? String(year) : null;  // yearは文字列として渡す
      const races = await db.prepare(`
        SELECT 
          date, 
          place, 
          race_number, 
          class_name_1 as class_name,
          track_type,
          distance,
          COUNT(*) as field_size
        FROM wakujun
        WHERE date = $1 AND place = $2 ${yearFilter ? 'AND year = $3' : ''}
        GROUP BY date, place, race_number, class_name_1, track_type, distance
        ORDER BY race_number::INTEGER
      `).all(...(yearFilter ? [date, place, yearFilter] : [date, place]));

      const response = { races };
      setCachedRaces(cacheKey, response);
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).json(response);
    } else if (date) {
      // 特定の日付の全場所・全レースを取得
      const dateStr = String(date).trim();
      const yearFilter = year ? String(year) : null;
      const yyyymmdd = yearFilter ? `${yearFilter}${dateStr}` : `${new Date().getFullYear()}${dateStr}`;
      console.log(`[api/races] date parameter: "${dateStr}", year: ${yearFilter}`);

      // wakujun からの場所一覧
      const wakujunPlaces = await db.prepare(`
        SELECT DISTINCT place
        FROM wakujun
        WHERE date = $1 ${yearFilter ? 'AND year = $2' : ''}
        ORDER BY place
      `).all(...(yearFilter ? [dateStr, yearFilter] : [dateStr])) as { place: string }[];

      // umadata からの場所一覧（wakujun にない場所を補完）
      const umadataPlaces = await db.prepare(`
        SELECT DISTINCT place
        FROM umadata
        WHERE SUBSTRING(race_id, 1, 8) = $1
        ORDER BY place
      `).all(yyyymmdd) as { place: string }[];

      // 全場所をマージ
      const placeSet = new Set<string>();
      const allPlaces: { place: string; fromUmadata?: boolean }[] = [];
      for (const p of wakujunPlaces) { placeSet.add(p.place); allPlaces.push(p); }
      for (const p of umadataPlaces) {
        if (!placeSet.has(p.place)) { placeSet.add(p.place); allPlaces.push({ ...p, fromUmadata: true }); }
      }

      console.log(`[api/races] found places: ${allPlaces.length}`, allPlaces.map((p: any) => p.place));

      const result = await Promise.all(allPlaces.map(async (p: any) => {
        // まず wakujun から取得
        const races = await db.prepare(`
          SELECT 
            date, 
            place, 
            race_number, 
            class_name_1 as class_name,
            track_type,
            distance,
            COUNT(*) as field_size
          FROM wakujun
          WHERE date = $1 AND place = $2 ${yearFilter ? 'AND year = $3' : ''}
          GROUP BY date, place, race_number, class_name_1, track_type, distance
          ORDER BY race_number::INTEGER
        `).all(...(yearFilter ? [dateStr, p.place, yearFilter] : [dateStr, p.place])) as any[];

        if (races.length > 0) {
          return { place: p.place, races };
        }

        // wakujun にデータがなければ umadata から取得（枠順未確定）
        const umadataRaces = await db.prepare(`
          SELECT DISTINCT
            $1 as date,
            place,
            CAST(RIGHT(race_id, 2) AS INTEGER)::TEXT as race_number,
            class_name,
            course_type as track_type,
            distance,
            COUNT(DISTINCT horse_name) as field_size
          FROM umadata
          WHERE SUBSTRING(race_id, 1, 8) = $2 AND place = $3
          GROUP BY place, race_id, class_name, course_type, distance
          ORDER BY race_number::INTEGER
        `).all(dateStr, yyyymmdd, p.place) as any[];

        return { place: p.place, races: umadataRaces, hasUmadataFallback: true };
      }));

      console.log(`[api/races] returning venues: ${result.length}`);
      const response = { date: dateStr, venues: result };
      setCachedRaces(cacheKey, response);
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).json(response);
    } else if (year) {
      // 特定の年の全日付を取得（wakujun + umadata マージ）
      const yearFilter = String(year);
      const wakujunDates = await db.prepare(`
        SELECT DISTINCT date
        FROM wakujun
        WHERE year = $1 AND date ~ '^[0-9]{4}$'
        ORDER BY date DESC
      `).all(yearFilter) as { date: string }[];

      // umadata から同年の日付を取得（race_id 先頭8桁 = YYYYMMDD）
      const umadataDates = await db.prepare(`
        SELECT DISTINCT SUBSTRING(race_id, 5, 4) as date
        FROM umadata
        WHERE SUBSTRING(race_id, 1, 4) = $1
          AND SUBSTRING(race_id, 5, 4) ~ '^[0-9]{4}$'
        ORDER BY date DESC
      `).all(yearFilter) as { date: string }[];

      // マージして重複除去
      const dateSet = new Set<string>();
      const mergedDates: { date: string }[] = [];
      for (const d of [...wakujunDates, ...umadataDates]) {
        if (!dateSet.has(d.date)) {
          dateSet.add(d.date);
          mergedDates.push(d);
        }
      }
      mergedDates.sort((a, b) => b.date.localeCompare(a.date));

      const response = { dates: mergedDates };
      setCachedRaces(cacheKey, response);
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).json(response);
    } else {
      // 利用可能な年を取得（wakujun + umadata マージ）
      const wakujunYears = await db.prepare(`
        SELECT DISTINCT year
        FROM wakujun
        WHERE year IS NOT NULL
        ORDER BY year DESC
      `).all() as { year: string }[];

      const umadataYears = await db.prepare(`
        SELECT DISTINCT SUBSTRING(race_id, 1, 4) as year
        FROM umadata
        WHERE race_id ~ '^[0-9]{8}'
        ORDER BY year DESC
      `).all() as { year: string }[];

      const yearSet = new Set<string>();
      const mergedYears: { year: string }[] = [];
      for (const y of [...wakujunYears, ...umadataYears]) {
        if (!yearSet.has(String(y.year))) {
          yearSet.add(String(y.year));
          mergedYears.push(y);
        }
      }
      mergedYears.sort((a, b) => String(b.year).localeCompare(String(a.year)));

      const response = { years: mergedYears };
      setCachedRaces(cacheKey, response);
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).json(response);
    }
  } catch (error: any) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
