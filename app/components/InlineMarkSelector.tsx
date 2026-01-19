'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// 印の種類（色は統一：黒っぽいグレー）
const MARKS = [
  { mark: '◎', label: '本命' },
  { mark: '○', label: '対抗' },
  { mark: '▲', label: '単穴' },
  { mark: '☆', label: '穴' },
  { mark: '△', label: '連下' },
  { mark: '紐', label: '紐' },
  { mark: '消', label: '消し' },
] as const;

type MarkType = '◎' | '○' | '▲' | '△' | '☆' | '紐' | '消' | null;

interface InlineMarkSelectorProps {
  currentMark: MarkType;
  onMarkChange: (mark: MarkType) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function InlineMarkSelector({ 
  currentMark, 
  onMarkChange, 
  disabled = false,
  compact = false 
}: InlineMarkSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 外側クリック/タップで閉じる（遅延登録でタップ直後の誤閉じを防ぐ）
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    // 少し遅らせて登録（タップ直後の誤閉じ防止）
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchend', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchend', handleClickOutside);
    };
  }, [isOpen]);

  const currentMarkInfo = MARKS.find(m => m.mark === currentMark);

  // タップ/クリックで開閉
  const handleToggle = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 開く前に位置を計算
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      // 下の余白が60px未満なら上に開く
      setOpenUpward(spaceBelow < 60);
    }
    
    setIsOpen(prev => !prev);
  }, [isOpen]);

  // 印を選択
  const handleSelect = useCallback((mark: MarkType, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onMarkChange(mark);
    setIsOpen(false);
  }, [onMarkChange]);

  if (disabled) {
    // 確定済みレースの場合は表示のみ
    return (
      <div className={`
        ${compact ? 'size-6 text-sm' : 'size-8 text-lg'}
        flex items-center justify-center font-bold text-slate-600
      `}>
        {currentMark || '-'}
      </div>
    );
  }

  // ドロップダウン選択（スマホ・PC共通）
  return (
    <div ref={containerRef} className="relative">
      {/* 現在の印表示 / クリック/タップで開く */}
      <motion.button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        onTouchEnd={handleToggle}
        className={`
          ${compact ? 'size-6 text-sm' : 'size-8 text-lg'}
          flex items-center justify-center font-bold rounded
          touch-manipulation
          ${currentMark 
            ? 'text-slate-700 bg-slate-200' 
            : 'text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200'
          }
        `}
        title={currentMarkInfo ? currentMarkInfo.label : '印を付ける'}
        // アニメーション: タップ時に縮小、印が変わった時にポップ
        whileTap={{ scale: 0.85 }}
        animate={currentMark ? {
          scale: [1, 1.2, 1],
          rotate: [0, -5, 5, 0],
        } : {}}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {currentMark || '＋'}
      </motion.button>

      {/* ドロップダウン：横長、位置は動的に上下切り替え */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className={`absolute left-0 z-[100] bg-white rounded-lg shadow-xl border border-slate-300 p-2 flex items-center gap-1 whitespace-nowrap ${
              openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
            onClick={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            // アニメーション: フェードイン・スケール
            initial={{ opacity: 0, scale: 0.9, y: openUpward ? 5 : -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: openUpward ? 5 : -5 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {MARKS.map(({ mark, label }) => (
              <motion.button
                type="button"
                key={mark}
                onClick={(e) => handleSelect(mark, e)}
                onTouchEnd={(e) => handleSelect(mark, e)}
                className={`
                  size-8 flex items-center justify-center font-bold text-base rounded
                  touch-manipulation
                  ${mark === currentMark ? 'ring-2 ring-slate-500 bg-slate-200' : 'text-slate-700 hover:bg-slate-100'}
                `}
                title={label}
                // アニメーション: タップ時に縮小
                whileTap={{ scale: 0.85 }}
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.15 }}
              >
                {mark}
              </motion.button>
            ))}
            {/* クリアボタン */}
            <motion.button
              type="button"
              onClick={(e) => handleSelect(null, e)}
              onTouchEnd={(e) => handleSelect(null, e)}
              className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded touch-manipulation"
              title="無印に戻す"
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.15 }}
            >
              クリア
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// マークの色情報を取得するヘルパー（統一色）
export function getMarkColor(mark: MarkType): string {
  return mark ? 'text-slate-700' : 'text-slate-400';
}

export function getMarkBgColor(mark: MarkType): string {
  return mark ? 'bg-slate-200' : 'bg-slate-100';
}

export type { MarkType };
