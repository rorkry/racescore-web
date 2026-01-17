'use client';

import { useState, useEffect } from 'react';
import { useSession } from './Providers';

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
  const [activeTab, setActiveTab] = useState<'favorite' | 'memo'>('favorite');

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
        const favorite = data.favorites?.find((f: { horse_name: string; note?: string }) => f.horse_name === horseName);
        if (favorite) {
          setIsFavorite(true);
          // favorite_horsesのnoteからメモを取得
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
    } catch {
      console.error('Failed to check favorite status');
    }
  };

  const toggleFavorite = async () => {
    if (status !== 'authenticated') {
      setMessage('ログインが必要です');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      if (isFavorite) {
        // 削除
        const res = await fetch('/api/user/favorites', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ horseName })
        });
        if (res.ok) {
          setIsFavorite(false);
          setMessage('お気に入りから削除しました');
          onFavoriteChange?.();
        }
      } else {
        // 追加
        const res = await fetch('/api/user/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ horseName, notifyOnRace: true })
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

    // お気に入りに登録されていない場合は先に登録
    if (!isFavorite) {
      setMessage('先にお気に入りに登録してください');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      // favorite_horsesのnoteを更新
      const res = await fetch('/api/user/favorites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horseName, note: memo.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setExistingMemo(memo.trim());
        setMessage('メモを保存しました！');
      } else {
        setMessage(data.error || '保存に失敗しました');
      }
    } catch {
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
        <div className="bg-green-800 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🐴</span>
              <div>
                <h2 className="text-lg font-bold text-white">{horseName}</h2>
                <p className="text-green-200 text-sm">{horseNumber}番</p>
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

        {/* タブ */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('favorite')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'favorite'
                ? 'text-green-700 border-b-2 border-green-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ⭐ お気に入り
          </button>
          <button
            onClick={() => setActiveTab('memo')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'memo'
                ? 'text-green-700 border-b-2 border-green-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📝 メモ
          </button>
        </div>

        <div className="p-5">
          {status !== 'authenticated' ? (
            <div className="text-center py-4 text-gray-500">
              <span className="text-3xl">🔐</span>
              <p className="mt-2">ログインが必要です</p>
            </div>
          ) : activeTab === 'favorite' ? (
            /* お気に入りタブ */
            <div className="space-y-4">
              <div className="text-center">
                <button
                  onClick={toggleFavorite}
                  disabled={saving}
                  className={`size-20 rounded-full flex items-center justify-center mx-auto transition-all ${
                    isFavorite
                      ? 'bg-yellow-100 text-yellow-500 hover:bg-yellow-200'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  } ${saving ? 'opacity-50' : ''}`}
                >
                  <span className="text-4xl">{isFavorite ? '⭐' : '☆'}</span>
                </button>
                <p className="mt-3 text-sm text-gray-600">
                  {isFavorite ? 'お気に入り登録済み' : 'タップでお気に入りに追加'}
                </p>
              </div>

              {isFavorite && (
                <div className="bg-green-50 rounded-lg p-3 text-sm text-green-700">
                  <p>🔔 この馬が出走するレースがあればお知らせします</p>
                </div>
              )}
            </div>
          ) : (
            /* メモタブ */
            <div className="space-y-4">
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value.slice(0, 200))}
                placeholder="この馬についてメモ..."
                className="w-full h-32 p-3 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                disabled={saving}
              />
              <div className="flex items-center justify-between">
                <span className={`text-xs ${memo.length >= 200 ? 'text-red-500' : 'text-gray-400'}`}>
                  {memo.length}/200
                </span>
                <button
                  onClick={saveMemo}
                  disabled={saving || !memo.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
              
              {existingMemo && existingMemo !== memo && (
                <p className="text-xs text-gray-400">
                  ※ 保存済みのメモがあります
                </p>
              )}
            </div>
          )}

          {message && (
            <div className={`mt-4 p-3 rounded-lg text-sm text-center ${
              message.includes('エラー') || message.includes('失敗') || message.includes('必要')
                ? 'bg-red-50 text-red-700'
                : 'bg-green-50 text-green-700'
            }`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
