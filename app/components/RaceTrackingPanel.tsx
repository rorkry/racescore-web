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
 *
 * 省スペース化（1行横スクロール・高さ 48px 固定）: 1頭あたり 枠色（背景）/ 馬番 / 順位 / 先頭差
 * のみを表示し、走破距離は表示しない（3D 表示の視認を優先）。データ内容は tracking-rows.ts の
 * 計算結果をそのまま使い、見せ方（フォーマット）のみをこの層で変えている。
 */
export function RaceTrackingPanelMobile({ rows, selectedHorse, onSelect }: RaceTrackingPanelProps) {
  if (!rows || rows.length === 0) return null;

  return (
    <div
      className="flex h-12 flex-row items-center gap-1 overflow-x-auto rounded-lg bg-slate-900 px-1.5 py-1 md:hidden"
      aria-label="出走馬トラッキング"
    >
      {rows.map((r) => (
        <TrackingChip
          key={r.horseNumber}
          row={r}
          selected={selectedHorse === r.horseNumber}
          onSelect={onSelect}
          layout="compact"
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
  layout: 'vertical' | 'compact';
}) {
  const ring = selected ? 'ring-2 ring-white' : 'ring-1 ring-black/30';
  const runShort = row.runLabel;
  const gapShort = row.gapLabel;

  if (layout === 'compact') {
    // スマホ省スペース版: 枠色(背景) / 馬番 / 順位 / 先頭差 のみ。走破距離は非表示。1行固定。
    const gapCompact = row.position === 1 ? '先頭' : `+${row.leaderGapMeters.toFixed(1)}m`;
    return (
      <button
        type="button"
        onClick={() => onSelect(row.horseNumber)}
        aria-label={`${row.horseNumber}番 ${row.name || ''} ${row.position}位 ${row.gapLabel}`}
        aria-pressed={selected}
        className={`pointer-events-auto flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] leading-none ${ring}`}
        style={{ background: row.color, color: row.textColor }}
      >
        <span className="font-bold opacity-80 tabular-nums">{row.position}</span>
        <span className="text-xs font-bold tabular-nums">{row.horseNumber}</span>
        <span className="opacity-90 tabular-nums">{gapCompact}</span>
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
