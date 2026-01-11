'use client';

import { useRouter } from 'next/navigation';
import { use as usePromise, useMemo } from 'react';
import useSWR from 'swr';

// API fetch helper
const fetcher = (url: string) => fetch(url).then(r => r.json());

// 競馬場コード → 表示名
const COURSE_NAME: Record<string, string> = {
  '01': '札幌', '02': '函館', '03': '福島', '04': '新潟',
  '05': '東京', '06': '中山', '07': '中京', '08': '京都',
  '09': '阪神', '10': '小倉',
};

// 競馬場コード → 日本語名（API用）
const COURSE_JP: Record<string, string> = {
  '01': '札幌', '02': '函館', '03': '福島', '04': '新潟',
  '05': '東京', '06': '中山', '07': '中京', '08': '京都',
  '09': '阪神', '10': '小倉',
};

interface TimeHighlight {
  raceNumber: string;
  place: string;
  hasTimeHighlight: boolean;
  highlightCount: number;
  bestTimeDiff: number;
}

/**
 * /races/[ymd] — その開催日の「場所別レース番号一覧」を表示
 */
export default function RacesByDay({ params }: { params: Promise<{ ymd: string }> }) {
  const { ymd } = usePromise(params);
  const { data, error } = useSWR(
    ymd ? `/api/races-by-day?ymd=${ymd}` : null,
    fetcher
  );
  
  // 日付をAPI用のフォーマットに変換（YYYYMMDD → YYYY.MM.DD）
  const dateForApi = useMemo(() => {
    if (!ymd || ymd.length !== 8) return '';
    return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
  }, [ymd]);
  
  // 時計ハイライト情報を取得
  const { data: highlightData } = useSWR(
    dateForApi ? `/api/time-highlights?date=${dateForApi}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  
  const router = useRouter();

  if (error) return <p className="p-4 text-red-600">⚠️ エラーが発生しました</p>;
  if (!data)  return <p className="p-4">loading…</p>;

  // 型を付けておく
  const courseMap = data as Record<string, number[]>;
  
  // ハイライト情報をMap化
  const highlightMap = useMemo(() => {
    const map = new Map<string, TimeHighlight>();
    if (highlightData?.highlights) {
      for (const h of highlightData.highlights as TimeHighlight[]) {
        const key = `${h.place}_${h.raceNumber}`;
        map.set(key, h);
      }
    }
    return map;
  }, [highlightData]);

  // 時計ハイライトの目印を取得
  const getHighlightBadge = (courseName: string, raceNo: number) => {
    const key = `${courseName}_${raceNo}`;
    const highlight = highlightMap.get(key);
    
    if (!highlight?.hasTimeHighlight) return null;
    
    // 時計差に応じてバッジの色を変える
    const timeDiff = highlight.bestTimeDiff;
    let bgColor = 'bg-yellow-400'; // デフォルト
    let emoji = '⏱️';
    
    if (timeDiff <= 0) {
      bgColor = 'bg-red-500';
      emoji = '🔥';  // 上位クラスを上回る
    } else if (timeDiff <= 0.5) {
      bgColor = 'bg-orange-500';
      emoji = '⏱️';  // 0.5秒以内
    } else {
      bgColor = 'bg-yellow-500';
      emoji = '⏱️';  // 1秒以内
    }
    
    return (
      <span 
        className={`ml-1 text-xs ${bgColor} text-white px-1 rounded`}
        title={`時計優秀: ${highlight.highlightCount}頭 (最良${timeDiff <= 0 ? '上回る' : timeDiff + '秒差'})`}
      >
        {emoji}
      </span>
    );
  };

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-bold">
        {ymd.slice(4, 6)}月{ymd.slice(6)}日のレース
      </h1>
      
      {/* 凡例 */}
      <div className="text-sm text-gray-600 flex gap-4 items-center">
        <span>凡例:</span>
        <span className="flex items-center gap-1">
          <span className="bg-red-500 text-white px-1 rounded text-xs">🔥</span>
          上位時計超え
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-orange-500 text-white px-1 rounded text-xs">⏱️</span>
          0.5秒以内
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-yellow-500 text-white px-1 rounded text-xs">⏱️</span>
          1秒以内
        </span>
      </div>

      {Object.entries(courseMap).map(([course, races]) => {
        const courseName = COURSE_NAME[course] ?? course;
        
        return (
          <section key={course} className="space-y-2">
            <h2 className="text-lg font-semibold">
              {courseName}
            </h2>

            <div className="flex flex-wrap gap-2">
              {races.map(no => {
                // raceKey: YYYYMMDD + 2桁course + 2桁raceNo
                const raceKey = `${ymd}${course.padStart(2, '0')}${String(no).padStart(2, '0')}`;
                const badge = getHighlightBadge(courseName, no);
                
                return (
                  <button
                    key={no}
                    onClick={() => router.push(`/race/${raceKey}`)}
                    className={`px-3 py-1 border rounded hover:bg-gray-100 flex items-center ${badge ? 'border-orange-300' : ''}`}
                  >
                    {no}R
                    {badge}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <button
        onClick={() => router.push('/')}
        className="inline-block mt-6 underline text-blue-600"
      >
        ← 開催日一覧へ戻る
      </button>
    </main>
  );
}
