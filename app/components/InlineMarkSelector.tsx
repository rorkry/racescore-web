'use client';

import { useState, useRef, useEffect } from 'react';

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
  const containerRef = useRef<HTMLDivElement>(null);

  // 外側クリック/タップで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const currentMarkInfo = MARKS.find(m => m.mark === currentMark);

  const handleSelect = (mark: MarkType) => {
    onMarkChange(mark);
    setIsOpen(false);
  };

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
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          ${compact ? 'size-6 text-sm' : 'size-8 text-lg'}
          flex items-center justify-center font-bold rounded
          transition-all active:scale-95
          ${currentMark 
            ? 'text-slate-700 bg-slate-200' 
            : 'text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200'
          }
        `}
        title={currentMarkInfo ? currentMarkInfo.label : '印を付ける'}
      >
        {currentMark || '＋'}
      </button>

      {/* ドロップダウン：横長 */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-xl border border-slate-300 p-2 flex items-center gap-1 whitespace-nowrap">
          {MARKS.map(({ mark, label }) => (
            <button
              key={mark}
              onClick={() => handleSelect(mark)}
              className={`
                size-8 flex items-center justify-center font-bold text-base rounded
                transition-all active:scale-95 hover:bg-slate-100
                ${mark === currentMark ? 'ring-2 ring-slate-500 bg-slate-200' : 'text-slate-700'}
              `}
              title={label}
            >
              {mark}
            </button>
          ))}
          {/* クリアボタン（テキスト） */}
          <button
            onClick={() => handleSelect(null)}
            className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
            title="無印に戻す"
          >
            クリア
          </button>
        </div>
      )}
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
