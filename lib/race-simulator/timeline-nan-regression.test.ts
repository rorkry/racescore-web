/**
 * timeline NaN / 0フレーム 回帰テスト
 * 実行: npx tsx lib/race-simulator/timeline-nan-regression.test.ts
 *
 * 本番症状「特定レース(1000m/14頭)へ切替 → 総再生時間 NaN / 補間後0件 → client-side exception」
 * をブラウザ非依存で回帰検証する。
 *
 * 根本原因（コード根拠）:
 *   start-phase の velocity = Math.max(10, Math.min(20, 15 + (score-50)/50*3)) は
 *   score(startSpeed/leadingIntention)が NaN（指数データ欠損）だと NaN を返し、
 *   avgVelocity=NaN → phaseTime = endDistance/(NaN*0.9)=NaN → 全phaseのtimeRangeがNaN。
 *   timeline-generator は NaN time を dedup すると Map キー(Math.round(NaN*10)/10=NaN)が
 *   衝突して全フレームが潰れ、totalDuration=NaN・補間0件になっていた。
 *
 * 検証:
 *   A. 函館 1000/1200/1800 の正常 timeline（frames>=2 / duration有限正 / 単調 / 距離有限）
 *   B. NaN指数の馬が混じっても timeline が有効（start-phase の velocity ガードが効く）
 *   C. validation 純粋関数（2点補間可 / 同一時刻 / NaN / Infinity / 0件 / null 拒否）
 *   D. 補間器防御（phase timeRange が NaN でも NaN/0件を返さない＝不正扱いで検出可能）
 *   E. レース切替（正常→不正→正常）で generateTimeline が例外なく分類できる
 */

import type { HorseState, PhaseResult, SimulationResult } from '@/types/race-simulator';
import { getCourseInfo, normalizeTrackType } from './course-database';
import { buildPhaseBoundaries } from './phase-boundaries';
import { executeStartPhase } from './engines/start-phase';
import { executeFormationPhase } from './engines/formation-phase';
import { executeCornerPhase } from './engines/corner-phase';
import { executeStraightPhase } from './engines/straight-phase';
import { generateTimeline, interpolateTimeline } from './timeline-generator';
import { validateInterpolatedTimeline, validateTimelineKeyframes } from './timeline-validation';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}

function makeHorse(num: number, waku: number): HorseState {
  return {
    horseNumber: num, horseName: `馬${num}`, position: 0, internalLane: waku,
    distanceFromLeader: 0, currentDistance: 0, currentVelocity: 0,
    lateralPosition: (waku - 4.5) * 2.5,
    capabilities: { startSpeed: 50 + num * 2, cruiseSpeed: 50 + num, acceleration: 50 + num * 3, stamina: 70, cornerSkill: 50 },
    leadingIntention: 50, pfs: 50, pastPositionPattern: '5-5-5-5', staminaRemaining: 70,
    blocked: false, outerPath: false, waku, weight: 55, trackBiasEffect: 0,
  } as HorseState;
}

/** orchestrator と同じ phase 列で SimulationResult を構築（DB非依存） */
function buildSimResult(place: string, distance: number, surface: string, n: number, injectNaN = false): SimulationResult | null {
  const tt = normalizeTrackType(surface);
  const courseInfo = tt ? getCourseInfo(place, distance, tt) : null;
  if (!courseInfo) return null;
  let boundaries;
  try { boundaries = buildPhaseBoundaries(distance, courseInfo); } catch { return null; }

  const horses: HorseState[] = [];
  for (let i = 1; i <= n; i++) horses.push(makeHorse(i, Math.min(8, Math.ceil(i * 8 / n))));
  if (injectNaN) {
    // 実データ欠損を模す: 1頭の startSpeed / leadingIntention を NaN にする
    horses[Math.min(3, n - 1)].capabilities.startSpeed = NaN;
    (horses[Math.min(3, n - 1)] as any).leadingIntention = NaN;
  }

  const startPhaseResult = executeStartPhase({ horses, totalHorses: n, endDistance: boundaries.start.end });
  const startSnapshot = { ...startPhaseResult, horses: structuredClone(startPhaseResult.horses) };

  const formationPhaseResult = executeFormationPhase({ horses: structuredClone(startPhaseResult.horses), courseInfo, totalHorses: n, endDistance: boundaries.formation.end }, startPhaseResult);
  const formationSnapshot = { ...formationPhaseResult, horses: structuredClone(formationPhaseResult.horses) };

  const paceHorses = structuredClone(formationPhaseResult.horses);
  const maxF = Math.max(...paceHorses.map(h => h.currentDistance));
  const paceRun = Math.max(0, boundaries.pace.end - maxF);
  for (const h of paceHorses) h.currentDistance = Math.min(boundaries.pace.end, h.currentDistance + paceRun);
  const paceSnapshot = { ...formationPhaseResult, phaseName: 'ペース形成', horses: paceHorses, distanceRange: { start: boundaries.pace.start, end: boundaries.pace.end } } as PhaseResult;

  const cornerPhaseResult = executeCornerPhase({ horses: structuredClone(paceHorses), courseInfo, totalHorses: n, endDistance: boundaries.corner.end }, formationPhaseResult);
  const cornerSnapshot = { ...cornerPhaseResult, horses: structuredClone(cornerPhaseResult.horses) };

  const straightPhaseResult = executeStraightPhase({ horses: structuredClone(cornerPhaseResult.horses), paceType: cornerPhaseResult.paceInfo.paceType, courseInfo, totalHorses: n, raceDistance: distance, endDistance: distance }, cornerPhaseResult);
  const straightSnapshot = { ...straightPhaseResult, horses: structuredClone(straightPhaseResult.horses) };
  const goalSnapshot = { ...straightPhaseResult, phaseName: 'ゴール', horses: structuredClone(straightPhaseResult.horses), distanceRange: { start: straightPhaseResult.distanceRange.end, end: distance } } as PhaseResult;

  return {
    raceKey: `T_${place}_${distance}`, raceDistance: distance,
    phases: { start: startSnapshot, formation: formationSnapshot, pace: paceSnapshot, corner3_4: cornerSnapshot, straight: straightSnapshot, goal: goalSnapshot },
    finalStandings: structuredClone(straightPhaseResult.horses),
  } as SimulationResult;
}

/** phase timeRange がすべて NaN の壊れた結果（別のNaN源が将来出た場合の防御確認用） */
function buildBrokenSimResult(): SimulationResult {
  const horses = [1, 2, 3].map((n) => makeHorse(n, n));
  const p = (name: string, ds: number, de: number, ts: number, te: number): PhaseResult => ({
    phaseName: name, distanceRange: { start: ds, end: de }, timeRange: { start: ts, end: te },
    horses, paceInfo: { averageSpeed: 15, leadingHorses: [1], paceType: 'middle' }, events: [],
  } as PhaseResult);
  return {
    raceKey: 'BROKEN', raceDistance: 1000,
    phases: {
      start: p('start', 0, 350, 0, NaN), formation: p('formation', 350, 500, NaN, NaN),
      pace: p('pace', 500, 709, NaN, NaN), corner3_4: p('corner', 709, 709, NaN, NaN),
      straight: p('straight', 709, 1000, NaN, NaN), goal: p('goal', 1000, 1000, NaN, NaN),
    }, finalStandings: horses,
  } as SimulationResult;
}

function assertValidTimeline(label: string, sim: SimulationResult) {
  const tl = generateTimeline(sim);
  const v = validateInterpolatedTimeline(tl);
  check(`${label}: timeline valid`, v.valid, v.errors.join(' / '));
  check(`${label}: frames>=2`, tl.keyframes.length >= 2, `frames=${tl.keyframes.length}`);
  check(`${label}: duration有限かつ正`, Number.isFinite(tl.totalDuration) && tl.totalDuration > 0, `dur=${tl.totalDuration}`);
  check(`${label}: first.time=0`, tl.keyframes[0]?.time === 0, `t0=${tl.keyframes[0]?.time}`);
  check(`${label}: last.time>0`, tl.keyframes[tl.keyframes.length - 1]?.time > 0);
  // 単調 & 距離有限
  let mono = true, distFinite = true;
  for (let i = 1; i < tl.keyframes.length; i++) if (!(tl.keyframes[i].time >= tl.keyframes[i - 1].time)) mono = false;
  for (const f of tl.keyframes) for (const h of f.horses) if (!Number.isFinite(h.currentDistance)) distFinite = false;
  check(`${label}: time単調非減少`, mono);
  check(`${label}: 全距離が有限`, distFinite);
  // 補間器(interpolateTimeline)が中間時刻で有限を返す
  const mid = interpolateTimeline(tl, tl.totalDuration / 2);
  check(`${label}: 中間補間が有限`, !!mid && mid.horses.every(h => Number.isFinite(h.currentDistance)));
  return tl;
}

function main() {
  console.log('=== timeline NaN / 0フレーム 回帰テスト ===');

  // A. 正常 timeline（短距離1000mを含む）
  for (const [place, dist] of [['函館', 1000], ['函館', 1200], ['福島', 1800]] as const) {
    const sim = buildSimResult(place, dist, '芝', 14);
    check(`${place}芝${dist}: sim構築`, sim !== null);
    if (sim) assertValidTimeline(`${place}芝${dist}`, sim);
  }

  // B. NaN指数の馬が混じっても timeline は有効（start-phase velocity ガード）
  {
    const sim = buildSimResult('函館', 1000, '芝', 14, true);
    check('NaN指数混入: sim構築', sim !== null);
    if (sim) {
      const tl = generateTimeline(sim);
      const v = validateInterpolatedTimeline(tl);
      check('NaN指数混入でも totalDuration 有限', Number.isFinite(tl.totalDuration), `dur=${tl.totalDuration}`);
      check('NaN指数混入でも frames>=2', tl.keyframes.length >= 2, `frames=${tl.keyframes.length}`);
      check('NaN指数混入でも timeline valid', v.valid, v.errors.join(' / '));
    }
  }

  // C. validation 純粋関数
  const mk = (t: number) => ({ time: t, horses: [{ currentDistance: 1 }] });
  check('C: null 拒否', validateInterpolatedTimeline(null).valid === false);
  check('C: 2点キーフレームは有効', validateTimelineKeyframes([{ time: 0 }, { time: 5 }]).valid === true);
  check('C: 0件 拒否', validateTimelineKeyframes([]).valid === false);
  check('C: 1件 拒否', validateTimelineKeyframes([{ time: 0 }]).valid === false);
  check('C: 同一時刻(0,0) 拒否', validateTimelineKeyframes([{ time: 0 }, { time: 0 }]).valid === false);
  check('C: NaN time 拒否', validateTimelineKeyframes([{ time: 0 }, { time: NaN }]).valid === false);
  check('C: Infinity time 拒否', validateTimelineKeyframes([{ time: 0 }, { time: Infinity }]).valid === false);
  check('C: 逆順time 拒否', validateTimelineKeyframes([{ time: 0 }, { time: 5 }, { time: 3 }]).valid === false);
  check('C: NaN duration timeline 拒否', validateInterpolatedTimeline({ raceKey: 'x', courseDistance: 1, totalDuration: NaN, keyframes: [mk(0), mk(5)] } as any).valid === false);
  check('C: 有効 timeline は valid', validateInterpolatedTimeline({ raceKey: 'x', courseDistance: 1, totalDuration: 10, keyframes: [mk(0), mk(5), mk(10)] } as any).valid === true);

  // D. 補間器防御: phase timeRange 全NaN でも NaN/クラッシュを外へ出さない
  {
    const tl = generateTimeline(buildBrokenSimResult());
    check('D: 壊れた入力でも totalDuration 有限', Number.isFinite(tl.totalDuration), `dur=${tl.totalDuration}`);
    check('D: 壊れた入力でも例外なくtimeline返却', Array.isArray(tl.keyframes));
    check('D: 壊れた入力は invalid 判定（fallback発火）', validateInterpolatedTimeline(tl).valid === false);
    // interpolateTimeline も落ちない
    const s = interpolateTimeline(tl, 0);
    check('D: 壊れた入力でも interpolateTimeline が例外なし', s === null || Array.isArray(s.horses));
  }

  // E. レース切替（正常→不正→正常）を例外なく分類
  {
    const seq: Array<{ label: string; sim: SimulationResult | null }> = [
      { label: '函館1200', sim: buildSimResult('函館', 1200, '芝', 8) },
      { label: '福島1800', sim: buildSimResult('福島', 1800, '芝', 14) },
      { label: 'broken', sim: buildBrokenSimResult() },
      { label: '函館1000', sim: buildSimResult('函館', 1000, '芝', 8) },
    ];
    let threw = false;
    const classes: string[] = [];
    for (const s of seq) {
      if (!s.sim) { classes.push(`${s.label}:skip`); continue; }
      try {
        const tl = generateTimeline(s.sim);
        classes.push(`${s.label}:${validateInterpolatedTimeline(tl).valid ? 'valid' : 'invalid'}`);
      } catch { threw = true; }
    }
    check('E: 切替中に例外が発生しない', !threw, classes.join(', '));
    check('E: broken だけ invalid、他は valid', classes.includes('broken:invalid') && classes.includes('函館1200:valid') && classes.includes('福島1800:valid'), classes.join(', '));
  }

  console.log(`\n結果: 成功 ${pass}件 / 失敗 ${fail}件`);
  if (fail > 0) process.exitCode = 1;
}

main();
