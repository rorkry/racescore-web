/**
 * display-frame テスト
 * 実行: npx tsx lib/race-simulator/display-frame.test.ts
 *
 * A. resolveDisplayFrame: dynamics優先 / dynamics無しfallback / horseNumber対応(shuffle) / seek / NaN無し
 * B. resolveLeaderHorseNumber: trackingInputsFromDynamicsと一致 / 旧timeline順位(position/rank)に依存しない
 * C. resolveHorseWorldPose: 馬メッシュ配置(positionHorsesOnGeometry)と同一計算式 / predicted finish収束中も一致
 * D. 旧2D診断ログの文言整理: prefix付与 / console.errorへ未格上げ / 判定条件(数値閾値)は不変
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  resolveDisplayFrame,
  resolveLeaderHorseNumber,
  resolveHorseWorldPose,
  type DisplayHorseFrame,
} from './display-frame';
import {
  resolveRacecourseLayout,
  runRaceDynamicsForRace,
  buildForecastLayoutsFromSimulation,
  interpolateDynamicsForDisplay,
  type CourseInfoLike,
  type SimulationLike,
} from './race-3d-integration';
import { trackingInputsFromDynamics } from './tracking-rows';
import { sampleRaceProgressPose } from '../racecourse-geometry';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  \u2713 ${label}`); }
  else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}

function mockSim(raceKey: string, raceDistance: number, n = 10): SimulationLike {
  const horses = Array.from({ length: n }, (_, i) => ({
    horseNumber: i + 1,
    horseName: `馬${i + 1}`,
    position: i + 1,
    waku: Math.min(8, Math.floor(i / 2) + 1),
    leadingIntention: 80 - i * 5,
    staminaRemaining: 100,
    capabilities: {
      startSpeed: 40 + ((i * 13) % 50),
      cruiseSpeed: 45 + ((i * 7) % 45),
      acceleration: 40 + ((i * 11) % 55),
      stamina: 40 + ((i * 5) % 50),
      cornerSkill: 50,
    },
  }));
  return { raceKey, raceDistance, phases: { start: { horses } }, finalStandings: horses };
}

console.log('=== A. resolveDisplayFrame ===');
{
  const ci: CourseInfoLike = { place: '函館', trackType: 'turf', distance: 1200, clockwise: true };
  const layout = resolveRacecourseLayout(ci)!;
  const sim = mockSim('DF_A', 1200);
  const dyn = runRaceDynamicsForRace(sim, layout, ci)!;
  const forecastLayouts = buildForecastLayoutsFromSimulation(sim, layout.raceDistance, layout.geometry.trackWidth);

  // dynamics優先: interpolateDynamicsForDisplay の生値と一致（値の欠落・改変が無いこと）
  const t = dyn.totalTime * 0.5;
  const frame = resolveDisplayFrame({ dynamics: dyn, dynamicsTime: t, forecastLayouts, fallbackHorses: [] });
  const raw = interpolateDynamicsForDisplay(dyn, t, forecastLayouts);
  check('dynamics優先: 頭数一致', frame.length === raw.length);
  check('dynamics優先: raceProgressがrawと一致', frame.every((h) => {
    const r = raw.find((x) => x.horseNumber === h.horseNumber);
    return !!r && Math.abs(r.raceProgress - h.raceProgress) < 1e-9;
  }));
  check('dynamics優先: lateralPositionがrawと一致', frame.every((h) => {
    const r = raw.find((x) => x.horseNumber === h.horseNumber);
    return !!r && Math.abs(r.lateralPosition - h.lateralPosition) < 1e-9;
  }));
  check('dynamics優先: NaN無し', frame.every((h) => Number.isFinite(h.raceProgress) && Number.isFinite(h.lateralPosition)));

  // dynamics無し → 旧timeline(fallbackHorses)へfallback
  const fallback = resolveDisplayFrame({
    dynamics: null,
    dynamicsTime: 0,
    forecastLayouts: null,
    fallbackHorses: [
      { horseNumber: 3, currentDistance: 555.5, lateralPosition: 2.2 },
      { horseNumber: 1, currentDistance: 100.1 },
    ],
  });
  check('dynamics無し: fallbackHorsesのcurrentDistanceを使う', fallback.find((h) => h.horseNumber === 3)?.raceProgress === 555.5);
  check('dynamics無し: lateralPosition未指定は0扱い', fallback.find((h) => h.horseNumber === 1)?.lateralPosition === 0);
  check('dynamics無し: finishedはfalse固定', fallback.every((h) => h.finished === false));
  check('dynamics無し: NaN無し', fallback.every((h) => Number.isFinite(h.raceProgress) && Number.isFinite(h.lateralPosition)));

  // horseNumber対応（配列indexではない）: frameをshuffleしても同じ馬の値は不変
  const shuffled = [...frame].reverse();
  const hnPick = frame[Math.floor(frame.length / 2)].horseNumber;
  const a = frame.find((h) => h.horseNumber === hnPick);
  const b = shuffled.find((h) => h.horseNumber === hnPick);
  check(
    'horseNumber対応: 配列をshuffleしても同じ馬の値が一致',
    !!a && !!b && a.raceProgress === b.raceProgress && a.lateralPosition === b.lateralPosition,
  );

  // seek: 異なる時刻を渡すとraceProgressが変化する（seek後にfollow targetが該当時刻へ移動する前提）
  const t1 = dyn.totalTime * 0.2;
  const t2 = dyn.totalTime * 0.4;
  const f1 = resolveDisplayFrame({ dynamics: dyn, dynamicsTime: t1, forecastLayouts, fallbackHorses: [] });
  const f2 = resolveDisplayFrame({ dynamics: dyn, dynamicsTime: t2, forecastLayouts, fallbackHorses: [] });
  const seekHn = f1[0].horseNumber;
  const p1 = f1.find((h) => h.horseNumber === seekHn)!.raceProgress;
  const p2 = f2.find((h) => h.horseNumber === seekHn)!.raceProgress;
  check('seek: 時刻を進めるとraceProgressが増加する', p2 > p1, `${p1} -> ${p2}`);
}

console.log('=== B. resolveLeaderHorseNumber ===');
{
  const ci: CourseInfoLike = { place: '函館', trackType: 'turf', distance: 1200, clockwise: true };
  const layout = resolveRacecourseLayout(ci)!;
  const sim = mockSim('DF_B', 1200, 12);
  const dyn = runRaceDynamicsForRace(sim, layout, ci)!;
  const forecastLayouts = buildForecastLayoutsFromSimulation(sim, layout.raceDistance, layout.geometry.trackWidth);

  // 通常走行中〜ゴール直前〜ゴール後まで、trackingパネルの先頭馬と必ず一致する
  for (const frac of [0.1, 0.5, 0.85, 0.97, 1.0]) {
    const t = dyn.totalTime * frac;
    const frame = resolveDisplayFrame({ dynamics: dyn, dynamicsTime: t, forecastLayouts, fallbackHorses: [] });
    const leader = resolveLeaderHorseNumber(frame, layout.raceDistance);
    const trackingLeader = trackingInputsFromDynamics(frame, layout.raceDistance)[0]?.horseNumber ?? null;
    check(`t比率${frac}: 先頭ラベルがtrackingの先頭馬と一致（predicted finish収束中含む）`, leader === trackingLeader, `${leader} vs ${trackingLeader}`);
  }

  // DisplayHorseFrame は position/rank(旧timelineの順位)フィールドを持たない構造。
  // raceProgressが最大の馬が先頭として選ばれることを、旧rank情報が無い手動frameで確認する。
  const manual: DisplayHorseFrame[] = [
    { horseNumber: 5, raceProgress: 800, lateralPosition: 0, blocked: false, finished: false },
    { horseNumber: 2, raceProgress: 950, lateralPosition: 1, blocked: false, finished: false },
    { horseNumber: 9, raceProgress: 900, lateralPosition: -1, blocked: false, finished: false },
  ];
  check('手動frame: raceProgress最大の馬(2番)が先頭として選ばれる（旧timeline順位には依存しない）', resolveLeaderHorseNumber(manual, 1200) === 2);

  // 配列順を変えても結果が変わらない（配列indexに依存しない）
  const manualShuffled = [manual[2], manual[0], manual[1]];
  check('手動frame: 配列順を変えても先頭馬は同じ', resolveLeaderHorseNumber(manualShuffled, 1200) === 2);

  check('空frame → null', resolveLeaderHorseNumber([], 1200) === null);
}

console.log('=== C. resolveHorseWorldPose ===');
{
  const ci: CourseInfoLike = { place: '函館', trackType: 'turf', distance: 1200, clockwise: true };
  const layout = resolveRacecourseLayout(ci)!;
  const sim = mockSim('DF_C', 1200, 10);
  const dyn = runRaceDynamicsForRace(sim, layout, ci)!;
  const forecastLayouts = buildForecastLayoutsFromSimulation(sim, layout.raceDistance, layout.geometry.trackWidth);

  // 通常走行中: followカメラのpose計算式が馬メッシュ配置(sampleRaceProgressPose)と完全一致すること
  {
    const t = dyn.totalTime * 0.5;
    const frame = resolveDisplayFrame({ dynamics: dyn, dynamicsTime: t, forecastLayouts, fallbackHorses: [] });
    const hn = frame[3].horseNumber;
    const pose = resolveHorseWorldPose(layout, frame, hn);
    const horse = frame.find((h) => h.horseNumber === hn)!;
    const ref = sampleRaceProgressPose(layout.geometry, layout.startMarker.pathDistance, horse.raceProgress, horse.lateralPosition);
    check(
      '通常走行中: followカメラpose=馬メッシュ配置と同一座標',
      !!pose && pose.position.x === ref.position.x && pose.position.y === ref.position.y && pose.position.z === ref.position.z,
    );
  }

  // predicted finish 収束中（ゴール間際）でも同様に一致すること
  {
    const t = dyn.totalTime * 0.995;
    const frame = resolveDisplayFrame({ dynamics: dyn, dynamicsTime: t, forecastLayouts, fallbackHorses: [] });
    const hn = frame[0].horseNumber;
    const pose = resolveHorseWorldPose(layout, frame, hn);
    const horse = frame.find((h) => h.horseNumber === hn)!;
    const ref = sampleRaceProgressPose(layout.geometry, layout.startMarker.pathDistance, horse.raceProgress, horse.lateralPosition);
    check(
      'predicted finish収束中: followカメラpose=馬メッシュ配置と同一座標',
      !!pose && pose.position.x === ref.position.x && pose.position.y === ref.position.y && pose.position.z === ref.position.z,
    );
    check('predicted finish収束中: NaN無し', !!pose && Number.isFinite(pose.position.x) && Number.isFinite(pose.position.y) && Number.isFinite(pose.position.z));
  }

  // 異常系
  check('存在しない馬番 → null', resolveHorseWorldPose(layout, [], 999) === null);
  const badFrame: DisplayHorseFrame[] = [{ horseNumber: 1, raceProgress: NaN, lateralPosition: 0, blocked: false, finished: false }];
  check('raceProgressがNaN → null', resolveHorseWorldPose(layout, badFrame, 1) === null);
}

console.log('=== D. 旧2D診断ログの文言整理 ===');
{
  const cornerSrc = readFileSync(join(process.cwd(), 'lib/race-simulator/engines/corner-phase.ts'), 'utf-8');
  const validationSrc = readFileSync(join(process.cwd(), 'lib/race-simulator/validation.ts'), 'utf-8');
  const timelineSrc = readFileSync(join(process.cwd(), 'lib/race-simulator/timeline-generator.ts'), 'utf-8');
  const orchestratorSrc = readFileSync(join(process.cwd(), 'lib/race-simulator/simulation-orchestrator.ts'), 'utf-8');

  // prefixが付与されていること（削除ではなく明示化）
  check('corner-phase.ts: 円弧長警告に旧2D診断prefixがある', /円弧長と実距離の乖離/.test(cornerSrc) && /旧2D内部診断・3D表示には直接影響なし/.test(cornerSrc));
  check('validation.ts: 重複警告に旧2D診断prefixがある', /が重複/.test(validationSrc) && /旧2D内部診断・3D表示には直接影響なし/.test(validationSrc));
  check('timeline-generator.ts: 全てゼロ診断に旧timeline診断prefixがある', /全てゼロ/.test(timelineSrc) && /旧timeline診断/.test(timelineSrc));
  check('simulation-orchestrator.ts: 「有効です」メッセージに旧2D診断の説明が付与されている', /シミュレーション（finalStandings算出）は有効です/.test(orchestratorSrc));

  // console.errorへ格上げしていないこと
  check('corner-phase.ts: 円弧長診断はconsole.warnのまま', /console\.warn\(`  \[旧2D内部診断・3D表示には直接影響なし\] 円弧長と実距離の乖離/.test(cornerSrc));
  check('corner-phase.ts: 円弧長診断にconsole.errorは無い', !/console\.error[^\n]*円弧長/.test(cornerSrc));
  check('validation.ts: 重複警告はwarnings.push(文字列)のまま・console.error化していない', !/console\.error[^\n]*重複/.test(validationSrc));
  check('timeline-generator.ts: 全てゼロ診断はconsole.warnのまま', /console\.warn\('\[旧timeline診断\] 隣接フレーム間の距離差/.test(timelineSrc));
  check('timeline-generator.ts: 全てゼロ診断にconsole.errorは無い', !/console\.error[^\n]*全てゼロ/.test(timelineSrc));

  // 判定条件(数値閾値)自体は変更していないこと
  check('corner-phase.ts: 乖離判定の閾値(cornerDistance*0.3)は不変', /distanceDiff > cornerDistance \* 0\.3/.test(cornerSrc));
  check('validation.ts: 重複判定の閾値(距離差<0.5 かつ 横差<0.5)は不変', /distanceDiff < 0\.5 && lateralDiff < 0\.5/.test(validationSrc));
}

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
