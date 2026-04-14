import { useEffect } from 'react';

/**
 * モーダル・オーバーレイ表示中に iOS Safari を含むモバイルで
 * 背景コンテンツがスクロールしないようにする共通フック。
 *
 * 使い方: コンポーネントのトップレベルで呼ぶだけ。
 * アンマウント時に自動復元される。
 */
export function useBodyScrollLock() {
  useEffect(() => {
    const scrollY = window.scrollY;
    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);
}
