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
  x: number; y: number;
  text: string; color: string; textColor: string;
  visible: boolean;
  emphasized: boolean;
}

export interface LayoutConfig {
  width: number;
  height: number;
  now: number;              // performance.now() 相当（ms）
  /** 同時表示の上限（既定は全頭。密集の最終安全弁）。 */
  maxVisible?: number;
  /** アンカーからの最大許容変位(px)。超える低優先ラベルは間引く（密集解消）。 */
  maxDisplacement?: number;
  hysteresis?: boolean;
}

const LABEL_W = 26;
const LABEL_H = 20;

export class HorseLabelManager {
  private shownSince = new Map<number, number>();
  private hiddenSince = new Map<number, number>();
  private lastY = new Map<number, number>();

  reset() {
    this.shownSince.clear();
    this.hiddenSince.clear();
    this.lastY.clear();
  }

  /** レース切替時: 位置履歴だけ捨てる（ヒステリシス状態はレース固有なので破棄）。 */
  clearForRaceSwitch() {
    this.reset();
  }

  layout(inputs: LabelInput[], projector: LabelProjector, cfg: LayoutConfig): LabelOut[] {
    const { width, height, now } = cfg;
    const maxVisible = cfg.maxVisible ?? inputs.length; // 既定=全頭
    const maxDisp = cfg.maxDisplacement ?? 999999;      // 既定=間引かない（全表示優先）
    const useHysteresis = cfg.hysteresis ?? true;

    const projected: { in: LabelInput; x: number; y: number; onScreen: boolean }[] = [];
    for (const inp of inputs) {
      const v = projector.project(inp.wx, inp.wy, inp.wz);
      const onScreen = v.z < 1 && v.x >= -1.05 && v.x <= 1.05 && v.y >= -1.05 && v.y <= 1.05;
      projected.push({
        in: inp,
        x: (v.x * 0.5 + 0.5) * width,
        y: (-v.y * 0.5 + 0.5) * height,
        onScreen,
      });
    }

    // 優先度順（forceShow を最優先）
    projected.sort(
      (a, b) => (b.in.forceShow ? 1e9 : b.in.priority) - (a.in.forceShow ? 1e9 : a.in.priority),
    );

    const placed: { x: number; y: number }[] = [];
    const out: LabelOut[] = [];
    let visibleCount = 0;

    for (const p of projected) {
      const anchorY = p.y;
      let wantShow = p.onScreen && (p.in.forceShow || visibleCount < maxVisible);
      let y = anchorY;

      if (wantShow) {
        y = resolveOverlap(p.x, y, placed);
        // 密集で許容変位を超え、かつ必須でない低優先ラベルは間引く
        if (!p.in.forceShow && Math.abs(y - anchorY) > maxDisp) {
          wantShow = false;
        }
      }

      if (wantShow) {
        // 縦の急な飛びを抑える（位置連続化）
        const prevY = this.lastY.get(p.in.id);
        if (prevY !== undefined) y = prevY + (y - prevY) * 0.45;
        placed.push({ x: p.x, y });
        this.lastY.set(p.in.id, y);
      }

      const visible = this.applyHysteresis(p.in.id, wantShow, now, !!p.in.forceShow, useHysteresis);
      if (visible) visibleCount++;

      out.push({
        id: p.in.id,
        x: p.x, y,
        text: p.in.text,
        color: p.in.color,
        textColor: p.in.textColor,
        visible,
        emphasized: !!p.in.forceShow || p.in.priority >= 400,
      });
    }
    return out;
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

function resolveOverlap(x: number, y: number, placed: { x: number; y: number }[]): number {
  let moved = true;
  let guard = 0;
  while (moved && guard++ < 60) {
    moved = false;
    for (const p of placed) {
      if (Math.abs(p.x - x) < LABEL_W && Math.abs(p.y - y) < LABEL_H) {
        y = p.y - LABEL_H; // 上へ退避
        moved = true;
      }
    }
  }
  return y;
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
