import { useEffect } from 'react';

/**
 * モーダル・オーバーレイ表示中に iOS Safari を含むモバイルで
 * 背景コンテンツがスクロールしないようにする共通フック。
 *
 * 使い方: コンポーネントのトップレベルで呼ぶだけ。
 * アンマウント時に自動復元される。
 *
 * refcount 方式: 複数のモーダルが同時に本フックを使っても、
 * body への style 適用は最初の 1 回のみ、復元は最後の 1 回のみ。
 * これにより「子モーダルが閉じたとき body が復元されて親モーダル下がスクロール可能になる」
 * 「scrollY の復元位置がズレる」といったネスト時バグを防ぐ。
 */

let lockCount = 0;
let savedScrollY = 0;
let savedStyles: {
  overflow: string;
  position: string;
  top: string;
  width: string;
} | null = null;

function applyLock() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    savedStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.width = '100%';
  }
  lockCount += 1;
}

function releaseLock() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (lockCount <= 0) return;
  lockCount -= 1;
  if (lockCount === 0 && savedStyles) {
    document.body.style.overflow = savedStyles.overflow;
    document.body.style.position = savedStyles.position;
    document.body.style.top = savedStyles.top;
    document.body.style.width = savedStyles.width;
    window.scrollTo(0, savedScrollY);
    savedStyles = null;
  }
}

export function useBodyScrollLock() {
  useEffect(() => {
    applyLock();
    return () => {
      releaseLock();
    };
  }, []);
}
