/**
 * L4F の意味・方向確定のためのDB調査（読み取り専用）
 *
 * 実行: npx tsx --env-file=.env.local scripts/investigate-l4f.ts
 *
 * 背景:
 *   lib/race-simulator/capability-analyzer.ts:194-215 は L4F を「大きいほど良い」として
 *   acceleration に 60% で反映している（L4F>=50 → 95点, L4F=42 → 30点）。
 *   一方 lib/ai-chat/system-prompt.ts:27 は「L4Fも小さいほど速い」と記述しており矛盾する。
 *   値域が 40〜50 であることから「後半4Fのラップ秒」の可能性があるが、
 *   列名と値域だけで断定してはいけないため実データで確定させる。
 *
 * 決定的な検定:
 *   last_3f（上がり3F・秒）は L4F と区間が重なる（後半3F ⊂ 後半4F）。
 *   - L4F が「秒」なら corr(L4F, last_3f) は強い正の相関になる
 *   - L4F が「大きいほど良い指数」なら corr(L4F, last_3f) は負の相関になる
 *
 * 本スクリプトは SELECT のみ。DBへの書き込み・schema変更は行わない。
 */
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

// ============================================================
// 統計ヘルパー
// ============================================================
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/** 同順位は平均ランク（tie対応） */
function rankTransform(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function spearman(xs: number[], ys: number[]): number {
  return pearson(rankTransform(xs), rankTransform(ys));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function describe(label: string, xs: number[]): string {
  const s = [...xs].sort((a, b) => a - b);
  return (
    `${label.padEnd(14)} n=${String(xs.length).padStart(6)}  ` +
    `min=${s[0].toFixed(2).padStart(7)}  p25=${quantile(s, 0.25).toFixed(2).padStart(7)}  ` +
    `median=${quantile(s, 0.5).toFixed(2).padStart(7)}  p75=${quantile(s, 0.75).toFixed(2).padStart(7)}  ` +
    `max=${s[s.length - 1].toFixed(2).padStart(7)}  mean=${mean(xs).toFixed(2).padStart(7)}`
  );
}

/** 「34.5」「1:34.5」「34.5秒」等をパース。数値化できなければ null */
function parseNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === '') return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function surfaceOf(distance: unknown): '芝' | 'ダ' | '他' {
  const s = String(distance ?? '');
  if (s.includes('芝')) return '芝';
  if (s.includes('ダ')) return 'ダ';
  return '他';
}

// ============================================================
type Row = {
  l4f: number;
  t2f: number | null;
  pfs: number | null;
  last3f: number;
  finishPos: number;
  fieldSize: number | null;
  surface: '芝' | 'ダ' | '他';
  raceId: string;
  distanceRaw: string;
};

async function main() {
  console.log('='.repeat(80));
  console.log(' L4F 意味・方向調査（読み取り専用）');
  console.log('='.repeat(80));

  // ---------- 1. カラム型 ----------
  console.log('\n[1] カラム定義');
  const cols = await pool.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_name IN ('indices','umadata')
       AND column_name IN ('L4F','T2F','pfs_past','potential','makikaeshi',
                           'last_3f','finish_position','field_size','distance',
                           'finish_time','umaban','race_id','pci','margin','track_condition')
     ORDER BY table_name, column_name`
  );
  for (const c of cols.rows) {
    console.log(`  ${String(c.table_name).padEnd(9)} ${String(c.column_name).padEnd(17)} ${c.data_type}`);
  }

  // ---------- 2. 件数 ----------
  console.log('\n[2] 件数');
  const counts = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM indices) AS indices_rows,
       (SELECT COUNT(*) FROM indices WHERE "L4F" IS NOT NULL) AS indices_l4f,
       (SELECT COUNT(*) FROM umadata) AS umadata_rows,
       (SELECT COUNT(DISTINCT race_id) FROM umadata) AS umadata_races,
       (SELECT COUNT(*) FROM umadata WHERE last_3f IS NOT NULL AND last_3f <> '') AS umadata_last3f`
  );
  const c0 = counts.rows[0];
  console.log(`  indices 全行            : ${c0.indices_rows}`);
  console.log(`  indices L4F非NULL       : ${c0.indices_l4f}`);
  console.log(`  umadata 全行            : ${c0.umadata_rows}`);
  console.log(`  umadata ユニークレース   : ${c0.umadata_races}`);
  console.log(`  umadata last_3f あり     : ${c0.umadata_last3f}`);

  // ---------- 3. 指数の分布 ----------
  console.log('\n[3] indices の値域（生値）');
  const dist = await pool.query(
    `SELECT "L4F" AS l4f, "T2F" AS t2f, pfs_past, potential, makikaeshi
     FROM indices
     WHERE "L4F" IS NOT NULL
     LIMIT 60000`
  );
  const l4fAll = dist.rows.map((r) => parseNum(r.l4f)).filter((v): v is number => v != null);
  const t2fAll = dist.rows.map((r) => parseNum(r.t2f)).filter((v): v is number => v != null);
  const pfsAll = dist.rows.map((r) => parseNum(r.pfs_past)).filter((v): v is number => v != null);
  const potAll = dist.rows.map((r) => parseNum(r.potential)).filter((v): v is number => v != null);
  const makAll = dist.rows.map((r) => parseNum(r.makikaeshi)).filter((v): v is number => v != null);
  if (l4fAll.length) console.log('  ' + describe('L4F', l4fAll));
  if (t2fAll.length) console.log('  ' + describe('T2F', t2fAll));
  if (pfsAll.length) console.log('  ' + describe('pfs_past', pfsAll));
  if (potAll.length) console.log('  ' + describe('potential', potAll));
  if (makAll.length) console.log('  ' + describe('makikaeshi', makAll));

  // ---------- 4. 結合 ----------
  console.log('\n[4] indices × umadata 結合（race_id = umadata.race_id || LPAD(umaban,2,"0")）');
  const joined = await pool.query(
    `SELECT i."L4F" AS l4f, i."T2F" AS t2f, i.pfs_past,
            u.last_3f, u.finish_position, u.field_size, u.distance, u.race_id
     FROM indices i
     JOIN umadata u ON i.race_id = u.race_id || LPAD(u.umaban::text, 2, '0')
     WHERE i."L4F" IS NOT NULL
       AND u.last_3f IS NOT NULL AND u.last_3f <> ''
       AND u.finish_position IS NOT NULL AND u.finish_position <> ''
     LIMIT 60000`
  );
  console.log(`  結合行数: ${joined.rowCount}`);

  const rows: Row[] = [];
  for (const r of joined.rows) {
    const l4f = parseNum(r.l4f);
    const last3f = parseNum(r.last_3f);
    const finishPos = parseNum(r.finish_position);
    if (l4f == null || last3f == null || finishPos == null) continue;
    // 上がり3Fの妥当範囲（秒）以外は除外（誤パース・異常値対策）
    if (last3f < 30 || last3f > 50) continue;
    if (finishPos < 1 || finishPos > 20) continue;
    rows.push({
      l4f,
      t2f: parseNum(r.t2f),
      pfs: parseNum(r.pfs_past),
      last3f,
      finishPos,
      fieldSize: parseNum(r.field_size),
      surface: surfaceOf(r.distance),
      raceId: String(r.race_id),
      distanceRaw: String(r.distance ?? ''),
    });
  }
  console.log(`  有効サンプル: ${rows.length} 頭`);

  if (rows.length < 100) {
    console.log('\n  !! サンプルが100頭未満。方向を確定できません。');
    console.log('  → v2 では L4F を無効（contribution=0 / reliability=0）とし、last_3f を主後半指標にすること。');
    await pool.end();
    return;
  }

  // ---------- 5. 相関 ----------
  console.log('\n[5] 相関（決定的検定）');
  const l4f = rows.map((r) => r.l4f);
  const last3f = rows.map((r) => r.last3f);
  const finishPos = rows.map((r) => r.finishPos);

  console.log(`  corr(L4F, last_3f)      Pearson=${pearson(l4f, last3f).toFixed(4)}  Spearman=${spearman(l4f, last3f).toFixed(4)}`);
  console.log(`  corr(L4F, finishPos)    Pearson=${pearson(l4f, finishPos).toFixed(4)}  Spearman=${spearman(l4f, finishPos).toFixed(4)}`);
  console.log(`  corr(last_3f, finishPos) Pearson=${pearson(last3f, finishPos).toFixed(4)}  Spearman=${spearman(last3f, finishPos).toFixed(4)}  ← 参照(上がりは小さいほど速い)`);

  const withT2f = rows.filter((r) => r.t2f != null);
  if (withT2f.length > 50) {
    const a = withT2f.map((r) => r.t2f!);
    console.log(
      `  corr(T2F, last_3f)      Pearson=${pearson(a, withT2f.map((r) => r.last3f)).toFixed(4)}  ` +
        `corr(T2F, finishPos) Pearson=${pearson(a, withT2f.map((r) => r.finishPos)).toFixed(4)}  ← 参照(T2Fは小さいほど速い)`
    );
  }

  console.log('\n  判定基準:');
  console.log('   corr(L4F, last_3f) が強い正 (>= +0.5)  → L4F は「秒」。小さいほど速い');
  console.log('   corr(L4F, last_3f) が負    (<= -0.3)  → L4F は「指数」。大きいほど良い');
  console.log('   いずれでもない                        → 確定不能。L4F を無効化する');

  // ---------- 6. 上位/下位群 ----------
  console.log('\n[6] L4F 四分位群の比較');
  const sortedL4f = [...l4f].sort((a, b) => a - b);
  const q25 = quantile(sortedL4f, 0.25);
  const q75 = quantile(sortedL4f, 0.75);
  const low = rows.filter((r) => r.l4f <= q25);
  const high = rows.filter((r) => r.l4f >= q75);
  console.log(`  L4F 小さい群 (<=${q25.toFixed(2)})  n=${low.length}  平均last_3f=${mean(low.map((r) => r.last3f)).toFixed(3)}  平均着順=${mean(low.map((r) => r.finishPos)).toFixed(3)}`);
  console.log(`  L4F 大きい群 (>=${q75.toFixed(2)})  n=${high.length}  平均last_3f=${mean(high.map((r) => r.last3f)).toFixed(3)}  平均着順=${mean(high.map((r) => r.finishPos)).toFixed(3)}`);

  // ---------- 7. 芝/ダート別 ----------
  console.log('\n[7] 芝/ダート別（意味が同じか）');
  for (const s of ['芝', 'ダ'] as const) {
    const g = rows.filter((r) => r.surface === s);
    if (g.length < 50) {
      console.log(`  ${s}: n=${g.length}（サンプル不足）`);
      continue;
    }
    console.log(
      `  ${s}: n=${String(g.length).padStart(5)}  ` +
        `corr(L4F,last_3f)=${pearson(g.map((r) => r.l4f), g.map((r) => r.last3f)).toFixed(4)}  ` +
        `corr(L4F,着順)=${pearson(g.map((r) => r.l4f), g.map((r) => r.finishPos)).toFixed(4)}  ` +
        `L4F中央=${quantile([...g.map((r) => r.l4f)].sort((a, b) => a - b), 0.5).toFixed(2)}  ` +
        `last_3f中央=${quantile([...g.map((r) => r.last3f)].sort((a, b) => a - b), 0.5).toFixed(2)}`
    );
  }

  // ---------- 8. レース内percentileとの関係 ----------
  console.log('\n[8] レース内 percentile での関係（頭数差を除去）');
  const byRace = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byRace.has(r.raceId)) byRace.set(r.raceId, []);
    byRace.get(r.raceId)!.push(r);
  }
  const usable = [...byRace.values()].filter((g) => g.length >= 5);
  console.log(`  5頭以上そろったレース: ${usable.length}`);
  if (usable.length >= 5) {
    // 各レース内で L4F を昇順percentile化し、着順percentileとの相関を見る
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    for (const g of usable) {
      const lr = rankTransform(g.map((r) => r.l4f));
      const fr = rankTransform(g.map((r) => r.finishPos));
      const l3 = rankTransform(g.map((r) => r.last3f));
      const n = g.length;
      for (let i = 0; i < n; i++) {
        xs.push((lr[i] - 1) / (n - 1));
        ys.push((fr[i] - 1) / (n - 1));
        zs.push((l3[i] - 1) / (n - 1));
      }
    }
    console.log(`  corr(L4F順位%, 着順%)     = ${pearson(xs, ys).toFixed(4)}   (正なら L4F小=好着順)`);
    console.log(`  corr(L4F順位%, last_3f順位%) = ${pearson(xs, zs).toFixed(4)}   (正なら L4F小=上がり速い)`);
  }

  // ---------- 9. 結論 ----------
  console.log('\n' + '='.repeat(80));
  const rSecond = pearson(l4f, last3f);
  let verdict: string;
  if (rSecond >= 0.5) {
    verdict = 'L4F は「秒」。小さいほど速い（= 現行 capability-analyzer は方向が反転している）';
  } else if (rSecond <= -0.3) {
    verdict = 'L4F は「指数」。大きいほど良い（= 現行 capability-analyzer の方向は正しい）';
  } else {
    verdict = `確定不能（corr=${rSecond.toFixed(4)}）。v2 では L4F を無効化し last_3f を主後半指標とする`;
  }
  console.log(` 判定: ${verdict}`);
  console.log('='.repeat(80));

  await pool.end();
}

main().catch(async (e) => {
  console.error('調査失敗:', e?.message ?? e);
  try {
    await pool.end();
  } catch {
    /* noop */
  }
  process.exit(1);
});
