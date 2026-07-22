'use client';

import { useState } from 'react';
import ReplayDebugger from '@/app/components/ReplayDebugger';

export default function ReplayDebuggerPage() {
  const [raceKey, setRaceKey] = useState('');
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const loadSimulation = async () => {
    if (!raceKey) {
      setError('レースキーを入力してください');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // レースキーをパース
      const match = raceKey.match(/^(\d{4})(\d{4})_(.+?)_(\d{2})$/);
      if (!match) {
        throw new Error('レースキー形式が不正です（例: 20230101_東京_01）');
      }
      
      const [, year, date, place, raceNumber] = match;
      
      // シミュレーション実行
      const response = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          date,
          place,
          raceNumber,
          trackBias: {
            innerAdvantage: 0,
            frontRunnerAdvantage: 0,
          },
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
      
      const data = await response.json();
      setSimulationResult(data.simulation);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-6">Replay Debugger（Phase 4.1検証用）</h1>
      
      {/* レース選択 */}
      <div className="bg-white border border-gray-300 rounded-lg p-4 mb-6">
        <h2 className="font-bold mb-3">レース選択</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={raceKey}
            onChange={(e) => setRaceKey(e.target.value)}
            placeholder="レースキー（例: 20230101_東京_01）"
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-gray-900"
          />
          <button
            onClick={loadSimulation}
            disabled={loading}
            className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          >
            {loading ? '読み込み中...' : '実行'}
          </button>
        </div>
        
        {error && (
          <div className="mt-2 text-red-600 text-sm">
            {error}
          </div>
        )}
      </div>
      
      {/* Replay Debugger表示 */}
      {simulationResult && (
        <ReplayDebugger
          simulationResult={simulationResult}
          courseDistance={simulationResult.phases.goal.distanceRange.end}
        />
      )}
      
      {!simulationResult && !loading && (
        <div className="text-center text-gray-500 py-12">
          レースキーを入力してシミュレーションを実行してください
        </div>
      )}
    </div>
  );
}
