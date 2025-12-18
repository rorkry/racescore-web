// page.tsx – revised: duplicate imports removed / odds section hooked to new API & static CSV fallback
// ラベル割当: 指定個数でスコア順にラベルを割り当てる
'use client'

/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { Tab } from '@headlessui/react'
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import EntryTable from './components/EntryTable'
import DateSelector from './components/DateSelector'
import { getClusterData, ClusterInfo, computeKisoScore } from '../utils/getClusterData'
import { assignLabelsByZ } from '../utils/labels'
import { levelToStars, toHalfWidth, formatTime, toSec, classToRank } from '../utils/helpers'
import type { CsvRaceRow } from '../types/csv'
import type { Race } from '../types/domain'
import { rowToRace } from '../utils/convert'
import type { RecordRow } from '../types/record'


const fetcher = (url: string) => fetch(url).then(r => r.json())

// スコア閾値方式（上から判定）
const SCORE_THRESHOLDS = [
  { label: 'くるでしょ', min: 0.3 },
  { label: 'めっちゃきそう', min: 0.25 },
  { label: 'ちょっときそう', min: 0.15 },
  { label: 'こなそう', min: 0.08 }
]

/* ------------------------------------------------------------------
 * クラス別スコア閾値テーブル
 *  rank: 8=G1, 7=G2, 6=G3, 5=OP/L, 4=3勝, 3=2勝, 2=1勝, 1=未勝利, 0=新馬
 *  [S, A, B, C] の下限値 (inclusive)
 * ------------------------------------------------------------------ */
const THRESHOLD_MAP: Record<number, [number, number, number, number]> = {
  8: [0.34, 0.28, 0.2, 0.12],
  7: [0.32, 0.26, 0.18, 0.1],
  6: [0.3, 0.24, 0.16, 0.1],
  5: [0.28, 0.22, 0.15, 0.09],
  4: [0.26, 0.2, 0.14, 0.08],
  3: [0.24, 0.18, 0.13, 0.08],
  2: [0.22, 0.17, 0.12, 0.07],
  1: [0.2, 0.15, 0.11, 0.07],
  0: [0.18, 0.14, 0.1, 0.06]
}


/** 開催地名称 or 開催コード → 2桁コード */
const placeCode: Record<string, string> = {
  // 日本語表記
  '札幌': '01', '函館': '02', '福島': '03', '新潟': '04',
  '東京': '05', '中山': '06', '中京': '07', '京都': '08',
  '阪神': '09', '小倉': '10',
  // すでにコードが入っていた場合もそのまま返す
  '01': '01', '02': '02', '03': '03', '04': '04',
  '05': '05', '06': '06', '07': '07', '08': '08',
  '09': '09', '10': '10',
};

/** 開催地の文字列を 2桁コードに変換（未知なら '00'）
 *   - 例) "新潟" → "04"
 *        "04 新潟" → "04"
 *        "1回新潟" → "04"
 *        "05" → "05"
 */
const getPlaceCode = (raw: string): string => {
  if (!raw) return '00';

  // 1) 全角数字→半角数字へ
  const half = raw.replace(/[０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
  );

  // 2) 数字・回数・空白を取り除き、漢字だけ残す
  const cleaned = half.replace(/\d|回|\s/g, '').trim(); // 例 "04 新潟"→"新潟"

  // 3) 直接コード入力のケース ("04", "05", …)
  if (/^\d{2}$/.test(half.trim())) return half.trim();

  // 4) placeCode マップで照合
  const code = placeCode[cleaned] ?? placeCode[half.trim()];
  if (!code) {
    // 未知開催地は '00' を返し、警告を出す
    console.warn('⚠️ unknown place:', raw, '→', cleaned);
    return '00';
  }
  return code;
};

/** YYYYMMDD + 開催地2桁 + レース番号2桁 を返す */
const buildRaceKey = (dateCode: string, place: string, raceNo: string): string => {
  const mmdd = dateCode.padStart(4, '0');
  const code = getPlaceCode(place);
  return `2025${mmdd}${code}${raceNo.padStart(2, '0')}`;
};



/* ------------------------------------------------------------------
 * Utility: percentile & dynamic threshold generator
 * ------------------------------------------------------------------ */
// p (0–1) percentile of numeric array (linear interpolation)
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Generate [S, A, B, C] thresholds from an array of scores
//   S: top 1%  (p=0.99)
//   A: top10%  (p=0.90)
//   B: top30%  (p=0.70)
//   C: top50%  (p=0.50)

function makeThresholds(arr: number[]): [number, number, number, number] {
  return [
    percentile(arr, 0.99), // S  (上位 1%)
    percentile(arr, 0.90), // A  (上位10%)
    percentile(arr, 0.70), // B  (上位30%)
    percentile(arr, 0.50), // C  (上位50%)
  ];
}



/**
 * クラスランクごとに異なる閾値でラベルを割り当てる
 * @param scores  生スコア配列（同一レース）
 * @param classRank classToRank() で得た 0–8 の値
 */
function assignLabelsByClass(
  scores: number[],
  classRank: number,
  map: Record<number, [number, number, number, number]> = THRESHOLD_MAP
): string[] {
  const [sThr, aThr, bThr, cThr] =
    map[classRank] ?? map[1];  // デフォ未勝利

  return scores.map(s => {
    if (s >= sThr) return 'くるでしょ';
    if (s >= aThr) return 'めっちゃきそう';
    if (s >= bThr) return 'ちょっときそう';
    if (s >= cThr) return 'こなそう';
    return 'きません';
  });
}
const REMAIN_LABEL = 'きません';
/**
 * スコア順でラベルを割り当てる
 * @param {number[]} scores
 * @returns {string[]} ラベル配列
 */
function assignLabels(scores: number[]): string[] {
  return scores.map(s => {
    for (const { label, min } of SCORE_THRESHOLDS) {
      if (s >= min) return label;
    }
    return REMAIN_LABEL;
  });
}


const DEBUG = false // デバッグログを無効化
/** ネットワーク（オッズ系）エラーを console に出すか */
const LOG_NETWORK_ERRORS = false;

/** EntryTable の race 単位ラッパー */
type RaceEntryProps = Omit<
  React.ComponentProps<typeof EntryTable>,
  'winOddsMap' | 'predicted'
> & {
  dateCode: string;
  place: string;
  raceNo: string;
  raceKey: string;
};

function RaceEntryTable(props: RaceEntryProps) {
  const {
    raceKey,
    horses,
    labels,
    scores,
    marks,
    setMarks,
    favorites,
    setFavorites,
    showLabels,
    frameNumbers,
  } = props;

  return (
    <EntryTable
      horses={horses}
      labels={labels}
      scores={scores}
      marks={marks}
      setMarks={setMarks}
      favorites={favorites}
      setFavorites={setFavorites}
      raceKey={raceKey}
      showLabels={showLabels}
      frameNumbers={frameNumbers || {}}
    />
  );
}

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

// "全角／半角スペースを全削除して馬名照合キーを作る
const normalizeName = (name: string = '') =>
  name.replace(/\u3000/g, '').replace(/\s/g, '');

// "yyyy.mm.dd"形式を Date に変換
function parseDateStr(str: string): Date | null {
  if (!str) return null;
  const parts = str.split('.').map(p => parseInt(p.trim(), 10));
  if (parts.length < 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}





// Distribution component
function DistributionTab({ scores }: { scores: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);         // Chart instance (lazy‑loaded)

  useEffect(() => {
    let cancelled = false;

    const draw = async () => {
      if (!canvasRef.current) return;

      // 必要になったときだけ Chart.js を読み込む
      const { default: Chart } = await import('chart.js/auto');
      if (cancelled || !canvasRef.current) return;

      // 有効データ抽出
      const dataScores = scores.filter(s => Number.isFinite(s));
      chartRef.current?.destroy();
      if (dataScores.length === 0) {
        chartRef.current = null;
        return;
      }

      const min   = Math.min(...dataScores);
      const max   = Math.max(...dataScores);
      const range = max - min;
      const bins  = range === 0 ? 1 : 20;
      const width = range === 0 ? 1 : range / bins;

      const counts = new Array(bins).fill(0);
      dataScores.forEach(s => {
        let idx = range === 0 ? 0 : Math.floor((s - min) / width);
        idx = Math.max(0, Math.min(bins - 1, idx));
        counts[idx]++;
      });

      const labels = new Array(bins).fill(0).map((_, i) =>
        range === 0 ? min.toFixed(2) : (min + i * width).toFixed(2)
      );

      const ctx = canvasRef.current.getContext('2d')!;
      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: '頭数', data: counts }] },
        options: {
          scales: {
            x: { title: { display: true, text: 'きそう指数' } },
            y: { title: { display: true, text: '頻度' }, beginAtZero: true }
          },
          plugins: { legend: { display: false } },
          animation: false
        }
      });
    };

    draw();
    return () => {
      cancelled = true;
      chartRef.current?.destroy();
    };
  }, [scores]);

  return <canvas ref={canvasRef} />;
}


type HorseWithPast = {
  entry: RecordRow;
  past: RecordRow[];
}

export default function Home() {
  /** レースタブの基底スタイル（背景のみ切り替え、文字色は固定） */
  const getRaceTabClass = (selected: boolean) =>
    selected
      ? 'px-3 py-2 rounded-t-lg bg-gray-300 text-blue-700 font-semibold shadow whitespace-nowrap text-sm'
      : 'px-3 py-2 rounded-t-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors whitespace-nowrap text-sm';

  /** 馬場+距離の文字色だけを馬場種別で出し分け */
  const getSurfaceTextClass = (surface: string, selected: boolean) => {
    const isTurf = surface.includes('芝');
    const isDirt = surface.includes('ダ');
    if (isTurf)  return selected ? 'text-green-700' : 'text-green-600';
    if (isDirt)  return selected ? 'text-amber-800' : 'text-amber-700';
    return selected ? 'text-gray-700' : 'text-gray-500';
  };
  const [entries, setEntries] = useState<RecordRow[]>([])
  const [races, setRaces] = useState<RecordRow[]>([])
  // 型変換後の Race[]（今後のロジックで使用予定）
  const [typedRaces, setTypedRaces] = useState<Race[]>([]);
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

  // --- 過去開催日一覧（API から取得） ----------------------------
  const ymdList: string[] = [];
  const [selectedYmd, setSelectedYmd] = useState<string>('');
  const router = useRouter();

  // 日付が選択されたら state を更新しつつ /races/[ymd] へ遷移
  const handleSelectYmd = (ymd: string) => {
    setSelectedYmd(ymd);
    router.push(`/races/${ymd}`);
  };

  /* --- 📅 DateSelector 選択に応じて表示対象の日付キーを絞る --- */
  const dateKeys =
    selectedYmd && nestedData[selectedYmd]
      ? [selectedYmd]
      : Object.keys(nestedData);

  const frameDateKeys =
    selectedYmd && frameNestedData[selectedYmd]
      ? [selectedYmd]
      : Object.keys(frameNestedData);
  // --- 別クラスタイム表示ヘルパー ----------------------------
  const renderClusterInfos = (infos: ClusterInfo[]) =>
    infos.map((info, idx) => {
      const color =
        info.highlight === 'red'
          ? 'text-red-500'
          : info.highlight === 'orange'
          ? 'text-orange-500'
          : '';
      const diffStr = info.diff > 0 ? `+${info.diff.toFixed(1)}` : info.diff.toFixed(1);
      return (
        <div key={idx} className={`text-xs mt-1 ${color}`}>
          {info.dayLabel}
          {info.className}
          {info.time}
          <span className="ml-1">{diffStr}</span>
        </div>
      );
    });
  // 表示倍率 (0.5〜1.5)
  const [zoom, setZoom] = useState(1);
  // 現在選択中のタブ (0: 出走予定馬, 1: 枠順確定後, 2: 馬検索, 3: 分布, 4: 競う指数)
  const [activeTab, setActiveTab] = useState(0);
  // クラス別パーセンタイルで生成した動的閾値マップ
  const [dynThresholdMap, setDynThresholdMap] =
    useState<Record<number, [number, number, number, number]>>(THRESHOLD_MAP);
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
  const handleFrameUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // --- 文字列へ読み込み（Shift_JIS → UTF‑8 変換を含む） ---
    const text = await readFileAsText(file);

    Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: true,
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



  /**
   * ファイル → 文字列
   * iOS Safari の TextDecoder('shift_jis') 未対応対策として
   * FileReader.readAsText(…, 'Shift_JIS') を優先し、
   * 失敗したら UTF‑8 へフォールバックする。
   */
  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      // --- 成功 ---
      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : '');
      };

      // --- 失敗 → UTF‑8 フォールバック ---
      reader.onerror = () => {
        console.warn('Shift_JIS decode failed, retrying as UTF‑8…');
        const fr = new FileReader();
        fr.onload = () => {
          resolve(typeof fr.result === 'string' ? fr.result : '');
        };
        fr.onerror = () =>
          reject(
            new Error(
              fr.error?.message || 'File read failed (both Shift_JIS & UTF‑8)',
            ),
          );
        fr.readAsText(file, 'UTF-8');
      };

      // まず Shift_JIS でチャレンジ
      try {
        reader.readAsText(file, 'Shift_JIS');
      } catch (e) {
        // 標準外ブラウザで例外になる場合も同じく UTF‑8 へ
        console.warn('readAsText with Shift_JIS threw, retrying as UTF‑8…');
        reader.onerror?.(e as ProgressEvent<FileReader>);
      }
    });
  }

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

  // 開催日一覧が取得できたら最初の日を自動選択
  useEffect(() => {
    if (!selectedYmd && Array.isArray(ymdList) && ymdList.length) {
      setSelectedYmd(ymdList[0]);
    }
  }, [ymdList, selectedYmd]);


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
        Object.values(raceMap).forEach(horses => {
          const rawScores = horses.map(h => computeKisoScore(h));
          scores.push(...rawScores);           // スケールせず生スコアを集計
        })
      )
    );
    setAllScores(scores);
  }, [nestedData]);

  /* ------------------------------------------------------------------
   * DEBUG: クラス別に「レース内最高スコア」を収集して表示
   * ------------------------------------------------------------------ */
  const classRaceMaxMap = React.useRef<Record<number, number[]>>({
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: []
  });
  // 各クラスの「全馬スコア」を蓄積（パーセンタイル用）
  const classHorseScoresMap = React.useRef<Record<number, number[]>>({
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: []
  });

  React.useEffect(() => {
    if (!Object.keys(nestedData).length) return;
    // クリア
    (Object.keys(classRaceMaxMap.current) as unknown as number[])
      .forEach(k => {
        classRaceMaxMap.current[k] = [];
        classHorseScoresMap.current[k] = [];
      });

    Object.values(nestedData).forEach(placeMap =>
      Object.values(placeMap).forEach(raceMap =>
        Object.values(raceMap).forEach(horses => {
          if (!horses.length) return;
          const scores = horses.map(h => computeKisoScore(h));

          // race‑max 用
          const maxScore = Math.max(...scores);
          const clsRank  = classToRank(horses[0].entry['クラス名'] || '');
          if (clsRank >= 0) {
            classRaceMaxMap.current[clsRank].push(maxScore);
            // all horse scores
            classHorseScoresMap.current[clsRank].push(...scores);
          }
        })
      )
    );

    // Generate newMap from classHorseScoresMap
    const newMap: Record<number, [number, number, number, number]> = { ...THRESHOLD_MAP };
    (Object.keys(classHorseScoresMap.current) as unknown as number[]).forEach(rank => {
      const arr = classHorseScoresMap.current[rank];
      if (arr.length >= 5) {
        // 5頭以上あればパーセンタイルで閾値を生成
        newMap[rank] = makeThresholds(arr);
      }
    });
    setDynThresholdMap(newMap);

    console.log('【DEBUG】race-max:', classRaceMaxMap.current);
    console.log('【DEBUG】horse-scores:', classHorseScoresMap.current);
  }, [nestedData]);

  // --- 追加: 枠順確定タブ専用のスコア分布計算 ---
  // 枠順確定タブでは entries を使わないため、frameNestedData だけで
  // 頭数分布を再計算し allScores を更新する
  useEffect(() => {
    if (!Object.keys(frameNestedData).length) return;
    const scores: number[] = [];
    Object.values(frameNestedData).forEach(placeMap =>
      Object.values(placeMap).forEach(raceMap =>
        Object.values(raceMap).forEach(horses => {
          const rawScores = horses.map(h => computeKisoScore(h));
          scores.push(...rawScores);           // 生スコアをそのまま集計
        })
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
      Papa.parse<CsvRaceRow>(file, {
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
        complete: ({ data }) => {
          setRaces(data as unknown as RecordRow[]);  // 既存ロジック維持
          // Csv → Domain 型変換
          const domainRaces: Race[] = data.map(rowToRace);
          setTypedRaces(domainRaces);
          // 1着馬データのみを抽出して allRaces として永続化
          const winners = (data as unknown as RecordRow[]).filter(r => {
            const pos = parseInt(toHalfWidth((r['着順'] || '').trim()), 10);
            return pos === 1;
          });
          setAllRaces(winners);
          localStorage.setItem('allRaces', JSON.stringify(winners));
          // racesはlocalStorageに保存しない（容量超過防止）
          if (DEBUG) console.log('Parsed races:', data.slice(0, 5), 'total:', data.length);
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
      <div
        className="overflow-x-auto origin-top-left [transform:scale(0.85)] w-[117.65%] md:w-auto md:[transform:scale(var(--zoom))]"
        style={{ '--zoom': String(zoom) } as React.CSSProperties}
      >
      <Tab.Group selectedIndex={activeTab} onChange={setActiveTab}>
        {/* ヘッダーとタブ */}
        <div className="flex justify-between items-center mb-4 bg-gradient-to-r from-gray-900 to-gray-800 shadow-sm rounded-xl px-4 py-2">
          <h1 className="text-xl font-bold text-white">俺の出馬表（馬名＆過去５走）</h1>
          {/* 🩺 DEV: localStorage quick check */}
          {process.env.NODE_ENV !== 'production' && (
            <button
              onClick={() => {
                const entries = JSON.parse(localStorage.getItem('entries') || 'null');
                const nested  = JSON.parse(localStorage.getItem('nestedData') || 'null');
                console.log('[DEBUG] localStorage entries:', entries);
                console.log('[DEBUG] localStorage nestedData:', nested);
                alert(
                  [
                    `entries: ${Array.isArray(entries) ? entries.length : 'none'}`,
                    `nestedData keys: ${
                      nested && typeof nested === 'object'
                        ? Object.keys(nested).length
                        : 'none'
                    }`
                  ].join('\n')
                );
              }}
              className="ml-2 px-2 py-1 border border-white text-white text-xs rounded hover:bg-white hover:text-gray-900 transition"
              title="localStorage check"
            >
              🩺
            </button>
          )}
          <Tab.List className="flex space-x-2">
            {['出走予定馬', '枠順確定後', '馬検索', '分布', '競う指数'].map(label => (
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

        {/* 開催日セレクター */}
        {ymdList && (
          <div className="mb-4">
            <DateSelector
              dates={ymdList || []}
              selected={selectedYmd}
              onChange={handleSelectYmd}
            />
          </div>
        )}

        {/* CSV アップロード & 実行ボタン */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:flex-wrap md:gap-6">
            {activeTab === 0 && (
              <div>
                <p>📥 出走予定馬CSV</p>
                {isEntryUploaded ? (
                  <p className="text-green-600">✅ アップロード済み</p>
                ) : (
                  <input type="file" accept=".csv" onChange={handleEntryUpload} />
                )}
              </div>
            )}
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
          {activeTab === 0 && (
            <div>
              <button
                onClick={() => {
                  setError(null);
                  try {
                    filterData();
                  } catch (e: any) {
                    console.error(e);
                    setError(e.message);
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
          )}

          {/* メインコンテンツ */}
          <Tab.Panels className="mt-4">
            {/* 出走予定馬 / 枠順確定後 / 馬検索 の各パネル */}
            <Tab.Panel>
              {/* 出走予定馬タブ: 日付→開催地→レース */}
              <Tab.Group>
                {/* 日付タブ */}
                <Tab.List className="flex space-x-2 overflow-x-auto">
                  {dateKeys.map(dateCode => (
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
                  {dateKeys.map(dateCode => {
                    const placeMap = nestedData[dateCode] || {};
                    return (
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
                                      <Tab
                                        key={raceNo}
                                        className={({ selected }) =>
                                          getRaceTabClass(selected)
                                        }
                                      >
                                        {({ selected }) => (
                                          <div className="flex flex-col items-center space-y-1">
                                            <span className="whitespace-nowrap text-sm">
                                              {raceNo}R {horses[0].entry['レース名']?.trim()}
                                            </span>
                                            <span
                                              className={`whitespace-nowrap text-xs ${getSurfaceTextClass(
                                                horses[0].entry['馬場']?.trim() || '',
                                                selected,
                                              )}`}
                                            >
                                              {horses[0].entry['馬場']?.trim()}
                                              {horses[0].entry['距離']?.trim()}m
                                            </span>
                                          </div>
                                        )}
                                      </Tab>
                                  ))}
                                </Tab.List>

                                {/* 馬柱テーブル */}
                                <Tab.Panels className="mt-4">
                                  {Object.entries(raceMap)
                                    .filter(([, horses]) => horses.length > 0)
                                    .map(([raceNo, horses]) => {
                                      const raceKey = buildRaceKey(dateCode, place.trim(), raceNo);

                                      // 直近3レースの評価スコアとラベルを計算
                                      // スコア順でラベルを割り当てる
                                      // === スコア (0–1 正規化) ======================================
                                      const rawScores = horses.map((horse, idx) => {
                                        const sc = computeKisoScore(horse);
                                        if (DEBUG) console.log(`[PAGE] rawScore [${dateCode}|${place}|${raceNo}] idx=${idx} ${horse.entry['馬名']}:`, sc);
                                        return sc;
                                      });
                                      const scores = rawScores;   // 生スコア
                                      const classRank = classToRank(horses[0]?.entry['クラス名'] || '');
                                      if (DEBUG) console.log(`[PAGE] raw scores for ${dateCode}|${place}|${raceNo}:`, scores, 'classRank=', classRank);
                                      const labels = assignLabelsByZ(scores);
                                      return (
                                        <Tab.Panel key={raceNo}>
                                          <RaceEntryTable
                                            raceKey={raceKey}
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


                                            showLabels={true}
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
                    );
                  })}
                </Tab.Panels>
              </Tab.Group>
            </Tab.Panel>

            <Tab.Panel>
              {!Object.keys(frameNestedData).length ? (
                <p className="text-gray-600">枠順確定CSVをアップロードしてください。</p>
              ) : (
                <>
                {/* === 以下、出走予定馬パネルと同一ロジック === */}
                <Tab.Group>
                  {/* 日付タブ */}
                  <DateSelector
                    dates={ymdList || []}
                    selected={selectedYmd}
                    onChange={handleSelectYmd}
                  />
                  <Tab.Panels className="mt-4">
                    {/* 開催地タブ・レースタブ・馬表をネスト */}
                    {frameDateKeys.map(dateCode => {
                      const placeMap = frameNestedData[dateCode] || {};
                      return (
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
                                {/* 開催地ごとのPDFダウンロードボタン */}
                                <button
                                  onClick={async () => {
                                    const doc = new jsPDF();
                                    let isFirstPage = true;

                                    // この開催地の全レースをループ
                                    const raceEntries = Object.entries(raceMap).filter(([, horses]) => horses.length > 0);
                                    
                                    for (const [raceNo, horses] of raceEntries) {
                                      if (!isFirstPage) {
                                        doc.addPage();
                                      }
                                      isFirstPage = false;

                                      // 競うスコアを計算
                                      const rawScores = horses.map((horse) => computeKisoScore(horse));
                                      const scores = rawScores.map(s => isNaN(s) ? 0 : s);

                                      // スコア順にソート
                                      const sortedHorses = horses
                                        .map((horse, idx) => ({ horse, score: scores[idx], idx }))
                                        .sort((a, b) => b.score - a.score);

                                      // 一時的なHTMLテーブルを作成
                                      const tempDiv = document.createElement('div');
                                      tempDiv.style.position = 'absolute';
                                      tempDiv.style.left = '-9999px';
                                      tempDiv.style.width = '800px';
                                      tempDiv.style.backgroundColor = 'white';
                                      tempDiv.style.padding = '20px';
                                      
                                      // レース情報を取得
                                      const className = horses[0].entry['クラス名'] || horses[0].entry.classname || '';
                                      const distance = horses[0].entry['距離'] || horses[0].entry.distance || '';
                                      const surfaceType = horses[0].entry['芝ダート'] || horses[0].entry.surface || '';
                                      // 距離数値を抽出
                                      const distanceMatch = distance.match(/(\d+)/);
                                      const distanceNum = distanceMatch ? distanceMatch[1] : '';
                                      
                                      const raceTitle = `${place}${raceNo}R ${className} ${surfaceType}${distanceNum}m`;
                                      
                                      // 枠番色を取得する関数
                                      const getFrameColor = (horseNo) => {
                                        const num = parseInt(horseNo, 10);
                                        const frame = Math.ceil(num / 2);
                                        const colors = {
                                          1: { bg: '#ffffff', text: '#000000' }, // 白
                                          2: { bg: '#000000', text: '#ffffff' }, // 黒
                                          3: { bg: '#ff0000', text: '#ffffff' }, // 赤
                                          4: { bg: '#0000ff', text: '#ffffff' }, // 青
                                          5: { bg: '#ffff00', text: '#000000' }, // 黄
                                          6: { bg: '#00ff00', text: '#000000' }, // 緑
                                          7: { bg: '#ff8c00', text: '#ffffff' }, // オレンジ
                                          8: { bg: '#ff69b4', text: '#ffffff' }  // ピンク
                                        };
                                        return colors[frame] || { bg: '#cccccc', text: '#000000' };
                                      };
                                      
                                      // スコアに応じた色を取得
                                      const getScoreColor = (rank, totalHorses) => {
                                        if (rank === 0) return '#ff4444'; // 1位：赤
                                        if (rank === 1) return '#ff8844'; // 2位：オレンジ
                                        if (rank === 2) return '#ffcc44'; // 3位：黄
                                        if (rank < totalHorses / 2) return '#88dd88'; // 上位：緑
                                        return '#dddddd'; // 下位：灰色
                                      };
                                      
                                      tempDiv.innerHTML = `
                                        <div style="font-family: 'Noto Sans JP', sans-serif;">
                                          <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 15px; color: #1e3a8a;">${raceTitle}</h2>
                                          <table style="width: 100%; border-collapse: collapse;">
                                            <thead>
                                              <tr style="background-color: #1e3a8a; color: white;">
                                                <th style="border: 3px solid #000; padding: 12px; text-align: center; font-size: 16px; font-weight: bold; width: 30px;">枠</th>
                                                <th style="border: 3px solid #000; padding: 12px; text-align: center; font-size: 16px; font-weight: bold; width: 60px;">馬番</th>
                                                <th style="border: 3px solid #000; padding: 12px; text-align: left; font-size: 16px; font-weight: bold;">馬名</th>
                                                <th style="border: 3px solid #000; padding: 12px; text-align: center; font-size: 16px; font-weight: bold; width: 100px;">競うスコア</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              ${sortedHorses.map((item, rank) => {
                                                const { horse, score } = item;
                                                const horseNo = parseInt(String(horse.entry.horseNo || horse.entry.馬番 || ''), 10).toString();
                                                const horseName = horse.entry.horseName || horse.entry.馬名 || '';
                                                
                                                const frameColor = getFrameColor(horseNo);
                                                const scoreColor = getScoreColor(rank, sortedHorses.length);
                                                
                                                return `
                                                  <tr>
                                                    <td style="border: 3px solid #000; padding: 12px; text-align: center; background-color: ${frameColor.bg}; width: 30px;"></td>
                                                    <td style="border: 3px solid #000; padding: 12px; text-align: center; background-color: #ffffff; color: #000000; font-size: 18px; font-weight: bold; width: 60px;">${horseNo}</td>
                                                    <td style="border: 3px solid #000; padding: 12px; text-align: left; font-size: 20px; font-weight: bold;">${horseName}</td>
                                                    <td style="border: 3px solid #000; padding: 12px; text-align: center; background-color: ${scoreColor}; font-size: 18px; font-weight: bold; width: 100px;">${Math.round(isNaN(score) ? 0 : score)}</td>
                                                  </tr>
                                                `;
                                              }).join('')}
                                            </tbody>
                                          </table>
                                        </div>
                                      `;
                                      
                                      document.body.appendChild(tempDiv);
                                      
                                      // html2canvasでHTMLをCanvasに変換
                                      const canvas = await html2canvas(tempDiv, {
                                        scale: 2,
                                        useCORS: true,
                                        logging: false
                                      });
                                      
                                      document.body.removeChild(tempDiv);
                                      
                                      // CanvasをPDFに追加
                                      const imgData = canvas.toDataURL('image/png');
                                      const imgWidth = 190;
                                      const imgHeight = (canvas.height * imgWidth) / canvas.width;
                                      doc.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
                                    }

                                    // PDFをダウンロード
                                    doc.save(`${dateCode}_${place}.pdf`);
                                  }}
                                  className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                  {place}の全レースをPDFでダウンロード
                                </button>
                                <Tab.Group>
                                  {/* レース番号タブ */}
                                  <Tab.List className="flex space-x-2 overflow-x-auto mt-2">
                                    {Object.entries(raceMap)
                                      .filter(([, horses]) => horses.length > 0)
                                      .map(([raceNo, horses]) => (
                                        <Tab
                                          key={raceNo}
                                          className={({ selected }) =>
                                            getRaceTabClass(selected)
                                          }
                                        >
                                          {({ selected }) => (
                                            <div className="flex flex-col items-center space-y-1">
                                              <span className="whitespace-nowrap text-sm">
                                                {raceNo}R {horses[0].entry['レース名']?.trim()}
                                              </span>
                                              <span
                                                className={`whitespace-nowrap text-xs ${getSurfaceTextClass(
                                                  horses[0].entry['馬場']?.trim() || '',
                                                  selected,
                                                )}`}
                                              >
                                                {horses[0].entry['馬場']?.trim()}
                                                {horses[0].entry['距離']?.trim()}m
                                              </span>
                                            </div>
                                          )}
                                        </Tab>
                                    ))}
                                  </Tab.List>

                                  {/* 馬柱テーブル */}
                                  <Tab.Panels className="mt-4">
                                    {Object.entries(raceMap)
                                      .filter(([, horses]) => horses.length > 0)
                                      .map(([raceNo, horses]) => {
                                        const raceKey = buildRaceKey(dateCode, place.trim(), raceNo);
                                        // 直近3レースの評価スコアとラベルを計算
                                        // スコア順でラベルを割り当てる
                                        // === スコア (0–1 正規化) ======================================
                                        const rawScores = horses.map((horse, idx) => {
                                          const sc = computeKisoScore(horse);
                                          if (DEBUG) console.log(
                                            `[FRAME] rawScore [${dateCode}|${place}|${raceNo}] idx=${idx} ${horse.entry['馬名']}:`,
                                            sc
                                          );
                                          return sc;
                                        });
                                        const scores = rawScores;   // 生スコア
                                        const classRank = classToRank(horses[0]?.entry['クラス名'] || '');
                                        if (DEBUG) console.log(`[FRAME] raw scores for ${dateCode}|${place}|${raceNo}:`, scores, 'classRank=', classRank);
                                        const labels = assignLabelsByZ(scores);
                                        return (
                                          <Tab.Panel key={raceNo}>
                                            <RaceEntryTable
                                              raceKey={raceKey}
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
                                          const orderedScores = ordered.map(h => computeKisoScore(h));
                                          const classRank = classToRank(ordered[0]?.entry['クラス名'] || '');
                                          const labels = assignLabelsByZ(orderedScores);
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
                      );
                    })}
                  </Tab.Panels>
                </Tab.Group>
                </>
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
                  const rawScores = horses.map(h => computeKisoScore(h));
                  const scores = rawScores;
                  const classRank = classToRank(horses[0]?.entry['クラス名'] || '');
                  const labels = assignLabelsByZ(scores);

                  return (
                    <div className="mt-4">
                      <EntryTable
                        horses={horses}
                        labels={labels}
                        scores={scores}
                        marks={marks}
                        setMarks={setMarks}
                        favorites={favorites}
                        setFavorites={setFavorites}
                        showLabels={false}
                        raceKey=""
                        frameNumbers={{}}
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
            {/* 競う指数タブ */}
            <Tab.Panel>
              <div className="p-4">
                <h2 className="text-xl font-bold mb-4">競う指数（簡易馬柱）</h2>
                {!Object.keys(frameNestedData).length ? (
                  <p className="text-gray-600">枠順確定CSVをアップロードしてください。</p>
                ) : (
                  <Tab.Group>
                    {/* 日付タブ */}
                    <DateSelector
                      dates={ymdList || []}
                      selected={selectedYmd}
                      onChange={handleSelectYmd}
                    />
                    <Tab.Panels className="mt-4">
                      {frameDateKeys.map(dateCode => {
                        const placeMap = frameNestedData[dateCode] || {};
                        return (
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
                                  {/* 開催地ごとのPDFダウンロードボタン */}
                                  <button
                                    onClick={async () => {
                                      const doc = new jsPDF();
                                      let isFirstPage = true;

                                      // この開催地の全レースをループ
                                      const raceEntries = Object.entries(raceMap).filter(([, horses]) => horses.length > 0);
                                      
                                      for (const [raceNo, horses] of raceEntries) {
                                        if (!isFirstPage) {
                                          doc.addPage();
                                        }
                                        isFirstPage = false;

                                        // 競うスコアを計算
                                        const rawScores = horses.map((horse) => computeKisoScore(horse));
                                        const scores = rawScores.map(s => isNaN(s) ? 0 : s);

                                        // スコア順にソート
                                        const sortedHorses = horses
                                          .map((horse, idx) => ({ horse, score: scores[idx], idx }))
                                          .sort((a, b) => b.score - a.score);

                                        // 一時的なHTMLテーブルを作成
                                        const tempDiv = document.createElement('div');
                                        tempDiv.style.position = 'absolute';
                                        tempDiv.style.left = '-9999px';
                                        tempDiv.style.width = '800px';
                                        tempDiv.style.backgroundColor = 'white';
                                        tempDiv.style.padding = '20px';
                                        
                                        // レース情報を取得
                                        const className = horses[0].entry['クラス名'] || horses[0].entry.classname || '';
                                        const distance = horses[0].entry['距離'] || horses[0].entry.distance || '';
                                        const surfaceType = horses[0].entry['芝ダート'] || horses[0].entry.surface || '';
                                        // 距離数値を抽出
                                        const distanceMatch = distance.match(/(\d+)/);
                                        const distanceNum = distanceMatch ? distanceMatch[1] : '';
                                        
                                        const raceTitle = `${place}${raceNo}R ${className} ${surfaceType}${distanceNum}m`;
                                        
                                        // 枠番色を取得する関数
                                        const getFrameColor = (horseNo) => {
                                          const num = parseInt(horseNo, 10);
                                          const frame = Math.ceil(num / 2);
                                          const colors = {
                                            1: { bg: '#ffffff', text: '#000000' }, // 白
                                            2: { bg: '#000000', text: '#ffffff' }, // 黒
                                            3: { bg: '#ff0000', text: '#ffffff' }, // 赤
                                            4: { bg: '#0000ff', text: '#ffffff' }, // 青
                                            5: { bg: '#ffff00', text: '#000000' }, // 黄
                                            6: { bg: '#00ff00', text: '#000000' }, // 緑
                                            7: { bg: '#ff8c00', text: '#ffffff' }, // オレンジ
                                            8: { bg: '#ff69b4', text: '#ffffff' }  // ピンク
                                          };
                                          return colors[frame] || { bg: '#cccccc', text: '#000000' };
                                        };
                                        
                                        // スコアに応じた色を取得
                                        const getScoreColor = (rank, totalHorses) => {
                                          if (rank === 0) return '#ff4444'; // 1位：赤
                                          if (rank === 1) return '#ff8844'; // 2位：オレンジ
                                          if (rank === 2) return '#ffcc44'; // 3位：黄
                                          if (rank < totalHorses / 2) return '#88dd88'; // 上位：緑
                                          return '#dddddd'; // 下位：灰色
                                        };
                                        
                                        tempDiv.innerHTML = `
                                          <div style="font-family: 'Noto Sans JP', sans-serif;">
                                            <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 15px; color: #1e3a8a;">${raceTitle}</h2>
                                            <table style="width: 100%; border-collapse: collapse;">
                                              <thead>
                                                <tr style="background-color: #1e3a8a; color: white;">
                                                  <th style="border: 3px solid #000; padding: 12px; text-align: center; font-size: 16px; font-weight: bold; width: 30px;">枠</th>
                                                  <th style="border: 3px solid #000; padding: 12px; text-align: center; font-size: 16px; font-weight: bold; width: 60px;">馬番</th>
                                                  <th style="border: 3px solid #000; padding: 12px; text-align: left; font-size: 16px; font-weight: bold;">馬名</th>
                                                  <th style="border: 3px solid #000; padding: 12px; text-align: center; font-size: 16px; font-weight: bold; width: 100px;">競うスコア</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                ${sortedHorses.map((item, rank) => {
                                                  const { horse, score } = item;
                                                  const horseNo = parseInt(String(horse.entry.horseNo || horse.entry.馬番 || ''), 10).toString();
                                                  const horseName = horse.entry.horseName || horse.entry.馬名 || '';
                                                  
                                                  const frameColor = getFrameColor(horseNo);
                                                  const scoreColor = getScoreColor(rank, sortedHorses.length);
                                                  
                                                  return `
                                                    <tr>
                                                      <td style="border: 3px solid #000; padding: 12px; text-align: center; background-color: ${frameColor.bg}; width: 30px;"></td>
                                                      <td style="border: 3px solid #000; padding: 12px; text-align: center; background-color: #ffffff; color: #000000; font-size: 18px; font-weight: bold; width: 60px;">${horseNo}</td>
                                                      <td style="border: 3px solid #000; padding: 12px; text-align: left; font-size: 20px; font-weight: bold;">${horseName}</td>
                                                      <td style="border: 3px solid #000; padding: 12px; text-align: center; background-color: ${scoreColor}; font-size: 18px; font-weight: bold; width: 100px;">${Math.round(isNaN(score) ? 0 : score)}</td>
                                                    </tr>
                                                  `;
                                                }).join('')}
                                              </tbody>
                                            </table>
                                          </div>
                                        `;
                                        
                                        document.body.appendChild(tempDiv);
                                        
                                        // html2canvasでHTMLをCanvasに変換
                                        const canvas = await html2canvas(tempDiv, {
                                          scale: 2,
                                          useCORS: true,
                                          logging: false
                                        });
                                        
                                        document.body.removeChild(tempDiv);
                                        
                                        // CanvasをPDFに追加
                                        const imgData = canvas.toDataURL('image/png');
                                        const imgWidth = 190;
                                        const imgHeight = (canvas.height * imgWidth) / canvas.width;
                                        doc.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
                                      }

                                      // PDFをダウンロード
                                      doc.save(`${dateCode}_${place}.pdf`);
                                    }}
                                    className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                  >
                                    {place}の全レースをPDFでダウンロード
                                  </button>
                                  <Tab.Group>
                                    {/* レース番号タブ */}
                                    <Tab.List className="flex space-x-2 overflow-x-auto mt-2">
                                      {Object.entries(raceMap)
                                        .filter(([, horses]) => horses.length > 0)
                                        .map(([raceNo, horses]) => (
                                          <Tab
                                            key={raceNo}
                                            className={({ selected }) =>
                                              getRaceTabClass(selected)
                                            }
                                          >
                                            {({ selected }) => (
                                              <div className="flex flex-col items-center space-y-1">
                                                <span className="whitespace-nowrap text-sm">
                                                  {raceNo}R {horses[0].entry['レース名']?.trim()}
                                                </span>
                                                <span className={`text-xs ${getSurfaceTextClass(horses[0].entry['距離'] || '', selected)}`}>
                                                  {horses[0].entry['距離']?.trim() || ''}
                                                </span>
                                              </div>
                                            )}
                                          </Tab>
                                        ))}
                                    </Tab.List>
                                    <Tab.Panels className="mt-4">
                                      {Object.entries(raceMap)
                                        .filter(([, horses]) => horses.length > 0)
                                        .map(([raceNo, horses]) => {
                                          const raceKey = buildRaceKey(dateCode, place.trim(), raceNo);

                                          // 競うスコアを計算
                                          const rawScores = horses.map((horse, idx) => {
                                            const sc = computeKisoScore(horse);
                                            return sc;
                                          });
                                          const scores = rawScores;
                                          const labels = assignLabelsByZ(scores);

                                          // スコア順にソート
                                          const sortedHorses = horses
                                            .map((horse, idx) => ({ horse, score: scores[idx], idx }))
                                            .sort((a, b) => b.score - a.score);

                                          return (
                                            <Tab.Panel key={raceNo}>
                                              <div className="bg-white p-4 rounded shadow">
                                                <h3 className="text-lg font-bold mb-2">
                                                  {raceNo}R {horses[0].entry['レース名']?.trim()} {horses[0].entry['距離']?.trim()}
                                                </h3>
                                                <table className="w-full border-collapse border-2 border-gray-400">
                                                  <thead>
                                                    <tr style={{ backgroundColor: '#87CEEB' }} className="text-white font-bold">
                                                      <th className="border-2 border-gray-400 px-3 py-2 text-center text-lg">馬番</th>
                                                      <th className="border-2 border-gray-400 px-3 py-2 text-center text-lg">印</th>
                                                      <th className="border-2 border-gray-400 px-3 py-2 text-center text-lg">得点</th>
                                                      <th className="border-2 border-gray-400 px-3 py-2 text-center text-lg">馬名</th>
                                                      <th className="border-2 border-gray-400 px-3 py-2 text-center text-lg">騎手</th>
                                                      <th className="border-2 border-gray-400 px-3 py-2 text-center text-lg">得点順</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {sortedHorses.map((item, rank) => {
                                                      const { horse, score, idx } = item;
                                                      const horseNo = String(horse.entry.horseNo || horse.entry.馬番 || '').padStart(2, '0');
                                                      const horseNoInt = parseInt(horseNo, 10);
                                                      const horseNoDisplay = horseNoInt.toString();
                                                      const horseName = String(horse.entry.horseName || horse.entry.馬名 || '');
                                                      const jockey = String(horse.entry.jockey || horse.entry.騎手 || '');
                                                      const mark = ['\u25ce', '\u25cb', '\u25b2', '\u2606', '\u25b3'][rank] || '';

                                                      // 枠番に基づく背景色（1-8枠）
                                                      const waku = Math.ceil(horseNoInt / 2);
                                                      const wakuColors = [
                                                        '#FFFFFF', // 0 (使わない)
                                                        '#FFFFFF', // 1枠 白
                                                        '#000000', // 2枠 黒
                                                        '#FF0000', // 3枠 赤
                                                        '#0000FF', // 4枠 青
                                                        '#FFFF00', // 5枠 黄
                                                        '#00FF00', // 6枠 緑
                                                        '#FFA500', // 7枠 オレンジ
                                                        '#FFC0CB'  // 8枠 ピンク
                                                      ];
                                                      const wakuBg = wakuColors[waku] || '#FFFFFF';
                                                      const wakuTextColor = (waku === 2 || waku === 4 || waku === 6) ? 'white' : 'black';

                                                      // 得点に基づく背景色グラデーション
                                                      const maxScore = Math.max(...sortedHorses.map(h => h.score));
                                                      const minScore = Math.min(...sortedHorses.map(h => h.score));
                                                      const scoreRange = maxScore - minScore;
                                                      let scoreBg = '#90EE90'; // デフォルトは緑
                                                      
                                                      if (scoreRange > 0) {
                                                        const normalized = (score - minScore) / scoreRange;
                                                        if (normalized > 0.66) {
                                                          scoreBg = '#FF6B6B'; // 高得点：赤
                                                        } else if (normalized > 0.33) {
                                                          scoreBg = '#FFD93D'; // 中得点：黄色
                                                        } else {
                                                          scoreBg = '#90EE90'; // 低得点：緑
                                                        }
                                                      }

                                                      return (
                                                        <tr key={horseNo} className="hover:opacity-80">
                                                          <td 
                                                            className="border-2 border-gray-400 px-3 py-2 text-center font-bold text-xl"
                                                            style={{ backgroundColor: wakuBg, color: wakuTextColor }}
                                                          >
                                                            {horseNoDisplay}
                                                          </td>
                                                          <td className="border-2 border-gray-400 px-3 py-2 text-center text-2xl font-bold">{mark}</td>
                                                          <td 
                                                            className="border-2 border-gray-400 px-3 py-2 text-center font-bold text-2xl"
                                                            style={{ backgroundColor: scoreBg }}
                                                          >
                                                            {Math.round(score)}
                                                          </td>
                                                          <td className="border-2 border-gray-400 px-3 py-2 text-lg font-bold">{horseName}</td>
                                                          <td className="border-2 border-gray-400 px-3 py-2 text-lg">{jockey}</td>
                                                          <td className="border-2 border-gray-400 px-3 py-2 text-center font-bold text-xl">{rank + 1}</td>
                                                        </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                </table>
                                                <button
                                                  onClick={() => {
                                                    const doc = new jsPDF();
                                                    
                                                    // タイトル
                                                    const raceTitle = `${raceNo}R ${horses[0].entry['レース名']?.trim()} ${horses[0].entry['距離']?.trim()}`;
                                                    doc.setFontSize(16);
                                                    doc.text(raceTitle, 14, 15);
                                                    
                                                    // テーブルデータ
                                                    const tableData = sortedHorses.map((item, rank) => {
                                                      const { horse, score } = item;
                                                      const horseNo = String(horse.entry.horseNo || horse.entry.馬番 || '').padStart(2, '0');
                                                      const horseNoDisplay = parseInt(horseNo, 10).toString();
                                                      const horseName = String(horse.entry.horseName || horse.entry.馬名 || '');
                                                      const jockey = String(horse.entry.jockey || horse.entry.騎手 || '');
                                                      const mark = ['\u25ce', '\u25cb', '\u25b2', '\u2606', '\u25b3'][rank] || '';
                                                      
                                                      return [
                                                        rank + 1,
                                                        mark,
                                                        horseNoDisplay,
                                                        horseName,
                                                        jockey,
                                                        Math.round(score)
                                                      ];
                                                    });
                                                    
                                                    // autoTableでテーブルを生成
                                                    autoTable(doc, {
                                                      head: [['順位', '印', '馬番', '馬名', '騎手', '競うスコア']],
                                                      body: tableData,
                                                      startY: 25,
                                                      styles: { font: 'helvetica', fontSize: 10 },
                                                      headStyles: { fillColor: [31, 41, 55], textColor: 255 },
                                                    });
                                                    
                                                    // PDFをダウンロード
                                                    doc.save(`${dateCode}_${place}_${raceNo}R_競う指数.pdf`);
                                                  }}
                                                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                                >
                                                  PDFでダウンロード
                                                </button>
                                              </div>
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
                        );
                      })}
                    </Tab.Panels>
                  </Tab.Group>
                )}
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
            { label: '競う', icon: '🏆' },
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