/**
 * Visual Lab 計測ヘルパ（純粋関数）
 *
 * 3案の見た目（モデル/材質/照明/アニメ/カメラ）には一切触れない。
 * 比較のための「同一ハーネス」側の道具だけを提供する。
 * すべてローカル計算。ネットワーク送信は行わない。
 */

export interface FrameStats {
  samples: number;
  avgFps: number;
  medianFps: number;
  minFps: number;
  low1Fps: number;      // 1% low 相当（遅いフレーム下位1%の平均FPS）
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  droppedFrames: number; // dt > 2×中央値 のフレーム数（ヒッチ推定・ヒューリスティック）
  longFrames: number;    // dt > 33.3ms のフレーム数
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

/** フレーム時間(ms)配列から統計を算出 */
export function computeFrameStats(frameMs: number[]): FrameStats {
  const valid = frameMs.filter((x) => Number.isFinite(x) && x > 0);
  if (valid.length === 0) {
    return { samples: 0, avgFps: 0, medianFps: 0, minFps: 0, low1Fps: 0, avgFrameMs: 0, p95FrameMs: 0, p99FrameMs: 0, droppedFrames: 0, longFrames: 0 };
  }
  const asc = valid.slice().sort((a, b) => a - b);
  const sum = valid.reduce((a, b) => a + b, 0);
  const avgFrameMs = sum / valid.length;
  const medianMs = percentile(asc, 50);
  const maxFrameMs = asc[asc.length - 1];
  const p95FrameMs = percentile(asc, 95);
  const p99FrameMs = percentile(asc, 99);

  // 1% low: 遅い方(大きいdt)から1%の平均
  const k = Math.max(1, Math.floor(asc.length * 0.01));
  const slow = asc.slice(asc.length - k);
  const low1Fps = 1000 / (slow.reduce((a, b) => a + b, 0) / slow.length);

  const droppedFrames = valid.filter((x) => x > 2 * medianMs).length;
  const longFrames = valid.filter((x) => x > 33.3).length;

  return {
    samples: valid.length,
    avgFps: r1(1000 / avgFrameMs),
    medianFps: r1(1000 / medianMs),
    minFps: r1(1000 / maxFrameMs),
    low1Fps: r1(low1Fps),
    avgFrameMs: r2(avgFrameMs),
    p95FrameMs: r2(p95FrameMs),
    p99FrameMs: r2(p99FrameMs),
    droppedFrames,
    longFrames,
  };
}

/** ラベル矩形の重なりペア数 */
export function countOverlapPairs(boxes: { x: number; y: number }[], w = 26, h = 20): number {
  let pairs = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (Math.abs(boxes[i].x - boxes[j].x) < w && Math.abs(boxes[i].y - boxes[j].y) < h) pairs++;
  return pairs;
}

/** ラベル矩形の重なり面積の合計(px^2) */
export function overlapAreaSum(boxes: { x: number; y: number }[], w = 26, h = 20): number {
  let area = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const ox = w - Math.abs(boxes[i].x - boxes[j].x);
      const oy = h - Math.abs(boxes[i].y - boxes[j].y);
      if (ox > 0 && oy > 0) area += ox * oy;
    }
  return Math.round(area);
}

/** performance.memory（Chromium系のみ）から JS heap 使用量MB。非対応は null */
export function readJsHeapMB(): number | null {
  const perf = performance as unknown as { memory?: { usedJSHeapSize?: number } };
  const used = perf.memory?.usedJSHeapSize;
  return typeof used === 'number' ? r1(used / (1024 * 1024)) : null;
}

function r1(x: number): number { return Math.round(x * 10) / 10; }
function r2(x: number): number { return Math.round(x * 100) / 100; }
