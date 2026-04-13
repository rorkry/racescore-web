'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from './Providers';

interface RaceMemoPopupProps {
  raceKey: string; // 例: "2026-01-17_中山_8R"
  raceName: string;
  onClose: () => void;
}

export default function RaceMemoPopup({ raceKey, raceName, onClose }: RaceMemoPopupProps) {
  const { status } = useSession();
  const [memo, setMemo] = useState('');
  const [originalMemo, setOriginalMemo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const popupRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const MAX_LENGTH = 500;

  useEffect(() => {
    if (status === 'authenticated') {
      fetchMemo();
    } else {
      setLoading(false);
    }
  }, [status, raceKey]);

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [onClose]);

  // Escapeキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const fetchMemo = async () => {
    try {
      const res = await fetch(`/api/user/race-memos?raceKey=${encodeURIComponent(raceKey)}`);
      if (res.ok) {
        const data = await res.json();
        const existingMemo = data.memos?.[0]?.memo || '';
        setMemo(existingMemo);
        setOriginalMemo(existingMemo);
      }
    } catch {
      console.error('Failed to fetch memo');
    } finally {
      setLoading(false);
      // フォーカスを当てる
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const handleSave = async () => {
    if (memo === originalMemo) {
      onClose();
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/user/race-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raceKey, memo: memo.trim() }),
      });

      if (res.ok) {
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || '保存に失敗しました');
      }
    } catch {
      setError('エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  // Ctrl+Enter で保存
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  if (status !== 'authenticated') {
    return (
      <div 
        ref={popupRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      >
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
          <p className="text-center text-gray-600">
            メモを保存するにはログインしてください
          </p>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-gray-200 rounded-lg font-medium"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div 
        ref={popupRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <span>📝</span> レースメモ
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>

        {/* レース名 */}
        <div className="px-4 py-2 bg-gray-50 text-sm text-gray-600">
          {raceName}
        </div>

        {/* メモ入力 */}
        <div className="flex-1 p-4 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="レースの回顧や予想メモを入力...&#10;&#10;例：&#10;・逃げ馬有利の展開になりそう&#10;・外枠不利のコース&#10;・穴馬に注目"
                className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-800"
                style={{ fontSize: '16px' }}
                maxLength={MAX_LENGTH}
              />
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                <span>Ctrl+Enter で保存</span>
                <span className={memo.length > MAX_LENGTH * 0.9 ? 'text-orange-500' : ''}>
                  {memo.length}/{MAX_LENGTH}
                </span>
              </div>
              {error && (
                <p className="text-red-500 text-sm mt-2">{error}</p>
              )}
            </>
          )}
        </div>

        {/* フッター */}
        <div className="flex gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
