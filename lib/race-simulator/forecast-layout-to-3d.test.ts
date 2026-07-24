/**
 * forecast-layout-to-3d テスト
 * 実行: npx tsx lib/race-simulator/forecast-layout-to-3d.test.ts
 *
 * 旧2D隊列（forecastPosition）と 3D 変換後の前後順・内外順が
 * horseNumber 単位で一致することを検証する。
 */
import {
  convertForecastLayoutTo3D,
  diffRankOrder,
  orderByLateralInnerFirst,
  computeGoalBlendWeights,
} from './forecast-layout-to-3d';
import {
  buildHorseInputsFromSimulation,
  buildForecastLayoutsFromSimulation,
  interpolateDynamics,
  interpolateDynamicsForDisplay,
} from './race-3d-integration';
import { simulateRaceDynamics } from '../race-dynamics';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  ✗ ${label} ${detail}`); }
}

console.log('=== forecast-layout-to-3d ===');

function makeField(n: number) {
  // スタート後: 馬番をシャッフルした隊列（horseNumber identity を崩さないこと）
  const order = Array.from({ length: n }, (_, i) => i + 1);
  // 決定的シャッフル
  for (let i = order.length - 1; i > 0; i--) {
    const j = (i * 7 + 3) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((hn, idx) => ({
    horseNumber: hn,
    forecastPosition: idx + 1, // 1=先頭
    waku: ((hn - 1) % 8) + 1,
    lateralPosition: ((((hn - 1) % 8) + 1) - 4.5) * 2.5,
    currentDistance: 200 - idx * 2.5,
    position: idx + 1,
    capabilities: { cruiseSpeed: 50, acceleration: 50, startSpeed: 50, stamina: 50 },
  }));
}

for (const n of [8, 14, 18]) {
  const field = makeField(n);
  const start3d = convertForecastLayoutTo3D(
    field.map((h) => ({ horseNumber: h.horseNumber, forecastPosition: h.forecastPosition, waku: h.waku })),
    { anchorDistance: 200 },
  );
  const expectedRanks = field.map((h) => ({ horseNumber: h.horseNumber, rank: h.position }));
  const gotRanks = start3d.map((p) => ({ horseNumber: p.horseNumber, rank: p.rank }));
  const mism = diffRankOrder(expectedRanks, gotRanks);
  check(`${n}頭: スタート後の前後順が一致`, mism.length === 0, `mism=${mism.join(',')}`);

  // 内外: waku 小さいほど lateral が小さい（内）
  const byLat = orderByLateralInnerFirst(start3d);
  const byWaku = [...field].sort((a, b) => a.waku - b.waku || a.horseNumber - b.horseNumber).map((h) => h.horseNumber);
  // waku 同値があるので完全一致は求めず、先頭（最内寄り）の waku が最小側であることを確認
  const innermost = start3d.reduce((a, b) => (a.lateralPosition <= b.lateralPosition ? a : b));
  const minWaku = Math.min(...field.map((h) => h.waku));
  const innermostWaku = field.find((h) => h.horseNumber === innermost.horseNumber)!.waku;
  check(`${n}頭: 最内の馬は最小枠グループ`, innermostWaku === minWaku, `waku=${innermostWaku}`);
  check(`${n}頭: horseNumber 列が保持`, byLat.length === n && new Set(byLat).size === n);
}

// ゴール前: 別の forecastPosition でも前後順一致
{
  const field = makeField(14);
  // ゴール前は逆順気味に入れ替え
  const goal = field.map((h, i) => ({
    horseNumber: h.horseNumber,
    forecastPosition: field.length - i,
    waku: h.waku,
  }));
  const goal3d = convertForecastLayoutTo3D(goal, { anchorDistance: 1600 });
  const expected = [...goal]
    .sort((a, b) => a.forecastPosition - b.forecastPosition || a.waku - b.waku || a.horseNumber - b.horseNumber)
    .map((h, i) => ({ horseNumber: h.horseNumber, rank: i + 1 }));
  const got = goal3d.map((p) => ({ horseNumber: p.horseNumber, rank: p.rank }));
  check('ゴール前の前後順が一致', diffRankOrder(expected, got).length === 0);
}

// dynamics 初期: start-phase 風の lateral/distance を渡すと frame0 の前後順が踏襲される
{
  const field = makeField(14);
  const sim = {
    raceKey: 'test_layout',
    raceDistance: 1600,
    phases: { start: { horses: field } },
    finalStandings: field.map((h, i) => ({ ...h, position: field.length - i })),
  };
  const inputs = buildHorseInputsFromSimulation(sim);
  check('initialLateral が渡る', inputs.every((h) => h.initialLateralPosition != null));
  check('initialProgressOffset が先頭ほど大きい傾向', (() => {
    const byNum = new Map(inputs.map((h) => [h.horseNumber, h]));
    const leader = field[0]; // position 1
    const last = field[field.length - 1];
    const lo = byNum.get(leader.horseNumber)?.initialProgressOffset ?? 0;
    const ll = byNum.get(last.horseNumber)?.initialProgressOffset ?? 0;
    return lo >= ll;
  })());

  const dyn = simulateRaceDynamics(inputs, {
    raceDistance: 1600,
    trackWidth: 25,
    seed: 42,
  });
  const f0 = dyn.frames[0].horses;
  const startOrder = field.map((h) => h.horseNumber);
  const dynOrder = [...f0].sort((a, b) => b.raceProgress - a.raceProgress).map((h) => h.horseNumber);
  check('frame0 先頭が start 先頭と一致', dynOrder[0] === startOrder[0], `dyn=${dynOrder[0]} start=${startOrder[0]}`);

  let latOk = 0;
  for (const h of field) {
    const d = f0.find((x) => x.horseNumber === h.horseNumber);
    if (d && Math.abs(d.lateralPosition - h.lateralPosition) < 0.01) latOk++;
  }
  check('frame0 横位置が start lateral を踏襲', latOk === field.length, `ok=${latOk}/${field.length}`);
}

// ゴール前 blend が display 経路で接続される
{
  const field = makeField(14);
  const finish = [...field].reverse().map((h, i) => ({ ...h, position: i + 1 }));
  const sim = {
    raceKey: 'blend_connect',
    raceDistance: 1600,
    phases: { start: { horses: field } },
    finalStandings: finish,
  };
  const layouts = buildForecastLayoutsFromSimulation(sim, 1600);
  check('forecast layouts 構築', !!layouts && layouts!.goal.length === 14);
  const inputs = buildHorseInputsFromSimulation(sim);
  const dyn = simulateRaceDynamics(inputs, { raceDistance: 1600, trackWidth: 25, seed: 7 });
  const t = dyn.totalTime * 0.85;
  const raw = interpolateDynamics(dyn, t);
  const disp = interpolateDynamicsForDisplay(dyn, t, layouts);
  const changed = disp.some((h) => {
    const r = raw.find((x) => x.horseNumber === h.horseNumber)!;
    return Math.abs(h.raceProgress - r.raceProgress) > 1e-6 || Math.abs(h.lateralPosition - r.lateralPosition) > 1e-6;
  });
  check('display経路でゴールblendが実適用', changed);
  const leaderP = Math.max(...raw.map((h) => h.raceProgress));
  const w = computeGoalBlendWeights(leaderP / 1600);
  check('0.85付近で blendToGoal>0', w.blendToGoal > 0, `w=${JSON.stringify(w)} leaderM=${leaderP.toFixed(1)}`);
}

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
