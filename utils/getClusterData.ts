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
 * 着順が有効かどうかをチェック（競走除外、失格、中止などは無効）
 */
function isValidFinish(finishStr: string): boolean {
  if (!finishStr) return false;
  const normalized = toHalfWidth(finishStr.trim());
  // 止、除、外、取、中、失、降、競、落、再 などの異常終了は無効
  if (/[止除外取中失降競落再]/.test(normalized)) return false;
  // 数字がない場合は無効
  const num = parseInt(normalized.replace(/[^0-9]/g, ''), 10);
  return !isNaN(num) && num > 0 && num < 30;  // 30着以上も異常値として扱う
}

/**
 * 有効な過去走のみをフィルタリング（競走除外等を除く）
 */
function filterValidRaces(races: RecordRow[]): RecordRow[] {
  return races.filter(race => {
    const finish = GET(race, 'finish', '着順').trim();
    return isValidFinish(finish);
  });
}

/**
 * 競うスコアの詳細情報（デバッグ用）
 */
export interface KisoScoreBreakdown {
  total: number;
  comeback: number;           // 巻き返し指数（35点満点）
  potential: number;           // ポテンシャル指数（15点満点）
  finish: number;              // 着順（8点満点）
  margin: number;              // 着差（8点満点）
  cluster: number;             // クラスタタイム（6点満点）
  passing: number;             // 通過順位×ペース（6点満点）
  positionImprovement: number; // 位置取り改善（8点満点）
  paceSync: number;            // 展開連動（6点満点）
  courseFit: number;           // コース適性（4点満点）
  penalty: number;             // 減点（下級条件連続2着など）
  details: {
    comebackValues: { race1: number; race2: number; race3: number };
    potentialValues: { race1: number; race2: number; race3: number; avg: number; max: number; combined: number };
    lastPosition: number;
    avgPastPosition: number;
    forwardRate: number | null;
    isTurfStartDirt: boolean;
    firstCornerDistance: number;
  };
}

/**
 * 馬 1 頭の "競うスコア" を返す（最大100点）
 * 
 * 【新ロジック追加】
 * - 位置取り改善: 後方競馬から前方への変化を評価
 * - 下級条件連続2着: マイナス評価
 * - コース適性: 芝スタートダート、初角距離
 * - 展開連動: allHorsesが渡された場合のみ計算
 * 
 * @param horse 過去走配列と現在出走情報（過去走にはindicesオブジェクトが含まれる）
 * @param allHorses 全出走馬のデータ（展開連動スコア計算用、オプション）
 * @param debug デバッグモード（trueの場合、詳細情報を返す）
 * @returns 0〜100 のスコア（高いほど期待）、または詳細情報（debug=trueの場合）
 */
export function computeKisoScore(
  horse: { past: RecordRow[]; entry: RecordRow }, 
  allHorses?: { past: RecordRow[]; entry: RecordRow }[],
  debug: boolean = false
): number | KisoScoreBreakdown {
  // 有効なレースのみをフィルタリング（競走除外、失格、中止等を除く）
  const validPastRaces = filterValidRaces(horse.past);
  const recent = validPastRaces.slice(0, 5);  // 直近5走（有効なもののみ）
  
  // 有効な過去走がない場合は0を返す
  if (recent.length === 0) {
    return debug ? {
      total: 0,
      comeback: 0,
      potential: 0,
      finish: 0,
      margin: 0,
      cluster: 0,
      passing: 0,
      positionImprovement: 0,
      paceSync: 0,
      courseFit: 0,
      penalty: 0,
      details: {
        comebackValues: { race1: 0, race2: 0, race3: 0 },
        potentialValues: { race1: 0, race2: 0, race3: 0, avg: 0, max: 0, combined: 0 },
        lastPosition: 99,
        avgPastPosition: 99,
        forwardRate: null,
        isTurfStartDirt: false,
        firstCornerDistance: 999,
      },
    } : 0;
  }

  let totalScore = 0;
  
  // デバッグ用: 各要素のスコアを個別に記録
  let comebackScore = 0;
  let potentialScore = 0;
  let finishScore = 0;
  let marginScoreVal = 0;
  let clusterScore = 0;
  let passScore = 0;
  let positionImprovementScore = 0;
  let paceSyncScore = 0;
  let courseFitScore = 0;
  let penaltyScore = 0;

  // ============================================================
  // 巻き返し指数スコア（35点満点）
  // indicesテーブルのmakikaeshiを使用
  // ============================================================
  const comeback1 = getIndexValue(recent[0], 'makikaeshi');
  const comeback2 = getIndexValue(recent[1], 'makikaeshi');
  const comeback3 = getIndexValue(recent[2], 'makikaeshi');

  comebackScore = 
    (comeback1 / 10) * 25 +  // 前走: 25点
    (comeback2 / 10) * 6 +   // 2走前: 6点
    (comeback3 / 10) * 4;    // 3走前: 4点
  totalScore += comebackScore;

  // ============================================================
  // ポテンシャル指数スコア（15点満点）
  // 直近3走の平均(80%) + 最高値(20%)で爆発力も加味
  // ============================================================
  const potential1 = getIndexValue(recent[0], 'potential');
  const potential2 = getIndexValue(recent[1], 'potential');
  const potential3 = getIndexValue(recent[2], 'potential');
  
  const potentialValues = [potential1, potential2, potential3].filter(v => v > 0);
  const potentialAvg = potentialValues.length > 0 
    ? potentialValues.reduce((a, b) => a + b, 0) / potentialValues.length 
    : 0;
  const potentialMax = potentialValues.length > 0 
    ? Math.max(...potentialValues)
    : 0;
  
  const potentialCombined = potentialAvg * 0.8 + potentialMax * 0.2;
  const potentialBaseScore = (potentialCombined / 10) * 12;
  let potentialBonus = 0;
  if (potentialCombined >= 3.0) {
    potentialBonus = Math.min(3, (potentialCombined - 3.0) * 0.5 + 0.5);
  }
  potentialScore = potentialBaseScore + potentialBonus;
  totalScore += potentialScore;

  // ============================================================
  // 着順スコア（8点満点）
  // ============================================================
  const fin1 = parseInt(toHalfWidth(GET(recent[0] || {}, 'finish', '着順').trim()), 10) || 99;
  finishScore = Math.max(0, 8 - (fin1 - 1) * 0.8);
  totalScore += finishScore;

  // ============================================================
  // 着差スコア（8点満点）
  // ============================================================
  const margin1 = parseFloat(GET(recent[0] || {}, 'margin', '着差') || '0');
  marginScoreVal = Math.max(0, 8 - margin1 * 2.5);
  totalScore += marginScoreVal;

  // ============================================================
  // クラスタタイムスコア（6点満点）
  // ============================================================
  clusterScore = 3; // 仮実装
  totalScore += clusterScore;

  // ============================================================
  // 通過順位×ペーススコア（6点満点）
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
  passScore = basePassScore * passFactor * 6;
  totalScore += passScore;

  // ============================================================
  // 【新規】位置取り改善スコア（8点満点）
  // 後方競馬から前方へ位置取りが改善した場合に加点
  // ============================================================
  // デバッグ用: 位置取り情報を保存
  const lastPosition = recent.length > 0 ? getPassingPosition(recent[0]) : 99;
  const avgPastPosition = recent.length >= 2 ? getAveragePassingPosition(recent, true) : 99;
  
  if (recent.length >= 2) {
    const fieldSz = parseInt(GET(recent[0], 'fieldSize', '頭数') || '16', 10);
    
    const wasBackRunner = avgPastPosition > fieldSz * 0.5;
    const movedForward = lastPosition <= 5;
    const positionImprovement = avgPastPosition - lastPosition;
    
    if (wasBackRunner && movedForward && positionImprovement >= 3) {
      // 大幅改善: 最大8点（改善幅×1.2、最大8点）
      positionImprovementScore = Math.min(8, positionImprovement * 1.2);
      totalScore += positionImprovementScore;
    } else if (wasBackRunner && positionImprovement >= 2) {
      // 小幅改善: 3点
      positionImprovementScore = 3;
      totalScore += positionImprovementScore;
    } else if (wasBackRunner && positionImprovement >= 1) {
      // 微改善: 1点
      positionImprovementScore = 1;
      totalScore += positionImprovementScore;
    }
  }

  // ============================================================
  // 【新規】展開連動スコア（6点満点）
  // メンバー全体の脚質分布から展開を判断
  // ============================================================
  // デバッグ用: 展開連動情報を保存
  let forwardRate: number | null = null;
  if (allHorses && allHorses.length > 0) {
    let forwardRunnerCount = 0;
    for (const h of allHorses) {
      const hRecent = filterValidRaces(h.past).slice(0, 1);
      if (hRecent.length > 0) {
        const pos = getPassingPosition(hRecent[0]);
        if (pos <= 3) forwardRunnerCount++;
      }
    }
    
    forwardRate = forwardRunnerCount / allHorses.length;
    const myLastPosition = recent.length > 0 ? getPassingPosition(recent[0]) : 99;
    const iAmForwardRunner = myLastPosition <= 3;
    const iAmCloser = myLastPosition > 5;
    
    // 前方馬が少ない（30%未満）→ 前方馬に大幅加点
    if (forwardRate < 0.30 && iAmForwardRunner) {
      paceSyncScore = 6;
      totalScore += paceSyncScore;
    }
    // 前方馬が多い（60%以上）→ 差し馬に大幅加点
    else if (forwardRate >= 0.60 && iAmCloser) {
      paceSyncScore = 6;
      totalScore += paceSyncScore;
    }
    // 前方馬がやや少ない（30-40%）→ 前方馬に中程度加点
    else if (forwardRate < 0.40 && iAmForwardRunner) {
      paceSyncScore = 3;
      totalScore += paceSyncScore;
    }
    // 前方馬がやや多い（50-60%）→ 差し馬に中程度加点
    else if (forwardRate >= 0.50 && iAmCloser) {
      paceSyncScore = 3;
      totalScore += paceSyncScore;
    }
    // 中間的な場合でも小幅加点
    else if (forwardRate < 0.45 && iAmForwardRunner) {
      paceSyncScore = 1;
      totalScore += paceSyncScore;
    }
    else if (forwardRate >= 0.55 && iAmCloser) {
      paceSyncScore = 1;
      totalScore += paceSyncScore;
    }
  }

  // ============================================================
  // 【新規】コース適性スコア（4点満点）
  // ============================================================
  const entryPlace = toHalfWidth(GET(horse.entry, 'place', '場所', '場所_1')).replace(/\s+/g, '');
  const entrySurface = GET(horse.entry, 'surface', 'トラック種別', 'track_type').trim().charAt(0) as '芝'|'ダ';
  const entryDistance = parseInt(GET(horse.entry, 'distance', '距離').replace(/[^\d]/g, '') || '0', 10);
  const entryWaku = parseInt(GET(horse.entry, 'waku', '枠番') || '0', 10);
  
  // デバッグ用: コース情報を保存
  const isTurfStartDirt = isTurfStartDirtCourse(entryPlace, entrySurface, entryDistance);
  const firstCornerDist = getFirstCornerDistance(entryPlace, entrySurface, entryDistance);
  
  // 芝スタートダートで後方馬が位置取り改善できる可能性
  if (isTurfStartDirt) {
    const avgPastPos = getAveragePassingPosition(recent, false);
    const fieldSz = parseInt(GET(horse.entry, 'tosu', '頭数', 'fieldSize', 'field_size') || '16', 10);
    if (avgPastPos > fieldSz * 0.5) {
      // 普段後方の馬は前に行ける可能性 → 3点
      courseFitScore += 3;
      totalScore += 3;
    } else if (avgPastPos > fieldSz * 0.3) {
      // 中団の馬もやや有利 → 1.5点
      courseFitScore += 1.5;
      totalScore += 1.5;
    }
  }
  
  // 初角距離が短いコースで内枠有利
  if (firstCornerDist < 280 && entryWaku <= 3) {
    // 内枠（1-3枠）ボーナス → 1点
    courseFitScore += 1;
    totalScore += 1;
  } else if (firstCornerDist < 300 && entryWaku <= 2) {
    // 最内枠（1-2枠）ボーナス → 0.5点
    courseFitScore += 0.5;
    totalScore += 0.5;
  }

  // ============================================================
  // 【新規】下級条件連続2着（-4点減点）
  // ============================================================
  if (recent.length >= 2) {
    const finPos1 = parseInt(toHalfWidth(GET(recent[0], 'finish', '着順').trim()), 10);
    const finPos2 = parseInt(toHalfWidth(GET(recent[1], 'finish', '着順').trim()), 10);
    const class1 = GET(recent[0], 'クラス名', 'class_name').trim();
    const class2 = GET(recent[1], 'クラス名', 'class_name').trim();
    
    if (finPos1 === 2 && finPos2 === 2 && isLowerClass(class1) && isLowerClass(class2)) {
      penaltyScore = -4;
      totalScore -= 4;
    }
  }

  const finalScore = Math.min(100, Math.max(0, +totalScore.toFixed(1)));
  
  // デバッグモードの場合は詳細情報を返す
  if (debug) {
    return {
      total: finalScore,
      comeback: +comebackScore.toFixed(2),
      potential: +(potentialScore).toFixed(2),
      finish: +finishScore.toFixed(2),
      margin: +marginScoreVal.toFixed(2),
      cluster: +clusterScore.toFixed(2),
      passing: +passScore.toFixed(2),
      positionImprovement: +positionImprovementScore.toFixed(2),
      paceSync: +paceSyncScore.toFixed(2),
      courseFit: +courseFitScore.toFixed(2),
      penalty: +penaltyScore.toFixed(2),
      details: {
        comebackValues: { race1: comeback1, race2: comeback2, race3: comeback3 },
        potentialValues: { 
          race1: potential1, 
          race2: potential2, 
          race3: potential3, 
          avg: +potentialAvg.toFixed(2), 
          max: potentialMax, 
          combined: +potentialCombined.toFixed(2) 
        },
        lastPosition,
        avgPastPosition: avgPastPosition === 99 ? 99 : +avgPastPosition.toFixed(2),
        forwardRate: forwardRate === null ? null : +(forwardRate * 100).toFixed(1),
        isTurfStartDirt,
        firstCornerDistance: firstCornerDist,
      },
    };
  }
  
  return finalScore;
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

/* ------------------------------------------------------------------ */
/*  新ロジック用ヘルパー関数                                           */
/* ------------------------------------------------------------------ */

/**
 * 通過順位を取得（コーナー2または4から）
 * 
 * マッピング済みキー: corner4, corner2（mapUmadataToRecordRowで設定）
 * フォールバック: corner_4, corner_4_position, corner_2（念のため）
 */
function getPassingPosition(race: RecordRow): number {
  // マッピング済みのキーを優先（mapUmadataToRecordRowで設定済み）
  const corner2 = toHalfWidth(GET(race, 'corner2', 'corner_2')).trim();
  const corner4 = toHalfWidth(GET(race, 'corner4', 'corner_4', 'corner_4_position')).trim();
  
  const c2 = parseInt(corner2.replace(/[^0-9]/g, ''), 10);
  const c4 = parseInt(corner4.replace(/[^0-9]/g, ''), 10);
  
  // 有効な方を返す（両方あればcorner4優先）
  if (!isNaN(c4) && c4 > 0) return c4;
  if (!isNaN(c2) && c2 > 0) return c2;
  return 99;  // データなし
}

/**
 * 過去走の平均通過順位を計算（直近N走、前走を除く）
 */
function getAveragePassingPosition(races: RecordRow[], excludeFirst: boolean = true): number {
  const targetRaces = excludeFirst ? races.slice(1) : races;
  const positions = targetRaces
    .map(r => getPassingPosition(r))
    .filter(p => p > 0 && p < 99);
  
  if (positions.length === 0) return 99;
  return positions.reduce((a, b) => a + b, 0) / positions.length;
}

/**
 * 下級条件かどうかを判定
 */
function isLowerClass(className: string): boolean {
  if (!className) return false;
  const normalized = toHalfWidth(className).toLowerCase();
  return /新馬|未勝利|1勝/.test(normalized);
}

/**
 * 芝スタートダートコースかどうかを判定
 */
const TURF_START_DIRT_COURSES: Record<string, number[]> = {
  '東京': [1300, 1400, 1600, 2100],
  '中山': [1200],
  '阪神': [1200, 1400],
  '京都': [1200, 1400],
  '中京': [1200, 1400],
  '新潟': [1200],
  '福島': [1150],
  '小倉': [1000],
  '札幌': [1000],
  '函館': [1000],
};

function isTurfStartDirtCourse(place: string, surface: string, distance: number): boolean {
  if (surface !== 'ダ' && surface !== 'ダート') return false;
  const distances = TURF_START_DIRT_COURSES[place];
  if (!distances) return false;
  return distances.includes(distance);
}

/**
 * 初角までの距離（短いコースは内枠有利）
 */
const FIRST_CORNER_DISTANCE: Record<string, Record<string, number>> = {
  '中山': { '芝1200': 200, '芝1600': 240, '芝1800': 306, 'ダ1200': 290, 'ダ1800': 340 },
  '東京': { '芝1400': 350, '芝1600': 542, '芝1800': 342, 'ダ1400': 440, 'ダ1600': 640 },
  '阪神': { '芝1200': 200, '芝1400': 304, '芝1600': 442, 'ダ1200': 264, 'ダ1400': 352 },
  '京都': { '芝1200': 220, '芝1400': 350, '芝1600': 450, 'ダ1200': 280, 'ダ1400': 400, 'ダ1800': 286 },
  '中京': { '芝1200': 280, '芝1400': 380, 'ダ1200': 310, 'ダ1400': 410 },
  '新潟': { '芝1000': 100, '芝1200': 200, '芝1400': 300, 'ダ1200': 250 },
  '福島': { '芝1200': 260, '芝1800': 460, 'ダ1150': 230, 'ダ1700': 290 },
  '小倉': { '芝1200': 200, '芝1800': 310, 'ダ1000': 150, 'ダ1700': 300 },
  '札幌': { '芝1200': 290, '芝1800': 390, 'ダ1000': 180, 'ダ1700': 380 },
  '函館': { '芝1200': 250, '芝1800': 350, 'ダ1000': 180, 'ダ1700': 360 },
};

function getFirstCornerDistance(place: string, surface: string, distance: number): number {
  const key = `${surface}${distance}`;
  return FIRST_CORNER_DISTANCE[place]?.[key] || 999;
}

/**
 * 地方競馬を含む競うスコア計算（改良版：indicesテーブルの指数を使用）
 * 
 * 配点（合計100点）:
 * - 巻き返し指数: 35点
 * - ポテンシャル指数: 15点
 * - 着順: 8点
 * - 着差: 8点
 * - クラスタタイム: 6点
 * - 通過順位×ペース: 6点
 * - 位置取り改善: 8点（新規）
 * - 展開連動: 6点（新規）
 * - コース適性: 4点（新規）
 * - 下級条件連続2着: -4点（減点、新規）
 * 
 * @returns { score: number, hasData: boolean } - score: 0〜100のスコア、hasData: 前走データの有無
 */
export function computeKisoScoreWithLocalEx(horse: { past: RecordRow[]; entry: RecordRow }, allHorses?: { past: RecordRow[]; entry: RecordRow }[]): { score: number; hasData: boolean } {
  // 有効なレースのみをフィルタリング（競走除外、失格、中止等を除く）
  const validPastRaces = filterValidRaces(horse.past);
  const recent = validPastRaces.slice(0, 5);  // 直近5走（有効なもののみ）
  const targetClass = GET(horse.entry, 'クラス名', 'classname').trim();
  
  // 有効な過去走データがない場合
  if (recent.length === 0) {
    return { score: -1, hasData: false };
  }
  
  let totalScore = 0;
  
  // ============================================================
  // 巻き返し指数スコア（35点満点）
  // indicesテーブルのmakikaeshiを使用、地方競馬は別ロジック
  // ============================================================
  const comebackWeights = [25, 6, 4];  // 前走、2走前、3走前の重み
  
  for (let i = 0; i < 3; i++) {
    const race = recent[i];
    if (!race) continue;
    
    const place = toHalfWidth(GET(race, 'place', '場所', '場所_1')).replace(/\s+/g, '');
    
    if (isLocalTrack(place)) {
      // 地方競馬の場合
      const localScore = computeLocalRaceScore(race, targetClass);
      totalScore += (localScore / 100) * comebackWeights[i];
    } else {
      // 中央競馬の場合（indicesテーブルのmakikaeshiを使用）
      const comeback = getIndexValue(race, 'makikaeshi');
      totalScore += (comeback / 10) * comebackWeights[i];
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
    // 着順スコア（8点満点）
    const fin1 = parseInt(toHalfWidth(GET(race1, 'finish', '着順').trim()), 10) || 99;
    const finishScore = Math.max(0, 8 - (fin1 - 1) * 0.8);
    totalScore += finishScore;
    
    // 着差スコア（8点満点）
    const margin1 = parseFloat(GET(race1, 'margin', '着差') || '0');
    const marginScoreVal = Math.max(0, 8 - margin1 * 2.5);
    totalScore += marginScoreVal;
    
    // クラスタタイムスコア（6点満点）
    const clusterScore = 3; // 仮実装
    totalScore += clusterScore;
    
    // 通過順位×ペーススコア（6点満点）
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
    const passScore = basePassScore * passFactor * 6;
    totalScore += passScore;
  }
  
  // ============================================================
  // 【新規】位置取り改善スコア（8点満点）
  // 過去走で後方競馬が続いていた馬が、前走で前方に位置取りできた場合に加点
  // ============================================================
  if (recent.length >= 2) {
    const lastPosition = getPassingPosition(recent[0]);
    const avgPastPosition = getAveragePassingPosition(recent, true);  // 前走を除く過去走の平均
    const fieldSize = parseInt(GET(recent[0], 'fieldSize', '頭数') || '16', 10);
    
    // 過去走で後方競馬（頭数の半分より後ろ）が続いていた場合
    const wasBackRunner = avgPastPosition > fieldSize * 0.5;
    
    // 前走で前方（5番手以内）に位置取りできた
    const movedForward = lastPosition <= 5;
    
    // 位置の改善幅（大きいほど評価）
    const positionImprovement = avgPastPosition - lastPosition;
    
    if (wasBackRunner && movedForward && positionImprovement >= 3) {
      // 後方→前方への大幅な位置取り改善は高評価（最大8点）
      const improvementScore = Math.min(8, positionImprovement * 1.2);
      totalScore += improvementScore;
    } else if (wasBackRunner && positionImprovement >= 2) {
      // 後方競馬からの改善（小幅）
      totalScore += 3;
    } else if (wasBackRunner && positionImprovement >= 1) {
      // 微改善
      totalScore += 1;
    }
  }
  
  // ============================================================
  // 【新規】展開連動スコア（6点満点）
  // メンバー内の脚質分布から展開を判断し、有利な脚質に加点
  // ============================================================
  if (allHorses && allHorses.length > 0) {
    // メンバー全体で「前走3番手以内」の馬をカウント
    let forwardRunnerCount = 0;
    for (const h of allHorses) {
      const hRecent = filterValidRaces(h.past).slice(0, 1);
      if (hRecent.length > 0) {
        const pos = getPassingPosition(hRecent[0]);
        if (pos <= 3) forwardRunnerCount++;
      }
    }
    
    const forwardRate = forwardRunnerCount / allHorses.length;
    const myLastPosition = recent.length > 0 ? getPassingPosition(recent[0]) : 99;
    const iAmForwardRunner = myLastPosition <= 3;
    const iAmCloser = myLastPosition > 5;
    
    // 前方馬が少ない（30%未満）→ 前方馬に大幅加点
    if (forwardRate < 0.30 && iAmForwardRunner) {
      totalScore += 6;
    }
    // 前方馬が多い（60%以上）→ 差し馬に大幅加点
    else if (forwardRate >= 0.60 && iAmCloser) {
      totalScore += 6;
    }
    // 前方馬がやや少ない（30-40%）→ 前方馬に中程度加点
    else if (forwardRate < 0.40 && iAmForwardRunner) {
      totalScore += 3;
    }
    // 前方馬がやや多い（50-60%）→ 差し馬に中程度加点
    else if (forwardRate >= 0.50 && iAmCloser) {
      totalScore += 3;
    }
    // 中間的な場合でも小幅加点
    else if (forwardRate < 0.45 && iAmForwardRunner) {
      totalScore += 1;
    }
    else if (forwardRate >= 0.55 && iAmCloser) {
      totalScore += 1;
    }
  }
  
  // ============================================================
  // 【新規】コース適性スコア（4点満点）
  // 芝スタートダート・初角距離による枠有利を加味
  // ============================================================
  const entryPlace = toHalfWidth(GET(horse.entry, 'place', '場所', '場所_1')).replace(/\s+/g, '');
  const entrySurface = GET(horse.entry, 'surface', 'トラック種別', 'track_type').trim().charAt(0) as '芝'|'ダ';
  const entryDistance = parseInt(GET(horse.entry, 'distance', '距離').replace(/[^\d]/g, '') || '0', 10);
  const entryWaku = parseInt(GET(horse.entry, 'waku', '枠番') || '0', 10);
  
  // 芝スタートダートで後方馬が位置取り改善できる可能性
  if (isTurfStartDirtCourse(entryPlace, entrySurface, entryDistance)) {
    const avgPastPosition = getAveragePassingPosition(recent, false);
    const fieldSize = parseInt(GET(horse.entry, 'tosu', '頭数', 'fieldSize', 'field_size') || '16', 10);
    
    // 普段後方の馬は前に行ける可能性 → 3点
    if (avgPastPosition > fieldSize * 0.5) {
      totalScore += 3;
    } else if (avgPastPosition > fieldSize * 0.3) {
      // 中団の馬もやや有利 → 1.5点
      totalScore += 1.5;
    }
  }
  
  // 初角距離が短いコースで内枠有利
  const firstCornerDist = getFirstCornerDistance(entryPlace, entrySurface, entryDistance);
  if (firstCornerDist < 280 && entryWaku <= 3) {
    // 内枠（1-3枠）ボーナス → 1点
    totalScore += 1;
  } else if (firstCornerDist < 300 && entryWaku <= 2) {
    // 最内枠（1-2枠）ボーナス → 0.5点
    totalScore += 0.5;
  }
  
  // ============================================================
  // 【新規】下級条件連続2着（-4点減点）
  // 未勝利/1勝クラスで連続2着は過信禁物
  // ============================================================
  if (recent.length >= 2) {
    const fin1 = parseInt(toHalfWidth(GET(recent[0], 'finish', '着順').trim()), 10);
    const fin2 = parseInt(toHalfWidth(GET(recent[1], 'finish', '着順').trim()), 10);
    const class1 = GET(recent[0], 'クラス名', 'class_name').trim();
    const class2 = GET(recent[1], 'クラス名', 'class_name').trim();
    
    // 連続2着かつ下級条件
    if (fin1 === 2 && fin2 === 2 && isLowerClass(class1) && isLowerClass(class2)) {
      totalScore -= 4;
    }
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

