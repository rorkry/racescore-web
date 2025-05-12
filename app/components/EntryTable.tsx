'use client';
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
    <div className="overflow-auto bg-white rounded-xl shadow-md">
      <table className="w-full table-auto text-left border-collapse border border-black text-xs">
      <thead>
  <tr>
    <th className="px-3 py-2 border border-black bg-gray-100 text-black text-sm font-medium w-auto">馬番</th>
    <th className="px-3 py-2 border border-black bg-gray-100 text-black text-sm font-medium">馬名</th>
        {hasWinOdds && (
          <th className="px-3 py-2 border border-black bg-gray-100 text-black text-sm font-medium text-right w-14">
            単勝
          </th>
        )}
        {hasPred && (
          <th className="px-3 py-2 border border-black bg-gray-100 text-black text-sm font-medium text-right w-14">
            合成単勝オッズ
          </th>
        )}
    <th className="px-3 py-2 border border-black bg-gray-100 text-black text-sm font-medium text-center w-[3rem]">
      印
    </th>
    <th className="px-3 py-2 border border-black bg-gray-100 text-black text-sm font-medium">騎手</th>
    {['前走','2走前','3走前','4走前','5走前'].map(label => (
      <th
        key={label}
        className="px-3 py-2 border border-black bg-gray-100 text-black text-sm font-medium"
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
                className={`w-auto px-2 py-1 border border-black text-center align-middle ${
                  frameColor[horse.entry['枠番'] ?? ''] ?? 'bg-gray-300 text-black'
                } text-sm`}
              >
                {umaNo}
              </td>

              {/* 馬名セル */}
              <td className="relative px-3 py-1 border border-black text-black align-top whitespace-nowrap text-sm">
                <div className="font-bold text-base">
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

              {hasWinOdds && (
                <td
                  className={`px-1 py-1 border border-black text-center w-14 leading-tight ${
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
              )}

              {hasPred && (
                <td className="px-1 py-1 border border-black text-center w-14 leading-tight text-amber-600">
                  {(() => {
                    // キー "01" と "1" のズレを吸収 (前ゼロ有無)
                    const raw =
                      predMap[umaNo] ??
                      predMap[umaNo.replace(/^0+/, '')];

                    const num = typeof raw === 'number' ? raw : Number(raw);
                    return Number.isFinite(num) && num > 0.5 ? num.toFixed(1) : '—';
                  })()}
                </td>
              )}

              {/* 印セル */}
              <td className="px-2 py-1 border border-black text-center w-[3rem] text-sm">
                {(() => {
                  const raceKey = `${dateCode}|${place}|${raceNo}`;
                  const num     = umaNo;
                  const current = marks[raceKey]?.[num] ?? '';
                  const setVal  = (val: string) => {
                    setMarks(prev => {
                      const nextRace = { ...(prev[raceKey] ?? {}), [num]: val };
                      return { ...prev, [raceKey]: nextRace };
                    });
                  };
                  return (
                    <select
                      value={current}
                      onChange={e => setVal(e.target.value)}
                      className="appearance-none bg-white border border-gray-300 rounded w-[2rem] h-[2rem] text-center text-sm font-bold text-black leading-tight"
                    >
                      <option value="" className="text-black"></option>
                      {['◎','○','▲','⭐︎','✔︎'].map(m => (
                        <option key={m} value={m} className="text-black">{m}</option>
                      ))}
                    </select>
                  );
                })()}
              </td>

              {/* 騎手セル */}
              <td className="px-3 py-1 border border-black text-sm text-black font-medium">
                {horse.entry['騎手']}
                {horse.entry['斤量'] && (
                  <div className="ml-1 flex flex-col items-end">
                    {/* 今回の斤量 */}
                    <span className="text-xs text-gray-600">
                      {horse.entry['斤量']}kg
                    </span>
                    {/* 前走との差 (括弧付きで表示) */}
                    {(() => {
                      const prev = parseFloat(horse.past[0]?.['斤量'] ?? '');
                      const curr = parseFloat(horse.entry['斤量'] ?? '');
                      if (!isNaN(prev) && !isNaN(curr)) {
                        const diff = curr - prev;
                        if (diff !== 0) {
                          return (
                            <span className="text-xs text-gray-600">
                              ({diff > 0 ? '+' : ''}{diff.toFixed(1)}kg)
                            </span>
                          );
                        }
                      }
                      return null;
                    })()}
                  </div>
                )}
              </td>

              {/* 過去５走セル */}
              {horse.past.map((r, j) => {
                const rid   = r['レースID(新/馬番無)']?.trim() || '';
                const date  = r['日付(yyyy.mm.dd)']?.trim() || '';
                const fin   = r['着差']?.trim() ? ` (${r['着差'].trim()})` : '';

                /* ★数 */
                const starCnt = levelToStars(r['レース印３']?.trim() || '');
                const starStr = starCnt ? '★'.repeat(starCnt) : '-';
                const starCol = ['text-gray-400','text-gray-700','text-blue-800','text-orange-500','text-red-500'][starCnt-1] ?? 'text-black';

                /* PCI ペース判定 */
                const pci  = parseFloat(r['PCI']||'0');
                const dist = parseInt((r['距離']||'').replace(/[^\d]/g,''),10);
                const surf = (r['距離']||'').trim().charAt(0) as '芝'|'ダ'|'-';
                const paceShort = (() => {
                  if (surf==='ダ'&&dist<=1600) return pci<=41?'超ハイ':pci<=42?'ハイ':pci>=49?'超スロー':pci>=48?'スロー':'ミドル';
                  if (surf==='ダ'&&dist>=1700) return pci<=44?'超ハイ':pci<=45?'ハイ':pci>=49?'超スロー':pci>=48?'スロー':'ミドル';
                  if (surf==='芝'&&dist>=1700) return pci<=47.5?'超ハイ':pci<=50?'ハイ':pci>=57?'超スロー':pci>=56?'スロー':'ミドル';
                  if (surf==='芝'&&dist<=1600) return pci<=46?'超ハイ':pci<=47?'ハイ':pci>=52?'超スロー':pci>=50?'スロー':'ミドル';
                  return 'ミドル';
                })();

                /* 通過順位と色付け */
                const passNums = [r['2角'],r['3角'],r['4角']]
                  .map(x=>parseInt((x||'').replace(/[^\d]/g,''),10))
                  .filter(n=>!isNaN(n));
                const avgPass = passNums.length?passNums.reduce((a,b)=>a+b,0)/passNums.length:99;
                const margin  = parseFloat(r['着差']?.trim()||'0');
                const passStr = [r['2角'],r['3角'],r['4角']].filter(x=>x?.trim()).join('-');
                const passColor = (() => {
                  if (paceShort==='超ハイ'&&avgPass<=4) return margin<=1?'text-red-500 font-semibold':'text-orange-500 font-semibold';
                  if (paceShort==='ハイ'&&avgPass<=4&&margin<=1) return 'text-red-500 font-semibold';
                  if (paceShort==='超スロー'&&avgPass>=8) return margin<=1?'text-red-500 font-semibold':'text-orange-500 font-semibold';
                  if (paceShort==='スロー'&&avgPass>=8&&margin<=1) return 'text-red-500 font-semibold';
                  return 'text-black';
                })();

                return (
                  <td key={j} className="align-top relative px-1 py-2 pb-12 border border-black text-black text-xs min-h-[120px]">
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        {/* 日付・場所・距離 */}
                        <div className="flex items-center mb-0.5">
                          <div className="text-xs font-medium">
                            {date} {(r['場所']||r['場所_1']||'').trim()} {r['距離']?.trim()}
                          </div>
                          <input
                            type="checkbox"
                            className="ml-1"
                            checked={favorites.has(rid)}
                            onChange={() => {
                              setFavorites(prev => {
                                const next = new Set(prev);
                                next.has(rid) ? next.delete(rid) : next.add(rid);
                                return next;
                              });
                            }}
                          />
                        </div>
                        {/* クラス・頭数・馬番・人気・騎手 */}
                        <div className="text-[0.7rem] mb-1">
                          {`${r['クラス名']||''} ${r['頭数']||''}頭 ${r['馬番']||''}番 ${r['人気']||''}人気 ${r['騎手']||''}`}
                        </div>
                        {/* ★数・ペース・通過順位・走破タイム */}
                        <div className={`${starCol} text-xs`}>{starStr}</div>
                        <div className="text-xs">{paceShort}</div>
                        <div className={`text-xs ${passColor}`}>{passStr}</div>
                        <div className="text-xs">
                          {formatTime(r['走破タイム']||'')}{fin}
                        </div>
                        {/* 着順 */}
                        {r['着順']?.trim() && (
                          <div className="absolute bottom-1 right-1 text-base font-semibold">
                            {r['着順'].trim()}
                          </div>
                        )}
                      </div>
                      {/* 別クラスタイム */}
                      <div className="mt-auto text-xs">
                        {clusterRenderer(r)}
                      </div>
                    </div>
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
          );
          })}
        </tbody>
      </table>
    </div>
  );
}