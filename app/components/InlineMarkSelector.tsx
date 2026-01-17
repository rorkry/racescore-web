'use client';

import { useState, useRef, useEffect } from 'react';

// 印の種類と色（7種類）
const MARKS = [
  { mark: '◎', label: '本命', color: 'text-red-500', bgColor: 'bg-red-500' },
  { mark: '○', label: '対抗', color: 'text-blue-500', bgColor: 'bg-blue-500' },
  { mark: '▲', label: '単穴', color: 'text-green-500', bgColor: 'bg-green-500' },
  { mark: '△', label: '連下', color: 'text-yellow-500', bgColor: 'bg-yellow-500' },
  { mark: '☆', label: '穴', color: 'text-purple-500', bgColor: 'bg-purple-500' },
  { mark: '紐', label: '紐', color: 'text-cyan-500', bgColor: 'bg-cyan-500' },
  { mark: '消', label: '消し', color: 'text-gray-400', bgColor: 'bg-gray-400' },
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

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const currentMarkInfo = MARKS.find(m => m.mark === currentMark);

  const handleSelect = (mark: MarkType) => {
    // 同じ印をクリックしたらクリア
    onMarkChange(mark === currentMark ? null : mark);
    setIsOpen(false);
  };

  if (disabled) {
    // 確定済みレースの場合は表示のみ
    return (
      <div className={`
        ${compact ? 'size-6 text-sm' : 'size-8 text-lg'}
        flex items-center justify-center font-bold
        ${currentMarkInfo ? currentMarkInfo.color : 'text-gray-600'}
      `}>
        {currentMark || '-'}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* 現在の印表示 / クリックで開く */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          ${compact ? 'size-6 text-sm' : 'size-8 text-lg'}
          flex items-center justify-center font-bold rounded
          transition-all hover:scale-110
          ${currentMarkInfo 
            ? `${currentMarkInfo.color} bg-white/10` 
            : 'text-gray-500 hover:text-gray-300 bg-gray-800/50'
          }
        `}
        title={currentMarkInfo ? currentMarkInfo.label : '印を付ける'}
      >
        {currentMark || '＋'}
      </button>

      {/* ドロップダウン */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 rounded-lg shadow-xl border border-gray-700 p-1.5 flex flex-wrap gap-1 max-w-[200px]">
          {MARKS.map(({ mark, label, color }) => (
            <button
              key={mark}
              onClick={() => handleSelect(mark)}
              className={`
                size-7 flex items-center justify-center font-bold text-base rounded
                transition-all hover:scale-110
                ${mark === currentMark ? 'ring-2 ring-white' : ''}
                ${color} hover:bg-white/20
              `}
              title={label}
            >
              {mark}
            </button>
          ))}
          {/* 無印に戻すボタン */}
          {currentMark && (
            <button
              onClick={() => handleSelect(null)}
              className="size-7 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded font-bold text-lg"
              title="無印に戻す"
            >
              -
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// マークの色情報を取得するヘルパー
export function getMarkColor(mark: MarkType): string {
  const info = MARKS.find(m => m.mark === mark);
  return info ? info.color : 'text-gray-500';
}

export function getMarkBgColor(mark: MarkType): string {
  const info = MARKS.find(m => m.mark === mark);
  return info ? info.bgColor : 'bg-gray-500';
}

export type { MarkType };
