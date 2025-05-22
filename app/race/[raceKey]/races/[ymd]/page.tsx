// app/races/[ymd]/page.tsx
'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const COURSE_NAME: Record<string, string> = {
  '01': '札幌', '02': '函館', '03': '福島', '04': '新潟',
  '05': '東京', '06': '中山', '07': '中京', '08': '京都',
  '09': '阪神', '10': '小倉',
};

export default function RacesByDay() {
  /** 1) URL パラメータ取得 */
  const { ymd } = useParams<{ ymd: string }>();
  const router  = useRouter();

  /** 2) API 取得 */
  const { data, error } = useSWR(
    ymd ? `/api/races-by-day?ymd=${ymd}` : null,
    fetcher
  );

  if (error) return <p style={{ color: 'red' }}>error</p>;
  if (!data)  return <p>loading…</p>;

  /** 3) 表示 */
  return (
    <main style={{ padding: 24 }}>
      <h1>{ymd.slice(4, 6)}月{ymd.slice(6)}日のレース</h1>

      {Object.entries<Record<string, number[]>>(data).map(([course, races]) => (
        <section key={course} style={{ marginBottom: 24 }}>
          <h2>{COURSE_NAME[course] ?? course}</h2>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {races.map((no) => (
              <button
                key={no}
                onClick={() =>
                  router.push(
                    `/races/${ymd}/${course}/${String(no).padStart(2, '0')}`
                  )
                }
                style={{
                  padding: '4px 10px',
                  border: '1px solid #666',
                  borderRadius: 4,
                }}
              >
                {no}R
              </button>
            ))}
          </div>
        </section>
      ))}

      <button onClick={() => router.push('/')} style={{ marginTop: 40 }}>
        ← 開催日一覧へ戻る
      </button>
    </main>
  );
}