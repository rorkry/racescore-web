'use client';

import { useSyntheticWinOdds } from '@/hooks/useSyntheticWinOdds';
import React from 'react';
import type { RecordRow } from '../../types/record';
import { getClusterData } from '../../utils/getClusterData';

export type HorseWithPast = {
  entry: RecordRow;
  past: RecordRow[];
  winOdds?: number | null;
};

type Props = {
  horses: HorseWithPast[];
  dateCode: string;
  place: string;
  raceNo: string;
  labels: string[];
  scores: number[];
  winOddsMap?: Record<string, number>;
  predicted?: Record<string, number | null>;
  marks: Record<string, Record<string, string>>;
  setMarks: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  favorites: Set<string>;
  setFavorites: React.Dispatch<React.SetStateAction<Set<string>>>;
  frameColor?: Record<string, string>;
  clusterRenderer?: (r: RecordRow) => JSX.Element[];
  showLabels?: boolean;
  largeCells?: boolean;
  raceKey: string;
  allRaces?: RecordRow[];
  frameNumbers?: Record<string, number>;
};

const FRAME_COLORS: Record<number, string> = {
  1: '#ffffff',
  2: '#000000',
  3: '#ff0000',
  4: '#0000ff',
  5: '#ffff00',
  6: '#00aa00',
  7: '#ff8800',
  8: '#ff69b4',
};

const FRAME_TEXT_COLORS: Record<number, string> = {
  1: '#000000',
  2: '#ffffff',
  3: '#ffffff',
  4: '#ffffff',
  5: '#000000',
  6: '#ffffff',
  7: '#ffffff',
  8: '#ffffff',
};

const INDEX_COLORS: Record<string, { bg: string; text: string }> = {
  'くるでしょ': { bg: '#dc2626', text: '#ffffff' },
  'めっちゃきそう': { bg: '#f97316', text: '#ffffff' },
  'ちょっときそう': { bg: '#3b82f6', text: '#ffffff' },
  'こなそう': { bg: '#93c5fd', text: '#000000' },
  'きません': { bg: '#d1d5db', text: '#000000' },
};

export default function EntryTable({
  horses,
  dateCode,
  place,
  raceNo,
  labels,
  scores,
  winOddsMap = {},
  predicted = {},
  marks,
  setMarks,
  favorites,
  setFavorites,
  frameColor = {},
  clusterRenderer,
  showLabels = true,
  largeCells = false,
  raceKey,
  allRaces = [],
  frameNumbers = {},
}: Props) {
  const { data: syntheticFromHook } = useSyntheticWinOdds(raceKey);

  const cacheRef = React.useRef<Record<string, any>>({});
  const [selectedTab, setSelectedTab] = React.useState<Record<string, number>>({});

  const handleMarkClick = (horseNo: string, mark: string) => {
    setMarks((prev) => {
      const updated = { ...prev };
      if (!updated[horseNo]) updated[horseNo] = {};
      updated[horseNo][raceKey] = updated[horseNo][raceKey] === mark ? '' : mark;
      return updated;
    });
  };

  const handleFavoriteClick = (horseNo: string) => {
    setFavorites((prev) => {
      const updated = new Set(prev);
      if (updated.has(horseNo)) {
        updated.delete(horseNo);
      } else {
        updated.add(horseNo);
      }
      return updated;
    });
  };

  const getFrameColor = (horseNo: string): { bg: string; text: string } => {
    const frameNum = frameNumbers[horseNo];
    if (frameNum && FRAME_COLORS[frameNum]) {
      return {
        bg: FRAME_COLORS[frameNum],
        text: FRAME_TEXT_COLORS[frameNum],
      };
    }
    return { bg: '#ffffff', text: '#000000' };
  };

  const formatPastRace = (race: RecordRow, index: number) => {
    const date = race['日付(yyyy.mm.dd)'] || race.date || '';
    const place = race.place || race.場所 || '';
    const distance = race.distance || race.距離 || '';
    const surface = distance.includes('ダ') ? 'ダ' : '芝';
    const className = race.classname || race['クラス名'] || '';
    const popularity = race.popularity || race.人気 || '';
    const finish = race.finish || race.着順 || '';
    const time = race.time || race['走破タイム'] || '';
    const timeDiff = race.timeDiff || '';

    const dayLabel = ['1走前', '2走前', '3走前', '4走前', '5走前'][index] || '';

    return (
      <div style={{ fontSize: '0.75rem', lineHeight: '1.3' }}>
        <div style={{ fontWeight: 600, marginBottom: '2px' }}>
          {dayLabel} {surface}{distance}
        </div>
        <div>{className} {popularity}人気 {finish}着</div>
        <div style={{ color: '#666' }}>
          {time} {timeDiff ? `(${timeDiff})` : ''}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full overflow-x-auto bg-white dark:bg-gray-900">
      <style>{`
        .entry-table {
          border-collapse: collapse;
          width: 100%;
          font-size: 0.875rem;
        }
        .entry-table th,
        .entry-table td {
          border: 1px solid #ddd;
          padding: 6px 4px;
          text-align: center;
        }
        .entry-table th {
          background-color: #1f2937;
          color: white;
          font-weight: 600;
          font-size: 0.75rem;
        }
        .entry-table tbody tr:nth-child(odd) {
          background-color: #f9fafb;
        }
        .entry-table tbody tr:hover {
          background-color: #f3f4f6;
        }
        .dark .entry-table tbody tr:nth-child(odd) {
          background-color: #1f2937;
        }
        .dark .entry-table tbody tr:hover {
          background-color: #374151;
        }
        .dark .entry-table th,
        .dark .entry-table td {
          border-color: #4b5563;
          color: #e5e7eb;
        }
        .horse-name {
          text-align: left;
          font-weight: 500;
          position: relative;
        }
        .horse-favorite {
          position: absolute;
          right: 2px;
          top: 2px;
          font-size: 0.9rem;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
          line-height: 1;
        }
        .mark-tabs {
          display: flex;
          gap: 2px;
          justify-content: center;
        }
        .mark-tab {
          padding: 4px 6px;
          border: 1px solid #ccc;
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.75rem;
          background: white;
          transition: all 0.2s;
          font-weight: 600;
        }
        .mark-tab:hover {
          background-color: #e5e7eb;
        }
        .mark-tab.active {
          background-color: #1f2937;
          color: white;
          border-color: #1f2937;
        }
        .index-badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.7rem;
          font-weight: 600;
          white-space: nowrap;
        }
        .past-race-tabs {
          display: flex;
          gap: 2px;
          margin-bottom: 4px;
          border-bottom: 1px solid #ddd;
        }
        .past-race-tab {
          padding: 4px 6px;
          border: 1px solid #ddd;
          border-bottom: none;
          border-radius: 3px 3px 0 0;
          cursor: pointer;
          font-size: 0.7rem;
          background: #f3f4f6;
          transition: all 0.2s;
        }
        .past-race-tab.active {
          background: white;
          border-color: #ddd;
          font-weight: 600;
        }
        .past-race-content {
          padding: 4px;
          min-height: 60px;
        }
        .dark .past-race-tabs {
          border-bottom-color: #4b5563;
        }
        .dark .past-race-tab {
          background: #374151;
          border-color: #4b5563;
        }
        .dark .past-race-tab.active {
          background: #1f2937;
        }
      `}</style>

      <table className="entry-table">
        <thead>
          <tr>
            <th>馬番</th>
            <th>馬名</th>
            <th>印</th>
            <th>騎手</th>
            <th>斤量</th>
            {showLabels && <th>指数</th>}
            <th>過去5走</th>
          </tr>
        </thead>
        <tbody>
          {horses.map((horse, idx) => {
            const horseNo = String(horse.entry.horseNo || horse.entry.馬番 || '').padStart(2, '0');
            const horseNoDisplay = parseInt(horseNo, 10).toString();
            const horseName = String(horse.entry.horseName || horse.entry.馬名 || '');
            const jockey = String(horse.entry.jockey || horse.entry.騎手 || '');
            const weight = String(horse.entry.weight || horse.entry.斤量 || '');
            const currentMark = marks[horseNo]?.[raceKey] || '';
            const isFavorite = favorites.has(horseNo);
            const scoreLabel = labels[idx] || '';

            const frameColorStyle = getFrameColor(horseNo);

            const tabIndex = selectedTab[horseNo] || 0;

            return (
              <tr key={horseNo}>
                <td
                  style={{
                    backgroundColor: frameColorStyle.bg,
                    color: frameColorStyle.text,
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                  }}
                >
                  {horseNoDisplay}
                </td>
                <td className="horse-name">
                  {horseName}
                  <button
                    className="horse-favorite"
                    onClick={() => handleFavoriteClick(horseNo)}
                    style={{
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      padding: '0 2px',
                      lineHeight: '1',
                    }}
                  >
                    {isFavorite ? '★' : '☆'}
                  </button>
                </td>
                <td>
                  <div className="mark-tabs">
                    {['◎', '○', '▲', '△', '×'].map((mark) => (
                      <button
                        key={mark}
                        className={`mark-tab ${currentMark === mark ? 'active' : ''}`}
                        onClick={() => handleMarkClick(horseNo, mark)}
                      >
                        {mark}
                      </button>
                    ))}
                  </div>
                </td>
                <td style={{ fontSize: '0.85rem' }}>{jockey}</td>
                <td style={{ fontSize: '0.85rem' }}>{weight}</td>
                {showLabels && (
                  <td>
                    {scoreLabel && (
                      <div
                        className="index-badge"
                        style={{
                          backgroundColor: INDEX_COLORS[scoreLabel]?.bg || '#d1d5db',
                          color: INDEX_COLORS[scoreLabel]?.text || '#000000',
                        }}
                      >
                        {scoreLabel}
                      </div>
                    )}
                  </td>
                )}
                <td style={{ padding: '4px', textAlign: 'left' }}>
                  <div className="past-race-tabs">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <button
                        key={i}
                        className={`past-race-tab ${tabIndex === i ? 'active' : ''}`}
                        onClick={() => setSelectedTab({ ...selectedTab, [horseNo]: i })}
                      >
                        {i + 1}走前
                      </button>
                    ))}
                  </div>
                  <div className="past-race-content">
                    {horse.past[tabIndex]
                      ? formatPastRace(horse.past[tabIndex], tabIndex)
                      : '情報なし'}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
