'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Phase 4.2プロトタイプ（SSR無効化）
const RaceSimulator3DProto = dynamic(
  () => import('@/app/components/RaceSimulator3DProto'),
  { ssr: false, loading: () => <div className="text-center py-12">3Dシミュレーター読み込み中...</div> }
);

interface SimulationResult {
  courseName: string;
  distance: number;
  finalStandings: Array<{
    position: number;
    horseNumber: number;
    horseName: string;
    waku: number;
  }>;
  timeline: Array<{
    time: number;
    distance: number;
    horses: Array<{
      n: number;
      p: [number, number, number];
      v: number;
      pos: number;
      stamina: number;
    }>;
  }>;
  simulation?: any;
  courseInfo?: any;
}

export default function SimulatorPage() {
  const [year, setYear] = useState('2025');
  const [date, setDate] = useState('0105');
  const [place, setPlace] = useState('東京');
  const [raceNumber, setRaceNumber] = useState('11');
  
  // 馬場バイアス
  const [trackCondition, setTrackCondition] = useState<'firm' | 'good' | 'yielding' | 'soft' | 'heavy'>('good');
  const [innerBias, setInnerBias] = useState(0);
  const [outerBias, setOuterBias] = useState(0);
  const [frontBias, setFrontBias] = useState(0);
  const [rearBias, setRearBias] = useState(0);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          date,
          place,
          raceNumber,
          trackBias: {
            condition: trackCondition,
            innerBias,
            outerBias,
            frontBias,
            rearBias,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'シミュレーション失敗');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">🏇 レースシミュレーター（3D可視化）</h1>

        {/* 入力フォーム */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">レース選択</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">年</label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                placeholder="2025"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">日付（MMDD）</label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                placeholder="0105"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">競馬場</label>
              <select
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              >
                <option value="東京">東京</option>
                <option value="中山">中山</option>
                <option value="京都">京都</option>
                <option value="阪神">阪神</option>
                <option value="中京">中京</option>
                <option value="新潟">新潟</option>
                <option value="小倉">小倉</option>
                <option value="札幌">札幌</option>
                <option value="函館">函館</option>
                <option value="福島">福島</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">レース番号</label>
              <input
                type="text"
                value={raceNumber}
                onChange={(e) => setRaceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                placeholder="11"
              />
            </div>
          </div>
          
          {/* 馬場バイアス設定 */}
          <h3 className="text-lg font-bold mb-3 mt-6">🌱 馬場バイアス設定</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">馬場状態</label>
              <select
                value={trackCondition}
                onChange={(e) => setTrackCondition(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              >
                <option value="firm">良（firm）</option>
                <option value="good">稍重（good）</option>
                <option value="yielding">重（yielding）</option>
                <option value="soft">不良（soft）</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                内有利 ({innerBias > 0 ? '+' : ''}{innerBias})
              </label>
              <input
                type="range"
                min="-10"
                max="10"
                value={innerBias}
                onChange={(e) => setInnerBias(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                外有利 ({outerBias > 0 ? '+' : ''}{outerBias})
              </label>
              <input
                type="range"
                min="-10"
                max="10"
                value={outerBias}
                onChange={(e) => setOuterBias(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                前残り ({frontBias > 0 ? '+' : ''}{frontBias})
              </label>
              <input
                type="range"
                min="-10"
                max="10"
                value={frontBias}
                onChange={(e) => setFrontBias(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                差し有利 ({rearBias > 0 ? '+' : ''}{rearBias})
              </label>
              <input
                type="range"
                min="-10"
                max="10"
                value={rearBias}
                onChange={(e) => setRearBias(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
          
          <button
            onClick={handleSimulate}
            disabled={loading}
            className="mt-6 w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-bold"
          >
            {loading ? '⏳ シミュレーション実行中...' : '🚀 シミュレーション実行'}
          </button>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <strong>エラー:</strong> {error}
          </div>
        )}

        {/* 3D可視化（Phase 4.2プロトタイプ） */}
        {result && result.simulation && (
          <>
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">🎬 3Dシミュレーション（Phase 4.2）</h2>
              <RaceSimulator3DProto
                simulationResult={result.simulation}
                courseInfo={result.courseInfo || null}
              />
            </div>

            {/* 予想着順 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">📊 予想着順</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="py-2 px-4 text-left">着順</th>
                      <th className="py-2 px-4 text-left">馬番</th>
                      <th className="py-2 px-4 text-left">枠</th>
                      <th className="py-2 px-4 text-left">馬名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.finalStandings.map((horse) => (
                      <tr key={horse.horseNumber} className="border-b border-gray-200">
                        <td className="py-2 px-4 font-bold">{horse.position}</td>
                        <td className="py-2 px-4">{horse.horseNumber}</td>
                        <td className="py-2 px-4">{horse.waku}</td>
                        <td className="py-2 px-4">{horse.horseName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
