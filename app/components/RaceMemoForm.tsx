'use client';

import { useState, useEffect } from 'react';
import { useSession } from './Providers';

interface RaceMemoFormProps {
  raceKey: string;  // 例: "0112_中山_1"
  raceTitle: string;  // 例: "中山 1R 未勝利"
  onSaved?: () => void;
}

export default function RaceMemoForm({ raceKey, raceTitle, onSaved }: RaceMemoFormProps) {
  const { status } = useSession();
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [existingMemo, setExistingMemo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 既存のメモを取得
  useEffect(() => {
    if (status === 'authenticated' && raceKey) {
      fetchExistingMemo();
    } else {
      setLoading(false);
    }
  }, [status, raceKey]);

  const fetchExistingMemo = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/race-memos?raceKey=${encodeURIComponent(raceKey)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.memos && data.memos.length > 0) {
          setMemo(data.memos[0].memo || '');
          setExistingMemo(data.memos[0].id);
        }
      }
    } catch {
      console.error('Failed to fetch race memo');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (status !== 'authenticated') {
      setMessage('ログインが必要です');
      return;
    }

    setSaving(true);
    setMessage('');
    
    try {
      const res = await fetch('/api/user/race-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raceKey, memo })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.deleted) {
          setExistingMemo(null);
          setMessage('削除しました！');
        } else {
          setExistingMemo(data.id);
          setMessage(data.updated ? '更新しました！' : '保存しました！');
        }
        setTimeout(() => {
          onSaved?.();
        }, 800);
      } else {
        const data = await res.json();
        setMessage(data.error || '保存に失敗しました');
      }
    } catch {
      setMessage('エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  if (status !== 'authenticated') {
    return (
      <div className="text-center py-6 text-gray-500">
        <span className="text-3xl">🔐</span>
        <p className="mt-2">レースメモを保存するにはログインが必要です</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-6">
        <div className="inline-block size-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-2 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー情報 */}
      <div className="bg-slate-100 rounded-lg p-3 flex items-center justify-between">
        <div>
          <span className="text-lg font-bold text-slate-800">{raceTitle}</span>
        </div>
        {existingMemo && (
          <span className="text-xs text-slate-600 bg-slate-200 px-2 py-1 rounded">
            ✓ 保存済み
          </span>
        )}
      </div>

      {/* メモ入力 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">レースメモ</label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value.slice(0, 500))}
          placeholder="このレースの気づき、展開予想、気になる馬など..."
          className="w-full h-32 p-3 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-gray-900"
          style={{ fontSize: '16px' }}
        />
        <p className="text-xs text-gray-400 mt-1">{memo.length}/500</p>
      </div>

      {/* メッセージ */}
      {message && (
        <div className={`p-3 rounded-lg text-sm text-center ${
          message.includes('エラー') || message.includes('失敗') || message.includes('必要')
            ? 'bg-red-50 text-red-700'
            : 'bg-slate-100 text-slate-700'
        }`}>
          {message}
        </div>
      )}

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {saving ? '保存中...' : existingMemo ? (memo ? '更新する' : '削除する') : '保存する'}
      </button>

      <p className="text-xs text-gray-400 text-center text-pretty">
        このレース専用のメモです。過去走で再訪問した時に確認できます。
      </p>
    </div>
  );
}
