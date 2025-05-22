'use client';

import { use as usePromise } from 'react';
import useSWR from 'swr';
import EntryTable from '@/app/components/EntryTable';
import { assignLabelsByZ } from '@/app/page';
import { computeKisoScore } from '@/utils/getClusterData';
import type { RecordRow } from '@/types/record';

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
};

type Props = {
  params: Promise<{ ymd: string; course: string; raceNo: string }>;
};

export default function RacePage({ params }: Props) {
  const { ymd, course, raceNo } = usePromise(params);
  // 8桁 ymd + 2桁 course + 2桁 raceNo ＝ 12桁 raceKey
  const raceKey = `${ymd.trim()}${course.trim().padStart(2, '0')}${raceNo.trim().padStart(2, '0')}`;

  const { data, error } = useSWR(
    `/api/race-detail/${raceKey}`,
    fetcher
  );

  if (error)
    return <p className="p-4 text-red-600">⚠️ 読み込みエラー</p>;
  if (!data)
    return <p className="p-4">loading…</p>;
  if (!Array.isArray(data.horses) || !data.horses.length) {
    return <p className="p-4 text-red-600">⚠️ データがありません</p>;
  }

  // ---------------- Horse data ----------------
  const horses: { entry: RecordRow; past: RecordRow[] }[] =
    data.horses.map((h: any) => ({ entry: h, past: [] })); // past は後で拡張

  // スコア計算 → ラベル
  const scores = horses.map(computeKisoScore);
  const labels = assignLabelsByZ(scores);

  return (
    <main className="p-4">
      <h1 className="text-lg font-bold mb-4">
        {data.dateCode.slice(0, -2)}月{data.dateCode.slice(-2)}日
        {' '}
        {course} {raceNo}R
      </h1>

      <EntryTable
        horses={horses}
        dateCode={data.dateCode}
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