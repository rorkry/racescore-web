/**
 * 実描画経路 方向回帰テスト
 * 実行: npx tsx lib/race-simulator/course-direction-render.test.ts
 *
 * RaceSimulator3DProto と同じ統合経路
 *   resolveRacecourseLayout → startMarker.pathDistance → sampleRaceProgressPose → world position
 * を通した「最終 world position/tangent 列」を正本として、
 * 公式の回り方向（右回り/左回り/直線）と一致することを固定する。
 *
 * 判定（Three.js 右手系・俯瞰 from +Y が正本。+X 右・+Z 下に見える）:
 *   sumCross = Σ (a×b).y  … 俯瞰の回転量
 *     sumCross < 0 = 時計回り(CW) = 右回り
 *     sumCross > 0 = 反時計回り(CCW) = 左回り
 *     ≈ 0          = 直線
 *
 * 純粋 sampler 単体ではなく、実際に mesh.position へ渡る座標列で検証する。
 */

import { resolveRacecourseLayout } from './race-3d-integration';
import { sampleRaceProgressPose } from '../racecourse-geometry';
import { verifyStartFinish } from '../racecourse-geometry/start-marker-resolver';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}

const TWO_PI = Math.PI * 2;

type Dir = 'clockwise' | 'counterclockwise' | 'straight';

interface Case { place: string; surface: string; distance: number; route?: string; official: Dir; }

// 公式方向（JRA）を正本にする
const CASES: Case[] = [
  { place: '札幌', surface: '芝', distance: 1800, official: 'clockwise' },
  { place: '函館', surface: '芝', distance: 1200, official: 'clockwise' },   // 目視必須
  { place: '福島', surface: '芝', distance: 1800, official: 'clockwise' },   // 目視必須
  { place: '中山', surface: '芝', distance: 2000, official: 'clockwise' },
  { place: '京都', surface: '芝', distance: 2000, official: 'clockwise' },
  { place: '阪神', surface: '芝', distance: 2000, official: 'clockwise' },
  { place: '小倉', surface: '芝', distance: 1200, official: 'clockwise' },   // 目視必須
  { place: '東京', surface: '芝', distance: 1600, official: 'counterclockwise' },
  { place: '中京', surface: '芝', distance: 1200, official: 'counterclockwise' },
  { place: '新潟', surface: '芝', distance: 2000, official: 'counterclockwise' }, // 周回
  { place: '新潟', surface: '芝', distance: 1000, route: '直線', official: 'straight' },
];

console.log('=== 実描画経路 方向回帰テスト ===');

for (const c of CASES) {
  const label = `${c.place}${c.surface}${c.distance}${c.route ? '(' + c.route + ')' : ''}`;
  const layout = resolveRacecourseLayout({ place: c.place, trackType: c.surface, distance: c.distance, route: c.route });
  if (!layout) { check(`${label}: layout解決`, false, 'layout=null'); continue; }
  check(`${label}: layout解決`, true);

  const g = layout.geometry;
  const start = layout.startMarker.pathDistance;
  const closed = g.pathKind === 'closed-loop';

  // registry direction が公式と一致
  check(`${label}: registry direction=${c.official}`, g.direction === c.official, `actual=${g.direction}`);

  // --- 実 world 経路の俯瞰回転・tangent一致・NaN ---
  const N = 720;
  const span = closed ? g.pathLength : c.distance;
  let prev = sampleRaceProgressPose(g, start, 0, 0);
  let sumCross = 0, minDot = 1, nan = 0;
  for (let i = 1; i <= N; i++) {
    const cur = sampleRaceProgressPose(g, start, (span * i) / N, 0);
    const a = prev.tangent, b = cur.tangent;
    sumCross += a.z * b.x - a.x * b.z;
    const dx = cur.position.x - prev.position.x, dz = cur.position.z - prev.position.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) { const dot = (a.x * dx + a.z * dz) / len; if (dot < minDot) minDot = dot; }
    if (![cur.position.x, cur.position.y, cur.position.z, cur.heading].every(Number.isFinite)) nan++;
    prev = cur;
  }

  check(`${label}: NaN/Infinityなし`, nan === 0, `nan=${nan}`);
  check(`${label}: tangentが移動方向と一致(dot>0.99)`, minDot > 0.99, `minDot=${minDot.toFixed(4)}`);

  if (c.official === 'clockwise') {
    check(`${label}: 俯瞰CW(右回り) sumCross<0`, sumCross < -1, `sumCross=${sumCross.toFixed(3)}`);
    check(`${label}: 総旋回≈-2π`, Math.abs(sumCross + TWO_PI) < 0.2, `sumCross=${sumCross.toFixed(3)}`);
  } else if (c.official === 'counterclockwise') {
    check(`${label}: 俯瞰CCW(左回り) sumCross>0`, sumCross > 1, `sumCross=${sumCross.toFixed(3)}`);
    check(`${label}: 総旋回≈+2π`, Math.abs(sumCross - TWO_PI) < 0.2, `sumCross=${sumCross.toFixed(3)}`);
  } else {
    check(`${label}: 直線 sumCross≈0`, Math.abs(sumCross) < 0.05, `sumCross=${sumCross.toFixed(4)}`);
  }

  // --- start/finish ---
  const vf = verifyStartFinish(g, layout.startMarker);
  check(`${label}: start/finish誤差<2m`, vf.finishErrorMeters < 2, `err=${vf.finishErrorMeters.toFixed(2)}m`);
  check(`${label}: traveled=raceDistance`, vf.traveledDistance === c.distance);

  // --- lane offset 正=外側（原点=コース中心 からの距離が増える） ---
  const W = g.trackWidth / 2;
  let outerOk = 0, total = 0;
  for (let i = 0; i <= 8; i++) {
    const prog = (c.distance * i) / 8;
    const c0 = sampleRaceProgressPose(g, start, prog, 0).position;
    const cO = sampleRaceProgressPose(g, start, prog, W).position;
    const r0 = Math.hypot(c0.x, c0.z);
    const rO = Math.hypot(cO.x, cO.z);
    total++;
    if (rO >= r0 - 1e-6) outerOk++;
  }
  check(`${label}: lateral正=外側`, outerOk === total, `${outerOk}/${total}`);
}

// 目視で確認済みの必須回帰（右回り3場が右、左回りが左）
const MUST: Array<[string, string, number, Dir]> = [
  ['函館', '芝', 1200, 'clockwise'],
  ['福島', '芝', 1800, 'clockwise'],
  ['小倉', '芝', 1200, 'clockwise'],
  ['東京', '芝', 1600, 'counterclockwise'],
];
for (const [place, surface, distance, official] of MUST) {
  const layout = resolveRacecourseLayout({ place, trackType: surface, distance });
  const g = layout?.geometry;
  if (!g) { check(`必須:${place}${distance} 解決`, false); continue; }
  const start = layout!.startMarker.pathDistance;
  let prev = sampleRaceProgressPose(g, start, 0, 0);
  let sumCross = 0;
  for (let i = 1; i <= 720; i++) {
    const cur = sampleRaceProgressPose(g, start, (g.pathLength * i) / 720, 0);
    sumCross += prev.tangent.z * cur.tangent.x - prev.tangent.x * cur.tangent.z;
    prev = cur;
  }
  const screen = sumCross < 0 ? 'clockwise' : 'counterclockwise';
  check(`必須:${place}${distance} 画面方向=${official}`, screen === official, `screen=${screen}, sumCross=${sumCross.toFixed(2)}`);
}

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
