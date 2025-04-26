

// utils/getClusterData.ts
import React from 'react';

/** 最低限のフィールド型 */
export type RecordRow = { [key: string]: string };

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
  const rid = r['レースID(新/馬番無)']?.trim() || '';
  if (cacheRef.current[rid]) return cacheRef.current[rid];

  /* === ユーティリティ関数（page.tsx から暫定コピー） === */
  const toHalfWidth = (str: string) =>
    str.replace(/[！-～]/g, s =>
      String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');

  const toSec = (t: string) => {
    // "1:34.5" -> 94.5
    const m = t.match(/(\d+):(\d{2}\.\d)/);
    if (!m) return NaN;
    return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
  };

  const formatTime = (t: string) => t;   // ここでは元文字列で十分

  const parseDateStr = (s: string) => {
    const [y,m,d] = s.split('.').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : undefined;
  };

  const classToRank = (cls: string) => {
    // G1=5, G2=4, G3=3, OP=2, L=1, others=0
    if (/G1/.test(cls)) return 5;
    if (/G2/.test(cls)) return 4;
    if (/G3/.test(cls)) return 3;
    if (/OP|オープン/.test(cls)) return 2;
    if (/L|ﾘｽﾃｯﾄﾞ/.test(cls)) return 1;
    return 0;
  };
  /* === ここまでユーティリティ === */

  const baseDate = parseDateStr(r['日付(yyyy.mm.dd)']?.trim() || '');
  if (!baseDate) { cacheRef.current[rid] = []; return []; }

  const selfPlace = (r['場所'] || r['場所_1'] || '').replace(/\s+/g, '');
  const selfDist  = (r['距離'] || '').replace(/\s+/g, '');

  const candidates = allRaces
    // 1 着馬
    .filter(x => toHalfWidth((x['着順'] || '').trim()) === '1')
    // ±1 日
    .filter(x => {
      const d = parseDateStr(x['日付(yyyy.mm.dd)'] || '');
      return d && Math.abs(+d - +baseDate) <= 86400000;
    })
    // 同場所・同距離
    .filter(x =>
      (x['場所'] || x['場所_1'] || '').replace(/\s+/g, '') === selfPlace &&
      (x['距離'] || '').replace(/\s+/g, '') === selfDist
    )
    // 走破タイムが有効
    .filter(x => !isNaN(toSec((x['走破タイム'] || '').trim())));

  if (candidates.length === 0) {
    cacheRef.current[rid] = [];
    return [];
  }

  const infos: ClusterInfo[] = candidates.map(c => {
    const otherTime = (c['走破タイム'] || '').trim();
    const diff = toSec(r['走破タイム'] || '') - toSec(otherTime);

    // 日付ラベル
    const d2 = parseDateStr(c['日付(yyyy.mm.dd)'] || '');
    let dayLabel: ClusterInfo['dayLabel'] = '';
    if (d2) {
      const delta = Math.round((+d2 - +baseDate) / 86400000);
      dayLabel = delta === 0 ? '同日' : delta === 1 ? '翌日' : delta === -1 ? '前日' : '';
    }

    // ハイライト判定
    const currRank  = classToRank(r['クラス名'] || '');
    const otherRank = classToRank((c['クラス名'] || '').trim());
    let highlight: ClusterInfo['highlight'] = '';
    if (otherRank > currRank) {
      highlight = diff < 0 ? 'red' : diff <= 1 ? 'orange' : '';
    }

    return {
      dayLabel,
      className: (c['クラス名'] || '').trim(),
      time: formatTime(otherTime),
      diff,
      highlight,
    };
  });

  infos.sort((a,b) => b.diff - a.diff);   // 大きい順
  cacheRef.current[rid] = infos.slice(0,3);
  return cacheRef.current[rid];
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
  // 直近 3 走の着順を取り、1/着順 の平均をスコアとする簡易版
  const recent = horse.past.slice(0, 3);

  const scores = recent.map(r => {
    const fin = parseInt(_toHalfWidth((r['着順'] || '').trim()), 10);
    return isNaN(fin) || fin <= 0 ? 0 : 1 / fin;
  });

  if (scores.length === 0) return 0;
  return +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3);
}