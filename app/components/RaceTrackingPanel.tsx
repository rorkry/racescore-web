'use client';

import type { TrackingRow } from '@/lib/race-simulator/tracking-rows';

/**
 * 画面端トラッキングパネル（全頭の識別を保証する常設 UI）。
 *
 * - PC（md 以上）: 3D viewport 内側・右端の縦帯（absolute overlay）。viewport の高さ計算には影響しない。
 * - スマホ（md 未満）: 3D viewport の外側・下に続く横帯（通常フロー）。canvas の高さ計算に混ぜない
 *   ため、viewport とは別コンポーネントとして分離している（呼び出し側で並べる）。
 * - 順位 / 先頭差（先頭 or +Xm） / 走破距離 を明示（曖昧な「0m」は出さない）
 * - チップクリック ↔ 3D 選択の双方向同期
 */
export interface RaceTrackingPanelProps {
  rows: TrackingRow[];
  selectedHorse: number | null;
  onSelect: (horseNumber: number) => void;
}

/** PC: 3D viewport 内側・右端の縦帯（absolute overlay）。呼び出し側は containerRef 内に配置すること。 */
export function RaceTrackingPanelDesktop({ rows, selectedHorse, onSelect }: RaceTrackingPanelProps) {
  if (!rows || rows.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute right-0 top-0 z-40 hidden h-full w-[88px] flex-col gap-1 overflow-y-auto bg-black/35 px-1.5 py-2 backdrop-blur-sm md:flex"
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
  );
}

/**
 * スマホ: 3D viewport の外側・下に配置する横帯（通常フロー・非 absolute）。
 * viewport の高さ計算に混ざらないよう、呼び出し側で viewport の兄弟要素として配置すること。
 */
export function RaceTrackingPanelMobile({ rows, selectedHorse, onSelect }: RaceTrackingPanelProps) {
  if (!rows || rows.length === 0) return null;

  return (
    <div
      className="flex h-[58px] flex-row gap-1 overflow-x-auto rounded-lg bg-slate-900 px-2 py-1.5 md:hidden"
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
  const runShort = row.runLabel;
  const gapShort = row.gapLabel;

  if (layout === 'horizontal') {
    return (
      <button
        type="button"
        onClick={() => onSelect(row.horseNumber)}
        aria-label={`${row.horseNumber}番 ${row.name || ''} ${row.position}位 ${row.gapLabel} 走破${row.runLabel}${row.remainingLabel ? ` ${row.remainingLabel}` : ''}`}
        aria-pressed={selected}
        className={`pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 ${ring}`}
        style={{ background: row.color, color: row.textColor }}
      >
        <span className="text-[11px] font-bold leading-none opacity-80 tabular-nums">{row.position}</span>
        <span className="text-sm font-bold leading-none tabular-nums">{row.horseNumber}</span>
        <span className="text-[10px] leading-none opacity-90 tabular-nums">{gapShort}</span>
        <span className="text-[9px] leading-none opacity-80 tabular-nums">{runShort}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(row.horseNumber)}
      aria-label={`${row.horseNumber}番 ${row.name || ''} ${row.position}位 ${row.gapLabel} 走破${row.runLabel}${row.remainingLabel ? ` ${row.remainingLabel}` : ''}`}
      aria-pressed={selected}
      className={`pointer-events-auto flex w-full shrink-0 flex-col items-center rounded-md px-1 py-1 ${ring}`}
      style={{ background: row.color, color: row.textColor }}
    >
      <span className="flex w-full items-baseline justify-between px-0.5">
        <span className="text-[10px] font-bold leading-none opacity-80 tabular-nums">{row.position}</span>
        <span className="text-base font-bold leading-none tabular-nums">{row.horseNumber}</span>
      </span>
      <span className="mt-0.5 w-full truncate text-center text-[10px] font-semibold leading-none tabular-nums">
        {gapShort}
      </span>
      <span className="mt-0.5 w-full truncate text-center text-[9px] leading-none opacity-90 tabular-nums">
        {runShort}
      </span>
    </button>
  );
}
