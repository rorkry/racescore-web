'use client';

import { useEffect, useState } from 'react';
import { useSession } from '../../components/Providers';
import Link from 'next/link';

export default function UserMaximsPage() {
  const { status } = useSession();
  const [content, setContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/user/maxims');
        if (res.ok) {
          const data = await res.json();
          setContent(typeof data.content === 'string' ? data.content : '');
          setUpdatedAt(data.updatedAt ?? null);
        }
      } catch {
        setMessage('読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, [status]);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/user/maxims', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage('保存しました');
        if (data.updatedAt) setUpdatedAt(data.updatedAt);
      } else {
        setMessage(data.error || '保存に失敗しました');
      }
    } catch {
      setMessage('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'unauthenticated') {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-gray-600">ログインが必要です。</p>
        <Link href="/" className="text-green-700 hover:underline mt-4 inline-block">
          トップへ
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-6">
        <Link href="/mypage" className="text-green-700 hover:underline text-sm">
          ← マイページ
        </Link>
      </div>

      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2">格言・自分ルール</h1>
      <p className="text-gray-600 text-sm mb-6 text-pretty leading-relaxed">
        形式は自由です。一文ごとの格言、種牡馬メモ、馬場の癖メモなどを好きなだけ書けます。
        レースカードを開いた状態で右下FAB「競馬の脳みそ」に質問すると、この内容と出走馬データを照らして答えます。
      </p>

      {loading ? (
        <p className="text-gray-500">読み込み中…</p>
      ) : (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`例:\n高速決着ではロードカナロア産駒を買え\n高速決着は内有利\n外枠は〇〇競馬場だけ注意`}
            className="w-full min-h-[280px] px-4 py-3 border border-gray-300 rounded-xl text-gray-900 text-sm leading-relaxed focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-y"
            maxLength={32000}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <span className="text-xs text-gray-500 tabular-nums">{content.length} / 32000 文字</span>
            {updatedAt && (
              <span className="text-xs text-gray-400">
                最終更新: {new Date(updatedAt).toLocaleString('ja-JP')}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-4 px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
          {message && <p className="mt-3 text-sm text-gray-700">{message}</p>}
        </>
      )}

      <div className="mt-10 p-4 bg-gray-50 rounded-xl text-sm text-gray-700 space-y-2">
        <p className="font-medium text-gray-800">FABでの聞き方の例</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>今回の馬場前提で、格言に沿ってどの馬を狙えばいい？</li>
          <li>高速決着想定で、産駒ルールに合う馬は？</li>
          <li>2歳戦として、自分のメモを踏まえて買いの軸を絞って</li>
        </ul>
      </div>
    </div>
  );
}
