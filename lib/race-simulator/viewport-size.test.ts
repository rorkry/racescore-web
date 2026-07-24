/**
 * viewport-size テスト
 * 実行: npx tsx --test lib/race-simulator/viewport-size.test.ts
 *
 * スマホ表示で 3D シミュレーターが縦長になる問題の修正を検証する。
 * - mobile viewport の width/height 比が約 16:9 になること（320/375/390/430px）
 * - renderer size が親 viewport の実測サイズと一致すること（overflow-x を出さない）
 * - resize 後に camera.aspect が正しく再計算されること
 * - tracking panel の高さがこの計算に混ざらないこと（関数シグネチャに含まれない）
 */

import * as THREE from 'three';
import {
  MOBILE_VIEWPORT_ASPECT,
  computeMobileViewportSize,
  computeRendererSize,
  applyViewportSizeToCamera,
} from './viewport-size';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}

console.log('=== A. スマホ幅ごとの 16:9 viewport ===');
for (const width of [320, 375, 390, 430]) {
  const size = computeMobileViewportSize(width);
  check(`width=${width}: size が算出される`, size !== null);
  if (!size) continue;
  check(`width=${width}: widthはそのまま(=overflow-xなし)`, size.width === width, `got ${size.width}`);
  check(`width=${width}: aspectが約16:9`, Math.abs(size.aspect - MOBILE_VIEWPORT_ASPECT) < 1e-9, `aspect=${size.aspect}`);
  check(`width=${width}: heightがwidth未満(横長)`, size.height < size.width, `h=${size.height} w=${size.width}`);
  check(`width=${width}: heightが有限かつ正`, Number.isFinite(size.height) && size.height > 0);
  // 16:9 の場合 height ≈ width * 9/16
  const expectedHeight = width * 9 / 16;
  check(`width=${width}: height ≈ width*9/16`, Math.abs(size.height - expectedHeight) < 1e-6, `got ${size.height} expected ${expectedHeight}`);
}

console.log('=== B. landscape幅でも横幅内に収まる ===');
for (const width of [568, 667, 812, 896]) { // 代表的なスマホ landscape 幅
  const size = computeMobileViewportSize(width);
  check(`landscape width=${width}: widthを超えない`, size !== null && size.width === width);
}

console.log('=== C. tracking panel の高さが計算へ混ざらない ===');
{
  // computeMobileViewportSize は width のみに依存する（tracking panel 高さの概念が存在しない）。
  // 同じ width であれば、tracking panel の有無に関わらず常に同じ結果になることを保証する。
  const a = computeMobileViewportSize(390);
  const b = computeMobileViewportSize(390);
  check('同じwidthなら結果が常に同一(=tracking高さ非依存)', JSON.stringify(a) === JSON.stringify(b));
  // aspect引数は既定値(16:9)を持つため必須パラメータはwidthのみ。tracking panel高さの引数は存在しない。
  check('関数の必須引数はwidthのみ(tracking高さを取らない)', computeMobileViewportSize.length === 1);
}

console.log('=== D. renderer size が親viewportと一致 ===');
{
  const cases: Array<[number, number]> = [[320, 180], [375, 667], [390, 219], [430, 242], [1024, 600]];
  for (const [w, h] of cases) {
    const size = computeRendererSize(w, h);
    check(`(${w}x${h}) rendererがそのまま一致`, size !== null && size.width === w && size.height === h);
  }
  check('width<=0 は null (黒画面/破壊防止)', computeRendererSize(0, 100) === null);
  check('height<=0 は null (黒画面/破壊防止)', computeRendererSize(100, 0) === null);
  check('負値は null', computeRendererSize(-10, 100) === null);
  check('NaNは null', computeRendererSize(NaN, 100) === null);
}

console.log('=== E. resize後にcamera.aspectが再計算される ===');
{
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 10000);
  // 初回: モバイル幅相当（縦長コンテナに誤って追従していないか）
  let ok = applyViewportSizeToCamera(camera, 375, 211); // 375 x (375*9/16≈211)
  check('初回 applyViewportSizeToCamera が成功', ok);
  check('camera.aspectがwidth/heightに一致', Math.abs(camera.aspect - 375 / 211) < 1e-6, `aspect=${camera.aspect}`);

  // resize: デスクトップ幅相当へ変化（既存 md:h-[600px] を想定）
  ok = applyViewportSizeToCamera(camera, 960, 600);
  check('resize後 applyViewportSizeToCamera が成功', ok);
  check('resize後にcamera.aspectが更新される', Math.abs(camera.aspect - 960 / 600) < 1e-6, `aspect=${camera.aspect}`);

  // 端末回転: landscapeへ変化
  ok = applyViewportSizeToCamera(camera, 812, 375);
  check('回転後 applyViewportSizeToCamera が成功', ok);
  check('回転後にcamera.aspectが再計算される', Math.abs(camera.aspect - 812 / 375) < 1e-6, `aspect=${camera.aspect}`);

  // 不正サイズでは前回値を維持（黒画面/warp防止）
  const beforeAspect = camera.aspect;
  ok = applyViewportSizeToCamera(camera, 0, 0);
  check('不正サイズではfalseを返す', ok === false);
  check('不正サイズでもcamera.aspectは変化しない(前回維持)', camera.aspect === beforeAspect);
}

console.log(`\n=== 結果: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
