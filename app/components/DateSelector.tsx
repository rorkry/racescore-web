'use client';

import React from 'react';

/**
 * 日付セレクタ
 *  props:
 *    dates    … "YYYYMMDD" もしくは "MMDD" などの開催日コード配列
 *    selected … 現在選択中の開催日コード
 *    onChange … クリックされた開催日コードを受け取るコールバック
 */
type Props = {
  dates: string[];
  selected: string;
  onChange: (ymd: string) => void;
};

/** "YYYYMMDD" / "MMDD" → "M月DD日" */
const formatDate = (code: string): string => {
  const mmdd = code.length === 8 ? code.slice(4) : code;   // 末尾 4 桁
  const p = mmdd.padStart(4, '0');                         // "MDD" → "0MDD"
  return `${parseInt(p.slice(0, 2), 10)}月${p.slice(2)}日`;
};

export default function DateSelector({ dates = [], selected, onChange }: Props) {
  // 重複除去して月日順ソート
  const list = Array.from(new Set(dates.filter(d => d.length >= 3)))
    .sort((a, b) => a.localeCompare(b));

  if (list.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {list.map(ymd => {
        const active = ymd === selected;
        return (
          <button
            key={ymd}
            onClick={() => onChange(ymd)}
            style={{
              padding: '4px 8px',
              border: '1px solid #888',
              borderRadius: 4,
              background: active ? '#2563eb' : 'transparent',
              color: active ? '#fff' : undefined,
            }}
          >
            {formatDate(ymd)}
          </button>
        );
      })}
    </div>
  );
}