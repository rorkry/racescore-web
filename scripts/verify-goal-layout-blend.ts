/**
 * ゴール前配置の実接続・比較検証
 * 実行: npx tsx scripts/verify-goal-layout-blend.ts
 */
import { simulateRaceDynamics } from '../lib/race-dynamics';
import {
  buildHorseInputsFromSimulation,
  buildForecastLayoutsFromSimulation,
  interpolateDynamics,
  interpolateDynamicsForDisplay,
} from '../lib/race-simulator/race-3d-integration';
import { computeGoalBlendWeights } from '../lib/race-simulator/forecast-layout-to-3d';

function makeSim(n: number) {
  // 決定的な能力差を付けた start horses（脚質傾向付き）
  const horses = Array.from({ length: n }, (_, i) => {
    const hn = i + 1;
    const position = i + 1; // 1=先頭
    return {
      horseNumber: hn,
      horseName: `馬${hn}`,
      position,
      waku: ((hn - 1) % 8) + 1,
      currentDistance: 200 - i * 2.5,
      lateralPosition: ((((hn - 1) % 8) + 1) - 4.5) * 2.5,
      capabilities: {
        startSpeed: 55 - i,
        cruiseSpeed: 40 + ((i * 17) % 50),
        acceleration: 35 + ((i * 13) % 55),
        stamina: 50 + ((i * 7) % 40),
        cornerSkill: 50,
      },
    };
  });
  // finalStandings: 能力寄りに並べ替え（着順≠スタート順）
  const finish = [...horses]
    .sort((a, b) => (b.capabilities.cruiseSpeed + b.capabilities.acceleration) - (a.capabilities.cruiseSpeed + a.capabilities.acceleration))
    .map((h, idx) => ({ ...h, position: idx + 1 }));
  return {
    raceKey: 'verify_goal_blend',
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

function main() {
  const sim = makeSim(14);
  const raceDistance = 1600;
  const layouts = buildForecastLayoutsFromSimulation(sim, raceDistance)!;
  const inputs = buildHorseInputsFromSimulation(sim);
  const dyn = simulateRaceDynamics(inputs, {
    raceDistance,
    trackWidth: 25,
    seed: 12345,
  });

  console.log('=== call sites / blend schedule ===');
  console.log('adapter: buildForecastLayoutsFromSimulation → forecastLayoutsRef');
  console.log('apply: interpolateDynamicsForDisplay(dynamics, time, layouts)');
  console.log('Proto paths: positionHorsesOnGeometry / syncTrackingRows / updateBroadcastCamera');
  console.log('GOAL_BLEND 0.70→0.88, FINISH_CONVERGE 0.88→0.98');

  // 比較表: 旧2Dゴール前後順 vs 修正前(raw) vs 修正後(display) at leader≈0.85
  // dynamics.raceProgress はメートル
  const tPeak = dyn.totalTime * 0.85;
  const raw = interpolateDynamics(dyn, tPeak);
  const blended = interpolateDynamicsForDisplay(dyn, tPeak, layouts);
  const leaderMeters = Math.max(...raw.map((h) => h.raceProgress));
  const leader01 = leaderMeters / raceDistance;
  const weights = computeGoalBlendWeights(leader01);

  const goalOrder = [...layouts.goal].sort((a, b) => a.rank - b.rank).map((p) => p.horseNumber);
  const rawOrder = rankOrder(raw);
  const blendOrder = rankOrder(blended);

  console.log('\n| 馬番 | 旧2Dゴール前の前後順 | 旧2D内外(waku) | 修正前3D順 | 修正後3D順 | 修正前距離(m) | 修正後距離(m) |');
  console.log('|---:|---:|---:|---:|---:|---:|---:|');
  for (const hn of goalOrder) {
    const g = layouts.goal.find((x) => x.horseNumber === hn)!;
    const rawH = raw.find((x) => x.horseNumber === hn)!;
    const blendH = blended.find((x) => x.horseNumber === hn)!;
    const rawRank = rawOrder.indexOf(hn) + 1;
    const blendRank = blendOrder.indexOf(hn) + 1;
    console.log(
      `| ${hn} | ${g.rank} | ${((hn - 1) % 8) + 1} | ${rawRank} | ${blendRank} | ${rawH.raceProgress.toFixed(1)} | ${blendH.raceProgress.toFixed(1)} |`,
    );
  }

  console.log(
    '\nblend weights at tPeak:',
    weights,
    'leaderMeters=',
    leaderMeters.toFixed(1),
    'leader01=',
    leader01.toFixed(3),
  );

  // 相関: 修正後の上位が goal 上位に近づいているか（Spearman的に先頭5頭の一致数）
  const top5Goal = goalOrder.slice(0, 5);
  const top5Raw = rawOrder.slice(0, 5);
  const top5Blend = blendOrder.slice(0, 5);
  const overlap = (a: number[], b: number[]) => a.filter((x) => b.includes(x)).length;
  console.log('top5 overlap goal∩raw:', overlap(top5Goal, top5Raw), 'goal∩blend:', overlap(top5Goal, top5Blend));
  console.log('PASS closer-to-goal:', overlap(top5Goal, top5Blend) >= overlap(top5Goal, top5Raw));

  // ワープ禁止: 隣接時刻で距離ジャンプが過大でない（メートル単位・約2%時間）
  const t1 = dyn.totalTime * 0.84;
  const t2 = dyn.totalTime * 0.86;
  const f1 = interpolateDynamicsForDisplay(dyn, t1, layouts);
  const f2 = interpolateDynamicsForDisplay(dyn, t2, layouts);
  let maxJump = 0;
  for (const h of f1) {
    const b = f2.find((x) => x.horseNumber === h.horseNumber)!;
    maxJump = Math.max(maxJump, Math.abs(b.raceProgress - h.raceProgress));
  }
  // 2%時間での移動は通常数十m。急ワープ禁止の上限は 120m 程度
  console.log('max meters jump 0.84→0.86:', maxJump.toFixed(2), 'PASS:', maxJump < 120);
}

main();
