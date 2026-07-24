/**
 * competition-score-service テスト
 * 実行: npx tsx lib/server/competition-score-service.test.ts
 *
 * 検証:
 *  - loadCompetitionScoresForRace が horseNumber を正本 identity として Map 化する
 *  - 欠損馬（過去走なし）は competitionScore=undefined / provenance='missing'（0 へ丸めない）
 *  - 重複 horseNumber を検知（最初の1頭を採用）
 *  - raceKey 違いでキャッシュが分離する
 *  - 同時呼び出しが 1 回の DB 取得へ集約される（Promise キャッシュ）
 *  - reject 後は再試行できる（reject を永続キャッシュしない）
 *  - computeScoresFromSource が直接 computeKisoScore と一致（正本式の共有・二重実装なし）
 */
import {
  loadCompetitionScoresForRace,
  computeScoresFromSource,
  fetchScoreSourceData,
  buildPastRacesWithIndices,
  mapUmadataToRecordRow,
  mapWakujunToRecordRow,
  __clearCompetitionScoreCacheForTest,
} from './competition-score-service';
import { computeKisoScore } from '../../utils/getClusterData';

let pass = 0,
  fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  \u2717 ${label} ${detail}`);
  }
}

console.log('=== competition-score-service ===');

// ---- フィクスチャ ----
const RACE = { year: '2025', date: '0125', place: '東京', raceNumber: '11' };

const WAKUJUN = [
  { id: 1, date: '0125', place: '東京', race_number: '11', year: '2025', waku: '1', umaban: '1', umamei: 'ウマA', kishu: '騎A', kinryo: '55', distance: '芝1600', tosu: '3', class_name_1: '3勝', track_type: '芝' },
  { id: 2, date: '0125', place: '東京', race_number: '11', year: '2025', waku: '2', umaban: '2', umamei: 'ウマB', kishu: '騎B', kinryo: '56', distance: '芝1600', tosu: '3', class_name_1: '3勝', track_type: '芝' },
  { id: 3, date: '0125', place: '東京', race_number: '11', year: '2025', waku: '3', umaban: '3', umamei: 'ウマC', kishu: '騎C', kinryo: '54', distance: '芝1600', tosu: '3', class_name_1: '3勝', track_type: '芝' },
];

// 過去走（date は 20250125 より前）。DESC で返す（DB の ORDER を模倣）
function pastRow(horse_name: string, race_id: string, umaban: string, date: string, finish: string, corner: string) {
  return {
    horse_name,
    race_id,
    umaban,
    date,
    distance: '芝1600',
    finish_position: finish,
    margin: finish === '1' ? '-0.2' : '0.3',
    corner_2: corner,
    corner_3: corner,
    corner_4: corner,
    field_size: '16',
    pci: '50',
    class_name: '3勝',
    place: '東京',
    finish_time: '1:33.5',
  };
}

// ウマA: 好走（1着・2着・先行）。ウマB: 凡走（10着など）。ウマC: 過去走なし。
const UMADATA: Record<string, any[]> = {
  ウマA: [
    pastRow('ウマA', '2024120105050111', '01', '2024.12.01', '1', '2'),
    pastRow('ウマA', '2024110905050111', '01', '2024.11.09', '2', '3'),
  ],
  ウマB: [pastRow('ウマB', '2024120105050112', '02', '2024.12.01', '11', '14')],
  ウマC: [],
};

// indices: fullRaceId(race_id+umaban) -> 値
// makikaeshi / potential は 0〜10 スケール（computeKisoScore が (値/10)*配点 で使う）
const INDICES: Record<string, any> = {
  '202412010505011101': { race_id: '202412010505011101', L4F: 48, T2F: 46, potential: 7.0, revouma: 55, makikaeshi: 8.0, cushion: 9, pfs_past: 6.0, corner_lane: 1, revouma2: 55 },
  '202411090505011101': { race_id: '202411090505011101', L4F: 47, T2F: 45, potential: 6.5, revouma: 54, makikaeshi: 7.0, cushion: 9, pfs_past: 5.8, corner_lane: 1, revouma2: 54 },
  '202412010505011202': { race_id: '202412010505011202', L4F: 40, T2F: 38, potential: 2.0, revouma: 40, makikaeshi: 2.0, cushion: 9, pfs_past: 2.0, corner_lane: 4, revouma2: 40 },
};

interface MockCounters { wakujun: number; umadata: number; indices: number; }

function makeDb(counters: MockCounters, opts?: { failFirstWakujun?: { n: number } }) {
  return {
    prepare(sql: string) {
      return {
        all: async (...params: any[]) => {
          if (sql.includes('FROM wakujun')) {
            counters.wakujun++;
            if (opts?.failFirstWakujun && opts.failFirstWakujun.n > 0) {
              opts.failFirstWakujun.n--;
              throw new Error('mock wakujun failure');
            }
            return WAKUJUN.map((h) => ({ ...h }));
          }
          if (sql.includes('FROM umadata')) {
            counters.umadata++;
            // TRIM(horse_name) IN (...) の params = uniqueHorseNames
            const names = new Set(params.map((p) => String(p)));
            const out: any[] = [];
            for (const n of names) for (const r of UMADATA[n] ?? []) out.push({ ...r });
            return out;
          }
          if (sql.includes('FROM indices')) {
            counters.indices++;
            return params.map((id) => INDICES[String(id)]).filter(Boolean);
          }
          return [];
        },
      };
    },
  };
}

async function main() {
  // 1) 基本: horseNumber Map / 欠損 undefined / 値域
  __clearCompetitionScoreCacheForTest();
  {
    const c: MockCounters = { wakujun: 0, umadata: 0, indices: 0 };
    const db = makeDb(c);
    const map = await loadCompetitionScoresForRace(RACE, db);
    check('馬番1が存在', map.has(1));
    check('馬番2が存在', map.has(2));
    check('馬番3が存在', map.has(3));
    const a = map.get(1)!;
    const b = map.get(2)!;
    const cc = map.get(3)!;
    check('ウマA: computed', a.provenance === 'computed' && typeof a.competitionScore === 'number');
    check('ウマC: missing / undefined（0へ丸めない）', cc.provenance === 'missing' && cc.competitionScore === undefined, `got=${JSON.stringify(cc)}`);
    check('スコア値域 0..100', (a.competitionScore ?? -1) >= 0 && (a.competitionScore ?? 999) <= 100);
    check('好走ウマA > 凡走ウマB', (a.competitionScore ?? 0) > (b.competitionScore ?? 0), `A=${a.competitionScore} B=${b.competitionScore}`);
    check('偏差値: データあり2頭で算出', typeof a.scoreDeviation === 'number');
  }

  // 2) computeScoresFromSource が直接 computeKisoScore と一致（正本式の共有）
  __clearCompetitionScoreCacheForTest();
  {
    const c: MockCounters = { wakujun: 0, umadata: 0, indices: 0 };
    const db = makeDb(c);
    const ctx = { date: RACE.date, place: RACE.place, raceNumber: RACE.raceNumber, year: RACE.year };
    const source = await fetchScoreSourceData(db, WAKUJUN, ctx);
    const { perHorse } = computeScoresFromSource(WAKUJUN, source, ctx);

    // 期待値をテスト内で独立に再構築（同じ mapper を使うが computeKisoScore を直接呼ぶ）
    const built = WAKUJUN.map((h) => {
      const name = h.umamei;
      const uniq = source.processedPastRacesByHorse.get(name) || [];
      const past = buildPastRacesWithIndices(uniq, source.indicesMap).map(mapUmadataToRecordRow);
      const entry = mapWakujunToRecordRow(h);
      return { past, entry };
    });
    const allHorseData = built.map((b) => ({ past: b.past, entry: b.entry }));
    built.forEach((b, i) => {
      const r = computeKisoScore({ past: b.past, entry: b.entry }, allHorseData, false);
      const expected = typeof r === 'number' ? r : r.total;
      check(`computeScoresFromSource[${i}] == computeKisoScore`, Math.abs(perHorse[i].score - expected) < 1e-9, `svc=${perHorse[i].score} direct=${expected}`);
    });
  }

  // 3) 重複 horseNumber 検知（最初を採用・warning）
  {
    const c: MockCounters = { wakujun: 0, umadata: 0, indices: 0 };
    const db = makeDb(c);
    const dupHorses = [WAKUJUN[0], { ...WAKUJUN[1], umaban: '1', umamei: 'ウマB' }];
    const ctx = { date: RACE.date, place: RACE.place, raceNumber: RACE.raceNumber, year: RACE.year };
    const source = await fetchScoreSourceData(db, dupHorses, ctx);
    const { scores, perHorse, warnings } = computeScoresFromSource(dupHorses, source, ctx);
    check('重複: perHorse は2件', perHorse.length === 2);
    check('重複: Map は1件（最初を採用）', scores.size === 1 && scores.has(1));
    check('重複: warning あり', warnings.some((w) => w.includes('重複')));
  }

  // 4) raceKey 違いでキャッシュ分離
  __clearCompetitionScoreCacheForTest();
  {
    const c: MockCounters = { wakujun: 0, umadata: 0, indices: 0 };
    const db = makeDb(c);
    await loadCompetitionScoresForRace(RACE, db);
    await loadCompetitionScoresForRace({ ...RACE, raceNumber: '12' }, db);
    check('別raceKey: wakujun取得2回', c.wakujun === 2, `wakujun=${c.wakujun}`);
  }

  // 5) 同時呼び出しが 1 回の取得へ集約（Promise キャッシュ）
  __clearCompetitionScoreCacheForTest();
  {
    const c: MockCounters = { wakujun: 0, umadata: 0, indices: 0 };
    const db = makeDb(c);
    const [m1, m2] = await Promise.all([
      loadCompetitionScoresForRace(RACE, db),
      loadCompetitionScoresForRace(RACE, db),
    ]);
    check('同時2呼び出し: wakujun取得1回', c.wakujun === 1, `wakujun=${c.wakujun}`);
    check('同時2呼び出し: 同一結果', m1.get(1)?.competitionScore === m2.get(1)?.competitionScore);
  }

  // 6) キャッシュ HIT（TTL 内）は再取得しない
  __clearCompetitionScoreCacheForTest();
  {
    const c: MockCounters = { wakujun: 0, umadata: 0, indices: 0 };
    const db = makeDb(c);
    await loadCompetitionScoresForRace(RACE, db);
    await loadCompetitionScoresForRace(RACE, db);
    check('TTL内2回目: wakujun取得1回（HIT）', c.wakujun === 1, `wakujun=${c.wakujun}`);
  }

  // 7) reject 後に再試行できる（reject を永続キャッシュしない）
  __clearCompetitionScoreCacheForTest();
  {
    const c: MockCounters = { wakujun: 0, umadata: 0, indices: 0 };
    const db = makeDb(c, { failFirstWakujun: { n: 1 } });
    const first = await loadCompetitionScoresForRace(RACE, db);
    check('失敗時: 空Map（3Dを止めない）', first.size === 0);
    const second = await loadCompetitionScoresForRace(RACE, db);
    check('失敗後の再試行: スコア取得成功', second.has(1) && typeof second.get(1)?.competitionScore === 'number');
  }

  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} : ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
