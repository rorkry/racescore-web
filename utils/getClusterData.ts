import type { RecordRow } from '../types/record';

/* ------------------------------------------------------------------ */
/* === ★ 旧ロジック用ユーティリティ (module‑level) ================== */
export function levelToStars(level: string): number {
  if (!level) return 0;
  let ch = level.trim().charAt(0);
  const code = ch.charCodeAt(0);
  if (code >= 0xff21 && code <= 0xff25) {
    ch = String.fromCharCode(code - 0xfee0);
  }
  switch (ch.toUpperCase()) {
    case 'A': return 5;
    case 'B': return 4;
    case 'C': return 3;
    case 'D': return 2;
    case 'E': return 1;
    default:  return 0;
  }
}

export function marginScore(marginSec: number): number {
  const raw = 1.2 - 0.4 * marginSec;
  return Math.max(0, Math.min(1, raw));
}

export type PaceCat = '超ハイ'|'ハイ'|'ミドル'|'スロー'|'超スロー';
export function getPaceCat(surface: '芝'|'ダ', dist: number, pci: number): PaceCat {
  if (surface === 'ダ' && dist <= 1600) {
    if (pci <= 41) return '超ハイ';
    if (pci <= 42) return 'ハイ';
    if (pci >= 49) return '超スロー';
    if (pci >= 48) return 'スロー';
  }
  if (surface === 'ダ' && dist >= 1700) {
    if (pci <= 44) return '超ハイ';
    if (pci <= 45) return 'ハイ';
    if (pci >= 49) return '超スロー';
    if (pci >= 48) return 'スロー';
  }
  if (surface === '芝' && dist >= 1700) {
    if (pci <= 47.5) return '超ハイ';
    if (pci <= 50)  return 'ハイ';
    if (pci >= 57)  return '超スロー';
    if (pci >= 56)  return 'スロー';
  }
  if (surface === '芝' && dist <= 1600) {
    if (pci <= 46) return '超ハイ';
    if (pci <= 47) return 'ハイ';
    if (pci >= 52) return '超スロー';
    if (pci >= 50) return 'スロー';
  }
  return 'ミドル';
}

export const paceFactorMap: Record<PaceCat, number> = {
  '超ハイ': 1.2,
  'ハイ':    1.1,
  'ミドル':  1.0,
  'スロー':  0.9,
  '超スロー':0.8,
};

export const WEIGHTS = {
  star:     0.28,  // ★レベル
  cluster:  0.10,  // クラスタタイム
  passing:  0.28,  // 通過順位 × ペース
  finish:   0.05,  // 着順
  margin:   0.10,  // 着差
  timeDiff: 0.09,  // レース内タイム差
};

export function timeDiffScore(selfSec: number, clusterSecs: number[]): number {
  if (!clusterSecs.length) return 0;
  const best = Math.min(...clusterSecs);
  const diff = selfSec - best;
  const s = 1 - Math.min(Math.abs(diff) / 3, 1);
  return Math.max(0, s);
}
/** 全角→半角変換ユーティリティ（数字・英記号が主） */
export const toHalfWidth = (str: string) =>
  str.replace(/[！-～]/g, s =>
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');

/** 走破タイム文字列 → 秒数 (旧page.tsxと同実装) */
export function toSec(t: string): number {
  const s = toHalfWidth(t.trim());

  // Pattern 1: "m:ss.s" or "mm:ss.s"
  let m = s.match(/^(\d+):(\d{2}\.\d)$/);
  if (m) {
    return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
  }

  // Pattern 2: "m.ss.s" (e.g., "2.10.4")
  m = s.match(/^(\d+)\.(\d{2})\.(\d)$/);
  if (m) {
    return (
      parseInt(m[1], 10) * 60 +
      parseInt(m[2], 10) +
      parseInt(m[3], 10) / 10
    );
  }

  // Pattern 3: pure digits "mmssd" / "msssd" (e.g., "2104" → 2:10.4)
  if (/^\d{4,5}$/.test(s)) {
    const digits = s.split('').map(Number);
    const tenths = digits.pop()!;                // 最後の 1 桁 = 0.1 秒
    const secs   = parseInt(digits.splice(-2).join(''), 10); // 後ろ 2 桁
    const mins   = parseInt(digits.join('') || '0', 10);     // 残り = 分
    return mins * 60 + secs + tenths / 10;
  }

  return NaN; // パターン不一致
}

/** タイム文字列をフォーマット（例: "1.53.8"） */
function formatTime(timeStr: string): string {
  const sec = toSec(timeStr);
  if (isNaN(sec)) return timeStr;
  const mins = Math.floor(sec / 60);
  const secs = (sec % 60).toFixed(1);
  return `${mins}.${secs.padStart(4, '0')}`;
}

// --- 距離表記を正規化: "芝1600", "芝1600m", "ダ 1200" → "芝1600", "ダ1200"
function normalizeDist(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/m/gi, '');
}

/* === ★ 旧ロジックユーティリティ (module‑level) ここまで ============ */

/* ------------------------------------------------------------------ */
/*  汎用キー取得ヘルパー：RecordRow 内で複数キーを試す                  */
/* ------------------------------------------------------------------ */
function GET(row: RecordRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = (row as any)[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v);
    }
  }
  return '';
}

/** 別クラスタタイム 1 件分の情報 */
export type ClusterInfo = {
  dayLabel: '' | '同日' | '前日' | '翌日';
  className: string;
  time: string;            // 例 "1.07.9"
  diff: number;            // 自馬との差（秒）
  highlight: '' | 'red' | 'orange';
};

/**
 * 別クラスタタイム（同日±1 日・同距離・1 着馬）を最大 3 件返す。
 * @param r         自馬の過去レース行
 * @param allRaces  すべての過去レース行
 * @param cacheRef  useRef で渡すキャッシュ
 */
export function getClusterData(
  r: RecordRow,
  allRaces: RecordRow[],
  cacheRef: React.MutableRefObject<Record<string, ClusterInfo[]>>
): ClusterInfo[] {
  const rid = GET(r, 'raceId', 'レースID(新/馬番無)', 'レースID').trim();
  if (cacheRef.current[rid]) return cacheRef.current[rid];

  /**
   * 日付文字列 → Date オブジェクト
   * - 区切りが `. / -` でも OK
   * - `YYYYMMDD`, `YYMMDD` も許容
   */
  const parseDateStr = (raw: string) => {
    if (!raw) return undefined;
    const s = toHalfWidth(raw).trim();                    // 半角化 + 前後空白除去
    const digits = s.replace(/[^\d]/g, '');               // 数字だけ抽出

    let y: number, m: number, d: number;

    if (digits.length === 8) {        // 20250420 → 2025/04/20
      y = +digits.slice(0, 4);
      m = +digits.slice(4, 6);
      d = +digits.slice(6, 8);
    } else if (digits.length === 6) { // 250420 → 2025/04/20 とみなす
      y = 2000 + +digits.slice(0, 2);
      m = +digits.slice(2, 4);
      d = +digits.slice(4, 6);
    } else {
      // `2025.4.20`, `2025/4/20`, etc.
      const parts = s.replace(/[/\-]/g, '.').split('.').map(Number);
      if (parts.length !== 3) return undefined;
      [y, m, d] = parts;
    }

    return y && m && d ? new Date(y, m - 1, d) : undefined;
  };

  // クラス順序定義: 新馬 → 未勝利 → 1勝 → 2勝 → 3勝 → OP → リステッド(L) → G3 → G2 → G1
  const classOrder = [
    /新馬/, /未勝利/, /1勝/, /2勝/, /3勝/, /OP|オープン/, /L|リステッド/, /G3/, /G2/, /G1/,
  ];
  const classToRank = (cls: string) => {
    const idx = classOrder.findIndex(re => re.test(cls));
    return idx !== -1 ? idx : -1;
  };

  const baseDate = parseDateStr(GET(r, 'date', '日付(yyyy.mm.dd)', '日付').trim());
  if (!baseDate) { cacheRef.current[rid] = []; return []; }

  const selfPlace = toHalfWidth(GET(r, 'place', '場所', '場所_1')).replace(/\s+/g, '');
  const selfDist  = normalizeDist(GET(r, 'distance', '距離'));
  const selfTimeSec = toSec(GET(r, 'time', '走破タイム').trim());

  const candidates = allRaces
    .filter(x => {
      // 同じレースIDの勝ち馬タイムを除外
      const cid = GET(x, 'raceId', 'レースID(新/馬番無)', 'レースID').trim();
      return cid !== rid;
    })
    // 1 着馬 (数値 "1" を含めば OK, 全角・スペース・「1着」も許容)
    .filter(x => {
      const fin = toHalfWidth(GET(x, 'finish', '着順').trim()).replace(/[^0-9]/g, '');
      return fin === '1';
    })
    // ±1 日
    .filter(x => {
      const d = parseDateStr(GET(x, 'date', '日付(yyyy.mm.dd)', '日付'));
      return d && Math.abs(+d - +baseDate) <= 86400000;
    })
    // 同場所・同距離
    .filter(x =>
      toHalfWidth(GET(x, 'place', '場所', '場所_1')).replace(/\s+/g, '') === selfPlace &&
      normalizeDist(GET(x, 'distance', '距離')) === selfDist
    )
    // 走破タイムが有効
    .filter(x => !isNaN(toSec(GET(x, 'time', '走破タイム').trim())));

  if (candidates.length === 0) {
    cacheRef.current[rid] = [];
    return [];
  }

  const infos: ClusterInfo[] = candidates.map(c => {
    const otherTime = GET(c, 'time', '走破タイム').trim();
    const diff = selfTimeSec - toSec(otherTime);

    // 日付ラベル
    const d2 = parseDateStr(GET(c, 'date', '日付(yyyy.mm.dd)', '日付'));
    let dayLabel: ClusterInfo['dayLabel'] = '';
    if (d2) {
      const delta = Math.round((+d2 - +baseDate) / 86400000);
      dayLabel = delta === 0 ? '同日' : delta === 1 ? '翌日' : delta === -1 ? '前日' : '';
    }

    // ハイライト判定
    const currRank  = classToRank(GET(r, 'クラス名'));
    const otherClassName = GET(c, 'クラス名').trim();
    const otherRank = classToRank(otherClassName);
    let highlight: ClusterInfo['highlight'] = '';
    if (otherRank > currRank) {
      highlight = diff < 0 ? 'red' : diff <= 1 ? 'orange' : '';
    }

    return {
      dayLabel,
      className: otherClassName,
      time: formatTime(otherTime),
      diff,
      highlight,
    };
  });

  infos.sort((a,b) => b.diff - a.diff);   // 大きい順
  const result = infos.slice(0, 3);
  cacheRef.current[rid] = result;
  return result;
}

/* ------------------------------------------------------------------ */
/*  競うスコア計算（改良版：indicesテーブルの指数を使用）               */
/* ------------------------------------------------------------------ */

/**
 * indicesオブジェクトから指数値を取得するヘルパー
 */
function getIndexValue(race: any, key: string): number {
  // indicesオブジェクトがある場合はそこから取得
  if (race && race.indices && race.indices[key] !== null && race.indices[key] !== undefined) {
    return parseFloat(race.indices[key]) || 0;
  }
  return 0;
}

/**
 * 馬 1 頭の "競うスコア" を返す（最大100点）
 * @param horse 過去走配列と現在出走情報（過去走にはindicesオブジェクトが含まれる）
 * @returns 0〜100 のスコア（高いほど期待）
 */
export function computeKisoScore(horse: { past: RecordRow[]; entry: RecordRow }): number {
  const recent = horse.past.slice(0, 5);  // 直近5走

  // ============================================================
  // 巻き返し指数スコア（50点満点）
  // indicesテーブルのmakikaeshiを使用
  // ============================================================
  const comeback1 = getIndexValue(recent[0], 'makikaeshi');
  const comeback2 = getIndexValue(recent[1], 'makikaeshi');
  const comeback3 = getIndexValue(recent[2], 'makikaeshi');

  const comebackScore = 
    (comeback1 / 10) * 35 +  // 前走: 35点
    (comeback2 / 10) * 10 +  // 2走前: 10点
    (comeback3 / 10) * 5;    // 3走前: 5点

  // ============================================================
  // ポテンシャル指数スコア（15点満点）
  // 直近3走の平均 + ボーナス
  // ============================================================
  const potential1 = getIndexValue(recent[0], 'potential');
  const potential2 = getIndexValue(recent[1], 'potential');
  const potential3 = getIndexValue(recent[2], 'potential');
  
  // 有効なデータのみで平均を計算
  const potentialValues = [potential1, potential2, potential3].filter(v => v > 0);
  const potentialAvg = potentialValues.length > 0 
    ? potentialValues.reduce((a, b) => a + b, 0) / potentialValues.length 
    : 0;
  
  // 基本点（12点満点）
  const potentialBaseScore = (potentialAvg / 10) * 12;
  
  // ボーナス（平均3.0以上から加点、1上がるごとに+0.5、最大3点）
  let potentialBonus = 0;
  if (potentialAvg >= 3.0) {
    potentialBonus = Math.min(3, (potentialAvg - 3.0) * 0.5 + 0.5);
  }
  
  const potentialScore = potentialBaseScore + potentialBonus;

  // ============================================================
  // 着順スコア（10点満点）
  // ============================================================
  const fin1 = parseInt(toHalfWidth(GET(recent[0] || {}, 'finish', '着順').trim()), 10) || 99;
  const finishScore = Math.max(0, 10 - (fin1 - 1) * 1);

  // ============================================================
  // 着差スコア（10点満点）
  // ============================================================
  const margin1 = parseFloat(GET(recent[0] || {}, 'margin', '着差') || '0');
  const marginScoreVal = Math.max(0, 10 - margin1 * 3);

  // ============================================================
  // クラスタタイムスコア（8点満点）
  // ============================================================
  const clusterScore = 4; // 仮実装（後で詳細化可能）

  // ============================================================
  // 通過順位×ペーススコア（7点満点）
  // ============================================================
  const passNums = ['corner2', 'corner3', 'corner4']
    .map(k => {
      const raw = toHalfWidth(GET(recent[0] || {}, k, k).trim());
      const m = raw.match(/^\d+/);
      return m ? parseInt(m[0], 10) : NaN;
    })
    .filter(n => !isNaN(n));
  
  const fieldSize = parseInt(GET(recent[0] || {}, 'fieldSize', '頭数') || '1', 10);
  const avgPass = passNums.length
    ? passNums.reduce((a, b) => a + b, 0) / passNums.length
    : fieldSize;
  
  const basePassScore = Math.max(0, (fieldSize - avgPass + 1) / fieldSize);
  const surf = (GET(recent[0] || {}, 'surface', '距離').trim().charAt(0) as '芝'|'ダ') || '芝';
  const dist = parseInt(GET(recent[0] || {}, 'distance', '距離').replace(/[^\d]/g, '') || '0', 10);
  const pci = parseFloat(GET(recent[0] || {}, 'pci', 'PCI') || '0');
  const paceCat = getPaceCat(surf, dist, pci);
  const passFactor = paceFactorMap[paceCat];
  const passScore = basePassScore * passFactor * 7;

  // ============================================================
  // 合計スコア（最大100点）
  // 巻き返し50点 + ポテンシャル15点 + 着順10点 + 着差10点 + クラスタ8点 + 通過7点
  // ============================================================
  const totalScore = comebackScore + potentialScore + finishScore + marginScoreVal + clusterScore + passScore;
  
  return Math.min(100, Math.max(0, +totalScore.toFixed(1)));
}

/**
 * 競うスコアに基づいて印を自動割り当て
 * @param scores 各馬のスコア配列
 * @returns 印の配列（◎○▲☆△または空文字）
 */
export function assignMarks(scores: number[]): string[] {
  const indexed = scores.map((score, idx) => ({ score, idx }));
  indexed.sort((a, b) => b.score - a.score);  // 降順

  const marks = new Array(scores.length).fill('');
  
  if (indexed[0]) marks[indexed[0].idx] = '◎';  // 1位
  if (indexed[1]) marks[indexed[1].idx] = '○';  // 2位
  if (indexed[2]) marks[indexed[2].idx] = '▲';  // 3位
  if (indexed[3]) marks[indexed[3].idx] = '☆';  // 4位
  if (indexed[4]) marks[indexed[4].idx] = '△';  // 5位

  return marks;
}

/* ------------------------------------------------------------------
 * 共通ヘルパー: rawScores を
 *   ① min‑max 正規化 → ② x² で右肩下がりに圧縮
 *   戻り値は 0–1 の配列（元配列と同じ長さ）
 * ------------------------------------------------------------------ */
export function scaleAndShapeScores(rawScores: number[]): number[] {
  if (rawScores.length === 0) return [];
  const max = Math.max(...rawScores);
  const min = Math.min(...rawScores);
  const norm = rawScores.map(s =>
    max === min ? 0.5 : (s - min) / (max - min)
  );
  // soften tail: use x^1.8 instead of x^2
  return norm.map(x => Math.pow(x, 1.8));
}

/* ------------------------------------------------------------------ */
/*  地方競馬評価ロジック                                              */
/* ------------------------------------------------------------------ */

/**
 * 地方競馬場のレベル分類
 * - 高レベル: 1.0倍
 * - 中レベル: 0.85倍
 * - 低レベル: 0.7倍
 */
const LOCAL_TRACK_LEVELS: Record<string, number> = {
  // 高レベル
  '大井': 1.0,
  '船橋': 1.0,
  '園田': 1.0,
  
  // 中レベル
  '川崎': 0.85,
  '高知': 0.85,
  
  // 低レベル
  '佐賀': 0.7,
  '名古屋': 0.7,
  '浦和': 0.7,
  '笠松': 0.7,
  '水沢': 0.7,
  '門別': 0.7,
  '盛岡': 0.7,
  '姫路': 0.7,
  '福山': 0.7,
  '帯広': 0.7,
  '金沠': 0.7,
};

/**
 * 基準時計（1勝クラス、ダート）
 * 単位: 秒
 */
const BASE_TIMES: Record<number, number> = {
  1200: 72.0,   // 1:12.0
  1400: 86.0,   // 1:26.0
  1600: 101.0,  // 1:41.0
  1800: 115.0,  // 1:55.0
};

/**
 * 園田の特別基準時計
 */
const SONODA_BASE_TIMES: Record<number, number> = {
  1400: 90.0,   // 1:30.0
};

/**
 * クラスごとの時計補正（秒）
 * 1勝クラスを基準として、クラスが上がるごとに-0.5秒
 */
const CLASS_TIME_ADJUSTMENT: Record<string, number> = {
  '新馬': 0.5,
  '未勝利': 0.0,
  '1勝': 0.0,
  '2勝': -0.5,
  '3勝': -1.0,
  'OP': -1.5,
  'オープン': -1.5,
  'G3': -2.0,
  'G2': -2.5,
  'G1': -3.0,
};

/**
 * 転入クラスによる補正倍率
 */
const TRANSFER_CLASS_MULTIPLIER: Record<string, number> = {
  '新馬': 1.0,
  '未勝利': 1.0,
  '1勝': 1.0,
  '2勝': 0.85,
  '3勝': 0.7,
  'OP': 0.6,
  'オープン': 0.6,
  'G3': 0.5,
  'G2': 0.4,
  'G1': 0.3,
};

/**
 * 地方競馬場かどうかを判定
 */
function isLocalTrack(place: string): boolean {
  return place in LOCAL_TRACK_LEVELS;
}

/**
 * 地方競馬の1走分のスコアを計算
 * @param race 過去走1件
 * @param targetClass 今回転入するクラス（中央競馬）
 * @returns 0〜100のスコア
 */
function computeLocalRaceScore(race: RecordRow, targetClass: string): number {
  const place = toHalfWidth(GET(race, 'place', '場所', '場所_1')).replace(/\s+/g, '');
  const className = GET(race, 'クラス名').trim();
  const distStr = GET(race, 'distance', '距離').replace(/[^\d]/g, '');
  const distance = parseInt(distStr, 10);
  const timeStr = GET(race, 'time', '走破タイム').trim();
  const timeSec = toSec(timeStr);
  const finish = parseInt(toHalfWidth(GET(race, 'finish', '着順').trim()).replace(/[^0-9]/g, ''), 10) || 99;
  const margin = parseFloat(GET(race, 'margin', '着差') || '0');
  
  // 競馬場レベル倍率
  const trackLevel = LOCAL_TRACK_LEVELS[place] || 0.7;
  
  // 基準時計を取得（園田の1400mは特別扱い）
  let baseTime = BASE_TIMES[distance] || 0;
  if (place === '園田' && distance === 1400) {
    baseTime = SONODA_BASE_TIMES[1400];
  }
  
  // 距離が基準にない場合は線形補間
  if (baseTime === 0) {
    const distances = Object.keys(BASE_TIMES).map(Number).sort((a, b) => a - b);
    for (let i = 0; i < distances.length - 1; i++) {
      if (distance > distances[i] && distance < distances[i + 1]) {
        const d1 = distances[i];
        const d2 = distances[i + 1];
        const t1 = BASE_TIMES[d1];
        const t2 = BASE_TIMES[d2];
        baseTime = t1 + (t2 - t1) * (distance - d1) / (d2 - d1);
        break;
      }
    }
  }
  
  // クラス補正
  const classAdj = CLASS_TIME_ADJUSTMENT[className] || 0;
  const adjustedBaseTime = baseTime + classAdj;
  
  // 時計評価（基準時計との差）
  let timeScore = 0;
  if (timeSec > 0 && adjustedBaseTime > 0) {
    const diff = timeSec - adjustedBaseTime;
    // 基準より速い: +点、遅い: -点
    // 1秒差で±10点
    timeScore = Math.max(0, 40 - diff * 10);
  }
  
  // 着順評価（30点満点）
  const finishScore = Math.max(0, 30 - (finish - 1) * 3);
  
  // 着差評価（20点満点）
  // 勝ち馬（着差0）: 20点
  // 着差が大きいほど減点（1秒で-5点）
  const marginScore = Math.max(0, 20 - Math.abs(margin) * 5);
  
  // 転入クラス補正
  const transferMult = TRANSFER_CLASS_MULTIPLIER[targetClass] || 1.0;
  
  // 合計スコア
  const rawScore = (timeScore + finishScore + marginScore) * trackLevel * transferMult;
  
  return Math.min(100, Math.max(0, +rawScore.toFixed(1)));
}

/**
 * 地方競馬を含む競うスコア計算（改良版：indicesテーブルの指数を使用）
 * @returns { score: number, hasData: boolean } - score: 0〜100のスコア、hasData: 前走データの有無
 */
export function computeKisoScoreWithLocalEx(horse: { past: RecordRow[]; entry: RecordRow }): { score: number; hasData: boolean } {
  const recent = horse.past.slice(0, 5);  // 直近5走
  const targetClass = GET(horse.entry, 'クラス名', 'classname').trim();
  
  // 前走データがない場合
  if (!recent[0]) {
    return { score: -1, hasData: false };
  }
  
  let totalScore = 0;
  
  // ============================================================
  // 巻き返し指数スコア（50点満点）
  // indicesテーブルのmakikaeshiを使用、地方競馬は別ロジック
  // ============================================================
  const weights = [35, 10, 5];  // 前走、2走前、3走前の重み
  
  for (let i = 0; i < 3; i++) {
    const race = recent[i];
    if (!race) continue;
    
    const place = toHalfWidth(GET(race, 'place', '場所', '場所_1')).replace(/\s+/g, '');
    
    if (isLocalTrack(place)) {
      // 地方競馬の場合
      const localScore = computeLocalRaceScore(race, targetClass);
      totalScore += (localScore / 100) * weights[i];
    } else {
      // 中央競馬の場合（indicesテーブルのmakikaeshiを使用）
      const comeback = getIndexValue(race, 'makikaeshi');
      totalScore += (comeback / 10) * weights[i];
    }
  }
  
  // ============================================================
  // ポテンシャル指数スコア（15点満点）
  // 直近3走の平均 + ボーナス
  // ============================================================
  const potential1 = getIndexValue(recent[0], 'potential');
  const potential2 = getIndexValue(recent[1], 'potential');
  const potential3 = getIndexValue(recent[2], 'potential');
  
  const potentialValues = [potential1, potential2, potential3].filter(v => v > 0);
  const potentialAvg = potentialValues.length > 0 
    ? potentialValues.reduce((a, b) => a + b, 0) / potentialValues.length 
    : 0;
  
  const potentialBaseScore = (potentialAvg / 10) * 12;
  let potentialBonus = 0;
  if (potentialAvg >= 3.0) {
    potentialBonus = Math.min(3, (potentialAvg - 3.0) * 0.5 + 0.5);
  }
  totalScore += potentialBaseScore + potentialBonus;
  
  // ============================================================
  // 前走の着順・着差・通過順位などの追加評価（中央・地方共通）
  // ============================================================
  const race1 = recent[0];
  if (race1) {
    // 着順スコア（10点満点）
    const fin1 = parseInt(toHalfWidth(GET(race1, 'finish', '着順').trim()), 10) || 99;
    const finishScore = Math.max(0, 10 - (fin1 - 1) * 1);
    totalScore += finishScore;
    
    // 着差スコア（10点満点）
    const margin1 = parseFloat(GET(race1, 'margin', '着差') || '0');
    const marginScoreVal = Math.max(0, 10 - margin1 * 3);
    totalScore += marginScoreVal;
    
    // クラスタタイムスコア（8点満点）
    const clusterScore = 4; // 仮実装
    totalScore += clusterScore;
    
    // 通過順位×ペーススコア（7点満点）
    const passNums = ['corner2', 'corner3', 'corner4']
      .map(k => {
        const raw = toHalfWidth(GET(race1, k, k).trim());
        const m = raw.match(/^\d+/);
        return m ? parseInt(m[0], 10) : NaN;
      })
      .filter(n => !isNaN(n));
    
    const fieldSize = parseInt(GET(race1, 'fieldSize', '頭数') || '1', 10);
    const avgPass = passNums.length
      ? passNums.reduce((a, b) => a + b, 0) / passNums.length
      : fieldSize;
    
    const basePassScore = Math.max(0, (fieldSize - avgPass + 1) / fieldSize);
    const surf = (GET(race1, 'surface', '距離').trim().charAt(0) as '芝'|'ダ') || '芝';
    const dist = parseInt(GET(race1, 'distance', '距離').replace(/[^\d]/g, '') || '0', 10);
    const pci = parseFloat(GET(race1, 'pci', 'PCI') || '0');
    const paceCat = getPaceCat(surf, dist, pci);
    const passFactor = paceFactorMap[paceCat];
    const passScore = basePassScore * passFactor * 7;
    totalScore += passScore;
  }
  
  return { score: Math.min(100, Math.max(0, +totalScore.toFixed(1))), hasData: true };
}

/**
 * 地方競馬を含む競うスコア計算（互換性版）
 * @returns number - 0〜100のスコア（データなしの場合は-1）
 */
export function computeKisoScoreWithLocal(horse: { past: RecordRow[]; entry: RecordRow }): number {
  const result = computeKisoScoreWithLocalEx(horse);
  return result.score;
}

