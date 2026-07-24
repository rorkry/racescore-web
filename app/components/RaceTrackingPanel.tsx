'use client';

import type { TrackingRow } from '@/lib/race-simulator/tracking-rows';

/**
 * 画面端トラッキングパネル（全頭の識別を保証する常設 UI）。
 *
 * 仕様（ユーザー承認済み）:
 *  - PC（md 以上）は 3D ビューの右端に縦帯、狭幅（md 未満）は下端に横帯で表示する。
 *  - 各チップに 枠色 / 馬番 / 現在順位 / 先頭差 を出す（狭幅では馬番と枠色を優先）。
 *  - チップをクリックすると 3D の選択馬になる（onSelect）。3D 側の選択はハイライトで同期される。
 *  - 3D ビューを最も隠さない画面端に固定し、pointer-events はチップのみ有効にする。
 */
export interface RaceTrackingPanelProps {
  rows: TrackingRow[];
  selectedHorse: number | null;
  onSelect: (horseNumber: number) => void;
}

export default function RaceTrackingPanel({ rows, selectedHorse, onSelect }: RaceTrackingPanelProps) {
  if (!rows || rows.length === 0) return null;

  return (
    <>
      {/* PC: 右端 縦帯 */}
      <div
        className="pointer-events-none absolute right-0 top-0 z-40 hidden h-full w-[74px] flex-col gap-1 overflow-y-auto bg-black/35 px-1.5 py-2 backdrop-blur-sm md:flex"
        aria-label="出走馬トラッキング"
      >
        {rows.map((r) => (
          <TrackingChip
            key={r.horseNumber}
            row={r}
            selected={selectedHorse === r.horseNumber}
            onSelect={onSelect}
            layout="vertical"
          />
        ))}
      </div>

      {/* 狭幅: 下端 横帯 */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex h-[54px] flex-row gap-1 overflow-x-auto bg-black/35 px-2 py-1.5 backdrop-blur-sm md:hidden"
        aria-label="出走馬トラッキング"
      >
        {rows.map((r) => (
          <TrackingChip
            key={r.horseNumber}
            row={r}
            selected={selectedHorse === r.horseNumber}
            onSelect={onSelect}
            layout="horizontal"
          />
        ))}
      </div>
    </>
  );
}

function TrackingChip({
  row,
  selected,
  onSelect,
  layout,
}: {
  row: TrackingRow;
  selected: boolean;
  onSelect: (horseNumber: number) => void;
  layout: 'vertical' | 'horizontal';
}) {
  const ring = selected ? 'ring-2 ring-white' : 'ring-1 ring-black/30';
  const gapLabel = row.position === 1 ? '先頭' : `${row.gap.toFixed(1)}m`;

  if (layout === 'horizontal') {
    return (
      <button
        type="button"
        onClick={() => onSelect(row.horseNumber)}
        aria-label={`${row.horseNumber}番 ${row.name || ''} ${row.position}位`}
        aria-pressed={selected}
        className={`pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 ${ring}`}
        style={{ background: row.color, color: row.textColor }}
      >
        <span className="text-[11px] font-bold leading-none opacity-80 tabular-nums">{row.position}</span>
        <span className="text-sm font-bold leading-none tabular-nums">{row.horseNumber}</span>
        <span className="text-[10px] leading-none opacity-90 tabular-nums">{gapLabel}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(row.horseNumber)}
      aria-label={`${row.horseNumber}番 ${row.name || ''} ${row.position}位`}
      aria-pressed={selected}
      className={`pointer-events-auto flex w-full shrink-0 flex-col items-center rounded-md px-1 py-1 ${ring}`}
      style={{ background: row.color, color: row.textColor }}
    >
      <span className="flex w-full items-baseline justify-between px-0.5">
        <span className="text-[10px] font-bold leading-none opacity-80 tabular-nums">{row.position}</span>
        <span className="text-base font-bold leading-none tabular-nums">{row.horseNumber}</span>
      </span>
      <span className="mt-0.5 w-full truncate text-center text-[10px] leading-none opacity-95 tabular-nums">
        {gapLabel}
      </span>
    </button>
  );
}
