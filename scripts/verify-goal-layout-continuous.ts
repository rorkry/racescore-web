/**
 * ゴール前 blend の連続フレーム検証（10fps）
 * 実行: npx tsx scripts/verify-goal-layout-continuous.ts
 *
 * - progress 0.68..0.99 を 0.01 刻み（≒10fps 相当の進捗サンプル）
 * - 8/14/18頭 × 3シード
 * - 前後移動・lateral・速度・加速度・境界ジャンプを計測
 * - 全頭比較表（1レース）
 */
import { simulateRaceDynamics } from '../lib/race-dynamics';
import {
  buildHorseInputsFromSimulation,
  buildForecastLayoutsFromSimulation,
  interpolateDynamics,
  interpolateDynamicsForDisplay,
} from '../lib/race-simulator/race-3d-integration';
import {
  computeGoalBlendWeights,
  GOAL_BLEND_START,
  GOAL_BLEND_PEAK,
  FINISH_CONVERGE_START,
  FINISH_CONVERGE_END,
} from '../lib/race-simulator/forecast-layout-to-3d';

function makeSim(n: number, seedTag: number) {
  const horses = Array.from({ length: n }, (_, i) => {
    const hn = i + 1;
    return {
      horseNumber: hn,
      horseName: `馬${hn}`,
      position: i + 1,
      waku: ((hn - 1) % 8) + 1,
      currentDistance: 200 - i * 2.5,
      lateralPosition: ((((hn - 1) % 8) + 1) - 4.5) * 2.5,
      capabilities: {
        startSpeed: 55 - (i % 7) + (seedTag % 3),
        cruiseSpeed: 40 + ((i * 17 + seedTag * 3) % 50),
        acceleration: 35 + ((i * 13 + seedTag) % 55),
        stamina: 50 + ((i * 7) % 40),
        cornerSkill: 50,
      },
    };
  });
  const finish = [...horses]
    .sort(
      (a, b) =>
        b.capabilities.cruiseSpeed +
        b.capabilities.acceleration -
        (a.capabilities.cruiseSpeed + a.capabilities.acceleration),
    )
    .map((h, idx) => ({ ...h, position: idx + 1 }));
  return {
    raceKey: `cont_${n}_${seedTag}`,
    raceDistance: 1600,
    phases: { start: { horses } },
    finalStandings: finish,
  };
}

function rankOrder(frame: Array<{ horseNumber: number; raceProgress: number }>) {
  return [...frame]
    .sort((a, b) => b.raceProgress - a.raceProgress || a.horseNumber - b.horseNumber)
    .map((h) => h.horseNumber);
}

function spearmanLike(goalOrder: number[], other: number[]) {
  // top-k overlap + full-order Kendall-ish: count pairwise agreements
  let agree = 0;
  let total = 0;
  for (let i = 0; i < goalOrder.length; i++) {
    for (let j = i + 1; j < goalOrder.length; j++) {
      const a = goalOrder[i];
      const b = goalOrder[j];
      const ia = other.indexOf(a);
      const ib = other.indexOf(b);
      if (ia < 0 || ib < 0) continue;
      total++;
      if (ia < ib) agree++;
    }
  }
  return total > 0 ? agree / total : 0;
}

function analyzeRace(n: number, seed: number) {
  const raceDistance = 1600;
  const sim = makeSim(n, seed);
  const layouts = buildForecastLayoutsFromSimulation(sim, raceDistance)!;
  const inputs = buildHorseInputsFromSimulation(sim);
  const dyn = simulateRaceDynamics(inputs, { raceDistance, trackWidth: 25, seed });

  const fracs: number[] = [];
  for (let p = 0.68; p <= 0.99 + 1e-9; p += 0.01) fracs.push(Number(p.toFixed(2)));

  let maxDp = 0;
  let maxDl = 0;
  let maxBack = 0; // negative longitudinal (regress)
  let maxLatFlip = 0;
  let maxDpAtBlendStart = 0;
  let maxDpAtPeak = 0;
  let maxDpAtConverge = 0;
  let prev: Map<number, { p: number; l: number; v: number }> | null = null;
  let prevFrac = 0;

  for (const frac of fracs) {
    const t = dyn.totalTime * frac;
    const frame = interpolateDynamicsForDisplay(dyn, t, layouts);
    const dt = prev ? (frac - prevFrac) * dyn.totalTime : 0;
    const cur = new Map(
      frame.map((h) => {
        const prevH = prev?.get(h.horseNumber);
        const v = prevH && dt > 1e-6 ? (h.raceProgress - prevH.p) / dt : 0;
        return [h.horseNumber, { p: h.raceProgress, l: h.lateralPosition, v }] as const;
      }),
    );

    if (prev && dt > 0) {
      for (const [hn, c] of cur) {
        const b = prev.get(hn)!;
        const dp = c.p - b.p;
        const dl = c.l - b.l;
        maxDp = Math.max(maxDp, Math.abs(dp));
        maxDl = Math.max(maxDl, Math.abs(dl));
        if (dp < -0.05) maxBack = Math.max(maxBack, -dp);
        // lateral sign flip with large jump
        if (b.l * c.l < 0 && Math.abs(dl) > 1.5) {
          maxLatFlip = Math.max(maxLatFlip, Math.abs(dl));
        }
        if (Math.abs(frac - GOAL_BLEND_START) < 0.011) maxDpAtBlendStart = Math.max(maxDpAtBlendStart, Math.abs(dp));
        if (Math.abs(frac - GOAL_BLEND_PEAK) < 0.011) maxDpAtPeak = Math.max(maxDpAtPeak, Math.abs(dp));
        if (Math.abs(frac - FINISH_CONVERGE_START) < 0.011) maxDpAtConverge = Math.max(maxDpAtConverge, Math.abs(dp));
      }
    }
    prev = cur;
    prevFrac = frac;
  }

  // full table at key points for this race
  const goalOrder = [...layouts.goal].sort((a, b) => a.rank - b.rank);
  const at = (frac: number) => interpolateDynamicsForDisplay(dyn, dyn.totalTime * frac, layouts);
  const orderAt = (frac: number) => rankOrder(at(frac));
  const finishOrder = dyn.finishOrder.map((f) => f.horseNumber);

  const o84 = orderAt(0.84);
  const o94 = orderAt(0.94);
  const pair84 = spearmanLike(
    goalOrder.map((g) => g.horseNumber),
    o84,
  );
  const pair94 = spearmanLike(
    goalOrder.map((g) => g.horseNumber),
    o94,
  );

  // natural speed ceiling ~20m/s; at 0.01*totalTime (~1.2s) → ~24m.
  // allow headroom; judge warp mainly by excess over raw + boundary spikes
  const maxAllowedDp = 40;
  const ok =
    maxDp <= maxAllowedDp &&
    maxBack < 8 &&
    maxLatFlip < 6 &&
    pair84 >= 0.55;

  return {
    n,
    seed,
    maxDp,
    maxDl,
    maxBack,
    maxLatFlip,
    maxDpAtBlendStart,
    maxDpAtPeak,
    maxDpAtConverge,
    pair84,
    pair94,
    ok,
    table:
      n === 14 && seed === 12345
        ? goalOrder.map((g) => {
            const hn = g.horseNumber;
            return {
              hn,
              goalRank: g.rank,
              waku: ((hn - 1) % 8) + 1,
              r84: o84.indexOf(hn) + 1,
              r94: o94.indexOf(hn) + 1,
              finish: finishOrder.indexOf(hn) + 1 || finishOrder.length + 1,
            };
          })
        : null,
    weights: {
      GOAL_BLEND_START,
      GOAL_BLEND_PEAK,
      FINISH_CONVERGE_START,
      FINISH_CONVERGE_END,
      at084: computeGoalBlendWeights(0.84),
      at090: computeGoalBlendWeights(0.9),
      at096: computeGoalBlendWeights(0.96),
    },
  };
}

function main() {
  console.log('=== continuous goal-layout blend (10fps-ish) ===');
  console.log('schedule:', {
    GOAL_BLEND_START,
    GOAL_BLEND_PEAK,
    FINISH_CONVERGE_START,
    FINISH_CONVERGE_END,
  });
  console.log('priority: <0.70 dynamics | 0.70-0.84 approach 2D goal | 0.84-0.94 hold 2D | 0.94-1.00 finish');

  const cases = [
    [8, 11],
    [8, 22],
    [8, 33],
    [14, 12345],
    [14, 99],
    [14, 7],
    [18, 5],
    [18, 17],
    [18, 41],
  ] as const;

  let allOk = true;
  let fullTable: ReturnType<typeof analyzeRace>['table'] = null;
  let weights: ReturnType<typeof analyzeRace>['weights'] | null = null;

  for (const [n, seed] of cases) {
    const r = analyzeRace(n, seed);
    if (r.table) fullTable = r.table;
    if (r.weights) weights = r.weights;
    console.log(
      `n=${n} seed=${seed} maxDp=${r.maxDp.toFixed(2)}m maxDl=${r.maxDl.toFixed(2)} maxBack=${r.maxBack.toFixed(2)} latFlip=${r.maxLatFlip.toFixed(2)} pair84=${r.pair84.toFixed(2)} pair94=${r.pair94.toFixed(2)} boundary(start/peak/conv)=${r.maxDpAtBlendStart.toFixed(1)}/${r.maxDpAtPeak.toFixed(1)}/${r.maxDpAtConverge.toFixed(1)} OK=${r.ok}`,
    );
    if (!r.ok) allOk = false;
  }

  if (fullTable) {
    console.log('\n| 馬番 | 旧2Dゴール前順 | 旧2D内外 | 0.84時点3D順 | 0.94時点3D順 | 入線順 |');
    console.log('|---:|---:|---:|---:|---:|---:|');
    for (const row of fullTable) {
      console.log(`| ${row.hn} | ${row.goalRank} | ${row.waku} | ${row.r84} | ${row.r94} | ${row.finish} |`);
    }
  }
  if (weights) console.log('\nweights sample:', JSON.stringify(weights));

  // Also compare raw vs display jump at 0.84→0.86 for transparency
  {
    const sim = makeSim(14, 12345);
    const layouts = buildForecastLayoutsFromSimulation(sim, 1600)!;
    const dyn = simulateRaceDynamics(buildHorseInputsFromSimulation(sim), {
      raceDistance: 1600,
      trackWidth: 25,
      seed: 12345,
    });
    const raw1 = interpolateDynamics(dyn, dyn.totalTime * 0.84);
    const raw2 = interpolateDynamics(dyn, dyn.totalTime * 0.86);
    const d1 = interpolateDynamicsForDisplay(dyn, dyn.totalTime * 0.84, layouts);
    const d2 = interpolateDynamicsForDisplay(dyn, dyn.totalTime * 0.86, layouts);
    let maxRaw = 0;
    let maxDisp = 0;
    for (const h of raw1) {
      const b = raw2.find((x) => x.horseNumber === h.horseNumber)!;
      maxRaw = Math.max(maxRaw, Math.abs(b.raceProgress - h.raceProgress));
    }
    for (const h of d1) {
      const b = d2.find((x) => x.horseNumber === h.horseNumber)!;
      maxDisp = Math.max(maxDisp, Math.abs(b.raceProgress - h.raceProgress));
    }
    const dt = dyn.totalTime * 0.02;
    console.log(
      `\n0.84→0.86 window: dt=${dt.toFixed(2)}s maxRaw=${maxRaw.toFixed(2)}m (${(maxRaw / dt).toFixed(1)}m/s) maxDisp=${maxDisp.toFixed(2)}m (${(maxDisp / dt).toFixed(1)}m/s)`,
    );
    console.log(
      'NOTE: ~15-18m/s is normal race speed; judge warp by excess over raw, not absolute meters alone.',
    );
    console.log('excessDispOverRaw=', (maxDisp - maxRaw).toFixed(2), 'm');
  }

  console.log('\nALL_OK:', allOk);
  if (!allOk) process.exit(1);
}

main();
