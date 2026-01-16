'use client';

import { useState, useRef, useEffect } from 'react';

interface InlineMemoProps {
  currentMemo?: string;
  onSave: (memo: string) => void;
  onDelete?: () => void;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
}

export default function InlineMemo({ 
  currentMemo, 
  onSave, 
  onDelete,
  maxLength = 200, 
  placeholder = 'メモを入力...',
  disabled 
}: InlineMemoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [memo, setMemo] = useState(currentMemo || '');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setMemo(currentMemo || '');
  }, [currentMemo]);

  const handleSave = async () => {
    if (!memo.trim()) return;
    setSaving(true);
    try {
      await onSave(memo.trim());
      setIsOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (onDelete) {
      setSaving(true);
      try {
        await onDelete();
        setMemo('');
        setIsOpen(false);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      setMemo(currentMemo || '');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          size-7 flex items-center justify-center rounded-lg border transition-all text-sm
          ${currentMemo 
            ? 'bg-yellow-100 border-yellow-400 text-yellow-700' 
            : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        title={currentMemo ? 'メモを編集' : 'メモを追加'}
      >
        📝
      </button>

      {isOpen && !disabled && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-black/20" 
            onClick={() => {
              setIsOpen(false);
              setMemo(currentMemo || '');
            }} 
          />
          <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-72">
            <textarea
              ref={textareaRef}
              value={memo}
              onChange={(e) => setMemo(e.target.value.slice(0, maxLength))}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full h-24 p-2 text-sm border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
              disabled={saving}
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${memo.length >= maxLength ? 'text-red-500' : 'text-gray-400'}`}>
                {memo.length}/{maxLength}
                {memo.length >= maxLength && ' (上限)'}
              </span>
              <div className="flex gap-2">
                {currentMemo && onDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                  >
                    削除
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setMemo(currentMemo || '');
                  }}
                  disabled={saving}
                  className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !memo.trim()}
                  className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Ctrl+Enterで保存 / Escでキャンセル</p>
          </div>
        </>
      )}
    </div>
  );
}
