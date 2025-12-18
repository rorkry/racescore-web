// --- 3連単→合成単勝オッズを、prop が無ければフックで取得 --------
import { useSyntheticWinOdds } from '@/hooks/useSyntheticWinOdds';
import React from 'react';
import type { RecordRow }  from '../../types/record';
import { levelToStars, toHalfWidth, formatTime } from '../page'; // ★ util が別ファイル化されるまでは page.tsx から流用

export type HorseWithPast = {
  entry: RecordRow;
  past: RecordRow[];
  /** 単勝オッズ (無い場合は null) */
  winOdds?: number | null;
};

type Props = {
  horses: HorseWithPast[];
  dateCode: string;
  place: string;
  raceNo: string;
  labels: string[];
  scores: number[];          // 追加：競う指数
  winOddsMap: Record<string, number>;  // 追加：親コンポーネントから渡される単勝オッズマップ
  /** 合成予想単勝オッズ (馬番 → オッズ) */
  predicted?: Record<string, number | null>;
  /** 印選択 */
  marks: Record<string, Record<string, string>>;
  setMarks: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  /** お気に入りチェック */
  favorites: Set<string>;
  setFavorites: React.Dispatch<React.SetStateAction<Set<string>>>;
  frameColor: Record<string, string>;
  clusterRenderer: (r: RecordRow) => JSX.Element[];
  /** ラベル・競う指数バッジを表示するか */
  showLabels?: boolean;
  largeCells?: boolean;
  raceKey: string;
};

export default function EntryTable({
  horses,
  dateCode,
  place,
  raceNo,
  labels,
  scores,           // 追加
  winOddsMap = {},       // 親コンポーネントから渡される単勝オッズマップ。テーブル単位のフェッチを省略して即時描画するため。
  predicted = {},
  marks,
  setMarks,
  favorites,
  setFavorites,
  frameColor,
  clusterRenderer,
  showLabels = true,   // 追加
  largeCells = false,
  raceKey,
}: Props) {
  // --- 3連単→合成単勝オッズを、prop が無ければフックで取得 --------
  const { data: syntheticFromHook } = useSyntheticWinOdds(raceKey);

  // predicted prop が空なら、hook の結果を fallback に使う
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
  // === DEBUG ==========================================================
  // 取得したデータが列に出てこない場合はまずここを見てください
  React.useEffect(() => {
    console.log('[DEBUG] EntryTable', raceKey, {
      mergedPredicted,
      winOddsMap,
    });
  }, [raceKey, mergedPredicted, winOddsMap]);
  // null 安全化 + 0 や NaN を除外したマップを生成（キー"01"と"1"両方でアクセス可能にする）
  const predMap: Record<string, number> = React.useMemo(() => {
    const src = (mergedPredicted ?? {}) as Record<string, number | string | null>;
    const m: Record<string, number> = {};
    Object.entries(src).forEach(([no, raw]) => {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n) || n <= 0.5) return;
      const padded   = no.padStart(2, '0');
      const unpadded = padded.replace(/^0+/, '');
      m[padded]   = n; // 例 "01"
      m[unpadded] = n; // 例 "1"
    });
    return m;
  }, [mergedPredicted]);
  // ====================================================================

  const hasWinOdds = Object.keys(winOddsMap).length > 0;
  const hasPred =
    Object.keys(predMap).length > 0 ||
    (syntheticFromHook && syntheticFromHook.length > 0);

  return (
    <div className="relative w-full">
      {/* スマホ向けスクロール表示 */}
      <div className="overflow-x-auto bg-white rounded-xl shadow-md">
        <table className="min-w-max table-auto text-left border-collapse border border-black text-xs md:text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-gray-100 text-black text-sm font-medium w-8 px-2 md:px-3 py-2 border border-black text-center">馬番</th>
              <th className="sticky left-8 z-10 bg-gray-100 text-black text-sm font-medium min-w-[8rem] md:min-w-[10rem] px-2 md:px-3 py-2 border border-black">馬名</th>
              <th className="px-2 md:px-3 py-2 border border-black bg-gray-100 text-black text-sm font-medium text-right w-12 md:w-14">
                単勝
              </th>
              <th className="px-2 md:px-3 py-2 border border-black bg-gray-100 text-black text-sm font-medium text-right w-12 md:w-14">
                合成
              </th>
              <th className="px-2 md:px-3 py-2 border border-black bg-gray-100 text-black text-sm font-medium text-center w-12">
                印
              </th>
              <th className="px-2 md:px-3 py-2 border border-black bg-gray-100 text-black text-sm font-medium">騎手</th>
              {['前走','2走前','3走前','4走前','5走前'].map(label => (
                <th
                  key={label}
                  className="px-2 md:px-3 py-2 border border-black bg-gray-100 text-black text-xs md:text-sm font-medium"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {horses.map((horse, idx) => {
              // 馬番を半角2桁に正規化
              const umaNo = toHalfWidth(String(horse.entry['馬番'] ?? '').trim()).padStart(2, '0');
              return (
                <tr key={idx} className="odd:bg-white even:bg-gray-50">
                  {/* 馬番セル */}
                  <td
                    className={`sticky left-0 z-20 bg-white w-auto px-1 md:px-2 py-1 border border-black text-center align-middle ${
                      frameColor[horse.entry['枠番'] ?? ''] ?? 'bg-gray-300 text-black'
                    } text-xs md:text-sm`}
                  >
                    {umaNo}
                  </td>

                  {/* 馬名セル */}
                  <td className="sticky left-8 z-10 bg-white relative min-w-[8rem] md:min-w-[10rem] px-2 md:px-3 py-1 border border-black text-black align-top whitespace-nowrap text-xs md:text-sm">
                    <div className="font-bold text-sm md:text-base">
                      {horse.entry['馬名']}
                    </div>
                    <div className="text-xs">
                      {horse.entry['性別']}{horse.entry['馬齢']}　
                      {horse.entry['調教師']}／{horse.entry['所属']}
                    </div>

                    {/* ラベルバッジ */}
                    {showLabels && (() => {
                      const label = labels[idx];
                      return (
                        <div className="absolute bottom-0.5 left-0 right-0 px-1">
                          {label === 'くるでしょ' ? (
                            <span className="block w-full px-2 py-0.5 text-center rounded-lg bg-yellow-500 text-white text-xs font-semibold shadow">
                              {label}
                            </span>
                          ) : label === 'めっちゃきそう' ? (
                            <span className="block w-full px-2 py-0.5 text-center rounded-lg bg-red-500 text-white text-xs font-semibold shadow">
                              {label}
                            </span>
                          ) : (
                            <span
                              className={`block w-full px-2 py-0.5 text-center rounded-full text-xs font-semibold ${
                                label === 'ちょっときそう'
                                  ? 'text-orange-500 bg-orange-100'
                                  : label === 'こなそう'
                                  ? 'text-blue-800 bg-blue-100'
                                  : 'text-gray-400 bg-gray-100'
                              }`}
                            >
                              {label}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  <td
                    className={`px-1 md:px-2 py-1 border border-black text-center w-12 md:w-14 leading-tight text-xs md:text-sm ${
                      winOddsMap[umaNo] != null && winOddsMap[umaNo] < 10
                        ? 'text-red-600 font-semibold'
                        : 'text-black'
                    }`}
                  >
                    {(() => {
                      const v = winOddsMap[umaNo];
                      return v != null ? v.toFixed(1) : '—';
                    })()}
                  </td>
                  <td className="px-1 md:px-2 py-1 border border-black text-center w-12 md:w-14 leading-tight text-amber-600 text-xs md:text-sm">
                    {(() => {
                      const v = predMap[umaNo];
                      return v != null ? v.toFixed(1) : '—';
                    })()}
                  </td>

                  {/* 印セル */}
                  <td className="px-1 md:px-2 py-1 border border-black text-center w-12">
                    <select
                      className="w-full text-xs md:text-sm border rounded px-1 py-0.5"
                      value={marks[raceKey]?.[umaNo] || ''}
                      onChange={(e) => {
                        const newMarks = { ...marks };
                        if (!newMarks[raceKey]) newMarks[raceKey] = {};
                        if (e.target.value) {
                          newMarks[raceKey][umaNo] = e.target.value;
                        } else {
                          delete newMarks[raceKey][umaNo];
                        }
                        setMarks(newMarks);
                      }}
                    >
                      <option value="">—</option>
                      <option value="◎">◎</option>
                      <option value="○">○</option>
                      <option value="▲">▲</option>
                      <option value="△">△</option>
                      <option value="×">×</option>
                    </select>
                  </td>

                  {/* 騎手 */}
                  <td className="px-2 md:px-3 py-1 border border-black text-xs md:text-sm whitespace-nowrap">
                    {horse.entry['騎手']}
                  </td>

                  {/* 過去走 */}
                  {horse.past.slice(0, 5).map((p, pidx) => (
                    <td key={pidx} className="px-1 md:px-2 py-1 border border-black text-center text-xs md:text-sm">
                      <div className="text-xs">{p['着順']}</div>
                      <div className="text-xs">{p['馬場']}</div>
                    </td>
                  ))}
                  {[...Array(Math.max(0, 5 - horse.past.length))].map((_, i) => (
                    <td key={`empty-${i}`} className="px-1 md:px-2 py-1 border border-black text-center text-xs md:text-sm">
                      —
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* スマホ向けスクロールヒント */}
      <div className="md:hidden text-center text-xs text-gray-500 mt-2 pb-4">
        ← 左右にスクロール →
      </div>
    </div>
  );
}
