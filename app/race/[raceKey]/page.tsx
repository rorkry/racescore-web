'use client';

import { use as usePromise, useState, useEffect } from 'react';
import useSWR from 'swr';
import EntryTable from '@/app/components/EntryTable';
import RaceSimulatorCard from '@/app/components/RaceSimulatorCard';
import { ResearchPanel } from '@/app/components/ResearchPanel';
import { assignLabelsByZ } from '@/utils/labels';
import { computeKisoScore } from '@/utils/getClusterData';
import type { RecordRow } from '@/types/record';
import { useRouter } from 'next/navigation';

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
  
  // シミュレーション用のステート
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

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

  // raceKey変更時にシミュレーション自動実行
  useEffect(() => {
    if (raceKey && data && data.horses?.length > 0) {
      runSimulation();
    }
  }, [raceKey]);

  return (
    <main className="p-4 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold text-slate-800">
          {ymd.slice(0, 4)}年{ymd.slice(4, 6)}月{ymd.slice(6)}日
          {' '}
          {COURSE_NAME[course] ?? course}
          {' '}
          {raceNo}R
        </h1>
        <button
          onClick={() => router.push(`/races/${ymd}`)}
          className="text-blue-600 hover:text-blue-700 underline text-sm font-medium"
        >
          ← 戻る
        </button>
      </div>

      {/* 3D展開予想カード */}
      <RaceSimulatorCard
        simulationResult={simulationResult}
        loading={simulationLoading}
        error={simulationError}
        onRetry={runSimulation}
      />

      {/* 出走表 */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold mb-4 text-slate-800">📊 出走表</h2>
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
      </div>

      {/* クイック分析 */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold mb-4 text-slate-800">🔍 クイック分析</h2>
        <ResearchPanel targetType="race" targetId={raceKey} />
      </div>
    </main>
  );
}
