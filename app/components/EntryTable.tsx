'use client';


import React from 'react';
import type { RecordRow } from '../../types/record';

export type HorseWithPast = {
  entry: RecordRow;
  past: RecordRow[];
};

type Props = {
  horses: HorseWithPast[];
  labels: string[];
  scores: number[];
  marks: Record<string, Record<string, string>>;
  setMarks: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  favorites: Set<string>;
  setFavorites: React.Dispatch<React.SetStateAction<Set<string>>>;
  showLabels?: boolean;
  raceKey: string;
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
  labels,
  scores,
  marks,
  setMarks,
  favorites,
  setFavorites,
  showLabels = true,
  raceKey,
  frameNumbers = {},
}: Props) {
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

  const formatPastRace = (race: RecordRow) => {
    const distance = race.distance || race.距離 || '';
    // 芝ダート区分の重複バグ修正：distanceに既に「芝」または「ダ」が含まれている場合はそのまま使用
    const surfaceInDistance = distance.includes('芝') || distance.includes('ダ');
    const surface = surfaceInDistance ? '' : (distance.includes('ダ') ? 'ダ' : '芝');
    const courseName = race.course || race.開催地 || '';
    const trackCondition = race.trackCondition || race.馬場状態 || '';
    const className = race.classname || race['クラス名'] || '';
    const popularity = race.popularity || race.人気 || '';
    const finish = race.finish || race.着順 || '';
    const timeRaw = race.time || race['走破タイム'] || '';
    // 時計表示修正: "1538" → "1.53.8"
    const formatTime = (t: string): string => {
      if (!t) return '';
      const str = t.toString().padStart(4, '0');
      const m = str.slice(0, 1);
      const ss = str.slice(1, 3);
      const d = str.slice(3);
      return `${m}.${ss}.${d}`;
    };
    const time = formatTime(timeRaw);
    const timeDiff = race.timeDiff || race['着差'] || '';
    // 通過順位: "4-4-4-3" 形式
    const passing = race['通過順位'] || race['コーナー'] || race.corner || '';
    // 巻き返し指数: 0-10
    const kisoIndexRaw = race['巻き返し指数'] || race['F'] || race.kiso || '';
    const kisoIndex = kisoIndexRaw ? parseInt(kisoIndexRaw, 10) : null;
    // 巻き返し指数の色分け: 0=灰色、0-4=青、5-8=オレンジ、9-10=赤
    const getKisoColor = (k: number | null): string => {
      if (k === null || k === 0) return '#999';
      if (k >= 1 && k <= 4) return '#3b82f6';
      if (k >= 5 && k <= 8) return '#f97316';
      if (k >= 9 && k <= 10) return '#dc2626';
      return '#999';
    };
    const kisoColor = getKisoColor(kisoIndex);

    return (
      <div style={{ fontSize: '0.75rem', lineHeight: '1.3' }}>
        <div style={{ fontWeight: 600, marginBottom: '2px' }}>
          {trackCondition} {courseName}{surface}{distance}
        </div>
        <div>{className} {popularity}人気 {finish}着</div>
        <div style={{ color: '#666' }}>
          {time} {timeDiff ? `(${timeDiff})` : ''}
        </div>
        {passing && (
          <div style={{ color: '#666', fontSize: '0.7rem' }}>
            通過: {passing}
          </div>
        )}
        {kisoIndex !== null && (
          <div style={{ color: kisoColor, fontWeight: 600, fontSize: '0.7rem' }}>
            巻き返し: {kisoIndex}
          </div>
        )}
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
          padding: 2px 4px;
          border: 1px solid #ccc;
          border-radius: 2px;
          cursor: pointer;
          font-size: 0.65rem;
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
            <th>印</th>
            <th>馬名</th>
            <th>騎手</th>
            <th>斤量</th>
            {showLabels && <th>指数</th>}
            <th>競うスコア</th>
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
                <td>
                  <select
                    value={currentMark}
                    onChange={(e) => handleMarkClick(horseNo, e.target.value)}
                    style={{
                      fontSize: '0.85rem',
                      padding: '2px 4px',
                      border: '1px solid #ccc',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      backgroundColor: currentMark ? '#1f2937' : 'white',
                      color: currentMark ? 'white' : '#000',
                      fontWeight: currentMark ? 'bold' : 'normal',
                    }}
                  >
                    <option value="">-</option>
                    <option value="◎">◎</option>
                    <option value="○">○</option>
                    <option value="▲">▲</option>
                    <option value="△">△</option>
                    <option value="☆">☆</option>
                    <option value="紐">紐</option>
                    <option value="消">消</option>
                  </select>
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
                <td>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                    {scores[idx] !== undefined ? Math.round(scores[idx]) : '-'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>
                    {/* 印の自動割り当て: スコア順に◎○▲☆△ */}
                    {(() => {
                      const sortedScores = scores.map((s, i) => ({ score: s, idx: i })).sort((a, b) => b.score - a.score);
                      const rank = sortedScores.findIndex((s) => s.idx === idx) + 1;
                      if (rank === 1) return '◎';
                      if (rank === 2) return '○';
                      if (rank === 3) return '▲';
                      if (rank === 4) return '☆';
                      if (rank === 5) return '△';
                      return '';
                    })()}
                  </div>
                </td>
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
                      ? formatPastRace(horse.past[tabIndex])
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
