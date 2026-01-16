'use client';

import { useState } from 'react';
import { signIn } from './Providers';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }

    if (!isLogin && password.length < 8) {
      setError('パスワードは8文字以上で設定してください');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    setLoading(true);
    
    try {
      if (isLogin) {
        // ログイン
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('メールアドレスまたはパスワードが正しくありません');
        } else {
          onClose();
          window.location.reload(); // セッションを反映
        }
      } else {
        // 新規登録
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || '登録に失敗しました');
        } else {
          setSuccess('登録が完了しました！ログインしています...');
          // 登録後に自動ログイン
          const result = await signIn('credentials', {
            email,
            password,
            redirect: false,
          });
          
          console.log('Login result:', result); // デバッグ用
          
          if (result?.error) {
            setError('登録は完了しましたが、自動ログインに失敗しました。手動でログインしてください。');
            setSuccess('');
          } else {
            setTimeout(() => {
              onClose();
              window.location.reload();
            }, 1000);
          }
        }
      }
    } catch {
      setError('エラーが発生しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  const handleSNSLogin = async (provider: string) => {
    setLoading(true);
    try {
      await signIn(provider.toLowerCase(), { callbackUrl: '/' });
    } catch {
      setError(`${provider}でのログインに失敗しました`);
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      {/* バックドロップ */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* モーダル */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[calc(100dvh-4rem)] flex flex-col">
        {/* ヘッダー */}
        <div className="bg-green-800 px-5 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 id="login-modal-title" className="text-lg font-bold text-white text-balance">
              {isLogin ? 'ログイン' : '新規登録'}
            </h2>
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
          <p className="text-green-200 text-xs mt-0.5">
            {isLogin ? 'アカウントにログインして続けましょう' : '新しいアカウントを作成'}
          </p>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* SNSログインボタン */}
          <div className="space-y-2 mb-4">
            {/* Google */}
            <button
              onClick={() => handleSNSLogin('Google')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700 text-sm disabled:opacity-50"
            >
              <svg className="size-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Googleで続ける
            </button>

            {/* X (Twitter) - 現在はOAuth設定が必要 */}
            <button
              onClick={() => handleSNSLogin('Twitter')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg hover:bg-gray-900 transition-colors font-medium text-sm disabled:opacity-50"
            >
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Xで続ける
            </button>

            {/* LINE - OAuth設定が必要 */}
            <button
              onClick={() => handleSNSLogin('Line')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#00B900] text-white rounded-lg hover:bg-[#00a000] transition-colors font-medium text-sm disabled:opacity-50"
            >
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
              </svg>
              LINEで続ける
            </button>

            {/* Apple - OAuth設定が必要 */}
            <button
              onClick={() => handleSNSLogin('Apple')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg hover:bg-gray-900 transition-colors font-medium text-sm disabled:opacity-50"
            >
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
              </svg>
              Appleで続ける
            </button>
          </div>

          {/* 区切り線 */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">または</span>
            </div>
          </div>

          {/* メール/パスワードフォーム */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {success}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow text-gray-900"
                placeholder="mail@example.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                パスワード {!isLogin && <span className="text-gray-400 font-normal">(8文字以上)</span>}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow text-gray-900"
                  placeholder="••••••••"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                >
                  {showPassword ? (
                    <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  パスワード（確認）
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow text-gray-900"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>
            )}

            {isLogin && (
              <div className="text-right">
                <button
                  type="button"
                  className="text-sm text-green-700 hover:text-green-800 font-medium"
                >
                  パスワードをお忘れですか？
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 btn-gold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-bold"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="size-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  処理中...
                </span>
              ) : (
                isLogin ? 'ログイン' : '新規登録'
              )}
            </button>
          </form>

          {/* 切り替え */}
          <div className="mt-4 text-center text-sm text-gray-600">
            {isLogin ? (
              <>
                アカウントをお持ちでないですか？{' '}
                <button
                  onClick={() => {
                    setIsLogin(false);
                    setError('');
                    setSuccess('');
                  }}
                  className="text-green-700 hover:text-green-800 font-bold"
                >
                  新規登録
                </button>
              </>
            ) : (
              <>
                すでにアカウントをお持ちですか？{' '}
                <button
                  onClick={() => {
                    setIsLogin(true);
                    setError('');
                    setSuccess('');
                  }}
                  className="text-green-700 hover:text-green-800 font-bold"
                >
                  ログイン
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
