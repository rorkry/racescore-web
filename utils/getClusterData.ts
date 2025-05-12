import React from 'react';
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

// --- 距離表記を正規化: "芝1600", "芝1600m", "ダ 1200" → "芝1600", "ダ1200"
function normalizeDist(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/m/gi, '');
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

  /* === ユーティリティ関数（page.tsx から暫定コピー） === */
  const toHalfWidth = (str: string) =>
    str.replace(/[！-～]/g, s =>
      String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');

  /** 走破タイム文字列 → 秒
   *  - "1:34.5"   → 94.5
   *  - "2.10.4"   → 130.4
   *  - "2104"     → 130.4
   */
  const toSec = (t: string): number => {
    const s = toHalfWidth(t.trim());

    // Pattern 1: "m:ss.s" or "mm:ss.s"
    let m = s.match(/^(\d+):(\d{2}\.\d)$/);
    if (m) {
      return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
    }

    // Pattern 2: "m.ss.s" or "mm.ss.s" (e.g., "2.10.4")
    m = s.match(/^(\d+)\.(\d{2})\.(\d)$/);
    if (m) {
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3], 10) / 10;
    }

    // Pattern 3: pure digits "mmssd" / "msssd" (e.g., "2104" → 2:10.4)
    if (/^\d{4,5}$/.test(s)) {
      const digits = s.split('').map(Number);
      const tenths = digits.pop()!;                        // 最後の 1 桁 = 0.1 秒
      const secs   = parseInt(digits.splice(-2).join(''), 10); // 後ろ 2 桁 = 秒
      const mins   = parseInt(digits.join('') || '0', 10);     // 残り = 分
      return mins * 60 + secs + tenths / 10;
    }

    return NaN; // パターン不一致
  };

  const formatTime = (t: string) => t;   // ここでは元文字列で十分

  /**
   * 日付文字列を Date へ変換
   * - 余分な空白・全角数字を半角へ
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
  /* === ★ 旧ロジック用ユーティリティ =============================== */

  /** レースレベル (全角/半角 A–E) → ★1–5 */
  function levelToStars(level: string): number {
    if (!level) return 0;
    let ch = level.trim().charAt(0);
    const code = ch.charCodeAt(0);
    // 全角Ａ～Ｅ → 半角A–E
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

  /** 着差スコア: 0差→1、+3秒以上→0 */
  function marginScore(marginSec: number): number {
    const raw = 1.2 - 0.4 * marginSec;
    return Math.max(0, Math.min(1, raw));
  }

  /** ペースカテゴリ */
  type PaceCat = '超ハイ'|'ハイ'|'ミドル'|'スロー'|'超スロー';
  function getPaceCat(surface: '芝'|'ダ', dist: number, pci: number): PaceCat {
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

  /** ペースカテゴリ → 補正係数 */
  const paceFactorMap: Record<PaceCat, number> = {
    '超ハイ': 1.2,
    'ハイ':    1.1,
    'ミドル':  1.0,
    'スロー':  0.9,
    '超スロー':0.8,
  };

  /** 指標合成の重み（合計1.0） */
  const WEIGHTS = {
    star:     0.28,  // ★レベル
    cluster:  0.10,  // クラスタタイム
    passing:  0.28,  // 通過順位 × ペース
    finish:   0.05,  // 着順
    margin:   0.10,  // 着差
    timeDiff: 0.09,  // レース内タイム差
  };

  /** 走破タイム差スコア: 差0→1、±3秒→0 */
  function timeDiffScore(selfSec: number, clusterSecs: number[]): number {
    if (!clusterSecs.length) return 0;
    const best = Math.min(...clusterSecs);
    const diff = selfSec - best;
    const s = 1 - Math.min(Math.abs(diff) / 3, 1);
    return Math.max(0, s);
  }
  /* === 旧ロジックユーティリティここまで =========================== */

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
    // [DEBUG getCluster] 自馬クラス=..., 他馬クラス=..., diff=...
    let highlight: ClusterInfo['highlight'] = '';
    if (otherRank > currRank) {
      highlight = diff < 0 ? 'red' : diff <= 1 ? 'orange' : '';
    }

    // DEBUG getClusterData detail: rid=..., currRank=..., otherRank=..., diff=..., highlight=...

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
/*  きそう指数 計算の簡易バージョン                                   */
/*  （元のロジックを簡略化：直近3走の着順でスコアリング）             */
/* ------------------------------------------------------------------ */

/**
 * 半角変換ユーティリティ（上部にもあるが単体利用用に再宣言）
 */
const _toHalfWidth = (str: string) =>
  str.replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
     .replace(/　/g, ' ');

/**
 * 馬 1 頭の “きそう指数” を返す。
 * @param horse 過去走配列と現在出走情報
 * @returns 0〜1 のスコア（高いほど期待）
 */
export function computeKisoScore(horse: { past: RecordRow[]; entry: RecordRow }): number {
  const recent = horse.past.slice(0, 3);          // 直近3走
  const recencyWeights = [0.5, 0.3, 0.2];         // ≒指数半減

  const trialScores = recent.map((r, idx) => {
    /* --- ① レースレベル（★） ---------------------------------- */
    const starCount   = levelToStars(GET(r, 'rating3', 'レース印３'));
    const starBase    = starCount / 5;
    const starFactor  = starCount >= 3 ? 1.1 : 0.9;
    const starScore   = Math.min(1, Math.max(0, starBase * starFactor));

    /* --- ⑦ 走破タイム差スコア ---------------------------------- */
    const selfSec = toSec(GET(r,'time','走破タイム'));
    /* --- ② 別クラスタタイム ------------------------------------ */
    /*  同一 surface+distance の他レース（直近3走内）で最速走破タイムとの差を評価
     *  diff ≤ 0   → 1.0
     *  diff 0.5s → 0.5
     *  diff ≥ 1s → 0   （timeDiffScore が処理）
     */
    const surf = (GET(r,'surface','距離').trim().charAt(0) as '芝'|'ダ') || '芝';
    const dist = normalizeDist(GET(r,'distance','距離'));
    const selfSecC = selfSec;  // selfSec は後段で算出するので先に placeholder
    // 集合をつくる: 同じ surface+distance かつ秒数が取れるもの
    const clusterSecs = recent
      .filter(x =>
        (GET(x,'surface','距離').trim().charAt(0) as '芝'|'ダ') === surf &&
        normalizeDist(GET(x,'distance','距離')) === dist
      )
      .map(x => toSec(GET(x,'time','走破タイム')))
      .filter(sec => !isNaN(sec) && sec > 0);
    const clusterScore = timeDiffScore(selfSecC, clusterSecs);

    /* --- ③ 通過順位スコア -------------------------------------- */
    // --- 通過順位 配列を生成（corner2, corner3, corner4） ---
const passNums = ['corner2', 'corner3', 'corner4']
  .map(k => {
    const raw = toHalfWidth(GET(r, k).trim());   // 全角→半角
    const m = raw.match(/^\d+/);                 // 先頭の数字だけ抜く
    return m ? parseInt(m[0], 10) : NaN;
  })
  .filter(n => !isNaN(n));

    const fieldSize = parseInt(GET(r, 'fieldSize', '頭数') || '1', 10);

// passNums が空なら「最後尾と同等」とみなす (負値を防ぐ)
const avgPass = passNums.length
  ? passNums.reduce((a, b) => a + b, 0) / passNums.length
  : fieldSize;    // 欠損 → 後方評価だが 0 以上に抑える

// 0〜1 にクリップ（マイナス防止）
const basePassScore = Math.max(
  0,
  (fieldSize - avgPass + 1) / fieldSize
);

    /* --- ④ 着差・ペース補正 ------------------------------------ */
    const mScore = marginScore(parseFloat(GET(r,'margin','着差') || '0'));
    const paceCat = getPaceCat(
      (GET(r,'surface','距離').trim().charAt(0) as '芝'|'ダ') || '芝',
      parseInt(GET(r,'distance','距離').replace(/[^\d]/g,'') || '0', 10),
      parseFloat(GET(r,'pci','PCI') || '0')
    );
    const passFactor = paceFactorMap[paceCat];
    const adjustedPassScore = basePassScore * mScore * passFactor;

    /* --- ⑤ 着順スコア ------------------------------------------ */
    const fin = parseInt(_toHalfWidth(GET(r,'finish','着順').trim()), 10) || 99;
    const finishScore = Math.max(0, 1 - (fin - 1) * 0.1);

    /* --- ⑥ 着差スコア ------------------------------------------ */
    const marginScore_ = mScore;

    /* --- ⑦ 走破タイム差スコア ---------------------------------- */
    const timeScore = timeDiffScore(selfSec, []);   // clusterSecs 未導入のため空配列

    /* --- ⑧ 合成 ------------------------------------------------ */
    // 着順ペナルティ: 3着以内 = 1.0、4着=0.85、5着=0.85²…
    const finishPenalty = Math.pow(0.85, Math.max(fin - 3, 0));
    const baseScore =
        WEIGHTS.star     * starScore
      + WEIGHTS.cluster  * clusterScore
      + WEIGHTS.passing  * adjustedPassScore
      + WEIGHTS.finish   * finishScore
      + WEIGHTS.margin   * marginScore_
      + WEIGHTS.timeDiff * timeScore;
    const score = baseScore * finishPenalty;

    return score * (recencyWeights[idx] || 0.1);   // recency weight掛け
  });

  const totalRecW = recencyWeights.slice(0, trialScores.length)
                     .reduce((a,b)=>a+b,0);
  const total = trialScores.reduce((a,b)=>a+b,0) / (totalRecW || 1);
  return +total.toFixed(3);
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