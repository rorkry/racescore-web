/**
 * align-finish-and-gates テスト
 * 実行: npx tsx lib/race-simulator/align-finish-and-gates.test.ts
 *
 * 検証対象（正式仕様）:
 *  A. 発馬ゲート配置（Phase A）: 馬番の内→外 / gateIndex=horseNumber-1 / 中央揃え /
 *     配列シャッフル不変 / 0秒は馬番順・level / 1〜5秒で滑らかに展開へ移行 / 横ワープなし /
 *     右回り・左回りで内外維持
 *  B. 入線順（finalStandings.position=正本）: 予想着順どおりに全頭が通過 /
 *     8/14/18頭一致 / horse配列shuffle後も一致 / dynamics.finishOrder一致 /
 *     予想着順を逆に使うと失敗 / finishGap符号を逆にすると失敗 / NaNなし / 同一座標で完全重複しない
 */

import {
  buildStartGateLayout,
  buildPredictedFinishTargets,
  convergeFrameToPredictedFinish,
  computeGoalBlendWeights,
  type PredictedFinishTarget,
} from './forecast-layout-to-3d';
import {
  resolveRacecourseLayout,
  runRaceDynamicsForRace,
  buildForecastLayoutsFromSimulation,
  interpolateDynamicsForDisplay,
  type CourseInfoLike,
  type SimulationLike,
} from './race-3d-integration';
import { sampleRaceProgressPose } from '../racecourse-geometry';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  ✗ ${label} ${detail}`); }
}

// 馬番→予想着順 の任意置換で sim を作る。capabilities は馬番でばらつかせ、
// dynamics の自然順が予想着順と一致しないようにする。
function makeSim(
  raceKey: string,
  raceDistance: number,
  n: number,
  positionOf: (hn: number) => number,
): SimulationLike {
  const horses = Array.from({ length: n }, (_, i) => {
    const hn = i + 1;
    return {
      horseNumber: hn,
      horseName: `馬${hn}`,
      position: positionOf(hn),
      waku: Math.min(8, Math.floor(i / 2) + 1),
      leadingIntention: 80 - i * 5,
      staminaRemaining: 100,
      capabilities: {
        startSpeed: 40 + ((hn * 13) % 50),
        cruiseSpeed: 45 + ((hn * 7) % 45),
        acceleration: 40 + ((hn * 11) % 55),
        stamina: 40 + ((hn * 5) % 50),
        cornerSkill: 50,
      },
    };
  });
  return { raceKey, raceDistance, phases: { start: { horses } }, finalStandings: horses };
}

function shuffleDeterministic<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (i * 7 + 3) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const finite = (v: number) => Number.isFinite(v);

// ============================================================
// A. 発馬ゲート配置
// ============================================================
console.log('=== A. 発馬ゲート配置 ===');

for (const n of [8, 14, 18]) {
  const nums = Array.from({ length: n }, (_, i) => i + 1);
  const gate = buildStartGateLayout(nums, { raceDistance: 1600, trackWidth: 25 });
  const byHn = new Map(gate.map((g) => [g.horseNumber, g]));

  // 馬番1が最内（最も負）, 最大馬番が最外（最も正）
  const lat1 = byHn.get(1)!.lateralPosition;
  const latN = byHn.get(n)!.lateralPosition;
  check(`${n}頭: 馬番1が最内(負) / 最大馬番が最外(正)`, lat1 < 0 && latN > 0 && lat1 < latN, `lat1=${lat1.toFixed(2)} latN=${latN.toFixed(2)}`);

  // lateral が馬番に対して単調増加（内→外）
  let mono = true;
  for (let hn = 1; hn < n; hn++) {
    if (!(byHn.get(hn)!.lateralPosition < byHn.get(hn + 1)!.lateralPosition)) mono = false;
  }
  check(`${n}頭: lateral が馬番で単調増加`, mono);

  // 全頭前後差なし（level）
  const allLevel = gate.every((g) => g.currentDistance === gate[0].currentDistance);
  check(`${n}頭: 発馬は全頭 level（前後差なし）`, allLevel);

  // 同一 waku でも別横位置（馬番ベースなので必ず別）
  const lats = gate.map((g) => g.lateralPosition);
  check(`${n}頭: 全頭が別横位置`, new Set(lats.map((l) => l.toFixed(4))).size === n);

  // 配列 shuffle 不変
  const gateShuf = buildStartGateLayout(shuffleDeterministic(nums), { raceDistance: 1600, trackWidth: 25 });
  const byHnShuf = new Map(gateShuf.map((g) => [g.horseNumber, g]));
  let shufSame = true;
  for (const hn of nums) {
    if (Math.abs(byHn.get(hn)!.lateralPosition - byHnShuf.get(hn)!.lateralPosition) > 1e-9) shufSame = false;
  }
  check(`${n}頭: 配列shuffleでも配置不変`, shufSame);
}

// 13番が5番付近ではなく外寄り（n>=13）
{
  const gate = buildStartGateLayout(Array.from({ length: 16 }, (_, i) => i + 1), { raceDistance: 1600, trackWidth: 25 });
  const byHn = new Map(gate.map((g) => [g.horseNumber, g]));
  check('16頭: 13番は5番より外(正方向)', byHn.get(13)!.lateralPosition > byHn.get(5)!.lateralPosition);
}

// 0秒は馬番順・level / 1〜5秒で滑らかに展開へ / 横ワープなし（実 dynamics 経路）
{
  const ci: CourseInfoLike = { place: '中山', trackType: 'turf', distance: 1600, clockwise: true };
  const layout = resolveRacecourseLayout(ci)!;
  const n = 14;
  const sim = makeSim('START14', 1600, n, (hn) => n - hn + 1);
  const dyn = runRaceDynamicsForRace(sim, layout, ci)!;
  const layouts = buildForecastLayoutsFromSimulation(sim, 1600, layout.geometry.trackWidth)!;

  const f0 = interpolateDynamicsForDisplay(dyn, 0, layouts);
  const byHn0 = new Map(f0.map((h) => [h.horseNumber, h]));
  // 0秒: level（進捗ほぼ同一）
  const prog0 = f0.map((h) => h.raceProgress);
  check('0秒: 全頭 level（進捗差<0.1m）', Math.max(...prog0) - Math.min(...prog0) < 0.1, `spread=${(Math.max(...prog0) - Math.min(...prog0)).toFixed(3)}`);
  // 0秒: lateral が馬番順（内→外）
  let latMono0 = true;
  for (let hn = 1; hn < n; hn++) {
    if (!(byHn0.get(hn)!.lateralPosition < byHn0.get(hn + 1)!.lateralPosition + 1e-9)) latMono0 = false;
  }
  check('0秒: lateral が馬番順（内→外）', latMono0);

  // 連続性: 0〜5秒を 0.25s 刻みで、横位置に不連続ジャンプなし
  let maxJump = 0;
  let prev = new Map(f0.map((h) => [h.horseNumber, h.lateralPosition]));
  let progressMonotonic = true;
  let prevProg = new Map(f0.map((h) => [h.horseNumber, h.raceProgress]));
  for (let t = 0.25; t <= 6.0 + 1e-9; t += 0.25) {
    const fr = interpolateDynamicsForDisplay(dyn, t, layouts);
    for (const h of fr) {
      const p = prev.get(h.horseNumber)!;
      maxJump = Math.max(maxJump, Math.abs(h.lateralPosition - p));
      const pp = prevProg.get(h.horseNumber)!;
      if (h.raceProgress < pp - 0.5) progressMonotonic = false;
    }
    prev = new Map(fr.map((h) => [h.horseNumber, h.lateralPosition]));
    prevProg = new Map(fr.map((h) => [h.horseNumber, h.raceProgress]));
  }
  check('0〜6秒: 横位置に不連続ジャンプなし(<2.5m/step)', maxJump < 2.5, `maxJump=${maxJump.toFixed(3)}`);
  check('0〜6秒: 進捗は概ね単調（後退なし）', progressMonotonic);

  // NaN なし
  let anyNaN = false;
  for (let t = 0; t <= dyn.totalTime; t += dyn.totalTime / 40) {
    const fr = interpolateDynamicsForDisplay(dyn, t, layouts);
    for (const h of fr) if (!finite(h.raceProgress) || !finite(h.lateralPosition)) anyNaN = true;
  }
  check('全区間: NaN なし', !anyNaN);
}

// 右回り/左回りで world 上でも内外維持
console.log('=== A2. 右回り/左回りの内外（world座標） ===');
for (const ci of [
  { place: '中山', trackType: 'turf', distance: 1600, clockwise: true } as CourseInfoLike,
  { place: '東京', trackType: 'turf', distance: 1600, clockwise: false } as CourseInfoLike,
]) {
  const layout = resolveRacecourseLayout(ci)!;
  const n = 12;
  const gate = buildStartGateLayout(Array.from({ length: n }, (_, i) => i + 1), {
    raceDistance: 1600,
    trackWidth: layout.geometry.trackWidth,
  });
  const start = layout.startMarker.pathDistance;
  // 進行方向少し先の中心線 pose の normal に射影
  const ref = sampleRaceProgressPose(layout.geometry, start, 5, 0);
  const nrm = { x: ref.normal.x, z: ref.normal.z };
  const proj = (lateral: number) => {
    const p = sampleRaceProgressPose(layout.geometry, start, 5, lateral);
    return (p.position.x - ref.position.x) * nrm.x + (p.position.z - ref.position.z) * nrm.z;
  };
  const byHn = new Map(gate.map((g) => [g.horseNumber, g]));
  // world 上の normal 射影が馬番で単調増加（内→外）
  let mono = true;
  for (let hn = 1; hn < n; hn++) {
    if (!(proj(byHn.get(hn)!.lateralPosition) < proj(byHn.get(hn + 1)!.lateralPosition) + 1e-6)) mono = false;
  }
  check(`${ci.place}(${ci.clockwise ? '右' : '左'}回り): world上でも馬番内→外`, mono);
}

// ============================================================
// B. 入線順（finalStandings.position = 正本）
// ============================================================
console.log('=== B. 入線順（finalStandings.position） ===');

// 入線収束が有効なフレーム（先頭が rd に到達＝converge=1）で、
// 予想着順どおりに表示進捗が「非増加」になっている（＝逆転がない）ことを検証する。
// 同時に、値が rd に達する順序（＝通過順）が予想着順どおりになる。
function checkFinishInvariant(
  label: string,
  sim: SimulationLike,
  layout: ReturnType<typeof resolveRacecourseLayout>,
  ci: CourseInfoLike,
  rd: number,
): void {
  const dyn = runRaceDynamicsForRace(sim, layout!, ci)!;
  const layouts = buildForecastLayoutsFromSimulation(sim, rd, layout!.geometry.trackWidth)!;
  const predictedRank = new Map(layouts.finishTargets.map((t) => [t.horseNumber, t.predictedRank]));
  const predictedOrder = [...layouts.finishTargets].sort((a, b) => a.predictedRank - b.predictedRank).map((t) => t.horseNumber);

  // converge=1 のフレーム群（先頭がゴール到達後）を集める
  let noInversion = true;
  let checkedFrames = 0;
  let firstAtRd: number | null = null;
  const steps = 400;
  for (let i = 0; i <= steps; i++) {
    const t = (dyn.totalTime * i) / steps;
    const raw = interpolateDynamicsForDisplay(dyn, t, null); // dynamics 生値で先頭進捗を判定
    const leaderMeters = Math.max(...raw.map((h) => h.raceProgress));
    if (leaderMeters < rd - 0.01) continue; // converge=1 でない
    const fr = interpolateDynamicsForDisplay(dyn, t, layouts);
    checkedFrames++;
    // 予想着順で並べたとき、表示進捗が非増加であること（逆転なし）
    const byRank = [...fr].sort((a, b) => predictedRank.get(a.horseNumber)! - predictedRank.get(b.horseNumber)!);
    for (let k = 1; k < byRank.length; k++) {
      if (byRank[k].raceProgress > byRank[k - 1].raceProgress + 1e-6) noInversion = false;
    }
    // 先頭がちょうど rd に到達した最初のフレーム: 予想1位が唯一 rd 到達
    if (firstAtRd == null) {
      firstAtRd = t;
      const top = byRank[0];
      check(`${label}: 予想1位(馬${predictedOrder[0]})が先頭到達`, top.horseNumber === predictedOrder[0] && top.raceProgress >= rd - 0.5);
    }
  }
  check(`${label}: 入線収束フレームで逆転なし(${checkedFrames}frames)`, noInversion && checkedFrames > 0);

  // dynamics.finishOrder が予想着順と一致
  const finOrder = dyn.finishOrder.map((f) => f.horseNumber);
  check(`${label}: dynamics.finishOrder = 予想着順`, JSON.stringify(finOrder) === JSON.stringify(predictedOrder), `got=${finOrder.join(',')} want=${predictedOrder.join(',')}`);
  // finishTime 昇順
  let timeAsc = true;
  for (let i = 1; i < dyn.finishOrder.length; i++) if (dyn.finishOrder[i].finishTime < dyn.finishOrder[i - 1].finishTime - 1e-9) timeAsc = false;
  check(`${label}: finishOrder の finishTime が昇順`, timeAsc);

  // 同一座標で完全重複しない（入線中フレーム: まだ全馬完走していない区間で
  // 進捗・横位置が完全一致する2頭がいないこと）。順序統計量 remap により進捗は各馬別値になる。
  let stacked = false;
  for (let i = Math.floor(steps * 0.7); i <= steps; i++) {
    const t = (dyn.totalTime * i) / steps;
    const raw = interpolateDynamicsForDisplay(dyn, t, null);
    const stillRunning = Math.min(...raw.map((h) => h.raceProgress)) < rd - 1; // 全馬完走前のみ
    if (!stillRunning) continue;
    const fr = interpolateDynamicsForDisplay(dyn, t, layouts);
    for (let a = 0; a < fr.length; a++) for (let b = a + 1; b < fr.length; b++) {
      if (Math.abs(fr[a].raceProgress - fr[b].raceProgress) < 1e-3 && Math.abs(fr[a].lateralPosition - fr[b].lateralPosition) < 1e-3) stacked = true;
    }
  }
  check(`${label}: 入線中フレームで同一座標の完全重複なし`, !stacked);
}

for (const n of [8, 14, 18]) {
  const ci: CourseInfoLike = { place: '阪神', trackType: 'turf', distance: 1600, clockwise: true };
  const layout = resolveRacecourseLayout(ci)!;
  const sim = makeSim(`FIN${n}`, 1600, n, (hn) => n - hn + 1); // 予想着順=馬番の反転
  checkFinishInvariant(`${n}頭`, sim, layout, ci, 1600);
}

// horse 配列 shuffle 後も同じ入線順（dynamics.finishOrder / finishTargets）
{
  const n = 14;
  const ci: CourseInfoLike = { place: '阪神', trackType: 'turf', distance: 1600, clockwise: true };
  const layout = resolveRacecourseLayout(ci)!;
  const sim = makeSim('SHUF14', 1600, n, (hn) => n - hn + 1);
  const shuffled: SimulationLike = {
    ...sim,
    phases: { start: { horses: shuffleDeterministic(sim.phases!.start!.horses!) } },
    finalStandings: shuffleDeterministic(sim.finalStandings!),
  };
  const predictedOrder = [...(sim.finalStandings ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((h) => h.horseNumber);
  const dynA = runRaceDynamicsForRace(sim, layout, ci)!;
  const dynB = runRaceDynamicsForRace(shuffled, layout, ci)!;
  const orderA = dynA.finishOrder.map((f) => f.horseNumber);
  const orderB = dynB.finishOrder.map((f) => f.horseNumber);
  check('shuffle前後で入線順が同一', JSON.stringify(orderA) === JSON.stringify(orderB), `A=${orderA.join(',')} B=${orderB.join(',')}`);
  check('shuffle: 予想着順と一致', JSON.stringify(orderA) === JSON.stringify(predictedOrder));

  const layoutsB = buildForecastLayoutsFromSimulation(shuffled, 1600, layout.geometry.trackWidth)!;
  const finTargetsOrder = [...layoutsB.finishTargets].sort((a, b) => a.predictedRank - b.predictedRank).map((t) => t.horseNumber);
  check('shuffle: finishTargets も予想着順', JSON.stringify(finTargetsOrder) === JSON.stringify(predictedOrder));
}

// ============================================================
// C. 逆順防止（順序統計量 remap / 着差符号）
// ============================================================
console.log('=== C. 逆順防止 ===');

// convergeFrameToPredictedFinish: 予想着順1位が最前になる（正しい向き）
{
  const frame = [
    { horseNumber: 1, raceProgress: 100, lateralPosition: 0 },
    { horseNumber: 2, raceProgress: 90, lateralPosition: 0 },
    { horseNumber: 3, raceProgress: 80, lateralPosition: 0 },
  ];
  const targets: PredictedFinishTarget[] = [
    { horseId: '3', horseNumber: 3, predictedRank: 1, finishGapMeters: 0 },
    { horseId: '2', horseNumber: 2, predictedRank: 2, finishGapMeters: 0.5 },
    { horseId: '1', horseNumber: 1, predictedRank: 3, finishGapMeters: 1.0 },
  ];
  const rd = 100;
  const out = convergeFrameToPredictedFinish(frame, targets, 1, rd);
  const byHn = new Map(out.map((h) => [h.horseNumber, h.raceProgress]));
  const winner = [...out].sort((a, b) => b.raceProgress - a.raceProgress)[0].horseNumber;
  // predictedRank1 = 馬3 が最前
  check('remap: 予想1位(馬3)が最前', winner === 3 && byHn.get(3)! > byHn.get(2)! && byHn.get(2)! > byHn.get(1)!);

  // 予想着順を逆に使う実装（rank を反転）だと最前が変わる → 検知できる
  const reversed = buildPredictedFinishTargets([
    { horseNumber: 3, position: 3 },
    { horseNumber: 2, position: 2 },
    { horseNumber: 1, position: 1 },
  ]);
  const outRev = convergeFrameToPredictedFinish(frame, reversed, 1, rd);
  const winnerRev = [...outRev].sort((a, b) => b.raceProgress - a.raceProgress)[0].horseNumber;
  check('remap: 予想着順を逆にすると最前が変わる（逆順検知）', winnerRev === 1 && winnerRev !== winner);
}

// buildPredictedFinishTargets: finishGap は 1着=0 で単調増加（符号が逆なら失敗）
{
  const targets = buildPredictedFinishTargets([
    { horseNumber: 1, position: 3, score: 60 },
    { horseNumber: 2, position: 1, score: 90 },
    { horseNumber: 3, position: 2, score: 75 },
  ]);
  check('finishGap: 1着=0', targets[0].predictedRank === 1 && targets[0].finishGapMeters === 0);
  let inc = true;
  for (let i = 1; i < targets.length; i++) if (!(targets[i].finishGapMeters > targets[i - 1].finishGapMeters)) inc = false;
  check('finishGap: 着順が下がるほど単調増加（符号正）', inc, targets.map((t) => t.finishGapMeters.toFixed(2)).join(','));
  check('finishGap: 2着は0.4m以上後方', targets[1].finishGapMeters >= 0.4);
  // 元配列破壊なし
  check('predictedRank が 1..n の連番', JSON.stringify(targets.map((t) => t.predictedRank).sort((a, b) => a - b)) === '[1,2,3]');
}

// blend weights: 入線収束で blendToGoal が減衰し convergeToFinish=1
{
  const w88 = computeGoalBlendWeights(0.88);
  const w100 = computeGoalBlendWeights(1.0);
  check('0.88: blendToGoal≈1, converge=0', Math.abs(w88.blendToGoal - 1) < 1e-6 && w88.convergeToFinish === 0);
  check('1.00: blendToGoal=0, converge=1', w100.blendToGoal < 1e-6 && Math.abs(w100.convergeToFinish - 1) < 1e-6);
}

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
