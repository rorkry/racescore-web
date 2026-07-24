/**
 * Visual Lab 撮影/計測 補助スクリプト（任意・未検証）
 *
 * ⚠️ 重要:
 *  - Playwright はこのリポジトリの依存には含めていません（package.json 未変更）。
 *  - このスクリプトは「実行確認済み」ではありません。ローカルで手動実行してください。
 *  - headless/software rendering の FPS は実機性能ではないため、FPS は正本にしないでください。
 *    （静止スクリーンショット/構図比較・console error 収集が主目的）
 *
 * 事前準備:
 *   1) 別ターミナルで dev server: `npm run dev`（http://localhost:3000）
 *   2) 一度だけ: `npm i -D playwright && npx playwright install chromium`
 *   3) 実行: `node scripts/visual-lab-capture.mjs`
 *      環境変数: BASE_URL(default http://localhost:3000) / VIEWPORT(default 1440x900) / VIDEO=1 で録画
 *
 * 出力:
 *   visual-lab-output/
 *     A/ B/ C/          … 各案のスクリーンショット
 *     metrics/          … benchmark JSON（benchmark=1 で取得）
 *     videos/           … 録画（VIDEO=1 時）
 *     console/          … console error / page error ログ
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const [VW, VH] = (process.env.VIEWPORT || '1440x900').split('x').map(Number);
const WITH_VIDEO = process.env.VIDEO === '1';
const OUT = path.resolve('visual-lab-output');
const PAGE = '/dev/race-visual-lab';

// 比較ケース（必要5ケース + ズーム3面）。speed=0 で静止再現。
const CASES = [
  { id: 'straight-14', scene: 'straight', surface: 'turf', horses: 14, labels: 'all', view: 'default' },
  { id: 'corner-14', scene: 'corner', surface: 'turf', horses: 14, labels: 'all', view: 'default' },
  { id: 'finish-14', scene: 'finish', surface: 'dirt', horses: 14, labels: 'all', view: 'default' },
  { id: 'dense-18', scene: 'dense', surface: 'turf', horses: 18, labels: 'all', view: 'default' },
  { id: 'zoomSide-14', scene: 'straight', surface: 'turf', horses: 14, labels: 'selected', view: 'zoomSide' },
  { id: 'zoomFront-14', scene: 'straight', surface: 'turf', horses: 14, labels: 'selected', view: 'zoomFront' },
  { id: 'zoomRear-14', scene: 'straight', surface: 'turf', horses: 14, labels: 'selected', view: 'zoomRear' },
];
const VARIANTS = { A: 'cel', B: 'semi', C: 'dataviz' };
const SEED = 1;
const SELECTED = 5;

function buildUrl({ variant, scene, surface, horses, labels, view, capture = 1, benchmark = 0, duration = 30 }) {
  const p = new URLSearchParams({
    debug: '1', capture: String(capture), variant, surface, horses: String(horses),
    scene, speed: '0', labels, hysteresis: '1', selectedHorse: String(SELECTED), seed: String(SEED), view,
    benchmark: String(benchmark), duration: String(duration),
  });
  return `${BASE}${PAGE}?${p.toString()}`;
}

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { console.error('playwright 未インストール。`npm i -D playwright && npx playwright install chromium` を実行してください。'); process.exit(1); }

  ['A', 'B', 'C', 'metrics', 'videos', 'console'].forEach((d) => ensure(path.join(OUT, d)));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: VW, height: VH }, deviceScaleFactor: 1,
    ...(WITH_VIDEO ? { recordVideo: { dir: path.join(OUT, 'videos'), size: { width: VW, height: VH } } } : {}),
  });

  for (const [variant, approach] of Object.entries(VARIANTS)) {
    for (const c of CASES) {
      const url = buildUrl({ variant, ...c });
      const page = await context.newPage();
      const logs = [];
      page.on('console', (m) => { if (m.type() === 'error') logs.push('[console.error] ' + m.text()); });
      page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500); // WebGL 初期化 + 数フレーム
      const name = `${variant}-${approach}-${c.id}.png`;
      await page.screenshot({ path: path.join(OUT, variant, name) });
      if (logs.length) fs.writeFileSync(path.join(OUT, 'console', `${variant}-${c.id}.log`), logs.join('\n'));
      await page.close();
      console.log('captured', name);
    }
  }

  // benchmark（現在頭数ごと）。※ headless FPS は参考値
  for (const [variant] of Object.entries(VARIANTS)) {
    for (const horses of [8, 14, 18]) {
      const url = buildUrl({ variant, scene: 'dense', surface: 'turf', horses, labels: 'all', view: 'default', capture: 0, benchmark: 1, duration: 30 });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(5000 + 30000 + 2000);
      const json = await page.$eval('textarea', (el) => el.value).catch(() => '');
      if (json) fs.writeFileSync(path.join(OUT, 'metrics', `${variant}-dense-${horses}.json`), json);
      await page.close();
      console.log('benchmark', variant, horses);
    }
  }

  await context.close();
  await browser.close();
  console.log('done ->', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
