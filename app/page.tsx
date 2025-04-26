// ラベル割当: 指定個数でスコア順にラベルを割り当てる
'use client';

/* eslint-disable @typescript-eslint/no-unused-vars */

import EntryTable from './components/EntryTable';
import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { Tab } from '@headlessui/react';
import Chart from 'chart.js/auto';
import { getClusterData, ClusterInfo, computeKisoScore } from '../utils/getClusterData';
import type { RecordRow } from '../types/record';
const LABELS = [
  { label: 'くるでしょ', count: 1 },
  { label: 'めっちゃきそう', count: 2 },
  { label: 'ちょっときそう', count: 3 },
  { label: 'こなそう', count: 6 },
];
const REMAIN_LABEL = 'きません';
/**
 * スコア順でラベルを割り当てる
 * @param {number[]} scores
 * @returns {string[]} ラベル配列
 */
function assignLabels(scores: number[]): string[] {
  // スコアと元indexをペアに
  const indexed = scores.map((score, i) => ({ score, i }));
  // 降順ソート
  indexed.sort((a, b) => b.score - a.score);
  const result: string[] = new Array(scores.length).fill(REMAIN_LABEL);
  let idx = 0;
  for (const { label, count } of LABELS) {
    for (let c = 0; c < count && idx < indexed.length; ++c, ++idx) {
      result[indexed[idx].i] = label;
    }
  }
  // 残りは REMAIN_LABEL
  return result;
}


const DEBUG = false // デバッグログを無効化

/* --- 枠番ごとの色(馬番セル用) --------------------------- */
const frameColor: Record<string, string> = {
  '1': 'text-black',          // 白枠
  '2': 'text-white bg-black', // 黒枠
  '3': 'text-red-600',
  '4': 'text-blue-600',
  '5': 'text-yellow-500',
  '6': 'text-green-600',
  '7': 'text-orange-500',
  '8': 'text-pink-500',
};

const frameBgStyle: Record<string, string> = {
  '1': 'bg-white text-black',
  '2': 'bg-black text-white',
  '3': 'bg-red-600 text-white',
  '4': 'bg-blue-600 text-white',
  '5': 'bg-yellow-500 text-black',
  '6': 'bg-green-600 text-white',
  '7': 'bg-orange-500 text-white',
  '8': 'bg-pink-500 text-white',
};


// 全角 A～E を半角に変換し、A→5★、…、E→1★
export function levelToStars(level: string): number {
  if (!level) return 0
  let ch = level.trim().charAt(0)
  const code = ch.charCodeAt(0)
  // 全角Ａ～Ｅ (U+FF21–FF25) → 半角A–E
  if (code >= 0xFF21 && code <= 0xFF25) {
    ch = String.fromCharCode(code - 0xFEE0)
  }
  switch (ch) {
    case 'A': return 5
    case 'B': return 4
    case 'C': return 3
    case 'D': return 2
    case 'E': return 1
    default:  return 0
  }
}

// p (0–1) パーセンタイルを返す (線形補間)
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// 全角数字を半角に変換
export function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
  );
}

// 全角／半角スペースを全削除して馬名照合キーを作る
const normalizeName = (name: string = '') =>
  name.replace(/\u3000/g, '').replace(/\s/g, '');

// "1085" → "1.08.5"
export function formatTime(t: string): string {
  if (!t) return ''
  const str = t.toString().padStart(4, '0')
  const m  = str.slice(0,1)
  const ss = str.slice(1,3)
  const d  = str.slice(3)
  return `${m}.${ss}.${d}`
}

// "yyyy.mm.dd"形式を Date に変換
function parseDateStr(str: string): Date | null {
  if (!str) return null;
  const parts = str.split('.').map(p => parseInt(p.trim(), 10));
  if (parts.length < 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

// "mssd" を秒数に変換 (例: "2104" → 130.4 秒)
export function toSec(t: string): number {
  const str = t.padStart(4, '0');
  const m = parseInt(str.slice(0,1), 10);
  const ss = parseInt(str.slice(1,3), 10);
  const d = parseInt(str.slice(3), 10);
  return m * 60 + ss + d / 10;
}

// クラス名を数値ランクに変換: 新馬:0, 未勝利:1, 1勝:2, 2勝:3, 3勝:4, OP系:5, G3:6, G2:7, G1:8
export function classToRank(cls: string): number {
  const s = cls.trim();
  if (s.includes('新馬')) return 0;
  if (s.includes('未勝利')) return 1;
  if (/^[123]勝/.test(s)) {
    const num = parseInt(s.charAt(0), 10);
    return isNaN(num) ? 1 : num + 1;  // 1勝→2,2勝→3,3勝→4
  }
  if (s.includes('OP') || s.includes('オープン')) return 5;
  if (s.startsWith('G3')) return 6;
  if (s.startsWith('G2')) return 7;
  if (s.startsWith('G1')) return 8;
  return 1; // 未勝利相当
}



// Distribution component
function DistributionTab({ scores }: { scores: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    // 1) 有効な数値のみ抽出
    const dataScores = scores.filter(s => typeof s === 'number' && Number.isFinite(s));
    if (!canvasRef.current) return;

    // 既存チャート破棄
    chartRef.current?.destroy();

    // 有効データがなければ何も描画せず終了
    if (dataScores.length === 0) {
      chartRef.current = null;
      return;
    }

    // 最小・最大を計算
    const min = Math.min(...dataScores);
    const max = Math.max(...dataScores);
    const range = max - min;

    // ビン数と幅
    const bins = range === 0 ? 1 : 20;
    const width = range === 0 ? 1 : range / bins;

    // 各ビンの頻度を初期化
    const counts = new Array(bins).fill(0);
    dataScores.forEach(s => {
      let idx = range === 0
        ? 0
        : Math.floor((s - min) / width);
      idx = Math.min(bins - 1, Math.max(0, idx));
      counts[idx]++;
    });

    // ラベル生成
    const labels = new Array(bins).fill(0).map((_, i) =>
      range === 0
        ? min.toFixed(2)
        : (min + i * width).toFixed(2)
    );

    // チャート生成
    const ctx = canvasRef.current.getContext('2d')!;
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: '頭数', data: counts }]
      },
      options: {
        scales: {
          x: { title: { display: true, text: 'きそう指数' } },
          y: { title: { display: true, text: '頻度' }, beginAtZero: true }
        },
        plugins: {
          legend: { display: false }
        },
        animation: false
      }
    });

    // クリーンアップ
    return () => {
      chartRef.current?.destroy();
    };
  }, [scores]);

  return <canvas ref={canvasRef} />;
}


type HorseWithPast = {
  entry: RecordRow
  past: RecordRow[]
}

export default function Home() {
  const [entries, setEntries] = useState<RecordRow[]>([])
  const [races, setRaces] = useState<RecordRow[]>([])
  const [nestedData, setNestedData] = useState<Record<string, Record<string, Record<string, HorseWithPast[]>>>>({})
  const [error, setError] = useState<string | null>(null)
  // 馬検索用 state
  const [searchName, setSearchName] = useState<string>('')
  const [searchResult, setSearchResult] = useState<HorseWithPast | null>(null)
  // ★マイ注目レースID管理
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // 印管理: raceKey (日付|開催|R) -> { 馬番: '◎' | '○' | '▲' | '⭐︎' | '✔︎' | '' }
  const [marks, setMarks] = useState<Record<string, Record<string, string>>>({});
  // 印marks を localStorage から初期ロード
  useEffect(() => {
    const saved = localStorage.getItem('marks');
    if (saved) {
      try { setMarks(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // 印marks を localStorage に永続化
  useEffect(() => {
    localStorage.setItem('marks', JSON.stringify(marks));
  }, [marks]);
  // アップロードした元の全レースデータ
  const [allRaces, setAllRaces] = useState<RecordRow[]>([]);
  // --- 枠順確定CSV 用 ---
  const [frames, setFrames] = useState<string[][]>([]);
  const [frameNestedData, setFrameNestedData] =
    useState<Record<string, Record<string, Record<string, HorseWithPast[]>>>>({});
  const clusterCache = useRef<Record<string, ClusterInfo[]>>({});
  const [allScores, setAllScores] = useState<number[]>([]);
  const [p90, setP90] = useState<number>(0);
  const [p70, setP70] = useState<number>(0);
  const [p30, setP30] = useState<number>(0);
  const [p10, setP10] = useState<number>(0);
  // 表示倍率 (0.5〜1.5)
  const [zoom, setZoom] = useState(1);
  // グローバル分布パーセンタイル計算
  useEffect(() => {
    if (allScores.length === 0) return;
    setP90(percentile(allScores, 0.90));
    setP70(percentile(allScores, 0.70));
    setP30(percentile(allScores, 0.30));
    setP10(percentile(allScores, 0.10));
  }, [allScores]);

  // CSVアップロード済み判定
  const isEntryUploaded = entries.length > 0
  const isRaceUploaded  = Object.keys(nestedData).length > 0
  const isFrameUploaded = Object.keys(frameNestedData).length > 0;
  // --- 枠順確定CSV アップロード（ヘッダーなし）---
  const handleFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      encoding: 'Shift_JIS',
      complete: ({ data }) => {
        const rows = data as string[][];

        /* --- races から 馬名→過去５走 のマップを構築 --- */
        const pastMap: Record<string, RecordRow[]> = {};
        races.forEach(r => {
          const k = normalizeName(r['馬名'] ?? '');
          if (!k) return;
          (pastMap[k] = pastMap[k] ?? []).push(r);
        });
        Object.keys(pastMap).forEach(n => {
          pastMap[n]
            .sort((a, b) =>
              (a['日付(yyyy.mm.dd)'] ?? '').localeCompare(b['日付(yyyy.mm.dd)'] ?? '')
            )
            .reverse();
          pastMap[n] = pastMap[n].slice(0, 5);
        });

        /* --- rows → HorseWithPast[] --- */
        const horses: HorseWithPast[] = rows.map(r => {
          const name = (r[8] ?? '').trim();     // 馬名列
          const nKey = normalizeName(name);
          return {
            entry: {
              日付: r[0] ?? '', 開催地: r[1] ?? '', R: r[2] ?? '', クラス名: r[3] ?? '',
              枠番: r[5] ?? '', 馬番: r[6] ?? '', 斤量: r[7] ?? '',
              馬名: name, 性別: r[9] ?? '', 馬齢: r[10] ?? '', 騎手: r[12] ?? '',
              馬場: r[14] ?? '', 距離: r[15] ?? '', 所属: r[17] ?? '', 調教師: r[18] ?? '',
            },
            past: pastMap[nKey] ?? [],
          };
        });

        /* --- date|place|R でネスト --- */
        const nest: Record<string, Record<string, Record<string, HorseWithPast[]>>> = {};
        horses.forEach(h => {
          const { 日付, 開催地, R } = h.entry;
          (((nest[日付] = nest[日付] ?? {})[開催地] = nest[日付][開催地] ?? {})[R] =
            nest[日付][開催地][R] ?? []).push(h);
        });

        setFrameNestedData(nest);
      },
    });
  };

  // 初回マウント時に localStorage からロード
  useEffect(() => {
    const stored = localStorage.getItem('favorites');
    if (stored) {
      try {
        const arr: string[] = JSON.parse(stored);
        setFavorites(new Set(arr));
      } catch (e) {
        console.error('Failed to parse stored favorites:', e);
      }
    }
  }, []);

  // entries を localStorage から初期ロード
  useEffect(() => {
    const saved = localStorage.getItem('entries');
    if (saved) {
      setEntries(JSON.parse(saved));
    }
  }, []);
  // nestedData を localStorage から初期ロード
  useEffect(() => {
    const saved = localStorage.getItem('nestedData');
    if (saved) {
      try {
        setNestedData(JSON.parse(saved));
      } catch {
        console.error('Failed to parse stored nestedData');
      }
    }
  }, []);

  // 初回マウント時に allRaces を localStorage からロード
  useEffect(() => {
    const saved = localStorage.getItem('allRaces');
    if (saved) {
      try {
        setAllRaces(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse stored allRaces:', e);
      }
    }
  }, []);


  // nestedData から races 配列を再構築（再アップロード不要にする、allRacesは変更しない）
  useEffect(() => {
    if (races.length === 0 && Object.keys(nestedData).length > 0) {
      const flat: RecordRow[] = []
      Object.values(nestedData).forEach(placeMap =>
        Object.values(placeMap).forEach(raceMap =>
          Object.values(raceMap).forEach(horses =>
            horses.forEach(horse => horse.past.forEach(r => flat.push(r)))
          )
        )
      )
      setRaces(flat)
      if (DEBUG) console.log('Reconstructed races from nestedData:', flat.length)
    }
  }, [nestedData, races])
  // Compute distribution scores whenever nestedData changes
  useEffect(() => {
    if (!Object.keys(nestedData).length) return;
    const scores: number[] = [];
    Object.values(nestedData).forEach(placeMap =>
      Object.values(placeMap).forEach(raceMap =>
        Object.values(raceMap).forEach(horses =>
          horses.forEach(horse => {
            scores.push(computeKisoScore(horse));
          })
        )
      )
    );
    setAllScores(scores);
  }, [nestedData]);

  // --- 追加: 枠順確定タブ専用のスコア分布計算 ---
  // 枠順確定タブでは entries を使わないため、frameNestedData だけで
  // 頭数分布を再計算し allScores を更新する
  useEffect(() => {
    if (!Object.keys(frameNestedData).length) return;
    const scores: number[] = [];
    Object.values(frameNestedData).forEach(placeMap =>
      Object.values(placeMap).forEach(raceMap =>
        Object.values(raceMap).forEach(horses =>
          horses.forEach(horse => {
            scores.push(computeKisoScore(horse));
          })
        )
      )
    );
    setAllScores(scores);
  }, [frameNestedData]);

  // favorites が変わるたびに localStorage に保存
  useEffect(() => {
    localStorage.setItem('favorites', JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  // entries と races がセットされたら自動で filterData を実行
  useEffect(() => {
    if (entries.length > 0 && races.length > 0) {
      try {
        filterData()
      } catch (e) {
        console.error('Auto filterData error:', e)
      }
    }
  }, [entries, races])

  // entries CSV アップロード
  const handleEntryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse<string[]>(file, {
        header: false,
        skipEmptyLines: true,
        encoding: 'Shift_JIS',
        complete: (result) => {
          // `result.data` は string[][] なので型を明示しつつ無効行を除外
          const rows = result.data as string[][];

          const mapped: RecordRow[] = rows
            .filter((row): row is string[] => Array.isArray(row) && row.length >= 16)
            .map((row) => ({
              日付:     row[0]  ?? '',
              開催地:   row[1]  ?? '',
              R:       row[2]  ?? '',
              レース名: row[3]  ?? '',
              馬名:     row[4]  ?? '',
              クラス:   row[5]  ?? '',
              馬齢:     row[6]  ?? '',
              馬場:     row[7]  ?? '',
              距離:     row[8]  ?? '',
              頭数:     row[9]  ?? '',
              性別:     row[10] ?? '',
              馬体重:   row[11] ?? '',
              斤量:     row[12] ?? '',
              所属:     row[13] ?? '',
              調教師:   row[14] ?? '',
              所在地:   row[15] ?? '',
            }));

          setEntries(mapped);
          localStorage.setItem('entries', JSON.stringify(mapped));
          if (DEBUG) {
            console.log('Parsed entries:', mapped.slice(0, 5), 'total:', mapped.length);
          }
        }
      });
    }
  }

  // races CSV アップロード (raw は保存せず nestedData のみ永続化)
  const handleRaceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const headerCounts: Record<string, number> = {};
      Papa.parse<RecordRow>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h, i) => {
          // normalize whitespace
          let trimmed = h.replace(/\u3000/g, '').trim();
          // collapse all spaces
          trimmed = trimmed.replace(/\s/g, '');
          // count occurrences
          headerCounts[trimmed] = (headerCounts[trimmed] || 0) + 1;
          let name = trimmed;
          // unnamed 17th column => PCI3
          if (i === 16 && !trimmed) {
            name = 'PCI3';
          }
          // second "場所" => "場所_1"
          if (trimmed === '場所' && headerCounts[trimmed] > 1) {
            name = `場所_1`;
          }
          // second "馬場状態" => "馬場状態_1"
          if (trimmed === '馬場状態' && headerCounts[trimmed] > 1) {
            name = `馬場状態_1`;
          }
          return name;
        },
        encoding: 'Shift_JIS',
        complete: (result) => {
          setRaces(result.data);
          // 1着馬データのみを抽出して allRaces として永続化
          const winners = result.data.filter(r => {
            const pos = parseInt(toHalfWidth((r['着順'] || '').trim()), 10);
            return pos === 1;
          });
          setAllRaces(winners);
          localStorage.setItem('allRaces', JSON.stringify(winners));
          // racesはlocalStorageに保存しない（容量超過防止）
          if (DEBUG) console.log('Parsed races:', result.data.slice(0, 5), 'total:', result.data.length);
        },
      });
    }
  };

  // 検索ハンドラ
  const handleSearch = () => {
    setError(null)
    try {
      const name = searchName.trim()
      if (!name) throw new Error('馬名を入力してください')
      const normalized = name.replace(/\u3000/g, '').replace(/\s/g, '')

      // 1. entries 配列内を完全一致 → 部分一致で探す
      let entry = entries.find(e =>
        e['馬名']?.trim().replace(/\u3000/g, '').replace(/\s/g, '') === normalized
      )
      if (!entry) {
        const candidates = entries.filter(e =>
          e['馬名']?.trim().replace(/\u3000/g, '').includes(name)
        )
        if (candidates.length === 1) entry = candidates[0]
      }

      // 2. nestedData 内に HorseWithPast がいれば即セット
      if (!entry) {
        for (const dateKey in nestedData) {
          for (const placeKey in nestedData[dateKey]) {
            for (const raceKey in nestedData[dateKey][placeKey]) {
              const candidate = nestedData[dateKey][placeKey][raceKey]
                .find(h => {
                  const hn = h.entry['馬名']?.trim().replace(/\u3000/g, '').replace(/\s/g, '')
                  return hn === normalized
                })
              if (candidate) {
                setSearchResult(candidate)
                return
              }
            }
          }
        }
      }

      // 3. races 配列内からレース行データ（fallback）
      if (!entry) {
        const raceEntry = races.find(r =>
          r['馬名']?.trim().replace(/\u3000/g, '').replace(/\s/g, '') === normalized
        )
        if (raceEntry) {
          const past = races
            .filter(r => r['馬名']?.trim() === raceEntry['馬名']?.trim())
            .sort((a, b) =>
              (a['日付(yyyy.mm.dd)'] || '').localeCompare(b['日付(yyyy.mm.dd)'] || '')
            )
          setSearchResult({ entry: raceEntry, past: past.slice(-5).reverse() })
          return
        }
      }

      setError('該当する馬名が見つかりません');
      return;
    } catch (e: any) {
      console.error(e)
      setError(e.message)
    }
  }

  // 過去レース抽出ロジック
  const filterData = () => {
    if (DEBUG) console.log('filterData called')
    if (entries.length === 0) throw new Error('出走予定馬CSVが未アップロード')
    if (races.length === 0)   throw new Error('出馬表CSVが未アップロード')

    const validEntries = entries.filter(e => e['馬名']?.trim())
    const validRaces   = races.filter(r => r['馬名']?.trim())

    // 過去マップを構築
    const pastMap: Record<string, RecordRow[]> = {}
    validEntries.forEach(e => {
      pastMap[normalizeName(e['馬名']!)] = []
    })
    validRaces.forEach(r => {
      const key = normalizeName(r['馬名']!)
      if (pastMap[key]) pastMap[key].push(r)
    })
    Object.keys(pastMap).forEach(name => {
      pastMap[name].sort((a,b) =>
        (a['日付(yyyy.mm.dd)']||'').localeCompare(b['日付(yyyy.mm.dd)']||'')
      )
      pastMap[name] = pastMap[name].slice(-5).reverse()
    })

    // グループ化
    const groups: Record<string, HorseWithPast[]> = {}
    validEntries.forEach(e => {
      const name   = e['馬名']!.trim()
      const date   = e['日付']?.trim()   || ''
      const place  = e['開催地']?.trim() || ''
      const raceNo = e['R']?.trim()      || ''
      const key    = `${date}|${place}|${raceNo}`
      const nameKey = normalizeName(e['馬名']!)
      if (!groups[key]) groups[key] = []
      groups[key].push({ entry: e, past: pastMap[nameKey] || [] })
    })

    if (!Object.keys(groups).length) {
      throw new Error('抽出結果が空です：該当レースがありません')
    }

    // nestedData 生成
    const nested: Record<string, Record<string, Record<string, HorseWithPast[]>>> = {}
    Object.entries(groups).forEach(([key, horses]) => {
      const [date, place, raceNo] = key.split('|')
      if (!nested[date]) nested[date] = {}
      if (!nested[date][place]) nested[date][place] = {}
      nested[date][place][raceNo] = horses
    })
    setNestedData(nested)
    // フィルタ結果を保存
    localStorage.setItem('nestedData', JSON.stringify(nested));
  }

  return (
    <main className="p-4 md:p-8 bg-gray-50 min-h-screen text-gray-800">
      <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: `${100/zoom}%` }}>
      <Tab.Group>
        {/* ヘッダーとタブ */}
        <div className="flex justify-between items-center mb-4 bg-gradient-to-r from-gray-900 to-gray-800 shadow-sm rounded-xl px-4 py-2">
          <h1 className="text-xl font-bold text-white">俺の出馬表（馬名＆過去５走）</h1>
          <Tab.List className="flex space-x-2">
            {['出走予定馬', '枠順確定後', '馬検索', '分布'].map(label => (
              <Tab key={label} className={({ selected }) =>
                selected
                  ? 'px-4 py-2 rounded-t-lg bg-gray-300 text-blue-700 font-semibold shadow'
                  : 'px-4 py-2 rounded-t-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors'
              }>
                {label}
              </Tab>
            ))}
          </Tab.List>
        </div>

        {/* ズームコントロール */}
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-sm">🔍 表示倍率:</span>
          <button
            onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(1)))}
            className="px-2 py-1 bg-gray-200 rounded"
          >-</button>
          <span className="w-10 text-center text-sm">{(zoom * 100).toFixed(0)}%</span>
          <button
            onClick={() => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(1)))}
            className="px-2 py-1 bg-gray-200 rounded"
          >+</button>
        </div>

        {/* CSV アップロード & 実行ボタン */}
        <div className="space-y-4">
          <div>
            <p>📥 出走予定馬CSV</p>
            {isEntryUploaded ? (
              <p className="text-green-600">✅ アップロード済み</p>
            ) : (
              <input type="file" accept=".csv" onChange={handleEntryUpload} />
            )}
          </div>
          <div>
            <p>📥 馬データCSV（出馬表CSV）</p>
            {isRaceUploaded ? (
              <p className="text-green-600">✅ アップロード済み</p>
            ) : (
              <input type="file" accept=".csv" onChange={handleRaceUpload} />
            )}
          </div>
          <div>
            <p>📥 枠順確定CSV</p>
            {isFrameUploaded ? (
              <p className="text-green-600">✅ アップロード済み</p>
            ) : (
              <input type="file" accept=".csv" onChange={handleFrameUpload} />
            )}
          </div>
          <div className="mt-2">
            <button
              onClick={() => {
                localStorage.removeItem('entries');
                localStorage.removeItem('nestedData');
                setEntries([]);
                setNestedData({});
              }}
              className="px-4 py-2 bg-red-500 text-white rounded"
            >
              CSV更新（再アップロード）
            </button>
          </div>
          <div>
            <button
              onClick={() => {
                setError(null)
                try {
                  filterData()
                } catch (e: any) {
                  console.error(e)
                  setError(e.message)
                }
              }}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
            >
              ▶️ 過去レースを抽出
            </button>
            {error && (
              <div className="mt-2 text-red-600 font-medium">{error}</div>
            )}
          </div>

          {/* メインコンテンツ */}
          <Tab.Panels className="mt-4">
            {/* 出走予定馬 / 枠順確定後 / 馬検索 の各パネル */}
            <Tab.Panel>
              {/* 出走予定馬タブ: 日付→開催地→レース */}
              <Tab.Group>
                {/* 日付タブ */}
                <Tab.List className="flex space-x-2 overflow-x-auto">
                  {Object.keys(nestedData).map(dateCode => (
                    <Tab key={dateCode} className={({ selected }) =>
                      selected
                        ? 'px-3 py-1 rounded-t-lg bg-gray-300 text-blue-700 font-semibold shadow'
                        : 'px-3 py-1 rounded-t-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors'
                    }>
                      {/* "426" → "4月26日" */}
                      {dateCode.length >= 3
                        ? `${dateCode.slice(0, dateCode.length - 2)}月${dateCode.slice(-2)}日`
                        : dateCode}
                    </Tab>
                  ))}
                </Tab.List>
                <Tab.Panels className="mt-4">
                  {/* 開催地タブ・レースタブ・馬表をネスト */}
                  {Object.entries(nestedData).map(([dateCode, placeMap]) => (
                    <Tab.Panel key={dateCode}>
                      <Tab.Group>
                        {/* 開催地タブ */}
                        <Tab.List className="flex space-x-2 overflow-x-auto">
                          {Object.keys(placeMap).map(place => (
                            <Tab key={place} className={({ selected }) =>
                              selected
                                ? 'px-3 py-1 rounded-t-lg bg-gray-300 text-blue-700 font-semibold shadow'
                                : 'px-3 py-1 rounded-t-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors'
                            }>
                              {place}
                            </Tab>
                          ))}
                        </Tab.List>
                        <Tab.Panels className="mt-4">
                          {Object.entries(placeMap).map(([place, raceMap]) => (
                            <Tab.Panel key={place}>
                              <Tab.Group>
                                {/* レース番号タブ */}
                                <Tab.List className="flex space-x-2 overflow-x-auto mt-2">
                                  {Object.entries(raceMap)
                                    .filter(([, horses]) => horses.length > 0)
                                    .map(([raceNo, horses]) => (
                                      <Tab key={raceNo} className={({ selected }) =>
                                        selected
                                          ? 'px-3 py-2 rounded-t-lg bg-gray-300 text-blue-700 font-semibold shadow whitespace-nowrap text-sm'
                                          : 'px-3 py-2 rounded-t-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors whitespace-nowrap text-sm'
                                      }>
                                        <div className="flex flex-col items-center space-y-1">
                                          <span className="whitespace-nowrap text-sm">{raceNo}R {horses[0].entry['レース名']?.trim()}</span>
                                          <span className="whitespace-nowrap text-xs text-gray-500">
                                            {horses[0].entry['馬場']?.trim()}{horses[0].entry['距離']?.trim()}m
                                          </span>
                                        </div>
                                      </Tab>
                                  ))}
                                </Tab.List>

                                {/* 馬柱テーブル */}
                                <Tab.Panels className="mt-4">
                                  {Object.entries(raceMap)
                                    .filter(([, horses]) => horses.length > 0)
                                    .map(([raceNo, horses]) => {
                                      // 直近3レースの評価スコアとラベルを計算
                                      // スコア順でラベルを割り当てる
                                      const scores = horses.map(horse => computeKisoScore(horse));
                                      const labels = assignLabels(scores);
                                      return (
                                        <Tab.Panel key={raceNo}>
                                          <EntryTable
                                            horses={horses}
                                            dateCode={dateCode}
                                            place={place}
                                            raceNo={raceNo}
                                            labels={labels}
                                            scores={scores}         /* 追加 */
                                            marks={marks}
                                            setMarks={setMarks}
                                            favorites={favorites}
                                            setFavorites={setFavorites}
                                            frameColor={frameColor}
                                            clusterRenderer={(r) => getClusterData(r, allRaces, clusterCache)}
                                          />
                                        </Tab.Panel>
                                      );
                                    })}
                                </Tab.Panels>
                              </Tab.Group>
                            </Tab.Panel>
                          ))}
                        </Tab.Panels>
                      </Tab.Group>
                    </Tab.Panel>
                  ))}
                </Tab.Panels>
              </Tab.Group>
            </Tab.Panel>

            <Tab.Panel>
              {Object.keys(frameNestedData).length === 0 ? (
                <p className="text-gray-600">枠順確定CSVをアップロードしてください。</p>
              ) : (
                /* === 以下、出走予定馬パネルと同一ロジック === */
                <Tab.Group>
                  {/* 日付タブ */}
                  <Tab.List className="flex space-x-2 overflow-x-auto">
                    {Object.keys(frameNestedData).map(dateCode => (
                      <Tab key={dateCode} className={({ selected }) =>
                        selected
                          ? 'px-3 py-1 rounded-t-lg bg-gray-300 text-blue-700 font-semibold shadow'
                          : 'px-3 py-1 rounded-t-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors'
                      }>
                        {dateCode.length >= 3
                          ? `${dateCode.slice(0, dateCode.length - 2)}月${dateCode.slice(-2)}日`
                          : dateCode}
                      </Tab>
                    ))}
                  </Tab.List>
                  <Tab.Panels className="mt-4">
                    {/* 開催地タブ・レースタブ・馬表をネスト */}
                    {Object.entries(frameNestedData).map(([dateCode, placeMap]) => (
                      <Tab.Panel key={dateCode}>
                        <Tab.Group>
                          {/* 開催地タブ */}
                          <Tab.List className="flex space-x-2 overflow-x-auto">
                          {Object.keys(placeMap).map(place => (
                            <Tab key={place} className={({ selected }) =>
                              selected
                                ? 'px-3 py-1 rounded-t-lg bg-gray-300 text-blue-700 font-semibold shadow'
                                : 'px-3 py-1 rounded-t-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors'
                            }>
                                {place}
                              </Tab>
                            ))}
                            <Tab
                              key="indexTab"
                              className={({ selected }) =>
                                selected
                                  ? 'px-3 py-1 rounded-t-lg bg-gray-300 text-blue-700 font-semibold shadow'
                                  : 'px-3 py-1 rounded-t-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors'
                              }
                            >
                              競う指数
                            </Tab>
                          </Tab.List>
                          <Tab.Panels className="mt-4">
                            {Object.entries(placeMap).map(([place, raceMap]) => (
                              <Tab.Panel key={place}>
                                <Tab.Group>
                                  {/* レース番号タブ */}
                                  <Tab.List className="flex space-x-2 overflow-x-auto mt-2">
                                    {Object.entries(raceMap)
                                      .filter(([, horses]) => horses.length > 0)
                                      .map(([raceNo, horses]) => (
                                        <Tab key={raceNo} className={({ selected }) =>
                                          selected
                                            ? 'px-3 py-2 rounded-t-lg bg-gray-300 text-blue-700 font-semibold shadow whitespace-nowrap text-sm'
                                            : 'px-3 py-2 rounded-t-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors whitespace-nowrap text-sm'
                                        }>
                                          <div className="flex flex-col items-center space-y-1">
                                            <span className="whitespace-nowrap text-sm">{raceNo}R {horses[0].entry['レース名']?.trim()}</span>
                                            <span className="whitespace-nowrap text-xs text-gray-500">
                                              {horses[0].entry['馬場']?.trim()}{horses[0].entry['距離']?.trim()}m
                                            </span>
                                          </div>
                                        </Tab>
                                    ))}
                                  </Tab.List>

                                  {/* 馬柱テーブル */}
                                  <Tab.Panels className="mt-4">
                                    {Object.entries(raceMap)
                                      .filter(([, horses]) => horses.length > 0)
                                      .map(([raceNo, horses]) => {
                                        // 直近3レースの評価スコアとラベルを計算
                                        // スコア順でラベルを割り当てる
                                        const scores = horses.map(horse => computeKisoScore(horse));
                                        const labels = assignLabels(scores);
                                        console.log(
                                          '枠順', dateCode, place, raceNo,
                                          'horses=', horses.length,
                                          'scores=', scores.length,
                                          'labels=', labels.length,
                                          labels.slice(0, 5)
                                        );
                                        return (
                                          <Tab.Panel key={raceNo}>
                                            <EntryTable
                                              horses={horses}
                                              dateCode={dateCode}
                                              place={place}
                                              raceNo={raceNo}
                                              labels={labels}
                                              scores={scores}         /* 追加 */
                                              marks={marks}
                                              setMarks={setMarks}
                                              favorites={favorites}
                                              setFavorites={setFavorites}
                                              frameColor={frameBgStyle}
                                              clusterRenderer={(r) => getClusterData(r, allRaces, clusterCache)}
                                              showLabels={true}
                                            />
                                          </Tab.Panel>
                                        );
                                      })}
                                  </Tab.Panels>
                                </Tab.Group>
                              </Tab.Panel>
                            ))}
                            {/* きそう指数 – 各レース横一列表示 */}
                            <Tab.Panel key="indexTab">
                              <div className="overflow-auto">
                                <table className="min-w-full text-left border-collapse border border-black">
                                  <tbody>
                                    {Object.entries(placeMap).flatMap(([plc, rmap]) =>
                                      Object.entries(rmap)
                                        .sort(([aNo], [bNo]) => Number(aNo) - Number(bNo))
                                        .flatMap(([raceNo, horses]) => {
                                          // 馬番順で並べ替え
                                          const ordered = [...horses].sort(
                                            (a, b) =>
                                              Number(a.entry['馬番'] || 0) -
                                              Number(b.entry['馬番'] || 0)
                                          );
                                          // ラベルを割り当て
                                          const labels = assignLabels(
                                            ordered.map(h => computeKisoScore(h))
                                          );
                                          // 8頭ごとにチャンク化
                                          const chunks = [];
                                          for (let i = 0; i < ordered.length; i += 8) {
                                            chunks.push(ordered.slice(i, i + 8));
                                          }
                                          // 各チャンクごとに<tr>を返す
                                          return chunks.map((chunk, rowIdx) => (
                                            <tr
                                              key={`${plc}-${raceNo}-row${rowIdx}`}
                                              className="odd:bg-white even:bg-gray-50"
                                            >
                                              {rowIdx === 0 ? (
                                                <th className="px-2 py-1 border border-black bg-gray-100 text-black whitespace-nowrap">
                                                  {plc}{raceNo}R
                                                </th>
                                              ) : (
                                                <th className="px-2 py-1 border border-black bg-white"></th>
                                              )}
                                              {chunk.map((horse, idx) => {
                                                // label = labels[rowIdx * 8 + idx]
                                                const label = labels[rowIdx * 8 + idx];
                                                return (
                                                  <React.Fragment key={`${plc}-${raceNo}-${rowIdx}-${idx}`}>
                                                    <td className="w-8 px-0 py-0 border border-black text-center align-middle bg-white text-black">
                                                      {horse.entry['馬番']}
                                                    </td>
                                                    <td className="relative px-2 py-1 border border-black text-black whitespace-nowrap">
                                                      <div className="text-xs font-bold">{horse.entry['馬名']}</div>
                                                      {/* ラベル表示 */}
                                                      {(() => {
                                                        switch (label) {
                                                          case 'くるでしょ':
                                                            return (
                                                              <span className="inline-block mt-1 px-2 py-0.5 rounded bg-red-500 text-white text-xs font-semibold">
                                                                {label}
                                                              </span>
                                                            );
                                                          case 'めっちゃきそう':
                                                            return (
                                                              <span className="inline-block mt-1 px-2 py-0.5 rounded bg-pink-100 text-pink-600 text-xs font-semibold">
                                                                {label}
                                                              </span>
                                                            );
                                                          case 'ちょっときそう':
                                                            return (
                                                              <span className="inline-block mt-1 px-2 py-0.5 rounded bg-orange-100 text-orange-500 text-xs font-semibold">
                                                                {label}
                                                              </span>
                                                            );
                                                          case 'こなそう':
                                                            return (
                                                              <span className="inline-block mt-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-semibold">
                                                                {label}
                                                              </span>
                                                            );
                                                          default:
                                                            return (
                                                              <span className="inline-block mt-1 px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-semibold">
                                                                {label}
                                                              </span>
                                                            );
                                                        }
                                                      })()}
                                                    </td>
                                                  </React.Fragment>
                                                );
                                              })}
                                              {/* 空白セル補完 (最大8組になるように補う) */}
                                              {chunk.length < 8 && Array.from({ length: 8 - chunk.length }).map((_, i) => (
                                                <React.Fragment key={`empty-${rowIdx}-${i}`}>
                                                  <td className="w-8 px-0 py-0 border border-black text-center align-middle bg-white text-black">
                                                    &nbsp;
                                                  </td>
                                                  <td className="relative px-2 py-1 border border-black text-black whitespace-nowrap">
                                                    &nbsp;
                                                  </td>
                                                </React.Fragment>
                                              ))}
                                            </tr>
                                          ));
                                        })
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </Tab.Panel>
                          </Tab.Panels>
                        </Tab.Group>
                      </Tab.Panel>
                    ))}
                  </Tab.Panels>
                </Tab.Group>
              )}
            </Tab.Panel>

            <Tab.Panel>
              <div className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={searchName}
                    onChange={e => setSearchName(e.target.value)}
                    placeholder="馬名を入力"
                    className="px-2 py-1 border rounded w-full"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="px-4 py-2 bg-green-600 text-white rounded"
                >
                  🔍 検索
                </button>
                {error && (
                  <div className="mt-2 text-red-600 font-medium">{error}</div>
                )}
                {searchResult && (() => {
                  const horses = [searchResult];
                  const scores = horses.map(h => computeKisoScore(h));
                  const labels = assignLabels(scores);

                  return (
                    <div className="mt-4">
                      <EntryTable
                        horses={horses}
                        dateCode="検索"
                        place="-"
                        raceNo="-"
                        labels={labels}
                        scores={scores}
                        marks={marks}
                        setMarks={setMarks}
                        favorites={favorites}
                        setFavorites={setFavorites}
                        frameColor={{}}     /* 枠色なし */
                        clusterRenderer={(r) => getClusterData(r, allRaces, clusterCache)}
                        showLabels={false}
                      />
                    </div>
                  );
                })()}
              </div>
            </Tab.Panel>
            {/* 分布タブ */}
            <Tab.Panel>
              <div className="p-4">
                <DistributionTab scores={allScores} />
              </div>
            </Tab.Panel>
          </Tab.Panels>
        </div>
      </Tab.Group>
        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-inner flex justify-around py-1 md:hidden z-20">
          {[
            { label: '出走', icon: '📄' },
            { label: '枠順', icon: '🏁' },
            { label: '検索', icon: '🔍' },
            { label: '分布', icon: '📊' },
          ].map(({ label, icon }) => (
            <div key={label} className="flex flex-col items-center text-xs text-gray-700">
              <span className="text-lg leading-none">{icon}</span>
              <span className="leading-none">{label}</span>
            </div>
          ))}
        </nav>
      </div>
    </main>
  )
}