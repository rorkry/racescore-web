/**
 * horse-labels（本番 頭上ラベルの screen-space 配置 / 純粋ロジック）
 *
 * 新仕様（ユーザー承認済み・Visual Lab A 忠実移植）:
 *  - 頭上ラベルは「選択馬 / hover 馬 / （必要なら）先頭馬」だけを出す。全頭表示はしない。
 *  - ラベルは対象馬の真上（アンカー）に固定する。動的スロット・横展開・縦積みはしない。
 *  - leader line は引かない。
 *  - 低優先ラベルがアンカーで重なった場合は「動かさず、低優先を隠す」。
 *  - 選択馬（forceShow）は重なっても必ず表示する。
 *  - 一度の表示/非表示は hysteresis でわずかに安定させる（ちらつき防止）。
 *  - 全頭の識別は画面端のトラッキングパネルが保証する（このモジュールは補助）。
 *
 * THREE への依存は投影のための project 関数型のみで、DOM には触れない（テスト可能）。
 */

export interface LabelProjector {
  /** world(x,y,z) を NDC へ。z<1 で前方。 */
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
  x: number; y: number;     // ラベル描画位置(px)。アンカー真上に固定。
  text: string; color: string; textColor: string;
  visible: boolean;
  emphasized: boolean;
}

export interface LayoutConfig {
  width: number;
  height: number;
  now: number;              // performance.now() 相当（ms）
  hysteresis?: boolean;
}

const LABEL_W = 26;   // 重なり判定の箱（幅）
const LABEL_H = 20;   // 重なり判定の箱（高さ）

function boxesOverlap(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) < LABEL_W && Math.abs(ay - by) < LABEL_H;
}

export class HorseLabelManager {
  private shownSince = new Map<number, number>();
  private hiddenSince = new Map<number, number>();

  reset() {
    this.shownSince.clear();
    this.hiddenSince.clear();
  }

  /** レース切替時: ヒステリシス状態を破棄（前レースを引きずらない）。 */
  clearForRaceSwitch() {
    this.reset();
  }

  /**
   * ラベルを配置する。アンカー真上に固定し、重なった低優先ラベルは隠す。
   * inputs は「選択/hover/先頭のみ」を想定（呼び出し側で絞る）。
   */
  layout(inputs: LabelInput[], projector: LabelProjector, cfg: LayoutConfig): LabelOut[] {
    const { width, height, now } = cfg;
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

    // 優先度順（forceShow を最優先）に確定していく
    projected.sort(
      (a, b) => (b.in.forceShow ? 1e9 : b.in.priority) - (a.in.forceShow ? 1e9 : a.in.priority),
    );

    const placed: { x: number; y: number }[] = [];
    const out: LabelOut[] = [];

    for (const p of projected) {
      const id = p.in.id;
      // 真上固定。重なり時は「動かさず隠す」（forceShow は重なっても表示）。
      let wantShow = p.onScreen;
      if (wantShow && !p.in.forceShow) {
        for (const q of placed) {
          if (boxesOverlap(p.ax, p.ay, q.x, q.y)) { wantShow = false; break; }
        }
      }
      if (wantShow) placed.push({ x: p.ax, y: p.ay });

      const visible = this.applyHysteresis(id, wantShow, now, !!p.in.forceShow, useHysteresis);

      out.push({
        id,
        x: p.ax, y: p.ay,
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
 * この馬に頭上ラベルを出すか（新仕様: 選択 / hover /（任意で）先頭のみ）。
 * showLeader=false なら先頭馬は出さない。
 */
export function shouldLabelHorse(params: {
  horseNumber: number;
  selectedHorse: number | null;
  hoverHorse: number | null;
  leaderHorse: number | null;
  showLeader?: boolean;
}): boolean {
  const { horseNumber, selectedHorse, hoverHorse, leaderHorse, showLeader = true } = params;
  if (selectedHorse != null && horseNumber === selectedHorse) return true;
  if (hoverHorse != null && horseNumber === hoverHorse) return true;
  if (showLeader && leaderHorse != null && horseNumber === leaderHorse) return true;
  return false;
}

/**
 * ラベル入力の優先度規則（1 か所に集約）。
 * selected=必ず表示 / hover=高 / leader=中。
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
  return { priority: 10, forceShow: false };
}
