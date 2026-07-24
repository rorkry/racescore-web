/**
 * ai 位置補正の表示レイヤ不変条件テスト
 * 実行: npx tsx lib/race-simulator/ai-position-display.test.ts
 *
 * 検証（interpolateDynamicsForDisplay に bonus を渡した場合）:
 *  - formation 区間では高評価馬の raceProgress が前へ（bonusあり != なし）
 *  - lateralPosition は不変（前方向のみ・横は触らない）
 *  - ゴール前(leaderProgress>=0.7)では bonusあり == なし（テーパーで0 → finish不変）
 *  - 表示 raceProgress は時間に対し単調非減少（単調増加維持）
 *  - buildFormationBonusFromSimulation: start馬の competitionScore/脚質から補正Mapを構築
 */
import {
  interpolateDynamicsForDisplay,
  buildFormationBonusFromSimulation,
  type FormationBonusContext,
} from './race-3d-integration';
import type { RaceDynamicsResult, HorseFrameState, RunningStyle } from '../race-dynamics/types';

let pass = 0,
  fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  \u2717 ${label} ${detail}`);
  }
}

console.log('=== ai-position-display ===');

const RD = 1600;
const T_END = 100;

function hf(horseNumber: number, style: RunningStyle, progress: number, lateral: number): HorseFrameState {
  return {
    horseId: String(horseNumber),
    horseNumber,
    raceProgress: progress,
    speed: 16,
    acceleration: 0,
    lateralPosition: lateral,
    targetLateralPosition: lateral,
    runningStyle: style,
    ability: 0.5,
    stamina: 0.8,
    rank: horseNumber,
    blocked: false,
    finished: progress >= RD,
  };
}

// 2頭・t=0..100 で raceProgress を 0→RD へ線形に増加させる dynamics
function makeDynamics(): RaceDynamicsResult {
  const frames = [];
  for (let t = 0; t <= T_END; t += 1) {
    const p = (t / T_END) * RD;
    frames.push({
      time: t,
      horses: [hf(1, 'stalker', p * 0.98, 2), hf(2, 'front', p, -1)],
    });
  }
  return {
    frames,
    finishOrder: [
      { horseId: '2', horseNumber: 2, rank: 1, finishTime: T_END },
      { horseId: '1', horseNumber: 1, rank: 2, finishTime: T_END + 1 },
    ],
    raceDistance: RD,
    totalTime: T_END,
    seed: 1,
    pace: 'middle',
    warnings: [],
  };
}

// horse 1 に前方向 8m の補正、horse 2 は 0
const bonus: FormationBonusContext = { appliedMetersByHorse: new Map([[1, 8], [2, 0]]) };

// 1) formation 区間（leaderProgress≈0.35 → t=35）で高評価馬(1)が前へ
{
  const dyn = makeDynamics();
  const t = 35; // leaderProgress = 0.35
  const withB = interpolateDynamicsForDisplay(dyn, t, null, bonus);
  const noB = interpolateDynamicsForDisplay(dyn, t, null, null);
  const w1 = withB.find((h) => h.horseNumber === 1)!;
  const n1 = noB.find((h) => h.horseNumber === 1)!;
  const w2 = withB.find((h) => h.horseNumber === 2)!;
  const n2 = noB.find((h) => h.horseNumber === 2)!;
  check('formation: 補正馬(1)は前へ', w1.raceProgress > n1.raceProgress + 1e-6, `with=${w1.raceProgress} no=${n1.raceProgress}`);
  check('formation: 前進量は最大8m以内', w1.raceProgress - n1.raceProgress <= 8 + 1e-6);
  check('formation: 非補正馬(2)は不変', Math.abs(w2.raceProgress - n2.raceProgress) < 1e-9);
  check('formation: lateralPosition 不変(1)', w1.lateralPosition === n1.lateralPosition);
  check('formation: lateralPosition 不変(2)', w2.lateralPosition === n2.lateralPosition);
}

// 2) ゴール前(leaderProgress>=0.7 → t=90)では bonusあり == なし
{
  const dyn = makeDynamics();
  const t = 90; // leaderProgress = 0.9
  const withB = interpolateDynamicsForDisplay(dyn, t, null, bonus);
  const noB = interpolateDynamicsForDisplay(dyn, t, null, null);
  let identical = true;
  for (const h of withB) {
    const o = noB.find((x) => x.horseNumber === h.horseNumber)!;
    if (Math.abs(h.raceProgress - o.raceProgress) > 1e-9) identical = false;
  }
  check('ゴール前: bonusあり==なし（finish不変）', identical);
}

// 3) 表示 raceProgress は時間に対し単調非減少（補正馬1）
{
  const dyn = makeDynamics();
  let prev = -Infinity;
  let monotonic = true;
  for (let t = 0; t <= T_END; t += 0.5) {
    const frame = interpolateDynamicsForDisplay(dyn, t, null, bonus);
    const h1 = frame.find((h) => h.horseNumber === 1)!;
    if (h1.raceProgress < prev - 1e-6) {
      monotonic = false;
      break;
    }
    prev = h1.raceProgress;
  }
  check('補正馬(1)の表示raceProgressは単調非減少', monotonic);
}

// 4) buildFormationBonusFromSimulation: start馬から補正Mapを構築
{
  const sim = {
    raceKey: 'x',
    raceDistance: RD,
    phases: {
      start: {
        horses: [
          { horseNumber: 1, position: 5, currentDistance: 14, lateralPosition: 2, competitionScore: 90 },
          { horseNumber: 2, position: 1, currentDistance: 26, lateralPosition: -1, competitionScore: 30 },
          { horseNumber: 3, position: 6, currentDistance: 12, lateralPosition: 3, competitionScore: 70 },
          { horseNumber: 4, position: 8, currentDistance: 5, lateralPosition: 4, competitionScore: 20 },
          { horseNumber: 5, position: 3, currentDistance: 20, lateralPosition: 0, competitionScore: 50 },
        ],
      },
    },
    finalStandings: [],
  } as any;
  const res = buildFormationBonusFromSimulation(sim, RD);
  check('bonus Map: 5頭', res.size === 5);
  const top = res.get(1)!; // 最高スコア90
  check('最高スコア(1)は前方向補正あり', top.appliedBonusMeters > 0, `applied=${top.appliedBonusMeters}`);
  const low = res.get(4)!; // 最低スコア20
  check('最低スコア(4)は補正0', low.appliedBonusMeters === 0);
}

console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} : ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
