'use client';

import { use as usePromise, useState } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import EntryTable from '@/app/components/EntryTable';
import { ResearchPanel } from '@/app/components/ResearchPanel';
import { assignLabelsByZ } from '@/utils/labels';
import { computeKisoScore } from '@/utils/getClusterData';
import type { RecordRow } from '@/types/record';
import { useRouter } from 'next/navigation';

// 3Dシミュレーター（SSR無効化）
const RaceSimulator3DProto = dynamic(
  () => import('@/app/components/RaceSimulator3DProto'),
  { ssr: false, loading: () => <div className="text-center py-12">3Dシミュレーター読み込み中...</div> }
);

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
};

type Props = {
  params: Promise<{ raceKey: string }>;
};

export default function RacePage({ params }: Props) {
  const { raceKey } = usePromise(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'entry' | 'simulation' | 'quick-analysis'>('entry');
  
  // シミュレーション用のステート
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [trackBias, setTrackBias] = useState({
    condition: 'good' as 'firm' | 'good' | 'yielding' | 'soft' | 'heavy',
    innerBias: 0,
    outerBias: 0,
    frontBias: 0,
    rearBias: 0,
  });

  const { data, error } = useSWR(
    raceKey ? `/api/race-detail/${raceKey}` : null,
    fetcher
  );

  if (error)
    return <p className="p-4 text-red-600">⚠️ 読み込みエラー</p>;
  if (!data)
    return <p className="p-4">loading…</p>;
  if (!Array.isArray(data.horses) || !data.horses.length) {
    return <p className="p-4 text-red-600">⚠️ データがありません</p>;
  }

  // raceKey から日付、競馬場、レース番号を抽出
  // raceKey format: YYYYMMDDCCNN (CC=course, NN=raceNo)
  const ymd = raceKey.slice(0, 8);
  const course = raceKey.slice(8, 10);
  const raceNo = raceKey.slice(10, 12);

  // 競馬場コード → 表示名
  const COURSE_NAME: Record<string, string> = {
    '01': '札幌', '02': '函館', '03': '福島', '04': '新潟',
    '05': '東京', '06': '中山', '07': '中京', '08': '京都',
    '09': '阪神', '10': '小倉',
  };

  // Horse data
  const horses: { entry: RecordRow; past: RecordRow[] }[] =
    data.horses.map((h: any) => ({ entry: h, past: [] }));

  // スコア計算 → ラベル
  const scores = horses.map(computeKisoScore);
  const labels = assignLabelsByZ(scores);

  // シミュレーション実行
  const runSimulation = async () => {
    setSimulationLoading(true);
    setSimulationError(null);
    setSimulationResult(null);

    try {
      const response = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: ymd.slice(0, 4),
          date: ymd.slice(4, 8),
          place: COURSE_NAME[course] ?? course,
          raceNumber: raceNo,
          trackBias,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'シミュレーション失敗');
      }

      setSimulationResult(result);
    } catch (err) {
      setSimulationError(err instanceof Error ? err.message : String(err));
    } finally {
      setSimulationLoading(false);
    }
  };

  return (
    <main className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">
          {ymd.slice(0, 4)}年{ymd.slice(4, 6)}月{ymd.slice(6)}日
          {' '}
          {COURSE_NAME[course] ?? course}
          {' '}
          {raceNo}R
        </h1>
        <button
          onClick={() => router.push(`/races/${ymd}`)}
          className="text-blue-600 underline"
        >
          ← 戻る
        </button>
      </div>

      {/* タブナビゲーション */}
      <div className="mb-4 flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('entry')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'entry'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📊 出走表
        </button>
        <button
          onClick={() => {
            setActiveTab('simulation');
            if (!simulationResult && !simulationLoading) {
              runSimulation();
            }
          }}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'simulation'
              ? 'border-b-2 border-green-600 text-green-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          🎬 展開予想
        </button>
        <button
          onClick={() => setActiveTab('quick-analysis')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'quick-analysis'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          🔍 クイック分析
        </button>
        <button
          onClick={() => router.push('/research-lab')}
          className="ml-auto px-4 py-2 font-medium text-purple-600 hover:text-purple-700 transition-colors"
        >
          🔬 研究ラボで開く →
        </button>
      </div>

      {/* コンテンツエリア */}
      {activeTab === 'entry' ? (
        <EntryTable
          horses={horses}
          labels={labels}
          scores={scores}
          marks={{}}
          setMarks={() => {}}
          favorites={new Set()}
          setFavorites={() => {}}
          showLabels
          raceKey={raceKey}
          frameNumbers={{}}
        />
      ) : activeTab === 'simulation' ? (
        <div className="space-y-4">
          {/* コンパクト馬場バイアス設定 */}
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <label className="text-sm font-medium">馬場状態:</label>
              <select
                value={trackBias.condition}
                onChange={(e) => setTrackBias({ ...trackBias, condition: e.target.value as any })}
                className="px-3 py-1 border rounded text-sm"
              >
                <option value="firm">良</option>
                <option value="good">稍重</option>
                <option value="yielding">重</option>
                <option value="soft">不良</option>
              </select>

              <div className="flex gap-2 items-center">
                <button
                  onClick={() => setTrackBias({ ...trackBias, innerBias: trackBias.innerBias === 0.2 ? 0 : 0.2 })}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    trackBias.innerBias > 0 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  内有利
                </button>
                <button
                  onClick={() => setTrackBias({ ...trackBias, outerBias: trackBias.outerBias === 0.2 ? 0 : 0.2 })}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    trackBias.outerBias > 0 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  外有利
                </button>
                <button
                  onClick={() => setTrackBias({ ...trackBias, frontBias: trackBias.frontBias === 0.2 ? 0 : 0.2 })}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    trackBias.frontBias > 0 ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  前有利
                </button>
                <button
                  onClick={() => setTrackBias({ ...trackBias, rearBias: trackBias.rearBias === 0.2 ? 0 : 0.2 })}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    trackBias.rearBias > 0 ? 'bg-purple-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  後有利
                </button>
              </div>

              <button
                onClick={runSimulation}
                disabled={simulationLoading}
                className="ml-auto px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 text-sm font-medium"
              >
                {simulationLoading ? '実行中...' : '再実行'}
              </button>
            </div>
          </div>

          {/* エラー表示 */}
          {simulationError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              <strong>エラー:</strong> {simulationError}
            </div>
          )}

          {/* ローディング */}
          {simulationLoading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-green-600"></div>
              <p className="mt-4 text-gray-600">シミュレーション実行中...</p>
            </div>
          )}

          {/* 3Dシミュレーター */}
          {simulationResult && simulationResult.simulation && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">🎬 3Dシミュレーション</h2>
              <RaceSimulator3DProto
                simulationResult={simulationResult.simulation}
                courseInfo={simulationResult.courseInfo || null}
              />
            </div>
          )}

          {/* 予想着順 */}
          {simulationResult && simulationResult.finalStandings && (
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
                    {simulationResult.finalStandings.map((horse: any) => (
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
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* 保存済み条件との照合 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">✅ 保存済み条件との照合</h2>
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-3">🔄</div>
              <p className="mb-2">条件マッチング機能は実装予定です</p>
              <p className="text-sm">研究ラボで保存した条件が自動で照合されます</p>
            </div>
          </div>
          
          {/* クイック分析 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">🔍 クイック分析</h2>
            <ResearchPanel targetType="race" targetId={raceKey} />
          </div>
          
          {/* 研究ラボへの導線 */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 text-center">
            <h3 className="font-bold text-purple-900 mb-2">
              🔬 より詳しく研究したい場合
            </h3>
            <p className="text-purple-800 mb-4">
              研究ラボでは、レースに紐づかない自由な研究ができます。<br />
              条件を発見し、保存して、今後のレースで活用しましょう。
            </p>
            <button
              onClick={() => router.push('/research-lab')}
              className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              研究ラボを開く →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
