// page.tsx – revised: duplicate imports removed / odds section hooked to new API & static CSV fallback
// ラベル割当: 指定個数でスコア順にラベルを割り当てる
'use client'

/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'
import { Tab } from '@headlessui/react'
import useSWR from 'swr'

import EntryTable from './components/EntryTable'
import { getClusterData, ClusterInfo, computeKisoScore } from '../utils/getClusterData'
import type { CsvRaceRow } from '../types/csv'
import type { Race } from '../types/domain'
import { rowToRace } from '../utils/convert'
import type { RecordRow } from '../types/record'
import type { OddsRow } from '../types/odds'
import { parseOdds } from '../utils/parseOdds'
import { fetchOdds } from '@/utils/fetchOdds'
import { fetchTrioOdds } from '@/lib/fetchTrio'
import { calcSyntheticWinOdds as calcSynthetic } from '@/lib/calcSyntheticWinOdds'

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

/** CSV から読み込んだ単勝オッズを初期値マップに変換 */
function buildInitialOddsMap(
  horses: HorseWithPast[],
  raceKey: string,
  oddsMap: Map<string, number>
): Record<string, number> {
  const map: Record<string, number> = {};
  horses.forEach(h => {
    const num = toHalfWidth(h.entry['馬番']?.trim() || '').padStart(2, '0');
    const o = oddsMap.get(`${raceKey}_${num}`);
    if (o != null) map[num] = o;
  });
  return map;
}

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

/* ------------------------------------------------------------------
 * Z‑score based labeling
 *   - Always top 1 horse ⇒ 'くるでしょ'
 *   - 次点 A 数 : 12頭以上=3, 8-11頭=2, 7頭以下=1
 *   - z >= 0    ⇒ 'ちょっときそう'
 *   - z >= -0.5 ⇒ 'こなそう'
 *   - else      ⇒ 'きません'
 * ------------------------------------------------------------------ */
function assignLabelsByZ(scores: number[]): string[] {
  const n = scores.length;
  if (n === 0) return [];
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;

  const sorted = scores
    .map((s, i) => ({ s, i, z: (s - mean) / sd }))
    .sort((a, b) => b.s - a.s);

  // initial labels
  const labels = Array<string>(n).fill('きません');

  // Top‑1 ⇒ S
  labels[sorted[0].i] = 'くるでしょ';

  // A head count
  let aCount = 1;
  if (n >= 12) aCount = 3;
  else if (n >= 8) aCount = 2;

  for (let k = 1; k <= aCount && k < sorted.length; k++) {
    labels[sorted[k].i] = 'めっちゃきそう';
  }

  // --- B / C by percentage of remaining horses --------------------
  const rest = sorted.slice(aCount + 1);        // 未分類の残り
  const totalRest = rest.length;
  const bN = Math.ceil(totalRest * 0.30);       // 上位 30% → B
  const cN = Math.ceil(totalRest * 0.30);       // 次の 30% → C

  rest.forEach(({ i }, idx) => {
    if (idx < bN)           labels[i] = 'ちょっときそう';
    else if (idx < bN + cN) labels[i] = 'こなそう';
    // 残りは 'きません' のまま
  });
  return labels;
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

/** EntryTable の race 単位ラッパー – 3連単合成オッズ(予想単勝)を注入 */
type RaceEntryProps = Omit<
  React.ComponentProps<typeof EntryTable>,
  'winOddsMap' | 'predicted'
> & {
  dateCode: string;
  place: string;
  raceNo: string;
  raceKey: string;
  syntheticOdds?: Record<string, number> | null;
  initialOddsMap?: Record<string, number>;   // ★ 追加
};

function RaceEntryTable(props: RaceEntryProps) {
  const {
    raceKey,
    syntheticOdds,
    initialOddsMap = {},          // ★ 追加
    dateCode,
    place,
    raceNo,
    horses,
    labels,
    scores,
    marks,
    setMarks,
    favorites,
    setFavorites,
    frameColor,
    clusterRenderer,
    showLabels,
  } = props;

  // --- 単勝を 5 分毎にポーリング ---
  const { data } = useSWR<{ o1: Record<string, number> }>(
    `/api/odds/${raceKey}`,
    fetcher,
    { refreshInterval: 5 * 60_000, keepPreviousData: true }
  );

  const winOddsMap = React.useMemo(() => {
    const m: Record<string, number> = { ...initialOddsMap };   // ★ 変更
    if (data?.o1) {
      Object.entries(data.o1).forEach(([no, odd]) => {
        m[no.padStart(2, '0')] = Number(odd);
      });
    }
    return m;
  }, [data, initialOddsMap]);

  return (
    <EntryTable
      horses={horses}
      dateCode={dateCode}
      place={place}
      raceNo={raceNo}
      labels={labels}
      scores={scores}
      marks={marks}
      setMarks={setMarks}
      favorites={favorites}
      setFavorites={setFavorites}
      frameColor={frameColor}
      clusterRenderer={clusterRenderer}
      raceKey={raceKey}
      showLabels={showLabels}
      predicted={syntheticOdds ?? null}
      winOddsMap={winOddsMap}
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

// 全角数字を半角に変換

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

export function classToRank(cls: string): number {
  // 1) 全角→半角変換
  let s = cls.replace(/[Ａ-Ｚ０-９]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  )
  // 2) ローマ数字 → 数字
  s = s.replace(/Ⅰ/g, '1').replace(/Ⅱ/g, '2').replace(/Ⅲ/g, '3')
  // 3) 大文字化 & 空白除去
  s = s.toUpperCase().trim()

  if (s.includes('新馬')) return 0
  if (s.includes('未勝利')) return 1
  if (/^[123]勝/.test(s)) {
    const num = parseInt(s.charAt(0), 10)
    return isNaN(num) ? 1 : num + 1        // 1勝→2, 2勝→3, 3勝→4
  }
  if (s.includes('OP') || s.includes('オープン') || s.includes('L')) return 5
  if (s.startsWith('G3') || s.includes('GⅢ') || s.includes('G3')) return 6
  if (s.startsWith('G2') || s.includes('GⅡ') || s.includes('G2')) return 7
  if (s.startsWith('G1') || s.includes('GⅠ') || s.includes('G1')) return 8
  return -1                                // 不明
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
  /** 単勝オッズ (取得できない場合は null) */
  winOdds?: number | null;
}

export default function Home() {
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
  // --- オッズCSV ---
  const [oddsData, setOddsData] = useState<OddsRow[]>([]);
  const [oddsLoaded, setOddsLoaded] = useState(false);
  // --- 三連単→合成単勝オッズ ---
  const [syntheticMap, setSyntheticMap] =
    useState<Record<string, Record<string, number>>>({});
  const [synFetchedAt, setSynFetchedAt] =
    useState<Record<string, number>>({});
  // --- fetch failure caches (avoid endless 500 loops) ---
  const failedOddsRef = useRef<Set<string>>(new Set());
  const failedTrioRef = useRef<Set<string>>(new Set());
  // raceKey_馬番(半角) -> 単勝オッズ
  const oddsMap = React.useMemo(() => {
    const m = new Map<string, number>();
    oddsData.forEach(o => {
      if (!o.raceKey) return;
      const num = toHalfWidth(String(o.horseNo ?? '').trim());
      m.set(`${o.raceKey}_${num}`, o.win);
    });
    return m;
  }, [oddsData]);
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
  const isOddsUploaded = oddsData.length > 0;

  // 枠順確定CSVを読み込んだ後にオッズAPIを呼び出す
  useEffect(() => {
    if (!isFrameUploaded || oddsLoaded) return;

    /* --- frameNestedData から raceKey 一覧を生成 -------------------- */
    const allKeys: string[] = [];
    Object.entries(frameNestedData).forEach(([dateCode, placeMap]) =>
      Object.entries(placeMap).forEach(([place, raceMap]) =>
        Object.keys(raceMap).forEach(raceNo => {
          const mmdd = dateCode.padStart(4, '0');           // 426 → 0426
          const key  = `2025${mmdd}${getPlaceCode(place)}${raceNo.padStart(2, '0')}`; // YYYYMMDDPPRR
          allKeys.push(key);
        })
      )
    );

    /* --- raceKey ごとに並列 fetch。取れた分だけ state へ追加 ------- */
    const uniqueKeys = [...new Set(allKeys)];
    let remaining    = uniqueKeys.length;

    // ロード開始を明示
    setOddsLoaded(false);

    uniqueKeys.forEach(raceKey => {
      // 既にCSVに存在 or 永続失敗(500) はスキップ
      if (
        oddsData.some(r => r.raceKey === raceKey) ||
        failedOddsRef.current.has(raceKey)
      ) {
        remaining -= 1;        // スキップ分も完了扱いに
        return;
      }
      fetchOdds(raceKey)
        .then(rows => {
          if (rows.length) {
            setOddsData(prev => {
              const next = [...prev, ...rows];
              console.log('[odds✓]', raceKey, 'rows', rows.length, 'total', next.length);
              return next;
            });
          } else {
            console.warn('⚠️ no odds rows for', raceKey);
            failedOddsRef.current.add(raceKey);     // mark permanently failed
          }
        })
        .catch(err => {
          failedOddsRef.current.add(raceKey);       // mark permanently failed
          if (LOG_NETWORK_ERRORS) {
            console.warn('⚠️ fetchOdds failed', raceKey, err);
          }
        })
        .finally(() => {
          remaining -= 1;
          if (remaining === 0) {
            // すべての fetch が終わったタイミングでロード完了
            setOddsLoaded(true);
          }
        });
    });

    /* --- Trio → 合成オッズもバックグラウンド取得 ------------------ */
    uniqueKeys.forEach(raceKey => {
      const prev = synFetchedAt[raceKey] ?? 0;
      const thirtyMin = 30 * 60 * 1000;
      if (failedTrioRef.current.has(raceKey)) return;     // permanent 500 failure
      if (Date.now() - prev < thirtyMin) return;          // 30分以内はスキップ

      fetchTrioOdds(raceKey)
        .then(json => {
          if (!json || !json.o6) {
            failedTrioRef.current.add(raceKey);        // no data → skip next time
            return;
          }
          // calcSyntheticWinOdds() から返るのは
          //   { '01': 3.2, '02': 8.5, … }
          // なのでオブジェクト→マップへそのまま変換する
          const synObj = calcSynthetic(json.o6);        // { '01': 3.2, … }

          // --- 0 や NaN を除外しつつキーそのまま取り込む ----------
          const map: Record<string, number> = {};
          Object.entries(synObj).forEach(([no, odd]) => {
            const value = Number(odd);           // 合成単勝オッズ

            // 無効な値は捨てる
            if (!Number.isFinite(value) || value <= 0.5) return;

            // synObj のキーは既に "01" 形式なのでそのまま使う
            map[no] = value;
          });

          // ★ 空でも必ず raceKey を登録しておく（null 判定を防ぐ）
          setSyntheticMap(prev => ({ ...prev, [raceKey]: map }));
          setSynFetchedAt(prev => ({ ...prev, [raceKey]: Date.now() }));

          if (Object.keys(map).length) {
            console.log('[syn✓]', raceKey, 'pairs', Object.keys(map).length);
          } else {
            console.log('[syn–Ø]', raceKey, 'no valid synthetic odds');
          }
        })
        .catch(err => {
          failedTrioRef.current.add(raceKey);        // mark permanently failed
          if (LOG_NETWORK_ERRORS) {
            console.warn('⚠️ fetchTrioOdds failed', raceKey, err);
          }
        });
    });
  }, [isFrameUploaded, oddsLoaded, frameNestedData, synFetchedAt, oddsData]);
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

  // --- オッズCSV アップロード ---
  const handleOddsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // --- SJIS → UTF‑8 文字列へ変換（PC/スマホ共通） ---
      const text = await readFileAsText(file);

      /** 与えられた列名の候補を大/小文字区別なく探して値を返す */
      const pick = (obj: any, candidates: string[]): any => {
        for (const key of Object.keys(obj)) {
          const lower = key.toLowerCase();
          if (candidates.some(c => c.toLowerCase() === lower)) {
            return obj[key];
          }
        }
        return undefined;
      };

      // ヘッダー有無を問わず解析する
      const parsed = Papa.parse(text, { skipEmptyLines: true });

      // 1行目がヘッダー行の場合は header:true で再パース
      const firstRow = parsed.data[0] as string[];
      const hasHeader =
        Array.isArray(firstRow) &&
        firstRow.some(cell =>
          ['racekey', 'race_key', '馬番', 'horseno', 'win', '単勝'].includes(
            String(cell).toLowerCase(),
          ),
        );

      const results = hasHeader
        ? Papa.parse<Record<string, string | number>>(text, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
          }).data
        : (parsed.data as string[][]).map((row: string[]) => ({
            RaceKey: row[0],
            HorseNo: row[1],
            Win: row[2],
          }));

      const rows: OddsRow[] = results.flatMap((r: any) => {
        const rk  = String(
          pick(r, ['raceKey', 'race_key', 'RACEKEY', 'レースキー']) ?? '',
        ).trim();
        const no  = String(
          pick(r, ['horseNo', 'horse_no', 'HORSENO', '馬番']) ?? '',
        ).trim();
        const win = Number(
          pick(r, ['win', '単勝', 'WIN', 'odds', 'ODDS']) ?? NaN,
        );

        if (!rk || !no || !Number.isFinite(win)) return [];
        return [{ raceKey: rk, horseNo: no, win }];
      });

      if (!rows.length) {
        alert(
          'オッズCSVを解析できませんでした。\n列名(raceKey/horseNo/win) またはフォーマットを確認してください。',
        );
        return;
      }

      setOddsData(rows);
      localStorage.setItem('oddsData', JSON.stringify(rows));

      if (DEBUG) {
        console.log(
          `[ODDS] parsed rows ${rows.length} (example):`,
          rows.slice(0, 5),
        );
      }
    } catch (err) {
      console.error('オッズCSV 解析エラー:', err);
      alert(
        'オッズCSVの読み込みに失敗しました。\nファイルと文字コード(Shift_JIS/UTF-8)を確認してください。',
      );
    }
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

  // 初回マウント時に oddsData を localStorage からロード
  useEffect(() => {
    const saved = localStorage.getItem('oddsData');
    if (saved) {
      try {
        setOddsData(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse stored oddsData:', e);
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
      <Tab.Group>
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
          <div>
            <p>📥 オッズCSV</p>
            {isOddsUploaded ? (
              <p className="text-green-600">✅ アップロード済み</p>
            ) : (
              <input type="file" accept=".csv" onChange={handleOddsUpload} />
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
                                      const raceKey = buildRaceKey(dateCode, place.trim(), raceNo);
                                      const initialOddsMap = buildInitialOddsMap(horses, raceKey, oddsMap);
                                      const syntheticOdds = syntheticMap[raceKey] ?? null;
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
                                            initialOddsMap={initialOddsMap}
                                            labels={labels}
                                            scores={scores}         /* 追加 */
                                            marks={marks}
                                            setMarks={setMarks}
                                            favorites={favorites}
                                            setFavorites={setFavorites}
                                            frameColor={frameColor}
                                            clusterRenderer={(r) => renderClusterInfos(getClusterData(r, allRaces, clusterCache))}
                                            syntheticOdds={syntheticOdds}
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
                  ))}
                </Tab.Panels>
              </Tab.Group>
            </Tab.Panel>

            <Tab.Panel>
              {!Object.keys(frameNestedData).length ? (
                <p className="text-gray-600">枠順確定CSVをアップロードしてください。</p>
              ) : (
                <>
                  {!isOddsUploaded && (
                    <p className="text-red-600 font-semibold">
                      オッズCSVが未アップロードです。オッズ列は空欄表示になります。
                    </p>
                  )}
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
                                        const raceKey = buildRaceKey(dateCode, place.trim(), raceNo);
                                        const initialOddsMap = buildInitialOddsMap(horses, raceKey, oddsMap);
                                        const syntheticOdds = syntheticMap[raceKey] ?? null;
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
                                              initialOddsMap={initialOddsMap}
                                              labels={labels}
                                              scores={scores}         /* 追加 */
                                              marks={marks}
                                              setMarks={setMarks}
                                              favorites={favorites}
                                              setFavorites={setFavorites}
                                              frameColor={frameBgStyle}
                                              clusterRenderer={(r) => renderClusterInfos(getClusterData(r, allRaces, clusterCache))}
                                              syntheticOdds={syntheticOdds}
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
                        clusterRenderer={(r) => renderClusterInfos(getClusterData(r, allRaces, clusterCache))}
                        showLabels={false}
                        raceKey=""
                        winOddsMap={{}}
                        predicted={null}
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