'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../components/Providers';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  
  // 予想JSONアップロード
  const [predictionFile, setPredictionFile] = useState<File | null>(null);
  const [predictionUploading, setPredictionUploading] = useState(false);
  const [predictionMessage, setPredictionMessage] = useState('');
  const router = useRouter();
  
  // 設定管理
  const [premiumForAll, setPremiumForAll] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const isAdmin = (session?.user as any)?.role === 'admin';
  
  // 設定を取得
  useEffect(() => {
    if (!isAdmin) return;
    
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/admin/settings');
        if (res.ok) {
          const data = await res.json();
          setPremiumForAll(data.settings?.premium_for_all === 'true');
        }
      } catch (e) {
        console.error('Failed to fetch settings:', e);
      } finally {
        setSettingsLoading(false);
      }
    };
    fetchSettings();
  }, [isAdmin]);
  
  // プレミアム設定を保存
  const handlePremiumToggle = async () => {
    setSettingsSaving(true);
    try {
      const newValue = !premiumForAll;
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'premium_for_all', value: String(newValue) }),
      });
      
      if (res.ok) {
        setPremiumForAll(newValue);
        setMessage(newValue 
          ? '✅ 全ユーザーにプレミアム機能を有効化しました' 
          : '✅ プレミアム機能を通常モードに戻しました'
        );
      } else {
        setMessage('❌ 設定の保存に失敗しました');
      }
    } catch (e) {
      setMessage('❌ 設定の保存に失敗しました');
    } finally {
      setSettingsSaving(false);
    }
  };

  // ローディング中
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="size-12 border-4 border-green-700 border-t-gold-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  // 未ログインまたは管理者でない場合
  if (!session || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="size-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="size-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">アクセス権限がありません</h1>
          <p className="text-gray-600 mb-6">
            このページは管理者のみアクセスできます。
            {!session && 'ログインしてください。'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            トップページに戻る
          </button>
        </div>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setMessage('');
    }
  };

  // 予想JSONファイル選択
  const handlePredictionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPredictionFile(e.target.files[0]);
      setPredictionMessage('');
    }
  };

  // 予想JSONアップロード
  const handlePredictionUpload = async () => {
    if (!predictionFile) {
      setPredictionMessage('ファイルを選択してください');
      return;
    }

    setPredictionUploading(true);
    setPredictionMessage('アップロード中...');

    try {
      const formData = new FormData();
      formData.append('file', predictionFile);

      const response = await fetch('/api/admin/import-predictions', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setPredictionMessage(
          `✅ アップロード成功: ${result.imported}件インポート / ${result.skipped}件スキップ / ${result.errors}件エラー`
        );
        setPredictionFile(null);
        const fileInput = document.getElementById('prediction-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setPredictionMessage(`❌ エラー: ${result.error || result.message}`);
      }
    } catch (error: any) {
      setPredictionMessage(`❌ アップロードエラー: ${error.message}`);
    } finally {
      setPredictionUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('ファイルを選択してください');
      return;
    }

    setUploading(true);
    setMessage('アップロード中...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-csv', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(`✅ アップロード成功: ${result.message || result.count + '件のデータを保存しました'}`);
        setFile(null);
        // ファイル入力をリセット
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        const errorDetail = result.error || result.details || JSON.stringify(result);
        setMessage(`❌ エラー: ${errorDetail}`);
        console.error('Upload error:', result);
      }
    } catch (error: any) {
      setMessage(`❌ アップロードエラー: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-green-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">管理者画面</h1>
            <p className="text-green-200 text-sm">{session.user?.email}</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg transition-colors"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-sm">戻る</span>
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-8 space-y-8">
        {/* プレミアム機能設定 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">🎁 プレミアム機能設定</h2>
          
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
            <div>
              <h3 className="font-bold text-gray-900">全ユーザーにプレミアム機能を開放</h3>
              <p className="text-sm text-gray-600 mt-1">
                ONにすると、全ユーザーがプレミアム機能（おれAI、展開予想カード等）を利用できます
              </p>
            </div>
            
            <button
              onClick={handlePremiumToggle}
              disabled={settingsLoading || settingsSaving}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:opacity-50 ${
                premiumForAll ? 'bg-yellow-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block size-6 transform rounded-full bg-white shadow-lg transition-transform ${
                  premiumForAll ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          
          <div className="mt-4 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
              premiumForAll 
                ? 'bg-yellow-100 text-yellow-800' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {settingsLoading ? (
                <>
                  <span className="size-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                  読み込み中...
                </>
              ) : premiumForAll ? (
                <>🔓 全ユーザー開放中</>
              ) : (
                <>🔒 プレミアム会員のみ</>
              )}
            </span>
          </div>
        </div>
        
        {/* CSVアップロード */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">📁 CSVファイルアップロード</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                CSVファイル（umadata.csv または wakujun.csv）
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={uploading}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded file:border-0
                  file:text-sm file:font-semibold
                  file:bg-green-50 file:text-green-700
                  hover:file:bg-green-100
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {file && (
              <div className="text-sm text-gray-600">
                選択されたファイル: <span className="font-medium">{file.name}</span>
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? 'アップロード中...' : 'アップロード'}
            </button>

            {message && (
              <div className={`p-4 rounded-lg ${
                message.startsWith('✅') ? 'bg-green-100 text-green-800' : 
                message.startsWith('❌') ? 'bg-red-100 text-red-800' : 
                'bg-blue-100 text-blue-800'
              }`}>
                {message}
              </div>
            )}
          </div>

          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-bold mb-2 text-gray-900">使い方</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
              <li>umadata.csv（過去走データ）またはwakujun.csv（当日の出走データ）を選択</li>
              <li>「アップロード」ボタンをクリック</li>
              <li>アップロードが完了したら、トップページで確認</li>
            </ol>
          </div>
        </div>

        {/* 予想JSONアップロード */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">🧠 AI予想学習データ</h2>
          <p className="text-gray-600 mb-4">
            Discord予想チャンネルのエクスポートJSON（DiscordChatExporter形式）をアップロードすると、
            AIがあなたの予想スタイルを学習します。
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Discord予想データ（.json）
              </label>
              <input
                id="prediction-file-input"
                type="file"
                accept=".json"
                onChange={handlePredictionFileChange}
                disabled={predictionUploading}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded file:border-0
                  file:text-sm file:font-semibold
                  file:bg-purple-50 file:text-purple-700
                  hover:file:bg-purple-100
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {predictionFile && (
              <div className="text-sm text-gray-600">
                選択されたファイル: <span className="font-medium">{predictionFile.name}</span>
              </div>
            )}

            <button
              onClick={handlePredictionUpload}
              disabled={!predictionFile || predictionUploading}
              className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {predictionUploading ? 'インポート中...' : 'AI学習データをインポート'}
            </button>

            {predictionMessage && (
              <div className={`p-4 rounded-lg ${
                predictionMessage.startsWith('✅') ? 'bg-green-100 text-green-800' : 
                predictionMessage.startsWith('❌') ? 'bg-red-100 text-red-800' : 
                'bg-blue-100 text-blue-800'
              }`}>
                {predictionMessage}
              </div>
            )}
          </div>

          <div className="mt-8 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h3 className="font-bold mb-2 text-purple-900">📚 AIの学習について</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-purple-800">
              <li>予想文から「競馬場」「レース番号」「本命/対抗/穴」「買い目」を抽出</li>
              <li>AIは予想生成時に類似レースの過去予想を参考にします</li>
              <li>文体・表現・ロジックを真似して予想文を書きます</li>
              <li>より多くのデータがあると精度が向上します</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
