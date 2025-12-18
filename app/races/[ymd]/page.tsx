'use client';

import { useRouter } from 'next/navigation';
import { use as usePromise } from 'react';
import useSWR from 'swr';

// API fetch helper
const fetcher = (url: string) => fetch(url).then(r => r.json());

// 競馬場コード → 表示名
const COURSE_NAME: Record<string, string> = {
  '01': '札幌', '02': '函館', '03': '福島', '04': '新潟',
  '05': '東京', '06': '中山', '07': '中京', '08': '京都',
  '09': '阪神', '10': '小倉',
};

/**
 * /races/[ymd] — その開催日の「場所別レース番号一覧」を表示
 */
export default function RacesByDay({ params }: { params: Promise<{ ymd: string }> }) {
  const { ymd } = usePromise(params);
  const { data, error } = useSWR(
    ymd ? `/api/races-by-day?ymd=${ymd}` : null,
    fetcher
  );
  const router = useRouter();

  if (error) return <p className="p-4 text-red-600">⚠️ エラーが発生しました</p>;
  if (!data)  return <p className="p-4">loading…</p>;

  // 型を付けておく
  const courseMap = data as Record<string, number[]>;

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-bold">
        {ymd.slice(4, 6)}月{ymd.slice(6)}日のレース
      </h1>

      {Object.entries(courseMap).map(([course, races]) => (
        <section key={course} className="space-y-2">
          <h2 className="text-lg font-semibold">
            {COURSE_NAME[course] ?? course}
          </h2>

          <div className="flex flex-wrap gap-2">
            {races.map(no => {
              // raceKey: YYYYMMDD + 2桁course + 2桁raceNo
              const raceKey = `${ymd}${course.padStart(2, '0')}${String(no).padStart(2, '0')}`;
              return (
                <button
                  key={no}
                  onClick={() => router.push(`/race/${raceKey}`)}
                  className="px-3 py-1 border rounded hover:bg-gray-100"
                >
                  {no}R
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <button
        onClick={() => router.push('/')}
        className="inline-block mt-6 underline text-blue-600"
      >
        ← 開催日一覧へ戻る
      </button>
    </main>
  );
}
