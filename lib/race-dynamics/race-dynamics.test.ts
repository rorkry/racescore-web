/**
 * race-dynamics テスト
 * 実行: npx tsx lib/race-dynamics/race-dynamics.test.ts
 *
 * C. Race dynamics 要件:
 *  - 5秒時点で全馬同一progressではない
 *  - 10秒時点で最低3段階以上の前後差
 *  - 逃げ・先行・中団・後方が形成される
 *  - 最低1頭が進路変更 / 最低1回順位変動
 *  - 前詰まりが発生可能 / 追い抜きが発生
 *  - 全馬完走 / raceDistance超過なし / ゴール順位固定
 *  - 同一seedで完全再現 / 別seedで差
 * D. adapter 単体
 */

import {
  simulateRaceDynamics,
  adaptFormationToHorseInputs,
  inferRunningStyleFromRankRatio,
  normalizeRunningStyle,
  type HorseInput,
  type RaceDynamicsResult,
  type RunningStyle,
} from './index';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  \u2713 ${label}`);
  } else {
    fail++;
    console.error(`  \u2717 ${label} ${detail}`);
  }
}

function buildField(): HorseInput[] {
  const styles: RunningStyle[] = [
    'escape', 'escape',
    'front', 'front', 'front',
    'stalker', 'stalker', 'stalker', 'stalker',
    'closer', 'closer', 'closer',
  ];
  return styles.map((style, i) => ({
    horseId: `h${i + 1}`,
    horseNumber: i + 1,
    runningStyle: style,
    ability: 0.4 + ((i * 7) % 12) / 12 * 0.5, // 0.4..0.9 の擬似ばらつき
    gateIndex: i,
  }));
}

const config = { raceDistance: 1200, trackWidth: 27, seed: 12345, dt: 0.1, frameInterval: 0.2 };

console.log('=== 基本シミュレーション ===');
const result = simulateRaceDynamics(buildField(), config);
check('フレームが生成される', result.frames.length > 10, `frames=${result.frames.length}`);
check('pace が決まる', ['slow', 'middle', 'high'].includes(result.pace), result.pace);

function frameAt(res: RaceDynamicsResult, time: number) {
  let best = res.frames[0];
  for (const f of res.frames) {
    if (Math.abs(f.time - time) < Math.abs(best.time - time)) best = f;
  }
  return best;
}

console.log('=== 5秒: 全馬同一progressではない ===');
{
  const f5 = frameAt(result, 5);
  const progs = f5.horses.map((h) => h.raceProgress);
  const spread = Math.max(...progs) - Math.min(...progs);
  check(`5s progress spread ${spread.toFixed(1)}m > 3m`, spread > 3);
}

console.log('=== 10秒: 3段階以上の前後差 ===');
{
  const f10 = frameAt(result, 10);
  const progs = f10.horses.map((h) => h.raceProgress).sort((a, b) => b - a);
  const spread = progs[0] - progs[progs.length - 1];
  // 5m 刻みのバケツで段階数を数える
  const buckets = new Set(progs.map((p) => Math.floor((progs[0] - p) / 5)));
  check(`10s 段階数 ${buckets.size} >= 3`, buckets.size >= 3, `spread=${spread.toFixed(1)}`);
}

console.log('=== 隊列形成: 10秒で逃げ平均 > 追込平均 ===');
{
  const f10 = frameAt(result, 10);
  const avg = (style: RunningStyle) => {
    const arr = f10.horses.filter((h) => h.runningStyle === style);
    return arr.reduce((s, h) => s + h.raceProgress, 0) / (arr.length || 1);
  };
  const escapeAvg = avg('escape');
  const frontAvg = avg('front');
  const stalkerAvg = avg('stalker');
  const closerAvg = avg('closer');
  check(
    `逃げ${escapeAvg.toFixed(1)} > 先行${frontAvg.toFixed(1)} > 中団${stalkerAvg.toFixed(1)} > 追込${closerAvg.toFixed(1)}`,
    escapeAvg > frontAvg && frontAvg > stalkerAvg && stalkerAvg > closerAvg
  );
}

console.log('=== 進路変更: 最低1頭が横移動 ===');
{
  const first = result.frames[0];
  const last = result.frames[result.frames.length - 1];
  let moved = 0;
  for (const h of last.horses) {
    const init = first.horses.find((x) => x.horseNumber === h.horseNumber)!;
    if (Math.abs(h.lateralPosition - init.lateralPosition) > 1.0) moved++;
  }
  check(`横移動した馬 ${moved} >= 1`, moved >= 1);
}

console.log('=== 順位変動 & 追い抜き ===');
{
  const f5 = frameAt(result, 5);
  const fEnd = result.frames[result.frames.length - 1];
  let changed = 0;
  let overtook = 0;
  for (const h of fEnd.horses) {
    const early = f5.horses.find((x) => x.horseNumber === h.horseNumber)!;
    if (early.rank !== h.rank) changed++;
    if (h.rank < early.rank) overtook++; // 順位が上がった=追い抜き
  }
  check(`順位変動した馬 ${changed} >= 1`, changed >= 1);
  check(`追い抜いた馬 ${overtook} >= 1`, overtook >= 1);
}

console.log('=== 前詰まり(blocked) が発生しうる ===');
{
  let blockedCount = 0;
  for (const f of result.frames) {
    for (const h of f.horses) if (h.blocked) blockedCount++;
  }
  check(`blocked フレーム延べ ${blockedCount} >= 1`, blockedCount >= 1);
}

console.log('=== 全馬完走 & raceDistance超過なし ===');
{
  const last = result.frames[result.frames.length - 1];
  const allFinished = last.horses.every((h) => h.finished);
  check('全馬完走', allFinished);
  let overRun = false;
  for (const f of result.frames) {
    for (const h of f.horses) if (h.raceProgress > config.raceDistance + 1e-6) overRun = true;
  }
  check('raceDistance超過なし', !overRun);
  check('finishOrder が全馬', result.finishOrder.length === 12, `len=${result.finishOrder.length}`);
}

console.log('=== ゴール順位固定（finishTime昇順・rank連番） ===');
{
  const fo = result.finishOrder;
  let okOrder = true;
  for (let i = 1; i < fo.length; i++) {
    if (fo[i].finishTime < fo[i - 1].finishTime - 1e-9) okOrder = false;
    if (fo[i].rank !== i + 1) okOrder = false;
  }
  check('finishOrder は finishTime昇順 & rank連番', okOrder && fo[0].rank === 1);
}

console.log('=== 決定性（同一seed完全再現） ===');
{
  const r2 = simulateRaceDynamics(buildField(), config);
  const same =
    r2.frames.length === result.frames.length &&
    JSON.stringify(r2.finishOrder) === JSON.stringify(result.finishOrder) &&
    JSON.stringify(r2.frames[Math.floor(r2.frames.length / 2)]) ===
      JSON.stringify(result.frames[Math.floor(result.frames.length / 2)]);
  check('同一seedで完全一致', same);
}

console.log('=== 別seedで結果が変わる ===');
{
  const r3 = simulateRaceDynamics(buildField(), { ...config, seed: 99999 });
  const diff = JSON.stringify(r3.finishOrder) !== JSON.stringify(result.finishOrder);
  check('別seedで finishOrder が変化', diff);
}

console.log('=== D. formation-adapter ===');
{
  check('逃げ→escape', normalizeRunningStyle('逃げ') === 'escape');
  check('先行→front', normalizeRunningStyle('先行') === 'front');
  check('差し→stalker', normalizeRunningStyle('差し') === 'stalker');
  check('追込→closer', normalizeRunningStyle('追込') === 'closer');
  check('rankRatio 0→escape', inferRunningStyleFromRankRatio(0) === 'escape');
  check('rankRatio 1→closer', inferRunningStyleFromRankRatio(1) === 'closer');

  const inputs = adaptFormationToHorseInputs(
    [
      { horseNumber: 1, runningStyle: '逃げ', score: 80 },
      { horseNumber: 2, runningStyle: '追込', score: 60 },
      { horseNumber: 3, expectedRankRatio: 0.5, score: 70 },
    ],
    { scoreRange: { min: 50, max: 90 } }
  );
  check('adapter 3頭', inputs.length === 3);
  check('adapter 能力正規化 0..1', inputs.every((h) => h.ability >= 0 && h.ability <= 1));
  check('adapter 脚質割当', inputs[0].runningStyle === 'escape' && inputs[1].runningStyle === 'closer');
  // adapter 出力でシミュレーションが回る
  const rAdapt = simulateRaceDynamics(inputs, { raceDistance: 1000, trackWidth: 25, seed: 7 });
  check('adapter入力でシミュレーション完走', rAdapt.finishOrder.length === 3);
}

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
