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

// --- 2) 密集配置 → overlap が減る（間引き） ---
const mgr2 = new HorseLabelManager();
const inputsDense = makeInputs(14, 0.02); // ほぼ同一 x に密集
// maxDisplacement を設定して密集時は間引く
outs = mgr2.layout(inputsDense, projectorSpread(1), { width: W, height: H, now: 0, hysteresis: false, maxDisplacement: 80 });
const visDense = outs.filter((o) => o.visible);
const boxes = visDense.map((o) => ({ x: o.x, y: o.y }));
const overlaps = countOverlapPairs(boxes);
check('密集時は間引かれる（表示数<14）', visDense.length < 14, `${visDense.length}`);
check('密集時 overlap ペアが少ない', overlaps <= 2, `overlaps=${overlaps}`);

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

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
