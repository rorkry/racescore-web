'use client';

import { useRouter } from 'next/navigation';
import { use as usePromise, useMemo } from 'react';
import useSWR from 'swr';
import { useSession } from '@/app/components/Providers';

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

interface UserHighlight {
  place: string;
  raceNumber: string;
  favoriteHorses: string[];
  memoHorses: string[];
}

/**
 * /races/[ymd] — その開催日の「場所別レース番号一覧」を表示
 */
export default function RacesByDay({ params }: { params: Promise<{ ymd: string }> }) {
  const { ymd } = usePromise(params);
  const { status: authStatus } = useSession();

  const { data, error } = useSWR(
    ymd ? `/api/races-by-day?ymd=${ymd}` : null,
    fetcher
  );
  
  // 日付をAPI用のフォーマットに変換（YYYYMMDD → YYYY.MM.DD）
  const dateForApi = useMemo(() => {
    if (!ymd || ymd.length !== 8) return '';
    return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
  }, [ymd]);
  
  // 時計ハイライト情報を取得（年情報も追加）
  const yearForApi = ymd?.slice(0, 4) || '';
  const { data: highlightData } = useSWR(
    dateForApi ? `/api/time-highlights?date=${dateForApi}&year=${yearForApi}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // ユーザー固有ハイライト（お気に入り馬・メモ馬が出走するレース）
  // authStatus === 'authenticated' を条件にすることで、セッション確立前のフェッチを防ぐ
  // （未認証時に空データがキャッシュされると再フェッチされない問題を回避）
  const { data: userHighlightData } = useSWR(
    ymd && authStatus === 'authenticated' ? `/api/user/race-highlights?ymd=${ymd}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      revalidateIfStale: true,
    }
  );

  const router = useRouter();

  // ハイライト情報をMap化（Rules of Hooks: early return より前に配置）
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

  // ユーザー固有ハイライトをMap化（Rules of Hooks: early return より前に配置）
  const userHighlightMap = useMemo(() => {
    const map = new Map<string, UserHighlight>();
    if (userHighlightData?.highlights) {
      for (const h of userHighlightData.highlights as UserHighlight[]) {
        const key = `${h.place}_${h.raceNumber}`;
        map.set(key, h);
      }
    }
    return map;
  }, [userHighlightData]);

  if (error) return <p className="p-4 text-red-600">⚠️ エラーが発生しました</p>;
  if (!data)  return <p className="p-4">loading…</p>;

  // 型を付けておく
  const courseMap = data as Record<string, number[]>;

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

  // ユーザー固有バッジ（お気に入り・メモ馬）
  const getUserBadges = (courseName: string, raceNo: number) => {
    const key = `${courseName}_${raceNo}`;
    const item = userHighlightMap.get(key);
    if (!item) return null;
    const badges: React.ReactNode[] = [];
    if (item.favoriteHorses.length > 0) {
      badges.push(
        <span
          key="fav"
          className="ml-1 text-xs bg-amber-500 text-white px-1 rounded"
          title={`お気に入り馬出走: ${item.favoriteHorses.join(', ')}`}
        >
          ★{item.favoriteHorses.length}
        </span>
      );
    }
    if (item.memoHorses.length > 0) {
      badges.push(
        <span
          key="memo"
          className="ml-1 text-xs bg-emerald-600 text-white px-1 rounded"
          title={`メモ済み馬出走: ${item.memoHorses.join(', ')}`}
        >
          📓{item.memoHorses.length}
        </span>
      );
    }
    return badges.length > 0 ? <>{badges}</> : null;
  };

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-bold">
        {ymd.slice(4, 6)}月{ymd.slice(6)}日のレース
      </h1>
      
      {/* 凡例 */}
      <div className="text-sm text-gray-600 flex gap-3 items-center flex-wrap">
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
        <span className="flex items-center gap-1">
          <span className="bg-amber-500 text-white px-1 rounded text-xs">★</span>
          お気に入り馬
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-emerald-600 text-white px-1 rounded text-xs">📓</span>
          メモ済み馬
        </span>
      </div>

      {Object.entries(courseMap).map(([course, races]) => {
        const courseName = COURSE_NAME[course] ?? course;
        
        return (
          <section key={course} className="space-y-2">
            <h2 className="text-lg font-semibold">
              {courseName}
            </h2>

            {/* スマホ: 3列グリッドで各ボタンに余裕を持たせる / PC: 従来の flex-wrap */}
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
              {races.map(no => {
                // raceKey: YYYYMMDD + 2桁course + 2桁raceNo
                const raceKey = `${ymd}${course.padStart(2, '0')}${String(no).padStart(2, '0')}`;
                const badge = getHighlightBadge(courseName, no);
                const userBadges = getUserBadges(courseName, no);
                const hasAnyBadge = Boolean(badge) || Boolean(userBadges);

                return (
                  <button
                    key={no}
                    onClick={() => router.push(`/race/${raceKey}`)}
                    className={`px-2 sm:px-3 py-1.5 sm:py-1 border rounded hover:bg-gray-100 flex flex-wrap items-center justify-center gap-x-0.5 gap-y-1 min-h-[36px] text-sm ${hasAnyBadge ? 'border-orange-400 bg-orange-50' : ''}`}
                  >
                    <span className="font-semibold">{no}R</span>
                    {badge}
                    {userBadges}
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
