'use client';

import { useState, useEffect } from 'react';
import { useSession } from './Providers';

interface BabaMemoFormProps {
  date: string;
  trackType: '芝' | 'ダート';  // レースのトラックタイプ
  place?: string;  // 競馬場名（参考情報として）
  onSaved?: () => void;
}

const POSITIONS = ['内有利', 'フラット', '外有利'];
const STYLES = ['前有利', 'フラット', '差し有利', '追込有利'];
const SPECIAL_NOTES = ['高速馬場', '荒れ馬場', 'ラップ優秀', '不利ありラップ', '時計かかる', '直線追い風', '直線向かい風', '強風'];

export default function BabaMemoForm({ date, trackType, place, onSaved }: BabaMemoFormProps) {
  const { status } = useSession();
  const [advantagePosition, setAdvantagePosition] = useState('フラット');
  const [advantageStyle, setAdvantageStyle] = useState('フラット');
  const [specialNotes, setSpecialNotes] = useState<string[]>([]);
  const [freeMemo, setFreeMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [existingMemo, setExistingMemo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 既存のメモを取得
  useEffect(() => {
    if (status === 'authenticated') {
      fetchExistingMemo();
    } else {
      setLoading(false);
    }
  }, [status, date, trackType]);

  const fetchExistingMemo = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/baba-memos?date=${date}&trackType=${trackType}`);
      if (res.ok) {
        const data = await res.json();
        if (data.memo) {
          const memo = data.memo;
          setAdvantagePosition(memo.advantage_position || 'フラット');
          setAdvantageStyle(memo.advantage_style || 'フラット');
          setSpecialNotes(memo.weather_note ? memo.weather_note.split(',').filter(Boolean) : []);
          setFreeMemo(memo.free_memo || '');
          setExistingMemo(memo.id);
        }
      }
    } catch {
      console.error('Failed to fetch baba memo');
    } finally {
      setLoading(false);
    }
  };

  const toggleSpecialNote = (note: string) => {
    setSpecialNotes(prev => 
      prev.includes(note) ? prev.filter(n => n !== note) : [...prev, note]
    );
  };

  const generateSummary = () => {
    const parts = [`${date}`, trackType];
    if (place) parts.push(place);
    if (advantagePosition !== 'フラット') parts.push(advantagePosition);
    if (advantageStyle !== 'フラット') parts.push(advantageStyle);
    if (specialNotes.length > 0) parts.push(`(${specialNotes.join('・')})`);
    return parts.join('・');
  };

  const handleSave = async () => {
    if (status !== 'authenticated') {
      setMessage('ログインが必要です');
      return;
    }

    setSaving(true);
    setMessage('');
    
    try {
      const res = await fetch('/api/user/baba-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          trackType,
          place,
          advantagePosition,
          advantageStyle,
          weatherNote: specialNotes.join(','),
          freeMemo,
          generatedSummary: generateSummary()
        })
      });

      if (res.ok) {
        const data = await res.json();
        setExistingMemo(data.id);
        setMessage(data.updated ? '更新しました！' : '保存しました！');
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
        <p className="mt-2">馬場メモを保存するにはログインが必要です</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-6">
        <div className="inline-block size-8 border-4 border-green-700 border-t-gold-500 rounded-full animate-spin"></div>
        <p className="mt-2 text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー情報 */}
      <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
        <div>
          <span className="text-lg font-bold text-gray-800">{date}</span>
          <span className={`ml-2 px-2 py-0.5 rounded text-sm font-bold ${
            trackType === '芝' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {trackType}
          </span>
        </div>
        {existingMemo && (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
            ✓ 保存済み
          </span>
        )}
      </div>

      {/* 有利位置 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">有利位置</label>
        <div className="flex gap-2">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setAdvantagePosition(pos)}
              className={`px-3 py-2 rounded-lg font-medium transition-all flex-1 text-sm ${
                advantagePosition === pos 
                  ? 'bg-amber-500 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* 有利脚質 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">有利脚質</label>
        <div className="flex gap-2 flex-wrap">
          {STYLES.map(style => (
            <button
              key={style}
              onClick={() => setAdvantageStyle(style)}
              className={`px-3 py-2 rounded-lg font-medium transition-all text-sm ${
                advantageStyle === style 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      {/* 特記事項 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">特記事項</label>
        <div className="flex gap-2 flex-wrap">
          {SPECIAL_NOTES.map(note => (
            <button
              key={note}
              onClick={() => toggleSpecialNote(note)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                specialNotes.includes(note) 
                  ? 'bg-red-500 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {note}
            </button>
          ))}
        </div>
      </div>

      {/* 自由メモ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">追加メモ（任意）</label>
        <textarea
          value={freeMemo}
          onChange={(e) => setFreeMemo(e.target.value.slice(0, 200))}
          placeholder="その他気づいたことがあれば..."
          className="w-full h-20 p-3 text-sm border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
        />
        <p className="text-xs text-gray-400 mt-1">{freeMemo.length}/200</p>
      </div>

      {/* プレビュー */}
      <div className={`rounded-lg p-3 ${trackType === '芝' ? 'bg-green-50' : 'bg-amber-50'}`}>
        <label className={`block text-xs font-medium mb-1 ${trackType === '芝' ? 'text-green-600' : 'text-amber-600'}`}>
          生成されるメモ
        </label>
        <p className="text-gray-800 text-sm font-medium text-pretty">{generateSummary()}</p>
      </div>

      {/* メッセージ */}
      {message && (
        <div className={`p-3 rounded-lg text-sm text-center ${
          message.includes('エラー') || message.includes('失敗') || message.includes('必要')
            ? 'bg-red-50 text-red-700'
            : 'bg-green-50 text-green-700'
        }`}>
          {message}
        </div>
      )}

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full py-3 text-white rounded-lg font-medium transition-colors disabled:opacity-50 ${
          trackType === '芝' 
            ? 'bg-green-600 hover:bg-green-700' 
            : 'bg-amber-600 hover:bg-amber-700'
        }`}
      >
        {saving ? '保存中...' : existingMemo ? '更新する' : '保存する'}
      </button>

      <p className="text-xs text-gray-400 text-center text-pretty">
        同じ日の{trackType}レース全てでこのメモが共有されます
      </p>
    </div>
  );
}
