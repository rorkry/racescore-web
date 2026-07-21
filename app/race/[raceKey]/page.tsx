'use client';

import { use as usePromise, useState } from 'react';
import useSWR from 'swr';
import EntryTable from '@/app/components/EntryTable';
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
  const [activeTab, setActiveTab] = useState<'entry' | 'quick-analysis'>('entry');

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
