/**
 * horse-labels テスト
 * 実行: npx tsx lib/race-simulator/horse-labels.test.ts
 *
 * 新仕様（Visual Lab A 忠実移植）:
 *  - ラベルは対象馬の真上（アンカー）に固定。動的スロット・横展開・縦積みはしない。
 *  - leader line は引かない（LabelOut に leader/ax/ay は無い）。
 *  - 低優先ラベルが重なったら「動かさず、低優先を隠す」。
 *  - 選択馬(forceShow)は重なっても必ず表示。
 *  - hysteresis で表示/非表示がちらつかない。
 *  - shouldLabelHorse: 選択/hover/先頭のみラベル対象。
 */
import {
  HorseLabelManager,
  buildLabelPriority,
  shouldLabelHorse,
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

// world x をそのまま NDC 風に投影する簡易プロジェクタ（z=0.5 で常に onScreen）
function projectorSpread(scale: number): LabelProjector {
  return {
    project: (x, _y, _z) => ({ x: Math.max(-1, Math.min(1, x * scale)), y: 0.2, z: 0.5 }),
  };
}

function makeInputs(ids: number[], spreadX: number, selected: number | null): LabelInput[] {
  const n = ids.length;
  const arr: LabelInput[] = [];
  for (let i = 0; i < n; i++) {
    const wx = n === 1 ? 0 : (-spreadX + (2 * spreadX * i) / (n - 1));
    const p = buildLabelPriority({ horseNumber: ids[i], selectedHorse: selected, hoverHorse: null, leaderHorse: 1 });
    arr.push({
      id: ids[i], wx, wy: 3, wz: 0, text: String(ids[i]),
      color: '#fff', textColor: '#000', priority: p.priority, forceShow: p.forceShow,
    });
  }
  return arr;
}

// --- 1) 真上固定: ラベルはアンカーからずれない ---
const mgr1 = new HorseLabelManager();
// 選択(5)/hover なし/先頭(1) の 2 頭だけを渡す（新仕様の呼び出し想定）
const twoInputs = makeInputs([1, 5], 0.9, 5);
let outs = mgr1.layout(twoInputs, projectorSpread(1), { width: W, height: H, now: 0, hysteresis: false });
{
  const o5 = outs.find((o) => o.id === 5)!;
  // 馬5の wx=0.9(NDC) → アンカー x=(0.9*0.5+0.5)*W。ラベルはそこに固定される（動かさない）。
  const expectedX = (0.9 * 0.5 + 0.5) * W;
  check('選択馬ラベルは真上固定（x=アンカー）', Math.abs(o5.x - expectedX) < 1e-6, `x=${o5.x} expected=${expectedX}`);
  check('LabelOut に leader/ax/ay が無い', !('leader' in o5) && !('ax' in o5) && !('ay' in o5));
}

// --- 2) 重なり時は低優先を隠す（動かさない）---
const mgr2 = new HorseLabelManager();
// 同一 x に密集した 3 頭。selected=5(force), leader=1, hover なし → その他は priority 低。
const denseInputs = makeInputs([1, 5, 9], 0.0, 5);
outs = mgr2.layout(denseInputs, projectorSpread(1), { width: W, height: H, now: 0, hysteresis: false });
{
  const vis = outs.filter((o) => o.visible);
  const boxes = vis.map((o) => ({ x: o.x, y: o.y }));
  check('重なり時 overlap ペア=0（低優先を隠す）', countOverlapPairs(boxes) === 0, `pairs=${countOverlapPairs(boxes)}`);
  check('選択馬(forceShow)は重なっても表示', outs.find((o) => o.id === 5)?.visible === true);
  check('選択馬は emphasized', outs.find((o) => o.id === 5)?.emphasized === true);
  // 全ラベルが真上固定（アンカーから動かない）: 同一 x なので可視ラベルは 1 つだけのはず
  check('同一位置では 1 つだけ可視（重なりは非表示）', vis.length === 1, `vis=${vis.length}`);
}

// --- 3) shouldLabelHorse: 選択/hover/先頭のみ ---
check('選択馬はラベル対象', shouldLabelHorse({ horseNumber: 5, selectedHorse: 5, hoverHorse: null, leaderHorse: 1 }) === true);
check('hover馬はラベル対象', shouldLabelHorse({ horseNumber: 3, selectedHorse: 5, hoverHorse: 3, leaderHorse: 1 }) === true);
check('先頭馬はラベル対象(既定)', shouldLabelHorse({ horseNumber: 1, selectedHorse: 5, hoverHorse: null, leaderHorse: 1 }) === true);
check('その他はラベル対象外', shouldLabelHorse({ horseNumber: 9, selectedHorse: 5, hoverHorse: null, leaderHorse: 1 }) === false);
check('showLeader=false で先頭は対象外', shouldLabelHorse({ horseNumber: 1, selectedHorse: 5, hoverHorse: null, leaderHorse: 1, showLeader: false }) === false);

// --- 4) hysteresis: 表示化は連続 100ms 必要（初回フレームは false→安定後 true）---
const mgr3 = new HorseLabelManager();
const one: LabelInput[] = [{ id: 7, wx: 0, wy: 3, wz: 0, text: '7', color: '#fff', textColor: '#000', priority: 400 }];
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

// --- 6) 真上固定: 同一入力を連続適用しても配置が動かない ---
const mgrStable = new HorseLabelManager();
const stableIn = makeInputs([1, 5], 0.5, 5);
const s1 = mgrStable.layout(stableIn, projectorSpread(1), { width: W, height: H, now: 0, hysteresis: false });
const s2 = mgrStable.layout(stableIn, projectorSpread(1), { width: W, height: H, now: 16, hysteresis: false });
let maxStableMove = 0;
for (const b of s2) {
  const a = s1.find((x) => x.id === b.id);
  if (!a || !a.visible || !b.visible) continue;
  maxStableMove = Math.max(maxStableMove, Math.hypot(b.x - a.x, b.y - a.y));
}
check('同一入力では配置が完全固定（移動=0）', maxStableMove < 1e-6, `move=${maxStableMove.toFixed(3)}`);

// --- 7) レース切替リセット: clearForRaceSwitch で hysteresis 状態が消える ---
const mgrR = new HorseLabelManager();
mgrR.layout(makeInputs([1, 5], 0.5, 5), projectorSpread(1), { width: W, height: H, now: 0, hysteresis: true });
mgrR.clearForRaceSwitch();
const rAfter = mgrR.layout(makeInputs([1, 5], 0.5, 5), projectorSpread(1), { width: W, height: H, now: 0, hysteresis: true });
// 切替直後は非強制ラベルは t=0 再開で未表示（選択馬 forceShow は常に表示）
check('切替後は t=0 再開（非強制は未表示）', rAfter.every((o) => o.visible === false || o.emphasized));

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
