'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// 3Dシミュレーター（SSR無効化）
const RaceSimulator3DProto = dynamic(
  () => import('@/app/components/RaceSimulator3DProto'),
  { ssr: false, loading: () => <div className="text-center py-8">3Dシミュレーター読み込み中...</div> }
);

interface SimulationResult {
  simulation: any;
  courseInfo: any;
  finalStandings?: Array<{
    position: number;
    horseNumber: number;
    waku: string;
    horseName: string;
  }>;
}

interface RaceSimulatorCardProps {
  simulationResult: SimulationResult | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

export default function RaceSimulatorCard({
  simulationResult,
  loading,
  error,
  onRetry,
}: RaceSimulatorCardProps) {
  // ローディング状態
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🎬</span>
          <h2 className="text-xl font-bold text-slate-800">3D展開予想</h2>
        </div>
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-green-600"></div>
          <p className="mt-4 text-gray-600">シミュレーション実行中...</p>
        </div>
      </div>
    );
  }

  // エラー状態
  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🎬</span>
          <h2 className="text-xl font-bold text-slate-800">3D展開予想</h2>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-700 font-medium mb-2">シミュレーション実行エラー</p>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              再実行
            </button>
          )}
        </div>
      </div>
    );
  }

  // データなし状態
  if (!simulationResult || !simulationResult.simulation) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🎬</span>
          <h2 className="text-xl font-bold text-slate-800">3D展開予想</h2>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-600 text-sm">シミュレーションデータがありません</p>
          <p className="text-gray-500 text-xs mt-2">レースを選択してください</p>
        </div>
      </div>
    );
  }

  // CourseInfo追跡
  console.warn('[COURSEINFO] RaceSimulatorCard:', {
    courseInfo: simulationResult.courseInfo ? 'LOADED' : 'NULL',
    courseInfoKeys: simulationResult.courseInfo ? Object.keys(simulationResult.courseInfo) : []
  });
  
  // 正常表示
  return (
    <div className="space-y-4">
      {/* 3Dシミュレーター */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🎬</span>
          <h2 className="text-xl font-bold text-slate-800">3D展開予想</h2>
        </div>
        <RaceSimulator3DProto
          simulationResult={simulationResult.simulation}
          courseInfo={simulationResult.courseInfo || null}
        />
      </div>

      {/* 予想着順 */}
      {simulationResult.finalStandings && simulationResult.finalStandings.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">📊</span>
            <h2 className="text-xl font-bold text-slate-800">予想着順</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="py-2 px-4 text-left text-sm font-semibold text-gray-700">着順</th>
                  <th className="py-2 px-4 text-left text-sm font-semibold text-gray-700">馬番</th>
                  <th className="py-2 px-4 text-left text-sm font-semibold text-gray-700">枠</th>
                  <th className="py-2 px-4 text-left text-sm font-semibold text-gray-700">馬名</th>
                </tr>
              </thead>
              <tbody>
                {simulationResult.finalStandings.map((horse) => (
                  <tr key={horse.horseNumber} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="py-2 px-4 font-bold text-gray-900">{horse.position}</td>
                    <td className="py-2 px-4 text-gray-700">{horse.horseNumber}</td>
                    <td className="py-2 px-4 text-gray-700">{horse.waku}</td>
                    <td className="py-2 px-4 text-gray-900">{horse.horseName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
