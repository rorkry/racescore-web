/**
 * horse-labels（本番 頭上ラベルの screen-space 配置 / 純粋ロジック）
 *
 * Visual Lab A の識別性（14頭でも全馬番が見え、重なりがほぼ解消）を本番で再現するための
 * 純粋関数群。THREE への依存は投影のための Camera 型のみで、DOM には触れない（テスト可能）。
 *
 * 方針（ユーザー承認済み・A案より識別性を落とさない）:
 *  - 画面空間に余裕がある場合は全頭表示
 *  - 密集時のみ 優先度 + screen-space collision で間引く
 *  - 選択馬は必ず表示（forceShow）
 *  - hover馬 / 先頭馬 は高優先度
 *  - 一度表示したラベルは hysteresis で安定させる（ちらつき/跳び防止）
 *  - ゼッケンは頭上ラベルの代替ではなく補助
 *
 * 文献: Vaaraniemi 2012 / Been et al. 2006 / External Labeling Survey(arXiv:1902.01454)
 */

export interface LabelProjector {
  /** world(x,y,z) を screen(px) へ。onScreen=false の場合 x/y は未定義でよい。 */
  project: (x: number, y: number, z: number) => { x: number; y: number; z: number };
}

export interface LabelInput {
  id: number;             // horseNumber
  wx: number; wy: number; wz: number; // world アンカー
  text: string;
  color: string;          // 枠色（背景）
  textColor: string;      // 文字色
  priority: number;       // 高いほど優先
  forceShow?: boolean;    // 選択馬など必ず表示
}

export interface LabelOut {
  id: number;
  x: number; y: number;     // ラベル最終描画位置(px)
  ax: number; ay: number;   // 対象馬のアンカー画面位置(px)。leader line 用。
  text: string; color: string; textColor: string;
  visible: boolean;
  emphasized: boolean;
  /** アンカーから十分ずれており leader line を引くべきか。 */
  leader: boolean;
}

export interface LayoutConfig {
  width: number;
  height: number;
  now: number;              // performance.now() 相当（ms）
  /** 同時表示の上限（既定は全頭。密集の最終安全弁）。 */
  maxVisible?: number;
  hysteresis?: boolean;
}

const LABEL_W = 26;   // 衝突判定の箱（幅）
const LABEL_H = 20;   // 衝突判定の箱（高さ）
const COL = 27;       // 横方向オフセット刻み
const ROW = 22;       // 縦方向オフセット刻み（2段目まで）
const EASE = 0.25;    // オフセットのスムージング係数
const MAX_STEP = 6;   // 1フレームあたりのオフセット最大移動量(px)。瞬間移動を防ぐ。
const LEADER_MIN = COL * 1.2; // これ以上ずれたら leader line を引く

// 配置候補（アンカー頭上からのオフセット）。横方向を優先し、縦は最大 2 段まで。
interface Slot { dx: number; dy: number }
const SLOTS: Slot[] = [
  // 1段目（頭上）: 横方向を優先的に広げる
  { dx: 0, dy: 0 },
  { dx: +COL, dy: 0 }, { dx: -COL, dy: 0 },
  { dx: +2 * COL, dy: 0 }, { dx: -2 * COL, dy: 0 },
  { dx: +3 * COL, dy: 0 }, { dx: -3 * COL, dy: 0 },
  { dx: +4 * COL, dy: 0 }, { dx: -4 * COL, dy: 0 },
  // 2段目（最大2段まで）: さらに横へ
  { dx: 0, dy: -ROW },
  { dx: +COL, dy: -ROW }, { dx: -COL, dy: -ROW },
  { dx: +2 * COL, dy: -ROW }, { dx: -2 * COL, dy: -ROW },
  { dx: +3 * COL, dy: -ROW }, { dx: -3 * COL, dy: -ROW },
];

function boxesOverlap(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) < LABEL_W && Math.abs(ay - by) < LABEL_H;
}

export class HorseLabelManager {
  private shownSince = new Map<number, number>();
  private hiddenSince = new Map<number, number>();
  private lastSlot = new Map<number, number>();          // 直近に選ばれたスロット index（連続性）
  private lastOffset = new Map<number, { dx: number; dy: number }>(); // スムージング済みオフセット

  reset() {
    this.shownSince.clear();
    this.hiddenSince.clear();
    this.lastSlot.clear();
    this.lastOffset.clear();
  }

  /** レース切替時: 配置・ヒステリシス状態を破棄（前レースを引きずらない）。 */
  clearForRaceSwitch() {
    this.reset();
  }

  layout(inputs: LabelInput[], projector: LabelProjector, cfg: LayoutConfig): LabelOut[] {
    const { width, height, now } = cfg;
    const maxVisible = cfg.maxVisible ?? inputs.length; // 既定=全頭
    const useHysteresis = cfg.hysteresis ?? true;

    const projected: { in: LabelInput; ax: number; ay: number; onScreen: boolean }[] = [];
    for (const inp of inputs) {
      const v = projector.project(inp.wx, inp.wy, inp.wz);
      const onScreen = v.z < 1 && v.x >= -1.05 && v.x <= 1.05 && v.y >= -1.05 && v.y <= 1.05;
      projected.push({
        in: inp,
        ax: (v.x * 0.5 + 0.5) * width,
        ay: (-v.y * 0.5 + 0.5) * height,
        onScreen,
      });
    }

    // 優先度順（forceShow を最優先）に配置していく
    projected.sort(
      (a, b) => (b.in.forceShow ? 1e9 : b.in.priority) - (a.in.forceShow ? 1e9 : a.in.priority),
    );

    const placed: { x: number; y: number }[] = [];
    const out: LabelOut[] = [];
    let visibleCount = 0;

    for (const p of projected) {
      const id = p.in.id;
      let wantShow = p.onScreen && (p.in.forceShow || visibleCount < maxVisible);
      let finalX = p.ax;
      let finalY = p.ay;
      let leader = false;

      if (wantShow) {
        const slotIdx = this.chooseSlot(p.ax, p.ay, placed, id, !!p.in.forceShow);
        if (slotIdx < 0) {
          // 空きスロットが無く、必須でもない → 最小限の間引き
          wantShow = false;
        } else {
          const target = SLOTS[slotIdx];
          // オフセットをスムージング + 1フレーム移動量を制限（ぴょんぴょん防止）
          const prev = this.lastOffset.get(id) ?? { dx: target.dx, dy: target.dy };
          let ndx = prev.dx + (target.dx - prev.dx) * EASE;
          let ndy = prev.dy + (target.dy - prev.dy) * EASE;
          ndx = clampStep(prev.dx, ndx, MAX_STEP);
          ndy = clampStep(prev.dy, ndy, MAX_STEP);
          finalX = p.ax + ndx;
          finalY = p.ay + ndy;
          leader = Math.hypot(ndx, ndy) > LEADER_MIN;

          placed.push({ x: finalX, y: finalY });
          this.lastSlot.set(id, slotIdx);
          this.lastOffset.set(id, { dx: ndx, dy: ndy });
        }
      }

      const visible = this.applyHysteresis(id, wantShow, now, !!p.in.forceShow, useHysteresis);
      if (visible) visibleCount++;

      out.push({
        id,
        x: finalX, y: finalY,
        ax: p.ax, ay: p.ay,
        text: p.in.text,
        color: p.in.color,
        textColor: p.in.textColor,
        visible,
        emphasized: !!p.in.forceShow || p.in.priority >= 400,
        leader: leader && visible,
      });
    }
    return out;
  }

  /**
   * 空きスロットを選ぶ。直近のスロットを最優先に試し（連続性=ちらつき防止）、
   * 衝突する場合のみ横→2段目の順で最初の空きを探す。
   * forceShow はどうしても空きが無ければ slot0 に強制配置（重なっても表示は維持）。
   */
  private chooseSlot(
    ax: number, ay: number,
    placed: { x: number; y: number }[],
    id: number,
    force: boolean,
  ): number {
    const order: number[] = [];
    const prev = this.lastSlot.get(id);
    if (prev !== undefined && prev >= 0 && prev < SLOTS.length) order.push(prev);
    for (let i = 0; i < SLOTS.length; i++) if (i !== prev) order.push(i);

    for (const i of order) {
      const sx = ax + SLOTS[i].dx;
      const sy = ay + SLOTS[i].dy;
      let hit = false;
      for (const q of placed) { if (boxesOverlap(sx, sy, q.x, q.y)) { hit = true; break; } }
      if (!hit) return i;
    }
    return force ? 0 : -1;
  }

  private applyHysteresis(id: number, want: boolean, now: number, force: boolean, enabled: boolean): boolean {
    if (force) return true;
    if (!enabled) return want;
    if (want) {
      this.hiddenSince.delete(id);
      const since = this.shownSince.get(id);
      if (since === undefined) { this.shownSince.set(id, now); return false; }
      return now - since >= 100; // 100ms 連続で表示化
    } else {
      this.shownSince.delete(id);
      const since = this.hiddenSince.get(id);
      if (since === undefined) { this.hiddenSince.set(id, now); return true; }
      return !(now - since >= 250); // 250ms 連続で非表示化
    }
  }
}

/** prev から next への移動量を ±maxStep に制限する。 */
function clampStep(prev: number, next: number, maxStep: number): number {
  const d = next - prev;
  if (d > maxStep) return prev + maxStep;
  if (d < -maxStep) return prev - maxStep;
  return next;
}

/** 数値の重なりペア数（識別指標・テスト用の純粋関数）。 */
export function countOverlapPairs(boxes: { x: number; y: number }[]): number {
  let n = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (Math.abs(boxes[i].x - boxes[j].x) < LABEL_W && Math.abs(boxes[i].y - boxes[j].y) < LABEL_H) n++;
    }
  }
  return n;
}

/**
 * ラベル入力を組み立てる補助（優先度規則を 1 か所に集約）。
 * selected=必ず表示 / hover=高 / leader=高 / その他=選択馬への近さで基準優先度。
 */
export function buildLabelPriority(params: {
  horseNumber: number;
  selectedHorse: number | null;
  hoverHorse: number | null;
  leaderHorse: number | null;
}): { priority: number; forceShow: boolean } {
  const { horseNumber, selectedHorse, hoverHorse, leaderHorse } = params;
  if (selectedHorse != null && horseNumber === selectedHorse) return { priority: 1000, forceShow: true };
  if (hoverHorse != null && horseNumber === hoverHorse) return { priority: 500, forceShow: false };
  if (leaderHorse != null && horseNumber === leaderHorse) return { priority: 400, forceShow: false };
  const near = selectedHorse != null ? 10 - Math.abs(horseNumber - selectedHorse) * 0.2 : 10;
  return { priority: near, forceShow: false };
}
