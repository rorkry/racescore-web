// app/components/EntryTable.tsx
'use client';
import React from 'react';
import { levelToStars, classToRank, toHalfWidth, formatTime, toSec } from '../page'; // ★ util が別ファイル化されるまでは page.tsx から流用

export type RecordRow = { [key: string]: string };
export type HorseWithPast = {
  entry: RecordRow;
  past: RecordRow[];
};

type Props = {
  horses: HorseWithPast[];
  dateCode: string;
  place: string;
  raceNo: string;
  labels: string[];
  favorites: Set<string>;
  frameColor: Record<string,string>;
  clusterRenderer: (r: RecordRow) => JSX.Element[];   // getClusterElements を受け取る
};

export default function EntryTable({
  horses,
  dateCode,
  place,
  raceNo,
  labels,
  favorites,
  frameColor,
  clusterRenderer,
}: Props) {
  return (
    <div className="overflow-auto bg-white rounded-xl shadow-md">
      <table className="w-full text-left border-collapse border border-black text-xs">
        {/* --- thead 省略（今までのままコピペ） --- */}
        <thead>…</thead>

        <tbody>
          {horses.map((horse, idx) => (
            <tr key={idx} className="odd:bg-white even:bg-gray-50">
              {/* 馬番セル */}
              <td
                className={`w-8 px-0 py-0 border border-black text-center align-middle ${
                  frameColor[horse.entry['枠番'] ?? ''] ?? 'bg-gray-300 text-black'
                }`}
              >
                {horse.entry['馬番']}
              </td>

              {/* 馬名・詳細セル … */}
              {/* …中略… */}

              {/* 過去５走セル */}
              {horse.past.map((r, j) => {
                /* 元の過去５走ロジックをそのまま移植 */
                const rid = r['レースID(新/馬番無)']?.trim() || '';
                const fin = r['着差']?.trim() && ` (${r['着差'].trim()})`;

                return (
                  <td key={j} className="align-top relative px-1 py-0.5 border border-black text-black text-xs">
                    {/* ↑ 途中の UI はそのままコピー … */}
                    {/* 別クラスタイム */}
                    {clusterRenderer(r)}
                  </td>
                );
              })}
              {/* 空白補完セル */}
              {horse.past.length < 5 &&
                Array.from({ length: 5 - horse.past.length }).map((_, k) => (
                  <td key={`empty-${k}`} className="align-top px-1 py-0.5 border border-black bg-white text-black text-xs">
                    &nbsp;
                  </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}