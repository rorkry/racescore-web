'use client';

import { use as usePromise } from 'react';
import useSWR from 'swr';
import EntryTable from '@/app/components/EntryTable';
import { assignLabelsByZ } from '@/app/page';
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
  const dateCode = ymd.slice(4, 6) + ymd.slice(6);

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

      <EntryTable
        horses={horses}
        dateCode={dateCode}
        place={course}
        raceNo={raceNo}
        labels={labels}
        scores={scores}
        marks={{}}
        setMarks={() => {}}
        favorites={new Set()}
        setFavorites={() => {}}
        frameColor={{}}
        clusterRenderer={() => null}
        showLabels
        raceKey={raceKey}
        winOddsMap={{}}
        predicted={null}
      />
    </main>
  );
}
