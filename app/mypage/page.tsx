'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from '../components/Providers';
import Link from 'next/link';
import { normalizeHorseName } from '@/utils/normalize-horse-name';

interface UserData {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    created_at: string;
  };
  subscription: {
    plan: string;
    status: string;
    current_period_end: string | null;
  } | null;
  points: {
    balance: number;
    total_earned: number;
    total_spent: number;
  } | null;
  horseMarks: Array<{
    horse_name: string;
    mark: string;
    memo: string | null;
    created_at: string;
  }>;
}

export default function MyPage() {
  const { data: session, status } = useSession();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchUserData();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status]);

  const fetchUserData = async () => {
    try {
      const res = await fetch('/api/user/me');
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
      } else {
        setError('ユーザー情報の取得に失敗しました');
      }
    } catch {
      setError('エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    // プレミアム機能のトグル状態をクリア
    localStorage.removeItem('stride_active_features');
    await signOut({ callbackUrl: '/' });
  };

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      const res = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() || null }),
      });
      if (res.ok) {
        setIsEditingName(false);
        fetchUserData();
        // セッションも更新するためにリロード
        window.location.reload();
      }
    } catch {
      console.error('Failed to save name');
    } finally {
      setSavingName(false);
    }
  };

  // 未ログイン
  if (status === 'unauthenticated') {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-xl font-bold text-gray-800 mb-4 text-balance">ログインが必要です</h1>
          <p className="text-gray-600 mb-6 text-pretty">
            マイページを表示するにはログインしてください。
          </p>
          <Link href="/" className="inline-block px-6 py-3 btn-gold rounded-lg font-bold">
            トップページへ戻る
          </Link>
        </div>
      </div>
    );
  }

  // ローディング
  if (loading || status === 'loading') {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="inline-block size-12 border-4 border-green-700 border-t-gold-500 rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-600">読み込み中...</p>
      </div>
    );
  }

  // エラー
  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-800 mb-4">{error}</h1>
          <button onClick={fetchUserData} className="px-6 py-3 btn-turf rounded-lg font-bold">
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  const planLabels: Record<string, string> = {
    free: '無料プラン',
    basic: 'ベーシックプラン',
    premium: 'プレミアムプラン',
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-balance">マイページ</h1>
      
      <div className="grid md:grid-cols-2 gap-6">
        {/* ユーザー情報 */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-xl">👤</span> アカウント情報
          </h2>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">メールアドレス</div>
              <div className="font-medium text-gray-800">{session?.user?.email}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">名前</div>
              {isEditingName ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="ユーザー名を入力"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                    maxLength={50}
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName}
                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {savingName ? '...' : '保存'}
                  </button>
                  <button
                    onClick={() => setIsEditingName(false)}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{userData?.user?.name || session?.user?.name || '未設定'}</span>
                  <button
                    onClick={() => {
                      setNewName(userData?.user?.name || session?.user?.name || '');
                      setIsEditingName(true);
                    }}
                    className="text-green-600 hover:text-green-700 text-sm"
                  >
                    編集
                  </button>
                </div>
              )}
            </div>
            {userData?.user && (
              <div>
                <div className="text-xs text-gray-500 mb-1">登録日</div>
                <div className="font-medium text-gray-800 tabular-nums">
                  {new Date(userData.user.created_at).toLocaleDateString('ja-JP')}
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={handleLogout}
              className="w-full py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* ポイント */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-xl">💰</span> ポイント
          </h2>
          <div className="text-center py-4">
            <div className="text-4xl font-bold text-green-700 tabular-nums">
              {userData?.points?.balance ?? 0}
              <span className="text-lg font-normal text-gray-500 ml-1">pt</span>
            </div>
            <div className="text-sm text-gray-500 mt-2">現在の保有ポイント</div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
            <div className="text-center">
              <div className="text-lg font-bold text-gray-700 tabular-nums">
                {userData?.points?.total_earned ?? 0}
              </div>
              <div className="text-xs text-gray-500">累計獲得</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-700 tabular-nums">
                {userData?.points?.total_spent ?? 0}
              </div>
              <div className="text-xs text-gray-500">累計使用</div>
            </div>
          </div>
          <div className="mt-4">
            <Link
              href="/mypage/points"
              className="block w-full py-2 text-center text-green-700 hover:bg-green-50 rounded-lg transition-colors font-medium"
            >
              ポイント履歴を見る →
            </Link>
          </div>
        </div>

        {/* プラン */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-xl">⭐</span> 利用プラン
          </h2>
          <div className="text-center py-4">
            <div className="inline-block px-4 py-2 gold-gradient rounded-full text-green-900 font-bold">
              {planLabels[userData?.subscription?.plan || 'free'] || '無料プラン'}
            </div>
            {userData?.subscription?.current_period_end && (
              <div className="text-sm text-gray-500 mt-2 tabular-nums">
                次回更新: {new Date(userData.subscription.current_period_end).toLocaleDateString('ja-JP')}
              </div>
            )}
          </div>
          <div className="mt-4">
            <Link
              href="/mypage/subscription"
              className="block w-full py-2 text-center text-green-700 hover:bg-green-50 rounded-lg transition-colors font-medium"
            >
              プランを変更する →
            </Link>
          </div>
        </div>

        {/* 馬印 */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-xl">🏇</span> 保存した馬印
          </h2>
          {userData?.horseMarks && userData.horseMarks.length > 0 ? (
            <div className="space-y-2">
              {userData.horseMarks.slice(0, 5).map((mark, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <span className="font-medium text-gray-800">{normalizeHorseName(mark.horse_name)}</span>
                  <span className="text-xl">{mark.mark}</span>
                </div>
              ))}
              {userData.horseMarks.length > 5 && (
                <div className="text-center text-gray-500 text-sm">
                  他 {userData.horseMarks.length - 5} 件
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <div className="text-3xl mb-2">📝</div>
              <p className="text-sm text-pretty">まだ馬印が登録されていません</p>
            </div>
          )}
          <div className="mt-4">
            <Link
              href="/mypage/horse-marks"
              className="block w-full py-2 text-center text-green-700 hover:bg-green-50 rounded-lg transition-colors font-medium"
            >
              馬印一覧を見る →
            </Link>
          </div>
        </div>

        {/* 格言（FAB連携） */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-xl">📜</span> 格言・自分ルール
          </h2>
          <div className="text-center py-2">
            <p className="text-gray-600 mb-4 text-pretty text-sm leading-relaxed">
              自由記述の格言を保存。レースカード表示中にFABの「競馬の脳みそ」へ質問すると、
              出走馬と照らして解釈して答えます。
            </p>
          </div>
          <div className="mt-2">
            <Link
              href="/mypage/maxims"
              className="block w-full py-3 text-center bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-900 transition-colors"
            >
              格言を編集する →
            </Link>
          </div>
        </div>

        {/* 馬分析 */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-xl">🐴</span> 馬分析
          </h2>
          <div className="text-center py-4">
            <p className="text-gray-600 mb-4 text-pretty">
              馬名で検索して過去走データや<br />
              詳細分析を確認できます
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-sm text-gray-500">
              <span className="px-2 py-1 bg-gray-100 rounded">馬検索</span>
              <span className="px-2 py-1 bg-gray-100 rounded">過去走</span>
              <span className="px-2 py-1 bg-gray-100 rounded">お気に入り</span>
            </div>
          </div>
          <div className="mt-4">
            <Link
              href="/mypage/horses"
              className="block w-full py-3 text-center btn-gold rounded-lg font-bold"
            >
              🐴 馬を検索・分析する →
            </Link>
          </div>
        </div>

        {/* 種牡馬分析 */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-xl">📊</span> 種牡馬分析
          </h2>
          <div className="text-center py-4">
            <p className="text-gray-600 mb-4 text-pretty">
              種牡馬の成績を競馬場・芝/ダート・<br />
              距離で絞り込んで分析
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-sm text-gray-500">
              <span className="px-2 py-1 bg-gray-100 rounded">勝率</span>
              <span className="px-2 py-1 bg-gray-100 rounded">複勝率</span>
              <span className="px-2 py-1 bg-gray-100 rounded">回収率</span>
            </div>
          </div>
          <div className="mt-4">
            <Link
              href="/mypage/analysis"
              className="block w-full py-3 text-center btn-turf rounded-lg font-bold"
            >
              📊 種牡馬成績を分析する →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
