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
  
  // ファインチューニング
  const [ftStatus, setFtStatus] = useState<{
    isFineTuned: boolean;
    currentModel: string | null;
    lastJobId: string | null;
  } | null>(null);
  const [ftLoading, setFtLoading] = useState(false);
  const [ftMessage, setFtMessage] = useState('');
  const [ftStats, setFtStats] = useState<{
    total: number;
    dbTotal: number;
    cost: { trainingCost: number; perRequestCost: number };
  } | null>(null);
  const [ftJobStatus, setFtJobStatus] = useState<{
    id: string;
    status: string;
    fine_tuned_model: string | null;
  } | null>(null);
  const [ftAllJobs, setFtAllJobs] = useState<Array<{
    id: string;
    status: string;
    model: string;
    fine_tuned_model: string | null;
    created_at: string;
  }>>([]);
  const [ftLimit, setFtLimit] = useState<string>('all'); // 'all', '500', '1000', '2000', '5000'

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
    
    // ファインチューニング状態を取得（ジョブ状態も自動取得）
    const fetchFtStatus = async () => {
      try {
        const res = await fetch('/api/admin/fine-tune');
        if (res.ok) {
          const data = await res.json();
          setFtStatus(data);
          
          // 全ジョブ一覧を取得
          const listRes = await fetch('/api/admin/fine-tune', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list' }),
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            setFtAllJobs(listData.jobs || []);
            
            // 進行中のジョブがあるかチェック
            const runningJobs = (listData.jobs || []).filter(
              (j: any) => j.status === 'queued' || j.status === 'running' || j.status === 'validating_files'
            );
            if (runningJobs.length > 0) {
              setFtJobStatus(runningJobs[0]);
              setFtMessage(`🔄 ファインチューニング進行中... (${runningJobs[0].status}) - ${runningJobs.length}件のジョブが実行中`);
            } else {
              // 最新の完了ジョブを表示
              const latestJob = listData.jobs?.[0];
              if (latestJob) {
                setFtJobStatus(latestJob);
                if (latestJob.status === 'succeeded') {
                  setFtMessage(`✅ 最新のファインチューニング完了！モデル: ${latestJob.fine_tuned_model}`);
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch fine-tune status:', e);
      }
    };
    fetchFtStatus();
  }, [isAdmin]);
  
  // 進行中のジョブを定期的にポーリング（30秒ごと）
  useEffect(() => {
    const runningJobs = ftAllJobs.filter(
      j => j.status === 'queued' || j.status === 'running' || j.status === 'validating_files'
    );
    if (runningJobs.length === 0) return;
    
    const interval = setInterval(async () => {
      try {
        // 全ジョブ一覧を再取得
        const listRes = await fetch('/api/admin/fine-tune', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list' }),
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          setFtAllJobs(listData.jobs || []);
          
          const newRunningJobs = (listData.jobs || []).filter(
            (j: any) => j.status === 'queued' || j.status === 'running' || j.status === 'validating_files'
          );
          
          if (newRunningJobs.length > 0) {
            setFtJobStatus(newRunningJobs[0]);
            setFtMessage(`🔄 ファインチューニング進行中... (${newRunningJobs[0].status}) - ${newRunningJobs.length}件`);
          } else {
            // 完了したジョブを探す
            const succeededJob = listData.jobs?.find((j: any) => j.status === 'succeeded' && j.fine_tuned_model);
            if (succeededJob) {
              setFtJobStatus(succeededJob);
              setFtMessage(`✅ ファインチューニング完了！モデル: ${succeededJob.fine_tuned_model}`);
              setFtStatus(prev => prev ? { ...prev, isFineTuned: true, currentModel: succeededJob.fine_tuned_model } : null);
            }
          }
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 30000); // 30秒ごと
    
    return () => clearInterval(interval);
  }, [ftAllJobs]);
  
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

  // ファインチューニング: データ準備
  const handleFtPrepare = async () => {
    setFtLoading(true);
    setFtMessage('学習データを準備中...');
    try {
      const limit = ftLimit === 'all' ? undefined : ftLimit;
      const res = await fetch('/api/admin/fine-tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare', limit }),
      });
      const data = await res.json();
      if (res.ok) {
        setFtStats({ total: data.stats.total, dbTotal: data.stats.dbTotal, cost: data.cost });
        const limitText = ftLimit === 'all' ? '全件' : `${ftLimit}件（上限指定）`;
        setFtMessage(`✅ ${data.stats.total}件の学習データを準備完了（DB全体: ${data.stats.dbTotal}件）`);
      } else {
        setFtMessage(`❌ エラー: ${data.message || data.error}`);
      }
    } catch (e: any) {
      setFtMessage(`❌ エラー: ${e.message}`);
    } finally {
      setFtLoading(false);
    }
  };

  // ファインチューニング: アップロード＆開始
  const handleFtStart = async () => {
    // 進行中のジョブがあるかチェック
    const runningJobs = ftAllJobs.filter(
      j => j.status === 'queued' || j.status === 'running' || j.status === 'validating_files'
    );
    
    let confirmMessage = 'ファインチューニングを開始しますか？\n推定コスト: $' + (ftStats?.cost.trainingCost || 0).toFixed(2);
    
    if (runningJobs.length > 0) {
      confirmMessage = `⚠️ 注意: ${runningJobs.length}件のジョブが進行中です！\n\n` +
        runningJobs.map(j => `・${j.id} (${j.status})`).join('\n') +
        '\n\n新しいジョブを追加で開始しますか？\n推定コスト: $' + (ftStats?.cost.trainingCost || 0).toFixed(2);
    }
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    setFtLoading(true);
    setFtMessage('ファイルをアップロード中...');
    try {
      const limit = ftLimit === 'all' ? undefined : ftLimit;
      
      // 1. ファイルアップロード
      const uploadRes = await fetch('/api/admin/fine-tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload', limit }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.message || uploadData.error);
      
      setFtMessage('ファインチューニングジョブを開始中...');
      
      // 2. ジョブ開始
      const startRes = await fetch('/api/admin/fine-tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', fileId: uploadData.fileId }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.message || startData.error);
      
      setFtJobStatus(startData.job);
      setFtMessage(`✅ ファインチューニング開始！ ジョブID: ${startData.job.id}`);
      
    } catch (e: any) {
      setFtMessage(`❌ エラー: ${e.message}`);
    } finally {
      setFtLoading(false);
    }
  };

  // ファインチューニング: 状態確認
  const handleFtCheckStatus = async () => {
    setFtLoading(true);
    setFtMessage('状態を確認中...');
    try {
      const res = await fetch('/api/admin/fine-tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const data = await res.json();
      if (res.ok) {
        setFtJobStatus(data.job);
        if (data.job.status === 'succeeded') {
          setFtMessage(`✅ 完了！ モデル: ${data.job.fine_tuned_model}`);
          setFtStatus(prev => prev ? { ...prev, isFineTuned: true, currentModel: data.job.fine_tuned_model } : null);
        } else if (data.job.status === 'failed') {
          setFtMessage(`❌ 失敗: ${data.job.error?.message || '不明なエラー'}`);
        } else {
          setFtMessage(`⏳ 状態: ${data.job.status}`);
        }
      } else {
        setFtMessage(`❌ エラー: ${data.message || data.error}`);
      }
    } catch (e: any) {
      setFtMessage(`❌ エラー: ${e.message}`);
    } finally {
      setFtLoading(false);
    }
  };

  // ファインチューニング: モデル解除
  const handleFtClearModel = async () => {
    if (!confirm('ファインチューニング済みモデルを解除し、通常モデルに戻しますか？')) {
      return;
    }
    setFtLoading(true);
    try {
      const res = await fetch('/api/admin/fine-tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-model', modelId: '' }),
      });
      if (res.ok) {
        setFtStatus(prev => prev ? { ...prev, isFineTuned: false, currentModel: null } : null);
        setFtMessage('✅ 通常モデルに戻しました');
      }
    } catch (e: any) {
      setFtMessage(`❌ エラー: ${e.message}`);
    } finally {
      setFtLoading(false);
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

        {/* ファインチューニング */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">🧠 AIファインチューニング</h2>
          
          {/* 現在の状態 */}
          <div className={`p-4 rounded-lg mb-6 ${
            ftStatus?.isFineTuned 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-gray-50 border border-gray-200'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">
                  {ftStatus?.isFineTuned ? '✅ カスタムモデル使用中' : '📦 標準モデル使用中'}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {ftStatus?.isFineTuned 
                    ? `モデル: ${ftStatus.currentModel}` 
                    : 'gpt-4o-mini（ファインチューニングなし）'}
                </p>
              </div>
              {ftStatus?.isFineTuned && (
                <button
                  onClick={handleFtClearModel}
                  disabled={ftLoading}
                  className="text-sm text-red-600 hover:text-red-700 underline"
                >
                  標準に戻す
                </button>
              )}
            </div>
          </div>
          
          {/* ステップ1: データ準備 */}
          <div className="space-y-4">
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-bold text-gray-900">Step 1: 学習データ準備</h3>
              <p className="text-sm text-gray-600 mt-1">
                インポート済みの予想データを学習用に整形します
              </p>
              
              {/* 件数選択 */}
              <div className="mt-3 flex items-center gap-3">
                <label className="text-sm text-gray-700">取得件数:</label>
                <select
                  value={ftLimit}
                  onChange={(e) => setFtLimit(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">全件（制限なし）</option>
                  <option value="500">500件</option>
                  <option value="1000">1,000件</option>
                  <option value="2000">2,000件</option>
                  <option value="3000">3,000件</option>
                  <option value="5000">5,000件</option>
                </select>
                <span className="text-xs text-gray-500">※リアクション数が多い順</span>
              </div>
              
              <button
                onClick={handleFtPrepare}
                disabled={ftLoading}
                className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {ftLoading ? '処理中...' : 'データを準備'}
              </button>
              
              {ftStats && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm">
                  <p>📊 学習データ: <strong>{ftStats.total}件</strong> / DB全体: {ftStats.dbTotal}件</p>
                  <p>💰 推定学習コスト: <strong>${ftStats.cost.trainingCost.toFixed(2)}</strong>（約{Math.round(ftStats.cost.trainingCost * 150)}円）</p>
                  <p>📈 推論コスト: <strong>${ftStats.cost.perRequestCost.toFixed(4)}/回</strong></p>
                </div>
              )}
            </div>
            
            {/* ステップ2: ファインチューニング開始 */}
            <div className="border-l-4 border-green-500 pl-4">
              <h3 className="font-bold text-gray-900">Step 2: ファインチューニング開始</h3>
              <p className="text-sm text-gray-600 mt-1">
                OpenAI APIでカスタムモデルを作成します（数分〜数時間）
              </p>
              <button
                onClick={handleFtStart}
                disabled={ftLoading || !ftStats}
                className="mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {ftLoading ? '処理中...' : 'ファインチューニング開始'}
              </button>
            </div>
            
            {/* ステップ3: 状態確認 */}
            <div className="border-l-4 border-yellow-500 pl-4">
              <h3 className="font-bold text-gray-900">Step 3: 状態確認</h3>
              <p className="text-sm text-gray-600 mt-1">
                ファインチューニングジョブの進捗を確認します
              </p>
              <button
                onClick={handleFtCheckStatus}
                disabled={ftLoading}
                className="mt-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {ftLoading ? '確認中...' : '状態を確認'}
              </button>
              
              {ftJobStatus && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${
                  ftJobStatus.status === 'succeeded' ? 'bg-green-50 border border-green-200' :
                  ftJobStatus.status === 'failed' ? 'bg-red-50 border border-red-200' :
                  'bg-yellow-50 border border-yellow-200'
                }`}>
                  <div className="flex items-center gap-2">
                    {(ftJobStatus.status === 'queued' || ftJobStatus.status === 'running' || ftJobStatus.status === 'validating_files') && (
                      <div className="size-4 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin" />
                    )}
                    {ftJobStatus.status === 'succeeded' && (
                      <span className="text-green-600">✅</span>
                    )}
                    {ftJobStatus.status === 'failed' && (
                      <span className="text-red-600">❌</span>
                    )}
                    <span className="font-bold">
                      {ftJobStatus.status === 'validating_files' && 'ファイル検証中...'}
                      {ftJobStatus.status === 'queued' && '待機中...'}
                      {ftJobStatus.status === 'running' && '学習中...'}
                      {ftJobStatus.status === 'succeeded' && '完了！'}
                      {ftJobStatus.status === 'failed' && '失敗'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">ジョブID: {ftJobStatus.id}</p>
                  {ftJobStatus.fine_tuned_model && (
                    <p className="mt-1 text-green-700">モデル: <strong>{ftJobStatus.fine_tuned_model}</strong></p>
                  )}
                  {(ftJobStatus.status === 'queued' || ftJobStatus.status === 'running' || ftJobStatus.status === 'validating_files') && (
                    <p className="mt-2 text-xs text-yellow-700">
                      🔄 30秒ごとに自動更新中（画面を離れても学習は継続します）
                    </p>
                  )}
                </div>
              )}
            </div>
            
            {/* ジョブ一覧 */}
            {ftAllJobs.length > 0 && (
              <div className="border-l-4 border-purple-500 pl-4">
                <h3 className="font-bold text-gray-900">📋 ジョブ履歴（直近10件）</h3>
                <div className="mt-2 space-y-2">
                  {ftAllJobs.slice(0, 10).map((job) => (
                    <div 
                      key={job.id}
                      className={`p-2 rounded text-xs ${
                        job.status === 'succeeded' ? 'bg-green-50' :
                        job.status === 'failed' ? 'bg-red-50' :
                        job.status === 'cancelled' ? 'bg-gray-50' :
                        'bg-yellow-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono">{job.id.slice(0, 20)}...</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          job.status === 'succeeded' ? 'bg-green-200 text-green-800' :
                          job.status === 'failed' ? 'bg-red-200 text-red-800' :
                          job.status === 'cancelled' ? 'bg-gray-200 text-gray-800' :
                          'bg-yellow-200 text-yellow-800'
                        }`}>
                          {job.status}
                        </span>
                      </div>
                      <div className="mt-1 text-gray-500">
                        {new Date(job.created_at).toLocaleString('ja-JP')}
                        {job.fine_tuned_model && (
                          <span className="ml-2 text-green-700">→ {job.fine_tuned_model.slice(-20)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* メッセージ */}
          {ftMessage && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${
              ftMessage.startsWith('✅') ? 'bg-green-100 text-green-800' :
              ftMessage.startsWith('❌') ? 'bg-red-100 text-red-800' :
              ftMessage.startsWith('⏳') ? 'bg-yellow-100 text-yellow-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {ftMessage}
            </div>
          )}
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
