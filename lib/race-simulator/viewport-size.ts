/**
 * 3D viewport（RaceSimulator3DProto の containerRef）のサイズ計算ロジック（純粋関数）。
 *
 * 目的:
 * - スマホでも 3D 表示そのものは常に横長（既定 16:9）にする。CSS 側（aspect-video /
 *   md:aspect-auto md:h-[600px]）が表示サイズの正本であり、ここでは
 *   「renderer / camera をその実測サイズへ正しく追従させる」計算だけを扱う。
 * - tracking panel（PC=absolute overlay / mobile=viewport 外側の兄弟要素）の高さは、
 *   この計算に一切関与しない（意図的に引数を持たない）。
 */

import type * as THREE from 'three';

/** スマホ側の既定アスペクト比（横長 16:9）。 */
export const MOBILE_VIEWPORT_ASPECT = 16 / 9;

export interface ViewportBoxSize {
  width: number;
  height: number;
  aspect: number;
}

/**
 * スマホ想定: コンテナ幅から、既定アスペクト比（16:9）に基づく viewport サイズを算出する。
 * width はそのまま返す（= 親要素の実測幅にのみ従う。overflow-x を出さない）。
 * height は width から算出する（viewport 高さで width を決めない = 縦長化を防ぐ）。
 */
export function computeMobileViewportSize(
  containerWidth: number,
  aspect: number = MOBILE_VIEWPORT_ASPECT,
): ViewportBoxSize | null {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return null;
  if (!Number.isFinite(aspect) || aspect <= 0) return null;
  const height = containerWidth / aspect;
  return { width: containerWidth, height, aspect: containerWidth / height };
}

/**
 * renderer.setSize に渡す内部解像度を、コンテナの実測 width/height から決定する。
 * 不正値（<=0 / NaN）の場合は null を返し、呼び出し側は前回サイズを維持する（黒画面・warp防止）。
 */
export function computeRendererSize(containerWidth: number, containerHeight: number): ViewportBoxSize | null {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return null;
  if (!Number.isFinite(containerHeight) || containerHeight <= 0) return null;
  return { width: containerWidth, height: containerHeight, aspect: containerWidth / containerHeight };
}

/** camera.aspect をコンテナ実測サイズへ同期する（resize / orientationchange 後の再計算用）。 */
export function applyViewportSizeToCamera(
  camera: Pick<THREE.PerspectiveCamera, 'aspect' | 'updateProjectionMatrix'>,
  width: number,
  height: number,
): boolean {
  const size = computeRendererSize(width, height);
  if (!size) return false;
  camera.aspect = size.aspect;
  camera.updateProjectionMatrix();
  return true;
}
