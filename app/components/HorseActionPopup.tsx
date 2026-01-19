'use client';

import { useState, useEffect } from 'react';
import { useSession } from './Providers';
import { normalizeHorseName } from '@/utils/normalize-horse-name';

interface HorseActionPopupProps {
  horseName: string;
  horseNumber: string;
  raceKey: string;
  isOpen: boolean;
  onClose: () => void;
  onFavoriteChange?: () => void;
}

export default function HorseActionPopup({ 
  horseName, 
  horseNumber, 
  raceKey, 
  isOpen, 
  onClose,
  onFavoriteChange
}: HorseActionPopupProps) {
  const { status } = useSession();
  const [isFavorite, setIsFavorite] = useState(false);
  const [memo, setMemo] = useState('');
  const [existingMemo, setExistingMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOpen && status === 'authenticated') {
      checkFavoriteStatusAndMemo();
    }
  }, [isOpen, status, horseName]);

  const checkFavoriteStatusAndMemo = async () => {
    try {
      const res = await fetch('/api/user/favorites');
      if (res.ok) {
        const data = await res.json();
        const normalizedName = normalizeHorseName(horseName);
        const favorite = data.favorites?.find((f: { horse_name: string; note?: string }) => normalizeHorseName(f.horse_name) === normalizedName);
        if (favorite) {
          setIsFavorite(true);
          if (favorite.note) {
            setExistingMemo(favorite.note);
            setMemo(favorite.note);
          } else {
            setExistingMemo('');
            setMemo('');
          }
        } else {
          setIsFavorite(false);
          setExistingMemo('');
          setMemo('');
        }
      }
    } catch (err) {
      console.error('Failed to check favorite status:', err);
    }
  };

  const toggleFavorite = async () => {
    if (status !== 'authenticated') {
      setMessage('ログインが必要です');
      return;
    }

    setSaving(true);
    setMessage('');
    const normalizedName = normalizeHorseName(horseName);
    try {
      if (isFavorite) {
        const res = await fetch('/api/user/favorites', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ horseName: normalizedName })
        });
        if (res.ok) {
          setIsFavorite(false);
          setMemo('');
          setExistingMemo('');
          setMessage('お気に入りから削除しました');
          onFavoriteChange?.();
        }
      } else {
        const res = await fetch('/api/user/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ horseName: normalizedName, notifyOnRace: true })
        });
        const data = await res.json();
        if (res.ok) {
          setIsFavorite(true);
          setMessage('お気に入りに追加しました！');
          onFavoriteChange?.();
        } else {
          setMessage(data.error || '追加に失敗しました');
        }
      }
    } catch {
      setMessage('エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  const saveMemo = async () => {
    if (status !== 'authenticated') {
      setMessage('ログインが必要です');
      return;
    }

    if (!memo.trim()) {
      setMessage('メモを入力してください');
      return;
    }

    if (!isFavorite) {
      setMessage('先にお気に入りに登録してください');
      return;
    }

    setSaving(true);
    setMessage('');
    const normalizedName = normalizeHorseName(horseName);
    try {
      const res = await fetch('/api/user/favorites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horseName: normalizedName, note: memo.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setExistingMemo(memo.trim());
        setMessage('メモを保存しました！');
      } else {
        setMessage(data.error || '保存に失敗しました');
      }
    } catch (err) {
      console.error('[HorseActionPopup] Save error:', err);
      setMessage('エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-emerald-700 px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🐴</span>
              <div>
                <h2 className="text-base font-bold text-white">{normalizeHorseName(horseName)}</h2>
                <p className="text-emerald-200 text-xs">{horseNumber}番</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="size-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
              aria-label="閉じる"
            >
              <svg className="size-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4">
          {status !== 'authenticated' ? (
            <div className="text-center py-6 text-gray-500">
              <span className="text-3xl">🔐</span>
              <p className="mt-2">ログインが必要です</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* お気に入りセクション */}
              {isFavorite ? (
                <div className="space-y-2">
                  {/* 登録済み表示 */}
                  <div className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold bg-amber-100 text-amber-600 border-2 border-amber-300">
                    <span className="text-2xl">★</span>
                    <span>お気に入り登録済み</span>
                  </div>
                  {/* 削除ボタン */}
                  <button
                    onClick={toggleFavorite}
                    disabled={saving}
                    className={`w-full py-2 rounded-lg flex items-center justify-center gap-1.5 text-sm font-medium transition-all
                      bg-white text-red-500 border border-red-200 hover:bg-red-50 hover:border-red-300
                      ${saving ? 'opacity-50' : ''}`}
                  >
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>お気に入りから削除</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={toggleFavorite}
                  disabled={saving}
                  className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold transition-all
                    bg-slate-100 text-slate-500 border-2 border-slate-200 hover:bg-amber-50 hover:text-amber-500 hover:border-amber-200
                    ${saving ? 'opacity-50' : ''}`}
                >
                  <span className="text-2xl">☆</span>
                  <span>お気に入りに追加</span>
                </button>
              )}

              {/* メモ入力エリア */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600 flex items-center gap-1">
                  📝 メモ {!isFavorite && <span className="text-xs text-slate-400">（お気に入り登録後に保存可能）</span>}
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value.slice(0, 200))}
                  placeholder="この馬についてメモ..."
                  className={`w-full h-24 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-gray-900 text-sm ${
                    isFavorite ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'
                  }`}
                  disabled={saving || !isFavorite}
                />
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${memo.length >= 200 ? 'text-red-500' : 'text-slate-400'}`}>
                    {memo.length}/200
                  </span>
                  <button
                    onClick={saveMemo}
                    disabled={saving || !memo.trim() || !isFavorite}
                    className="px-4 py-1.5 bg-emerald-600 text-white text-sm rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>

              {/* 通知案内 */}
              {isFavorite && (
                <div className="bg-emerald-50 rounded-lg p-2.5 text-xs text-emerald-700 flex items-center gap-2">
                  <span>🔔</span>
                  <span>この馬が出走するレースがあればお知らせします</span>
                </div>
              )}
            </div>
          )}

          {/* メッセージ */}
          {message && (
            <div className={`mt-3 p-2.5 rounded-lg text-sm text-center ${
              message.includes('エラー') || message.includes('失敗') || message.includes('必要')
                ? 'bg-red-50 text-red-700'
                : 'bg-emerald-50 text-emerald-700'
            }`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
