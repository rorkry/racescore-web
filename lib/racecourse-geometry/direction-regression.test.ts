/**
 * 方向(右回り/左回り)回帰テスト
 * 実行: npx tsx lib/racecourse-geometry/direction-regression.test.ts
 *
 * 目的: directionSign を誤って反転できないよう、全10競馬場の
 *       「馬の進行方向に対する旋回向き」を数値で固定する。
 *
 * 判定規約（Three.js: Y=up, 地面=XZ。sampleRaceProgressPose の tangent は
 *          レース進行方向。連続 tangent の外積 Y成分 = a.z*b.x - a.x*b.z を周回で積算）:
 *   - 右回り(clockwise)      : sumCross ≈ +2π (> 0)
 *   - 左回り(counterclockwise): sumCross ≈ -2π (< 0)
 *   - 直線(straight/open-path): sumCross ≈ 0
 *   - tangent は実移動方向と一致: 各ステップ dot(tangent, Δposition) > 0.99
 *
 * これは方向ロジックの検証専用であり、方向ロジック自体は一切変更しない。
 */

import { ALL_GEOMETRIES, GEOMETRIES_BY_VENUE, VENUE_IDS } from './registries';
import { sampleRaceProgressPose } from './start-marker-resolver';
import type { RacecourseGeometry } from './types';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}

const TWO_PI = Math.PI * 2;

/** 進行方向で1周サンプルし、旋回積算と tangent-移動方向の最小dotを返す */
function analyze(geom: RacecourseGeometry): { sumCross: number; minDot: number } {
  const N = 720;
  let sumCross = 0;
  let minDot = 1;
  let prev = sampleRaceProgressPose(geom, 0, 0, 0);
  const span = geom.pathLength;
  for (let i = 1; i <= N; i++) {
    const p = (span * i) / N;
    const cur = sampleRaceProgressPose(geom, 0, p, 0);
    const a = prev.tangent;
    const b = cur.tangent;
    // 外積 Y成分（水平面の旋回向き）
    sumCross += a.z * b.x - a.x * b.z;
    // tangent が実際の移動方向を向いているか
    const dx = cur.position.x - prev.position.x;
    const dz = cur.position.z - prev.position.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) {
      const dot = (a.x * dx + a.z * dz) / len;
      if (dot < minDot) minDot = dot;
    }
    prev = cur;
  }
  return { sumCross, minDot };
}

console.log('=== 方向(右回り/左回り)回帰テスト ===');

// 対象10場が全て存在すること
for (const venue of VENUE_IDS) {
  check(`${venue}: geometry登録あり`, (GEOMETRIES_BY_VENUE.get(venue)?.length ?? 0) > 0);
}
check('全ジオメトリ数 >= 24', ALL_GEOMETRIES.length >= 24, `actual=${ALL_GEOMETRIES.length}`);

// 全ジオメトリで direction 契約を固定
for (const geom of ALL_GEOMETRIES) {
  const { sumCross, minDot } = analyze(geom);
  const id = geom.id;

  // tangent は常に進行方向を向く（全コース共通）
  check(`${id}: tangentが移動方向と一致(dot>0.99)`, minDot > 0.99, `minDot=${minDot.toFixed(4)}`);

  if (geom.direction === 'clockwise') {
    // 右回り: 進行方向に対し右へ曲がる → sumCross > 0（≈ +2π）
    check(`${id}: 右回りは sumCross>0`, sumCross > 1, `sumCross=${sumCross.toFixed(3)}`);
    check(`${id}: 右回り 総旋回≈+2π`, Math.abs(sumCross - TWO_PI) < 0.2, `sumCross=${sumCross.toFixed(3)}`);
  } else if (geom.direction === 'counterclockwise') {
    // 左回り: 進行方向に対し左へ曲がる → sumCross < 0（≈ -2π）
    check(`${id}: 左回りは sumCross<0`, sumCross < -1, `sumCross=${sumCross.toFixed(3)}`);
    check(`${id}: 左回り 総旋回≈-2π`, Math.abs(sumCross + TWO_PI) < 0.2, `sumCross=${sumCross.toFixed(3)}`);
  } else {
    // 直線: 実質旋回しない
    check(`${id}: 直線は sumCross≈0`, Math.abs(sumCross) < 0.05, `sumCross=${sumCross.toFixed(4)}`);
  }
}

// 主要場の期待方向を明示的に固定（回帰防止のダメ押し）
const EXPECTED: Record<string, 'clockwise' | 'counterclockwise'> = {
  sapporo: 'clockwise',
  hakodate: 'clockwise',
  fukushima: 'clockwise',
  nakayama: 'clockwise',
  kyoto: 'clockwise',
  hanshin: 'clockwise',
  kokura: 'clockwise',
  tokyo: 'counterclockwise',
  chukyo: 'counterclockwise',
  // niigata は closed-loop(inner/outer/dirt)が左回り + straight
};
for (const [venue, dir] of Object.entries(EXPECTED)) {
  const geoms = (GEOMETRIES_BY_VENUE.get(venue) ?? []).filter((g) => g.pathKind === 'closed-loop');
  check(`${venue}: 周回コースは全て${dir}`, geoms.length > 0 && geoms.every((g) => g.direction === dir),
    geoms.map((g) => `${g.id}=${g.direction}`).join(','));
}
// 新潟: 周回は左回り、直線は straight
const niigata = GEOMETRIES_BY_VENUE.get('niigata') ?? [];
check('niigata: closed-loopは左回り',
  niigata.filter((g) => g.pathKind === 'closed-loop').every((g) => g.direction === 'counterclockwise'));
check('niigata: straight(open-path)が存在',
  niigata.some((g) => g.pathKind === 'open-path' && g.direction === 'straight'));

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
