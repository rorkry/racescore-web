/**
 * PHASE 0 監査用スクリプト（調査専用・本番経路には一切影響しない）
 * 実行: npx tsx scripts/audit-forecast-logic.ts
 *
 * 目的:
 *  現行の展開予想ロジックが「入力指数の差をどれだけ着順へ反映しているか」を
 *  実際の関数を呼び出して数値で確認する。コード読解だけでは断定できない
 *  正規化・クランプ・欠損fallbackの実挙動を可視化する。
 *
 * 検証項目:
 *  1. analyzeCapabilities の出力が入力指数の差を保持しているか
 *     （capability-analyzer.ts の `score / weight * 100` が飽和を起こすか）
 *  2. 過去走なし馬の leadingIntention が NaN になるか
 *     （createEmptyIndices の `PFS:` typo により indices.pfs が undefined になる経路）
 *  3. capabilities → dynamics ability への圧縮幅
 *  4. PFS の実スケール(0〜10)と、コードが想定する 0〜100 のズレによる寄与の消失
 */
import { analyzeCapabilities } from '../lib/race-simulator/capability-analyzer';
import { calculateLeadingIntention, type HorseIndices } from '../lib/race-simulator/data-fetcher';

function makeIndices(
  label: string,
  o: {
    T2F?: number | null;
    L4F?: number | null;
    potential?: number | null;
    makikaeshi?: number | null;
    pfs?: number | null;
    cushion?: number | null;
    corner1?: number | null;
    pastCorners?: number[];
    raceCount?: number;
  }
): HorseIndices & { __label: string } {
  const pc = o.pastCorners ?? [];
  return {
    __label: label,
    horseNumber: 1,
    horseName: label,
    T2F: o.T2F ?? null,
    L4F: o.L4F ?? null,
    potential: o.potential ?? null,
    makikaeshi: o.makikaeshi ?? null,
    pfs: o.pfs ?? null,
    revouma: null,
    cushion: o.cushion ?? null,
    pastPositions: { corner1: pc, corner2: pc, corner3: pc, corner4: pc },
    lastRace: {
      T2F: o.T2F ?? null,
      corner1: o.corner1 ?? null,
      corner2: null,
      distance: 1600,
      surface: '芝',
    },
    avgData: {
      T2F: o.T2F ?? null,
      L4F: o.L4F ?? null,
      potential: o.potential ?? null,
      makikaeshi: o.makikaeshi ?? null,
      pfs: o.pfs ?? null,
      raceCount: o.raceCount ?? pc.length,
    },
  } as HorseIndices & { __label: string };
}

/** race-3d-integration.ts:426-431 と同じ ability 合成式 */
function abilityFromCapabilities(cap: {
  cruiseSpeed: number;
  acceleration: number;
  startSpeed: number;
  stamina: number;
}): number {
  const v =
    (cap.cruiseSpeed * 0.4 + cap.acceleration * 0.3 + cap.startSpeed * 0.15 + cap.stamina * 0.15) /
    100;
  return Math.max(0, Math.min(1, v));
}

// ============================================================
// 検証1: 能力値が入力差を保持しているか
// ============================================================
console.log('='.repeat(78));
console.log(' 検証1: analyzeCapabilities は入力指数の差を保持するか');
console.log('='.repeat(78));

const cases = [
  // 超一流（全指数トップクラス）
  makeIndices('S級(T2F22.0/pot9.5/L4F50/maki8)', {
    T2F: 22.0, potential: 9.5, L4F: 50, makikaeshi: 8.0, pfs: 9.0, cushion: 9,
    corner1: 1, pastCorners: [1, 2, 1], raceCount: 8,
  }),
  // 平均的
  makeIndices('平均(T2F24.0/pot5.0/L4F46/maki3)', {
    T2F: 24.0, potential: 5.0, L4F: 46, makikaeshi: 3.0, pfs: 5.0, cushion: 9,
    corner1: 6, pastCorners: [7, 8, 6], raceCount: 4,
  }),
  // 最低クラス（全指数ワースト）
  makeIndices('最低(T2F27.0/pot1.0/L4F40/maki0.5)', {
    T2F: 27.0, potential: 1.0, L4F: 40, makikaeshi: 0.5, pfs: 1.0, cushion: 9,
    corner1: 15, pastCorners: [16, 15, 14], raceCount: 1,
  }),
  // 過去走なし（createEmptyIndices 相当）
  makeIndices('過去走なし(全null)', {}),
];

const rows: string[][] = [];
for (const c of cases) {
  const cap = analyzeCapabilities(c);
  const ability = abilityFromCapabilities(cap);
  rows.push([
    c.__label,
    String(cap.startSpeed),
    String(cap.cruiseSpeed),
    String(cap.acceleration),
    String(cap.stamina),
    String(cap.cornerSkill),
    ability.toFixed(4),
  ]);
}

console.log(
  ['入力', 'start', 'cruise', 'accel', 'stamina', 'corner', 'ability'].map((h) => h.padEnd(11)).join('')
);
for (const r of rows) {
  console.log(r.map((v, i) => (i === 0 ? v.padEnd(38) : v.padEnd(11))).join(''));
}

const abilities = rows.map((r) => parseFloat(r[6]));
const spread = Math.max(...abilities) - Math.min(...abilities);
console.log(`\n>> ability レンジ: ${Math.min(...abilities).toFixed(4)} 〜 ${Math.max(...abilities).toFixed(4)}  (幅 ${spread.toFixed(4)})`);
console.log('>> dynamics 速度換算: abilityMod = 0.95 + ability*0.1');
console.log(
  `>> 速度差: ${((Math.max(...abilities) - Math.min(...abilities)) * 0.1 * 100).toFixed(2)}% ` +
    `(乱数振幅 ±0.8% と比較)`
);

// ============================================================
// 検証2: 正規化式の飽和メカニズム（手計算での再現）
// ============================================================
console.log('\n' + '='.repeat(78));
console.log(' 検証2: `score / weight * 100` の飽和（startSpeed で再現）');
console.log('='.repeat(78));
console.log('式: score = Σ(factorScore_i × w_i) ,  weight = Σ w_i');
console.log('    最後に score = score / weight * 100  → clamp(0,100)');
console.log('');
for (const t2f of [22.0, 23.0, 24.0, 25.0, 26.0, 27.0]) {
  // T2F のみ存在するケース（weight=0.6）
  const only = analyzeCapabilities(makeIndices('x', { T2F: t2f }));
  // 全因子あり（weight=1.0）
  const full = analyzeCapabilities(makeIndices('x', { T2F: t2f, pfs: 5.0, corner1: 6 }));
  console.log(
    `T2F=${t2f.toFixed(1)}  → startSpeed(T2Fのみ)=${String(only.startSpeed).padStart(3)}  ` +
      `startSpeed(全因子)=${String(full.startSpeed).padStart(3)}`
  );
}

// ============================================================
// 検証3: 過去走なし馬の leadingIntention（NaN 発生確認）
// ============================================================
console.log('\n' + '='.repeat(78));
console.log(' 検証3: leadingIntention の欠損時挙動');
console.log('='.repeat(78));

// createEmptyIndices は `PFS: null`（大文字）を返すため pfs は undefined になる。
// それを忠実に再現する。
const emptyLikeCreateEmpty: any = {
  horseNumber: 9, horseName: '過去走なし',
  T2F: null, L4F: null, potential: null, makikaeshi: null,
  PFS: null, // ← createEmptyIndices の実際のキー（typo）。pfs は存在しない
  revouma: null, cushion: null,
  pastPositions: { corner1: [], corner2: [], corner3: [], corner4: [] },
  lastRace: { T2F: null, corner1: null, corner2: null, distance: null, surface: null },
  avgData: { T2F: null, L4F: null, potential: null, makikaeshi: null, pfs: null, raceCount: 0 },
};
const liEmpty = calculateLeadingIntention(emptyLikeCreateEmpty);
console.log(`createEmptyIndices 相当（pfs キーなし）: leadingIntention = ${liEmpty}  (NaN? ${Number.isNaN(liEmpty)})`);

const liNullPfs = calculateLeadingIntention(makeIndices('pfs=null', { pastCorners: [] }));
console.log(`pfs=null を明示                        : leadingIntention = ${liNullPfs}`);

const liFront = calculateLeadingIntention(makeIndices('先行実績', { pfs: 8.0, pastCorners: [1, 2, 2] }));
const liBack = calculateLeadingIntention(makeIndices('後方実績', { pfs: 2.0, pastCorners: [14, 15, 13] }));
console.log(`PFS8.0 + 1C前(1,2,2)                   : leadingIntention = ${liFront.toFixed(2)}`);
console.log(`PFS2.0 + 1C後(14,15,13)                : leadingIntention = ${liBack.toFixed(2)}`);

// ============================================================
// 検証4: PFS スケール想定ズレの寄与
// ============================================================
console.log('\n' + '='.repeat(78));
console.log(' 検証4: PFS の想定スケール(0-100)と実データ(0-10)のズレ');
console.log('='.repeat(78));
console.log('capability-analyzer.ts:74 「PFSは既に0-100スケールと仮定」');
console.log('start-phase.ts:91-94 の閾値: pfs>=80 → +8, pfs>=60 → +4');
console.log('');
for (const pfs of [1, 3, 5, 8, 10, 60, 80]) {
  const li = calculateLeadingIntention(makeIndices('x', { pfs, pastCorners: [] }));
  const startBonus = pfs >= 80 ? 8 : pfs >= 60 ? 4 : 0;
  console.log(
    `pfs=${String(pfs).padStart(3)}  → leadingIntention=${li.toFixed(1).padStart(6)}  ` +
      `start-phase加点=+${startBonus}  (実データは概ね 0〜10 の範囲)`
  );
}

// ============================================================
// 検証5: 「指数欠損馬が優秀馬より前になる」経路の再現
// ============================================================
console.log('\n' + '='.repeat(78));
console.log(' 検証5: 指数欠損馬が優秀馬より前の隊列を取る経路（最重要）');
console.log('='.repeat(78));
console.log('leadingIntention: pfs!==null → score=pfs / その後 corner1があれば score=score*0.7+frontRatio*30');
console.log('  → pfs欠損馬は default 50 が 0.7 倍されて 35 から始まる。');
console.log('  → pfs実データ(0〜10)を持つ馬は 0〜7 から始まる。');
console.log('');

const startSpeedSaturated = 100; // 検証1でデータあり馬は全員100と確認済み
function startDashScore(li: number, pattern: string, pfs: number | null): number {
  // start-phase.ts:80-95 と同じ式
  let s = startSpeedSaturated * 0.7 + li * 0.3;
  if (/^[123]-/.test(pattern)) s += 10;
  if (pfs != null && pfs >= 80) s += 8;
  else if (pfs != null && pfs >= 60) s += 4;
  return s;
}

const scenarios = [
  { label: 'A: PFS優秀8.0 + 1C前(1,2,2)', pfs: 8.0 as number | null, corners: [1, 2, 2] },
  { label: 'B: PFS欠損(null) + 1C前(1,2,2)', pfs: null as number | null, corners: [1, 2, 2] },
  { label: 'C: PFS欠損(null) + 1C中団(6,7,6)', pfs: null as number | null, corners: [6, 7, 6] },
  { label: 'D: PFS欠損(null) + 1C後方(14,15,13)', pfs: null as number | null, corners: [14, 15, 13] },
  { label: 'E: PFS優秀8.0 + 1C後方(14,15,13)', pfs: 8.0 as number | null, corners: [14, 15, 13] },
];

console.log(['シナリオ', 'leadingInt', 'startDash'].map((h) => h.padEnd(34)).join(''));
const dashResults: { label: string; li: number; dash: number }[] = [];
for (const s of scenarios) {
  const idx = makeIndices(s.label, { pfs: s.pfs, pastCorners: s.corners, corner1: s.corners[0], T2F: 24.0 });
  const li = calculateLeadingIntention(idx);
  const pattern = s.corners.join('-');
  const dash = startDashScore(li, pattern, s.pfs);
  dashResults.push({ label: s.label, li, dash });
  console.log(s.label.padEnd(34) + li.toFixed(2).padEnd(34) + dash.toFixed(2));
}

const sorted = [...dashResults].sort((a, b) => b.dash - a.dash);
console.log('\n>> startDashScore 降順（= start-phase の隊列優先順）:');
sorted.forEach((r, i) => console.log(`   ${i + 1}. ${r.label}  (dash=${r.dash.toFixed(2)})`));

const a = dashResults.find((r) => r.label.startsWith('A'))!;
const b = dashResults.find((r) => r.label.startsWith('B'))!;
console.log(
  `\n>> 結論: 同じ先行実績でも PFS欠損馬(B) の dash=${b.dash.toFixed(2)} が ` +
    `PFS優秀馬(A) の dash=${a.dash.toFixed(2)} を ${(b.dash - a.dash).toFixed(2)} 上回る。`
);
console.log('   欠損が「不利」ではなく「有利」に働く（default 50 > 実データ由来の 0〜10 換算値）。');

console.log('\n' + '='.repeat(78));
console.log(' 監査スクリプト終了（本番経路は一切変更していません）');
console.log('='.repeat(78));
