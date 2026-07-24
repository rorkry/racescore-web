/**
 * horse-labels テスト
 * 実行: npx tsx lib/race-simulator/horse-labels.test.ts
 *
 * 検証（A案の識別性を落とさない）:
 *  - 画面に余裕がある場合は全頭表示される
 *  - 密集時は overlap が減る（占有解消 + 間引き）
 *  - 選択馬(forceShow)は密集でも必ず表示
 *  - hysteresis で表示/非表示がちらつかない
 *  - 優先度規則: selected>hover>leader>その他
 */
import {
  HorseLabelManager,
  buildLabelPriority,
  countOverlapPairs,
  type LabelInput,
  type LabelProjector,
} from './horse-labels';

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.error(`  \u2717 ${label} ${detail}`); }
}

console.log('=== horse-labels ===');

const W = 1280, H = 720;

// world x をそのまま NDC 風に投影する簡易プロジェクタ（z=0 で常に onScreen）
function projectorSpread(scale: number): LabelProjector {
  return {
    project: (x, _y, _z) => ({ x: Math.max(-1, Math.min(1, x * scale)), y: 0.2, z: 0.5 }),
  };
}

function makeInputs(n: number, spreadX: number): LabelInput[] {
  const arr: LabelInput[] = [];
  for (let i = 0; i < n; i++) {
    // -spreadX..+spreadX に均等配置
    const wx = n === 1 ? 0 : (-spreadX + (2 * spreadX * i) / (n - 1));
    const p = buildLabelPriority({ horseNumber: i + 1, selectedHorse: 5, hoverHorse: null, leaderHorse: 1 });
    arr.push({
      id: i + 1, wx, wy: 3, wz: 0, text: String(i + 1),
      color: '#fff', textColor: '#000', priority: p.priority, forceShow: p.forceShow,
    });
  }
  return arr;
}

// --- 1) 余裕がある配置 → 全頭表示 ---
const mgr1 = new HorseLabelManager();
const inputsSparse = makeInputs(14, 0.9); // 広く分散
let outs = mgr1.layout(inputsSparse, projectorSpread(1), { width: W, height: H, now: 0, hysteresis: false });
const visibleSparse = outs.filter((o) => o.visible).length;
check('余裕ある配置で全頭表示', visibleSparse === 14, `${visibleSparse}/14`);

// --- 2) 密集配置 → 横展開で重なり解消。縦積みは最大2段まで ---
const mgr2 = new HorseLabelManager();
const inputsDense = makeInputs(14, 0.02); // ほぼ同一 x に密集
outs = mgr2.layout(inputsDense, projectorSpread(1), { width: W, height: H, now: 0, hysteresis: false });
const visDense = outs.filter((o) => o.visible);
const boxes = visDense.map((o) => ({ x: o.x, y: o.y }));
const overlaps = countOverlapPairs(boxes);
check('密集時 overlap ペアが少ない', overlaps <= 2, `overlaps=${overlaps}`);
// 縦積みは最大2段まで（アンカーからの縦変位は 1 段ぶん=ROW(22) 程度に収まる）
const maxDy = Math.max(...visDense.map((o) => Math.abs(o.y - o.ay)));
check('縦積みは最大2段（縦変位<=約22px）', maxDy <= 23, `maxDy=${maxDy.toFixed(1)}`);
// 横方向へ逃がしているので、多くの馬が表示され続ける（A案の識別性維持）
check('密集でも大半が表示（横展開）', visDense.length >= 10, `${visDense.length}/14`);
// leader line が密集時に付与される（横/上へ逃がしたラベル）
check('密集時に leader line が出る', visDense.some((o) => o.leader === true));

// --- 3) 選択馬は密集でも必ず表示 ---
const selVisible = outs.find((o) => o.id === 5)?.visible;
check('選択馬(forceShow)は密集でも表示', selVisible === true);
check('選択馬は emphasized', outs.find((o) => o.id === 5)?.emphasized === true);

// --- 4) hysteresis: 表示化は連続 100ms 必要（初回フレームは false→安定後 true）---
const mgr3 = new HorseLabelManager();
const one: LabelInput[] = [{ id: 7, wx: 0, wy: 3, wz: 0, text: '7', color: '#fff', textColor: '#000', priority: 10 }];
let o0 = mgr3.layout(one, projectorSpread(1), { width: W, height: H, now: 0, hysteresis: true });
check('hysteresis: t=0 は未表示', o0[0].visible === false);
let o1 = mgr3.layout(one, projectorSpread(1), { width: W, height: H, now: 150, hysteresis: true });
check('hysteresis: 100ms 後に表示', o1[0].visible === true);
// 一瞬 offscreen になっても 250ms 未満は表示維持
const off: LabelProjector = { project: () => ({ x: 5, y: 5, z: 2 }) }; // onScreen=false
let o2 = mgr3.layout(one, off, { width: W, height: H, now: 200, hysteresis: true });
check('hysteresis: 一瞬の非表示は維持', o2[0].visible === true);
let o3 = mgr3.layout(one, off, { width: W, height: H, now: 600, hysteresis: true });
check('hysteresis: 250ms 継続で非表示化', o3[0].visible === false);

// --- 5) 優先度規則 ---
const pSel = buildLabelPriority({ horseNumber: 5, selectedHorse: 5, hoverHorse: 3, leaderHorse: 1 });
const pHov = buildLabelPriority({ horseNumber: 3, selectedHorse: 5, hoverHorse: 3, leaderHorse: 1 });
const pLead = buildLabelPriority({ horseNumber: 1, selectedHorse: 5, hoverHorse: 3, leaderHorse: 1 });
const pOther = buildLabelPriority({ horseNumber: 9, selectedHorse: 5, hoverHorse: 3, leaderHorse: 1 });
check('優先度 selected>hover', pSel.priority > pHov.priority);
check('優先度 hover>leader', pHov.priority > pLead.priority);
check('優先度 leader>other', pLead.priority > pOther.priority);
check('selected は forceShow', pSel.forceShow === true && pHov.forceShow === false);

// --- 6) 出走頭数と出力数が一致 ---
check('出力数==入力数', outs.length === 14, `${outs.length}`);

// --- 7) ぴょんぴょん抑制: オフセットの1フレーム移動量が MAX_STEP(6px) 以内 ---
// 密集(大きなオフセット)→疎(オフセット0)へ急変させても、1フレームの移動は制限される。
const mgrS = new HorseLabelManager();
const denseS = makeInputs(14, 0.02);
const fA = mgrS.layout(denseS, projectorSpread(1), { width: W, height: H, now: 0, hysteresis: false });
const sparseS = makeInputs(14, 0.9);
const fB = mgrS.layout(sparseS, projectorSpread(1), { width: W, height: H, now: 16, hysteresis: false });
let maxOffsetDelta = 0;
for (const b of fB) {
  const a = fA.find((x) => x.id === b.id);
  if (!a) continue;
  const dAx = a.x - a.ax, dAy = a.y - a.ay;
  const dBx = b.x - b.ax, dBy = b.y - b.ay;
  maxOffsetDelta = Math.max(maxOffsetDelta, Math.abs(dBx - dAx), Math.abs(dBy - dAy));
}
check('オフセット移動量が MAX_STEP 以内（ぴょんぴょん抑制）', maxOffsetDelta <= 6.5, `maxDelta=${maxOffsetDelta.toFixed(2)}`);

// --- 8) スロット連続性: 同一入力を連続適用すると配置が安定（動かない） ---
const mgrStable = new HorseLabelManager();
const stableIn = makeInputs(14, 0.05);
const s1 = mgrStable.layout(stableIn, projectorSpread(1), { width: W, height: H, now: 0, hysteresis: false });
const s2 = mgrStable.layout(stableIn, projectorSpread(1), { width: W, height: H, now: 16, hysteresis: false });
let maxStableMove = 0;
for (const b of s2) {
  const a = s1.find((x) => x.id === b.id);
  if (!a || !a.visible || !b.visible) continue;
  maxStableMove = Math.max(maxStableMove, Math.hypot(b.x - a.x, b.y - a.y));
}
check('同一入力では配置が安定（移動≈0）', maxStableMove < 1.0, `move=${maxStableMove.toFixed(2)}`);

// --- 9) レース切替リセット: clearForRaceSwitch で状態が消える ---
const mgrR = new HorseLabelManager();
mgrR.layout(makeInputs(8, 0.05), projectorSpread(1), { width: W, height: H, now: 0, hysteresis: true });
mgrR.clearForRaceSwitch();
const rAfter = mgrR.layout(makeInputs(8, 0.05), projectorSpread(1), { width: W, height: H, now: 0, hysteresis: true });
check('切替後は t=0 再開（未表示から）', rAfter.every((o) => o.visible === false || o.emphasized));

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
