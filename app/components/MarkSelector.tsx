'use client';

import { useState } from 'react';

const MARKS = [
  { value: '◎', label: '本命', color: 'text-red-500' },
  { value: '○', label: '対抗', color: 'text-blue-500' },
  { value: '▲', label: '単穴', color: 'text-green-500' },
  { value: '△', label: '連下', color: 'text-yellow-500' },
  { value: '☆', label: '穴', color: 'text-purple-500' },
  { value: '×', label: '消し', color: 'text-gray-400' },
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

  const handleSelect = (mark: string) => {
    if (mark === currentMark) {
      onSelect(null); // 同じ印をクリックしたら解除
    } else {
      onSelect(mark);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          ${compact ? 'size-7 text-sm' : 'size-8 text-lg'}
          flex items-center justify-center rounded-lg border transition-all
          ${currentMark 
            ? `${currentMarkData?.color} bg-white border-current font-bold` 
            : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200'
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
          <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[140px]">
            <div className="grid grid-cols-3 gap-1">
              {MARKS.map((mark) => (
                <button
                  key={mark.value}
                  onClick={() => handleSelect(mark.value)}
                  className={`
                    size-10 flex items-center justify-center rounded-lg text-xl font-bold transition-all
                    ${currentMark === mark.value 
                      ? `${mark.color} bg-gray-100 ring-2 ring-current` 
                      : `${mark.color} hover:bg-gray-50`
                    }
                  `}
                  title={mark.label}
                >
                  {mark.value}
                </button>
              ))}
            </div>
            {currentMark && (
              <button
                onClick={() => handleSelect(currentMark)}
                className="w-full mt-2 py-1.5 text-xs text-gray-500 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              >
                印を消す
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
