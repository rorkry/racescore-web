'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setMessage('');
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
        setMessage(`✅ アップロード成功: ${result.count}件のデータを保存しました`);
        setFile(null);
        // ファイル入力をリセット
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setMessage(`❌ エラー: ${result.error}`);
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
      <header className="bg-blue-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">管理者画面</h1>
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-3 py-2 bg-blue-700 hover:bg-blue-600 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
            <span className="text-sm">トップページ</span>
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6">CSVファイルアップロード</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
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
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
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
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? 'アップロード中...' : 'アップロード'}
            </button>

            {message && (
              <div className={`p-4 rounded ${
                message.startsWith('✅') ? 'bg-green-100 text-green-800' : 
                message.startsWith('❌') ? 'bg-red-100 text-red-800' : 
                'bg-blue-100 text-blue-800'
              }`}>
                {message}
              </div>
            )}
          </div>

          <div className="mt-8 p-4 bg-gray-50 rounded">
            <h3 className="font-bold mb-2">使い方</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
              <li>umadata.csv（過去走データ）またはwakujun.csv（当日の出走データ）を選択</li>
              <li>「アップロード」ボタンをクリック</li>
              <li>アップロードが完了したら、トップページで確認</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
