'use client';

import { useSyntheticWinOdds } from '@/hooks/useSyntheticWinOdds';
import React from 'react';
import type { RecordRow } from '../../types/record';
import { getClusterData, levelToStars } from '../../utils/getClusterData';

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
  winOddsMap: Record<string, number>;
  predicted?: Record<string, number | null>;
  marks: Record<string, Record<string, string>>;
  setMarks: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  favorites: Set<string>;
  setFavorites: React.Dispatch<React.SetStateAction<Set<string>>>;
  frameColor: Record<string, string>;
  clusterRenderer: (r: RecordRow) => JSX.Element[];
  showLabels?: boolean;
  largeCells?: boolean;
  raceKey: string;
  allRaces?: RecordRow[];
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
  frameColor,
  clusterRenderer,
  showLabels = true,
  largeCells = false,
  raceKey,
  allRaces = [],
}: Props) {
  // 3連単→合成単勝オッズを取得
  const { data: syntheticFromHook } = useSyntheticWinOdds(raceKey);

  const mergedPredicted: Record<string, number | null> = React.useMemo(() => {
    if (predicted && Object.keys(predicted).length > 0) return predicted;
    if (!syntheticFromHook || syntheticFromHook.length === 0) return {};
    const m: Record<string, number> = {};
    syntheticFromHook.forEach(({ horseNo, odds }) => {
      if (Number.isFinite(odds) && odds > 0.5) {
        const key = String(horseNo).padStart(2, '0');
        m[key] = odds;
      }
    });
    return m;
  }, [predicted, syntheticFromHook]);

  const predMap: Record<string, number> = React.useMemo(() => {
    const src = (mergedPredicted ?? {}) as Record<string, number | string | null>;
    const m: Record<string, number> = {};
    Object.entries(src).forEach(([no, raw]) => {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n) || n <= 0.5) return;
      const padded = no.padStart(2, '0');
      const unpadded = padded.replace(/^0+/, '');
      m[padded] = n;
      m[unpadded] = n;
    });
    return m;
  }, [mergedPredicted]);

  const cacheRef = React.useRef<Record<string, any>>({});

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

  const hasWinOdds = Object.keys(winOddsMap).length > 0;
  const hasPred = Object.keys(predMap).length > 0;

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
          padding: 4px 6px;
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
        }
        .mark-btn {
          padding: 2px 4px;
          margin: 1px;
          border: 1px solid #ccc;
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.7rem;
          background: white;
          transition: all 0.2s;
        }
        .mark-btn:hover {
          background-color: #e5e7eb;
        }
        .mark-btn.active {
          background-color: #1f2937;
          color: white;
          border-color: #1f2937;
        }
        .cluster-info {
          font-size: 0.7rem;
          color: #666;
          line-height: 1.2;
        }
        .dark .cluster-info {
          color: #9ca3af;
        }
        .pci-value {
          font-weight: 600;
        }
        .pci-high {
          color: #dc2626;
        }
        .pci-low {
          color: #2563eb;
        }
        .passing-order {
          font-weight: 500;
        }
        .passing-order.highlight {
          background-color: #fef3c7;
          color: #92400e;
        }
        .dark .passing-order.highlight {
          background-color: #78350f;
          color: #fcd34d;
        }
        .score-badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.7rem;
          font-weight: 600;
          background-color: #dbeafe;
          color: #1e40af;
        }
        .dark .score-badge {
          background-color: #1e3a8a;
          color: #93c5fd;
        }
      `}</style>

      <table className="entry-table">
        <thead>
          <tr>
            <th>馬番</th>
            <th>馬名</th>
            <th>騎手</th>
            <th>斤量</th>
            {hasWinOdds && <th>オッズ</th>}
            {hasPred && <th>合成</th>}
            {showLabels && <th>指数</th>}
            <th>過去5走</th>
            <th>印</th>
            <th>★</th>
          </tr>
        </thead>
        <tbody>
          {horses.map((horse, idx) => {
            const horseNo = String(horse.entry.horseNo || horse.entry.馬番 || '').padStart(2, '0');
            const horseName = String(horse.entry.horseName || horse.entry.馬名 || '');
            const jockey = String(horse.entry.jockey || horse.entry.騎手 || '');
            const weight = String(horse.entry.weight || horse.entry.斤量 || '');
            const currentMark = marks[horseNo]?.[raceKey] || '';
            const isFavorite = favorites.has(horseNo);
            const score = scores[idx] || 0;
            const scoreLabel = labels[idx] || '';

            const winOdds = winOddsMap[horseNo] || winOddsMap[horseNo.replace(/^0+/, '')];
            const predOdds = predMap[horseNo];

            // クラスタータイム情報を取得
            const clusterData = horse.past.length > 0
              ? getClusterData(horse.past[0], allRaces, cacheRef)
              : [];

            return (
              <tr key={horseNo}>
                <td className="font-bold">{horseNo}</td>
                <td className="horse-name">{horseName}</td>
                <td>{jockey}</td>
                <td>{weight}</td>
                {hasWinOdds && (
                  <td className={winOdds ? 'font-semibold' : ''}>
                    {winOdds ? winOdds.toFixed(1) : '-'}
                  </td>
                )}
                {hasPred && (
                  <td className={predOdds ? 'font-semibold text-blue-600 dark:text-blue-400' : ''}>
                    {predOdds ? predOdds.toFixed(1) : '-'}
                  </td>
                )}
                {showLabels && (
                  <td>
                    {scoreLabel && (
                      <span className="score-badge">{scoreLabel}</span>
                    )}
                    {score > 0 && (
                      <div className="text-xs mt-1">{score.toFixed(2)}</div>
                    )}
                  </td>
                )}
                <td className="cluster-info">
                  {horse.past.slice(0, 3).map((race, i) => {
                    const cluster = clusterData[i];
                    const pci = race.PCI || race.PCI || '';
                    const passingOrder = race['2角'] || race['2角'] || '';

                    return (
                      <div key={i} style={{ marginBottom: '4px' }}>
                        {cluster && (
                          <div>
                            <span className="pci-value">
                              {cluster.dayLabel}
                              {cluster.className}
                            </span>
                            <br />
                            <span className={cluster.highlight === 'red' ? 'pci-high' : ''}>
                              {cluster.time}
                            </span>
                            {cluster.diff !== 0 && (
                              <span className={cluster.diff < 0 ? 'pci-low' : 'pci-high'}>
                                {cluster.diff > 0 ? '+' : ''}{cluster.diff.toFixed(1)}
                              </span>
                            )}
                          </div>
                        )}
                        {pci && (
                          <div>
                            PCI: <span className="pci-value">{pci}</span>
                          </div>
                        )}
                        {passingOrder && (
                          <div>
                            2角: <span className="passing-order">{passingOrder}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {['◎', '○', '▲', '△', '×'].map((mark) => (
                      <button
                        key={mark}
                        className={`mark-btn ${currentMark === mark ? 'active' : ''}`}
                        onClick={() => handleMarkClick(horseNo, mark)}
                      >
                        {mark}
                      </button>
                    ))}
                  </div>
                </td>
                <td>
                  <button
                    onClick={() => handleFavoriteClick(horseNo)}
                    style={{
                      fontSize: '1.2rem',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      padding: '4px',
                    }}
                  >
                    {isFavorite ? '★' : '☆'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
