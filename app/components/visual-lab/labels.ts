/**
 * スクリーン空間ラベル管理（Phase 7 の識別方式比較用）
 *
 * 文献ベースの原則を最小実装:
 *  - screen-space で配置（探索が速い / 衝突判定が容易）
 *  - priority selection（選択馬 > 先頭 > その他）
 *  - occupancy（矩形の重なりを貪欲に解消：縦方向へ押し出し）
 *  - temporal hysteresis（表示/非表示のバタつき防止：連続フレームで状態固定）
 *
 * 参考:
 *  Vaaraniemi et al. 2012 (Temporally Coherent Real-Time Labeling)
 *  Been et al. 2006 (dynamic map labeling desiderata: no flicker / no jump)
 *  External Labeling Survey (arXiv:1902.01454)
 */
import * as THREE from 'three';

export interface LabelInput {
  id: number;
  world: THREE.Vector3;
  text: string;
  color: string;      // 枠色（背景）
  textColor: string;  // 文字色
  priority: number;   // 高いほど優先（選択=100, 先頭=50, 通常=距離ベース）
  forceShow?: boolean;
}

export interface LabelOut {
  id: number;
  x: number; y: number;
  text: string; color: string; textColor: string;
  visible: boolean;
  emphasized: boolean;
}

const LABEL_W = 26;
const LABEL_H = 20;

export class LabelManager {
  private shownSince = new Map<number, number>();
  private hiddenSince = new Map<number, number>();
  private lastY = new Map<number, number>();
  hysteresis = true;

  /** 1フレーム分のラベル配置を計算 */
  layout(
    inputs: LabelInput[],
    camera: THREE.Camera,
    width: number,
    height: number,
    maxVisible: number,
    now: number,
  ): LabelOut[] {
    const projected: { in: LabelInput; x: number; y: number; onScreen: boolean }[] = [];
    const v = new THREE.Vector3();
    for (const inp of inputs) {
      v.copy(inp.world).project(camera);
      const onScreen = v.z < 1 && v.x >= -1.05 && v.x <= 1.05 && v.y >= -1.05 && v.y <= 1.05;
      projected.push({
        in: inp,
        x: (v.x * 0.5 + 0.5) * width,
        y: (-v.y * 0.5 + 0.5) * height,
        onScreen,
      });
    }

    // 優先度順（forceShow/priority）
    projected.sort((a, b) => (b.in.forceShow ? 1e6 : b.in.priority) - (a.in.forceShow ? 1e6 : a.in.priority));

    const placed: { x: number; y: number }[] = [];
    const out: LabelOut[] = [];
    let visibleCount = 0;

    for (const p of projected) {
      const wantShow = p.onScreen && (p.in.forceShow || visibleCount < maxVisible);
      let y = p.y;

      if (wantShow) {
        // occupancy: 既存ラベルと重なるなら上方向へ押し出す
        y = resolveOverlap(p.x, y, placed);
        // 縦の急な飛びを抑える（連続性）
        const prevY = this.lastY.get(p.in.id);
        if (prevY !== undefined) y = prevY + (y - prevY) * 0.45;
        placed.push({ x: p.x, y });
        this.lastY.set(p.in.id, y);
      }

      const visible = this.applyHysteresis(p.in.id, wantShow, now, !!p.in.forceShow);
      if (visible) visibleCount++;

      out.push({
        id: p.in.id,
        x: p.x, y,
        text: p.in.text,
        color: p.in.color,
        textColor: p.in.textColor,
        visible,
        emphasized: p.in.priority >= 100,
      });
    }
    return out;
  }

  private applyHysteresis(id: number, want: boolean, now: number, force: boolean): boolean {
    if (force) return true;
    if (!this.hysteresis) return want;
    // 表示化: 100ms 連続で want=true / 非表示化: 250ms 連続で want=false
    if (want) {
      this.hiddenSince.delete(id);
      const since = this.shownSince.get(id);
      if (since === undefined) { this.shownSince.set(id, now); return false; }
      return now - since >= 100;
    } else {
      this.shownSince.delete(id);
      const since = this.hiddenSince.get(id);
      if (since === undefined) { this.hiddenSince.set(id, now); return true; }
      return !(now - since >= 250);
    }
  }

  reset() {
    this.shownSince.clear();
    this.hiddenSince.clear();
    this.lastY.clear();
  }
}

function resolveOverlap(x: number, y: number, placed: { x: number; y: number }[]): number {
  let moved = true;
  let guard = 0;
  while (moved && guard++ < 40) {
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
