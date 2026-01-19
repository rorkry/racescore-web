'use client';

import { useState } from 'react';

// 印の順序（スマホでこの順にサイクル）
const MARK_ORDER = ['◎', '○', '▲', '☆', '△', '紐', '消', null] as const;

const MARKS = [
  { value: '◎', label: '本命' },
  { value: '○', label: '対抗' },
  { value: '▲', label: '単穴' },
  { value: '☆', label: '穴' },
  { value: '△', label: '連下' },
  { value: '紐', label: '紐' },
  { value: '消', label: '消し' },
];

interface MarkSelectorProps {
  currentMark?: string;
  onSelect: (mark: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function MarkSelector({ currentMark, onSelect, disabled, compact }: MarkSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const currentMarkData = MARKS.find(m => m.value === currentMark);

  const handleSelect = (mark: string | null) => {
    onSelect(mark);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          ${compact ? 'size-7 text-sm' : 'size-8 text-lg'}
          flex items-center justify-center rounded-lg border transition-all font-bold
          ${currentMark 
            ? 'text-slate-700 bg-slate-200 border-slate-300' 
            : 'bg-slate-100 border-slate-300 text-slate-400 hover:bg-slate-200'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        title={currentMarkData?.label || '印をつける'}
      >
        {currentMark || '印'}
      </button>

      {isOpen && !disabled && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          {/* 横長レイアウト */}
          <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-xl border border-slate-300 p-2 flex items-center gap-1 whitespace-nowrap">
            {MARKS.map((mark) => (
              <button
                key={mark.value}
                onClick={() => handleSelect(mark.value)}
                className={`
                  size-8 flex items-center justify-center rounded text-base font-bold transition-all hover:scale-110 hover:bg-slate-100
                  ${currentMark === mark.value 
                    ? 'ring-2 ring-slate-500 bg-slate-200 text-slate-700' 
                    : 'text-slate-700'
                  }
                `}
                title={mark.label}
              >
                {mark.value}
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
        </>
      )}
    </div>
  );
}
