/**
 * Real DB coat samples + normalize + palette path.
 * Usage: npx tsx scripts/verify-coat-live-samples.ts
 */
import { getDb } from '../lib/db';
import { normalizeCoatColor } from '../lib/race-simulator/coat-normalize';
import { coatIndexFromName, coatIndexFor, COAT_PALETTE } from '../lib/race-simulator/broadcast-cel-horse';
import { fetchCoatColors, __resetCoatColumnCacheForTest } from '../lib/race-simulator/data-fetcher';

const PALETTE_NOTE = ['bay', 'darkBay', 'black', 'chestnut', 'gray', 'darkChestnut', 'white'];

async function main() {
  const db = getDb();
  __resetCoatColumnCacheForTest();

  // Prefer normal field sizes (avoid duplicate-bloated race_id groups)
  const races = (await db
    .prepare(
      `SELECT race_id,
              COUNT(DISTINCT horse_name)::int AS n,
              COUNT(DISTINCT btrim(keiro))::int AS coats
       FROM umadata
       WHERE keiro IS NOT NULL AND btrim(keiro) <> ''
       GROUP BY race_id
       HAVING COUNT(DISTINCT horse_name) BETWEEN 10 AND 18
          AND COUNT(DISTINCT btrim(keiro)) >= 4
       ORDER BY coats DESC, n DESC
       LIMIT 5`,
    )
    .all()) as Array<{ race_id: string; n: number; coats: number }>;
  console.log('candidate races:', races);
  if (races.length === 0) throw new Error('no diverse race');

  const raceId = races[0].race_id;
  const horses = (await db
    .prepare(
      `SELECT DISTINCT ON (horse_name)
          id, race_id, umaban, horse_name, keiro
       FROM umadata
       WHERE race_id = $1 AND keiro IS NOT NULL AND btrim(keiro) <> ''
       ORDER BY horse_name, id DESC`,
    )
    .all(raceId)) as Array<{
    id: number;
    race_id: string;
    umaban: string;
    horse_name: string;
    keiro: string;
  }>;
  // sort by umaban for display
  horses.sort((a, b) => Number(a.umaban) - Number(b.umaban));
  console.log('\npicked race_id=', raceId, 'distinct horses=', horses.length);

  const picked: typeof horses = [];
  const seen = new Set<string>();
  for (const h of horses) {
    const k = String(h.keiro).trim();
    if (!seen.has(k)) {
      seen.add(k);
      picked.push(h);
    }
    if (picked.length >= 6) break;
  }
  for (const h of horses) {
    if (picked.length >= 5) break;
    if (!picked.find((x) => x.id === h.id)) picked.push(h);
  }

  console.log('\n| 馬番 | 馬名 | DB keiro | normalized | palette | fallback |');
  console.log('|---:|---|---|---|---|---|');

  const names = picked.map((h) => String(h.horse_name).trim());
  __resetCoatColumnCacheForTest();
  const coatMap = await fetchCoatColors(db, names);

  let allOk = true;
  for (const h of picked) {
    const umaban = h.umaban;
    const name = String(h.horse_name).trim();
    const dbKeiro = String(h.keiro).trim();
    const fromApi = coatMap.get(name) ?? null;
    const norm = normalizeCoatColor(dbKeiro);
    const byName = coatIndexFromName(dbKeiro);
    const fb = coatIndexFor(Number(umaban) || 1);
    const usedFallback = byName < 0;
    const idx = usedFallback ? fb : byName;
    const palette = PALETTE_NOTE[idx] ?? String(idx);
    const apiOk = fromApi != null && fromApi.trim() === dbKeiro;
    if (!apiOk || usedFallback || !norm) allOk = false;
    console.log(
      `| ${umaban} | ${name} | ${dbKeiro} | ${norm} | ${palette} | ${usedFallback} |`,
    );
    console.log(
      JSON.stringify({
        id: h.id,
        race_id: h.race_id,
        umaban,
        name,
        dbKeiro,
        fetchCoatColors: fromApi,
        apiMatchesDb: apiOk,
        HorseState_keiro: fromApi,
        normalized: norm,
        paletteIndex: idx,
        paletteHex: COAT_PALETTE[idx],
        fallback: usedFallback,
        fallbackIndexIfUsed: fb,
      }),
    );
  }

  console.log('\nfetchCoatColors size:', coatMap.size, '/', names.length);
  console.log('LIVE_COAT_OK', allOk);
  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
