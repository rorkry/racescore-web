'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useSession } from '@/app/components/Providers';
import RaceTimeAnalysisModal from '@/app/components/RaceTimeAnalysisModal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

// ========================================
// 型定義
// ========================================

interface PastRaceIndices {
  L4F: number | null;
  T2F: number | null;
  potential: number | null;
  revouma: number | null;
  makikaeshi: number | null;
  cushion: number | null;
}

interface RaceLevelInfo {
  level: string;
  levelLabel: string;
  totalHorsesRun: number;
  firstRunGoodCount: number;
  winCount: number;
  aiComment: string;
}

interface PastRaceData {
  date: string;
  distance: string;
  class_name: string;
  race_name?: string;
  finish_position: string;
  finish_time: string;
  margin: string;
  index_value: string;
  corner_1?: string;
  corner_2: string;
  corner_3: string;
  corner_4: string;
  pci: string;
  popularity: string;
  track_condition: string;
  place: string;
  race_number?: string;
  jockey?: string;
  lap_time?: string;
  indices?: PastRaceIndices | null;
  indexRaceId?: string;
  race_id?: string;  // umadata.race_id（馬番なし）
  raceLevel?: RaceLevelInfo | null;
  weight_carried?: string; // 斤量
  horse_weight?: string;
  weight_change?: string;
  gender?: string; // 性別（牡牝セ）
  age?: string;     // 当時の年齢表記
  umaban?: string;  // 当該レースの馬番（ユーザー印の照合に使用）
}

interface PastRaceDetailProps {
  pastRaces: PastRaceData[];
  isPremium?: boolean;
  onDateClick?: (date: string) => void;
  isDateClickable?: (date: string) => boolean;
  raceMemos?: Map<string, string>;
  onMemoClick?: (raceKey: string, raceTitle: string, memo: string) => void;
  hideEntrants?: boolean;
  horseRaceMemos?: Map<string, string>; // 今走メモ: race_key → memo
  currentRaceHorses?: string[]; // 今回の出走馬名リスト（対戦ハイライト用）
  currentHorseName?: string;   // 展開中の馬の名前（黄色ハイライト用）
  /** モーダル内など、画面固定の閉じる FAB を出さないとき true */
  hideCollapseFab?: boolean;
  /**
   * レースカードなど、レイアウト全体のメインFAB（右下）と横位置をずらす
   * （重なって押しにくいのを防ぐ）
   */
  collapseFabAvoidGlobalFab?: boolean;
}

// ========================================
// ユーティリティ関数
// ========================================

function toHalfWidth(str: string): string {
  return str.replace(/[！-～]/g, s =>
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
}

/** 予想保存時の馬番と過去走 umadata の馬番を同じキーに揃える */
function normalizeHorseNumberForPrediction(umaban: string | undefined): string {
  if (!umaban) return '';
  const n = parseInt(toHalfWidth(String(umaban)).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? String(n) : '';
}

function userMarkChipClass(mark: string): string {
  switch (mark) {
    case '◎':
      return 'bg-rose-100 text-rose-800 border border-rose-300';
    case '○':
      return 'bg-orange-100 text-orange-800 border border-orange-300';
    case '▲':
      return 'bg-amber-100 text-amber-900 border border-amber-300';
    case '△':
      return 'bg-lime-100 text-lime-900 border border-lime-300';
    case '☆':
      return 'bg-sky-100 text-sky-900 border border-sky-300';
    case '紐':
      return 'bg-slate-200 text-slate-800 border border-slate-400';
    case '消':
      return 'bg-zinc-300 text-zinc-800 border border-zinc-500';
    default:
      return 'bg-violet-100 text-violet-900 border border-violet-300';
  }
}

function lookupUserPredictionMark(race: PastRaceData, map: Map<string, string>): string | null {
  if (!race.date || !race.place || !race.race_number || !race.umaban) return null;
  const rk = `${race.date}_${race.place}_${race.race_number}`;
  const hn = normalizeHorseNumberForPrediction(race.umaban);
  if (!hn) return null;
  return map.get(`${rk}|${hn}`) ?? null;
}

// netkeibaのレース結果URLを生成
// DBのrace_id(16桁: YYYYMMDD+場所+回+日+R) → netkeiba形式(12桁: YYYY+場所+回+日+R)
function buildNetkeibaUrl(raceId: string | undefined): string | null {
  if (!raceId || raceId.length < 16) return null;
  const netkeibaId = raceId.substring(0, 4) + raceId.substring(8);
  return `https://race.netkeiba.com/race/result.html?race_id=${netkeibaId}`;
}

// 今走メモのキーを生成（race_id先頭8桁 + 場所 + R番号）
function deriveHorseRaceMemoKey(race: PastRaceData): string | null {
  if (!race.race_id) return null;
  const yyyymmdd = race.race_id.substring(0, 8);
  const place = (race.place || '').replace(/[0-9０-９]+回.*$/, '').trim();
  // race_number が未設定の場合は race_id 末尾2桁から導出（umadataにカラムなし対策）
  const raceNum = race.race_number
    || (race.race_id.length >= 2 ? String(parseInt(race.race_id.slice(-2), 10)) : '');
  if (!yyyymmdd || !place || !raceNum) return null;
  return `${yyyymmdd}-${place}-${raceNum}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  // "2024. 1. 5" or "2024.01.05" -> "01/05"
  const cleaned = dateStr.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length >= 3) {
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${month}/${day}`;
  }
  return dateStr;
}

function formatDateFull(dateStr: string): string {
  if (!dateStr) return '-';
  const cleaned = dateStr.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length >= 3) {
    const year = parts[0].slice(-2);  // 下2桁
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${year}/${month}/${day}`;
  }
  return dateStr;
}

function getFinishColor(finish: string): string {
  const finishNum = parseInt(toHalfWidth(finish));
  if (finishNum === 1) return 'text-amber-500';
  if (finishNum === 2) return 'text-slate-400';
  if (finishNum === 3) return 'text-orange-500';
  if (finishNum <= 5) return 'text-emerald-600';
  return 'text-slate-600';
}

function getPassingOrder(race: PastRaceData): string {
  const corners = [race.corner_1, race.corner_2, race.corner_3, race.corner_4]
    .filter(c => c && c !== '' && c !== '0')
    .map(c => toHalfWidth(c || ''));
  return corners.length > 0 ? corners.join('-') : '-';
}

function getSurfaceAndDistance(distance: string): { surface: string; dist: string } {
  if (!distance) return { surface: '', dist: '' };
  const match = distance.match(/(芝|ダ|ダート|障)(\d+)/);
  if (match) {
    const surface = match[1] === 'ダート' ? 'ダ' : match[1];
    return { surface, dist: match[2] };
  }
  return { surface: '', dist: distance };
}

/** 性別を牡/牝/セ に短縮 */
function formatSexAbbrev(gender: string | undefined): string {
  if (!gender?.trim()) return '';
  const g = toHalfWidth(gender);
  if (g.includes('牝')) return '牝';
  if (g.includes('牡')) return '牡';
  if (g.includes('セ')) return 'セ';
  return g.trim().slice(0, 2);
}

/** 馬体重と増減（例: 480(+2)） */
function formatBodyWeightLine(hw: string | undefined, wc: string | undefined): string {
  const w = (hw || '').replace(/[^\d]/g, '');
  if (!w) return '';
  const ch = (wc || '').trim().replace(/[＋]/g, '+').replace(/[－﹣−]/g, '-');
  return ch ? `${w}(${ch})` : w;
}

function formatMargin(margin: string): string {
  if (!margin || margin === '0' || margin === '-0.0' || margin === '0.0') return '-';
  const num = parseFloat(margin);
  if (isNaN(num) || num === 0) return '-';
  return num > 0 ? `+${num.toFixed(1)}` : num.toFixed(1);
}

// タイム表記フォーマット: "1559" → "1:55.9"、"580" → "58.0"
function formatFinishTime(timeStr: string): string {
  if (!timeStr || timeStr === '-') return '-';
  const cleaned = toHalfWidth(timeStr).replace(/[^\d]/g, '');
  if (cleaned.length === 4) {
    return `${cleaned[0]}:${cleaned.slice(1, 3)}.${cleaned[3]}`;
  } else if (cleaned.length === 3) {
    return `${cleaned.slice(0, 2)}.${cleaned[2]}`;
  }
  return timeStr;
}

// 巻き返し指数の色分け
function getMakikaeshiColor(value: number | null | undefined): string {
  if (value == null) return 'text-slate-400';
  if (value >= 3.5) return 'text-red-500';
  if (value >= 2.0) return 'text-orange-500';
  return 'text-slate-600';
}

// 過去走の日付(2025.04.04) → 馬場メモ用日付(0404)
function pastDateToBabaMemoDate(dateStr: string): string {
  const cleaned = dateStr.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length >= 3) {
    return parts[1].padStart(2, '0') + parts[2].padStart(2, '0');
  }
  return dateStr;
}

// surface("芝"/"ダ") → trackType("芝"/"ダート")
function surfaceToTrackType(surface: string): '芝' | 'ダート' {
  return surface === '芝' ? '芝' : 'ダート';
}

// ========================================
// 馬場メモ表示チップ
// ========================================

interface BabaMemoData {
  advantage_position: string | null;
  advantage_style: string | null;
  weather_note: string | null;
  free_memo: string | null;
}

/** 一覧行用: 有利位置・脚質・特記（フラット除く） */
function buildBabaMemoTagList(memo: BabaMemoData | null): string[] {
  if (!memo) return [];
  const tags: string[] = [];
  if (memo.advantage_position && memo.advantage_position !== 'フラット') tags.push(memo.advantage_position);
  if (memo.advantage_style && memo.advantage_style !== 'フラット') tags.push(memo.advantage_style);
  if (memo.weather_note) tags.push(...memo.weather_note.split(',').filter(Boolean));
  return tags;
}

/** 馬場メモキャッシュキー（日付MMDD+場+芝/ダ） */
function babaMemoCacheKeyForRace(race: PastRaceData): string | null {
  if (!race.date || !race.place) return null;
  const { surface } = getSurfaceAndDistance(race.distance);
  if (!surface) return null;
  const babaDate = pastDateToBabaMemoDate(race.date);
  return `${babaDate}::${race.place}::${surface}`;
}

function BabaMemoChip({ date, place, surface }: { date: string; place: string; surface: string }) {
  const [memo, setMemo] = useState<BabaMemoData | null>(null);

  useEffect(() => {
    if (!date || !place) return;
    const fetchMemo = async () => {
      try {
        const babaMemoDate = pastDateToBabaMemoDate(date);
        const trackType = surfaceToTrackType(surface);
        const res = await fetch(
          `/api/user/baba-memos?date=${babaMemoDate}&place=${encodeURIComponent(place)}&trackType=${encodeURIComponent(trackType)}`
        );
        if (res.ok) {
          const data = await res.json();
          setMemo(data.memo || null);
        }
      } catch {
        // 未ログイン等は無視
      }
    };
    fetchMemo();
  }, [date, place, surface]);

  if (!memo) return null;

  const tags: string[] = [];
  if (memo.advantage_position && memo.advantage_position !== 'フラット') tags.push(memo.advantage_position);
  if (memo.advantage_style && memo.advantage_style !== 'フラット') tags.push(memo.advantage_style);
  if (memo.weather_note) tags.push(...memo.weather_note.split(',').filter(Boolean));

  if (tags.length === 0 && !memo.free_memo) return null;

  return (
    <div className="mt-2 pt-2 border-t border-slate-100 w-full overflow-hidden">
      <div className="flex items-start gap-1.5 min-w-0">
        <span className="text-[9px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
          馬場メモ
        </span>
        <div className="flex-1 min-w-0">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-200 whitespace-nowrap">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {memo.free_memo && (
            <p className="text-[9px] text-slate-500 mt-0.5 break-all">{memo.free_memo}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ラップタイムをパースして前半/後半に分割
function parseLapTime(lapTime: string | undefined): { 
  all: number[]; 
  first: number[];   // last4の前の部分（表示用）
  last4: number[];
  last4Sum: number | null;
  first3Sum: number | null;
  first5Sum: number | null;
  last5Sum: number | null;
} {
  const empty = { all: [], first: [], last4: [], last4Sum: null, first3Sum: null, first5Sum: null, last5Sum: null };
  if (!lapTime) return empty;
  
  const laps = lapTime.split('-').map(l => parseFloat(l.trim())).filter(l => !isNaN(l));
  if (laps.length < 4) return { ...empty, all: laps, first: laps };
  
  const last4 = laps.slice(-4);
  const first = laps.slice(0, -4);
  const last4Sum = last4.reduce((sum, v) => sum + v, 0);

  const first3Sum = laps.length >= 3
    ? laps.slice(0, 3).reduce((sum, v) => sum + v, 0)
    : null;
  const first5Sum = laps.length >= 5
    ? laps.slice(0, 5).reduce((sum, v) => sum + v, 0)
    : null;
  const last5Sum = laps.length >= 5
    ? laps.slice(-5).reduce((sum, v) => sum + v, 0)
    : null;
  
  return { all: laps, first, last4, last4Sum, first3Sum, first5Sum, last5Sum };
}

// ========================================
// 評価バッジコンポーネント
// ========================================

type BadgeLevel = 'high' | 'mid' | 'low' | 'none';

interface EvaluationBadge {
  type: 'member' | 'time' | 'lap' | 'load';
  level: BadgeLevel;
  label: string;
  detail: string;
}

function getBadgeColor(level: BadgeLevel): string {
  switch (level) {
    case 'high': return 'bg-red-500 text-white';
    case 'mid': return 'bg-orange-400 text-white';
    case 'low': return 'bg-blue-200 text-blue-800';
    case 'none': return 'bg-slate-200 text-slate-500';
  }
}

/** calculateEvaluationBadges のメンバーレベル判定と同じ（S+/S/A=高、B=中、C/LOW=低、その他=灰） */
function raceLevelToBadgeLevel(rl: RaceLevelInfo | null | undefined): BadgeLevel {
  if (!rl?.level) return 'none';
  const level = String(rl.level).toUpperCase().trim();
  if (level === 'S+' || level === 'S' || level === 'A') return 'high';
  if (level === 'B' || level.startsWith('B')) return 'mid'; // B+ など
  if (level === 'C' || level === 'LOW' || level.startsWith('C')) return 'low';
  if (level === 'UNKNOWN' || level === '-') return 'none';
  return 'none';
}

function getBadgeDot(level: BadgeLevel): string {
  switch (level) {
    case 'high': return 'bg-red-500';
    case 'mid': return 'bg-orange-400';
    case 'low': return 'bg-blue-300';
    case 'none': return 'bg-slate-300';
  }
}

/**
 * 評価バッジを計算
 */
function calculateEvaluationBadges(race: PastRaceData): EvaluationBadge[] {
  const badges: EvaluationBadge[] = [];
  
  // 1. メンバーレベル（レースレベル）
  const raceLevel = race.raceLevel;
  if (raceLevel) {
    const level = raceLevel.level?.toUpperCase() || '';
    let label = level;
    const badgeLevel = raceLevelToBadgeLevel(raceLevel);
    
    const goodRate = raceLevel.totalHorsesRun > 0 
      ? Math.round((raceLevel.firstRunGoodCount / raceLevel.totalHorsesRun) * 100)
      : 0;
    
    badges.push({
      type: 'member',
      level: badgeLevel,
      label: `Lv${label}`,
      detail: raceLevel.totalHorsesRun > 0 
        ? `${raceLevel.totalHorsesRun}頭中${raceLevel.firstRunGoodCount}頭好走(${goodRate}%)`
        : raceLevel.aiComment || 'データ不足'
    });
  }
  
  // 2. 時計評価（L4Fベース - 仮実装）
  const l4f = race.indices?.L4F;
  if (l4f != null) {
    let badgeLevel: BadgeLevel = 'none';
    let label = '';
    
    // L4F: 45以下が高評価、数字が低いほど速い
    if (l4f <= 45) {
      badgeLevel = 'high';
      label = '時計◎';
    } else if (l4f <= 48) {
      badgeLevel = 'mid';
      label = '時計○';
    } else if (l4f <= 51) {
      badgeLevel = 'low';
      label = '時計△';
    }
    
    if (label) {
      badges.push({
        type: 'time',
        level: badgeLevel,
        label,
        detail: `L4F: ${l4f.toFixed(1)}`
      });
    }
  }
  
  // 3. ラップ評価（lap_timeから判定）
  const lapTime = race.lap_time;
  if (lapTime) {
    const laps = lapTime.split('-').map(l => parseFloat(l.trim())).filter(l => !isNaN(l));
    if (laps.length >= 4) {
      const last3 = laps.slice(-3);
      const lastDecel = last3[2] - last3[1];
      
      let badgeLevel: BadgeLevel = 'none';
      let label = '';
      let pattern = '';
      
      if (lastDecel < -0.05) {
        // 加速ラップ
        badgeLevel = 'high';
        label = '加速';
        pattern = `${last3[0].toFixed(1)}-${last3[1].toFixed(1)}-${last3[2].toFixed(1)}`;
      } else if (Math.abs(lastDecel) <= 0.05) {
        // 非減速ラップ
        badgeLevel = 'high';
        label = '非減速';
        pattern = `${last3[0].toFixed(1)}-${last3[1].toFixed(1)}-${last3[2].toFixed(1)}`;
      } else if (lastDecel <= 0.3) {
        // 微減速
        badgeLevel = 'mid';
        label = '微減速';
        pattern = `${last3[0].toFixed(1)}-${last3[1].toFixed(1)}-${last3[2].toFixed(1)}`;
      } else {
        // 減速
        badgeLevel = 'low';
        label = '減速';
        pattern = `-${lastDecel.toFixed(1)}秒`;
      }
      
      badges.push({
        type: 'lap',
        level: badgeLevel,
        label,
        detail: `後半3F: ${pattern}`
      });
    }
  }
  
  // 4. 負荷ありラップ判定（中盤でペースが緩まない）
  if (lapTime) {
    const laps = lapTime.split('-').map(l => parseFloat(l.trim())).filter(l => !isNaN(l));
    if (laps.length >= 6) {
      // 中盤3Fを取得（全体の1/3〜2/3）
      const startIdx = Math.floor(laps.length / 3);
      const endIdx = Math.floor(laps.length * 2 / 3);
      const midLaps = laps.slice(startIdx, endIdx);
      
      // 中盤が12.5秒以下（芝）または13.0秒以下（ダート）で続いていれば負荷あり
      const { surface } = getSurfaceAndDistance(race.distance);
      const threshold = surface === '芝' ? 12.5 : 13.0;
      const hasLoad = midLaps.every(lap => lap <= threshold);
      
      if (hasLoad) {
        badges.push({
          type: 'load',
          level: 'high',
          label: '負荷',
          detail: `中盤${midLaps.map(l => l.toFixed(1)).join('-')}で淀みなし`
        });
      }
    }
  }
  
  return badges;
}

// ========================================
// バッジ表示コンポーネント
// ========================================

interface BadgeDotsProps {
  badges: EvaluationBadge[];
  className?: string;
}

function BadgeDots({ badges, className }: BadgeDotsProps) {
  if (badges.length === 0) return null;
  
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {badges.map((badge, idx) => (
        <div
          key={idx}
          className={cn('size-2.5 rounded-full', getBadgeDot(badge.level))}
          title={`${badge.label}: ${badge.detail}`}
        />
      ))}
    </div>
  );
}

interface BadgeLabelsProps {
  badges: EvaluationBadge[];
  className?: string;
}

function BadgeLabels({ badges, className }: BadgeLabelsProps) {
  if (badges.length === 0) return null;
  
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {badges.map((badge, idx) => (
        <span
          key={idx}
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-medium',
            getBadgeColor(badge.level)
          )}
          title={badge.detail}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

// ========================================
// 出走馬一覧セクション（同レースの全馬）+ 馬過去走モーダル
// ========================================

interface RaceEntrant {
  horse_name: string;
  finish_position: string;
  waku: string;
  umaban: string;
  popularity: string;
  win_odds: string;
  margin: string;
  weight_carried: string;
  finish_time: string;
  last_3f: string;
  jockey: string;
  corner_1: string;
  corner_2: string;
  corner_3: string;
  corner_4: string;
}

function getWakuBadgeClass(waku: string): string {
  const n = parseInt(waku, 10);
  const map: Record<number, string> = {
    1: 'bg-white text-gray-900 border border-gray-400',
    2: 'bg-black text-white',
    3: 'bg-red-500 text-white',
    4: 'bg-blue-500 text-white',
    5: 'bg-yellow-400 text-gray-900',
    6: 'bg-green-500 text-white',
    7: 'bg-orange-500 text-white',
    8: 'bg-pink-400 text-white',
  };
  return map[n] || 'bg-gray-400 text-white';
}

function getEntrantPassingOrder(e: RaceEntrant): string {
  const corners = [e.corner_1, e.corner_2, e.corner_3, e.corner_4]
    .filter(c => c && c !== '' && c !== '0');
  return corners.length > 0 ? corners.join('-') : '';
}

// ========================================
// お気に入り・メモセクション（モーダル内）
// ========================================

function HorseFavoriteSection({ horseName }: { horseName: string }) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [note, setNote] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/user/favorites')
      .then(r => r.ok ? r.json() : { favorites: [] })
      .then(data => {
        const found = (data.favorites || []).find((f: { horse_name: string; note: string | null }) => f.horse_name === horseName);
        if (found) {
          setIsFavorite(true);
          setNote(found.note || '');
          setNoteText(found.note || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [horseName]);

  const toggleFavorite = async () => {
    if (isFavorite) {
      const res = await fetch('/api/user/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horseName }),
      });
      if (res.ok) { setIsFavorite(false); setNote(''); setNoteText(''); setEditing(false); }
    } else {
      const res = await fetch('/api/user/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horseName, notifyOnRace: false }),
      });
      if (res.ok) { setIsFavorite(true); }
    }
  };

  const saveNote = async () => {
    setSaving(true);
    await fetch('/api/user/favorites', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horseName, note: noteText }),
    });
    setSaving(false);
    setNote(noteText);
    setEditing(false);
  };

  if (loading) return null;

  return (
    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={toggleFavorite}
          className={cn(
            'flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors',
            isFavorite
              ? 'bg-amber-50 border-amber-300 text-amber-600'
              : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'
          )}
        >
          <span>{isFavorite ? '★' : '☆'}</span>
          <span>{isFavorite ? 'お気に入り済み' : 'お気に入り登録'}</span>
        </button>
        {isFavorite && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            {note ? '📝 メモを編集' : '📝 メモを追加'}
          </button>
        )}
      </div>
      {isFavorite && !editing && note && (
        <div className="mt-1.5 text-xs text-slate-600 bg-amber-50 rounded px-2 py-1 border border-amber-100">
          {note}
        </div>
      )}
      {isFavorite && editing && (
        <div className="mt-2">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="メモを入力..."
            className="w-full border border-slate-200 rounded px-2 py-1.5 resize-none h-14 focus:outline-none focus:border-emerald-300"
            style={{ fontSize: '16px' }}
          />
          <div className="flex gap-2 mt-1">
            <button
              onClick={saveNote}
              disabled={saving}
              className="text-xs bg-emerald-500 text-white px-3 py-1 rounded hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => { setEditing(false); setNoteText(note); }}
              className="text-xs text-slate-500 px-3 py-1 rounded border border-slate-200"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function HorsePastRaceModal({ horseName, onClose }: { horseName: string; onClose: () => void }) {
  useBodyScrollLock();
  const [pastRaces, setPastRaces] = useState<PastRaceData[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/horse-past-races?horseName=${encodeURIComponent(horseName)}`)
      .then(r => r.ok ? r.json() : { pastRaces: [] })
      .then(data => setPastRaces(data.pastRaces || []))
      .catch(() => setPastRaces([]))
      .finally(() => setLoading(false));
  }, [horseName]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-2xl max-h-[85vh] sm:max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
          <span className="font-semibold text-sm text-slate-800">{horseName} の過去走</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none px-1"
          >
            ✕
          </button>
        </div>
        {/* お気に入り・メモ */}
        <HorseFavoriteSection horseName={horseName} />
        {/* コンテンツ */}
        <div className="overflow-y-auto flex-1 min-h-0 p-4" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {loading && (
            <div className="text-sm text-slate-400 text-center py-8">読み込み中...</div>
          )}
          {!loading && pastRaces && pastRaces.length > 0 && (
            <PastRaceDetailInner pastRaces={pastRaces} isPremium={false} hideEntrants hideCollapseFab />
          )}
          {!loading && (!pastRaces || pastRaces.length === 0) && (
            <div className="text-sm text-slate-400 text-center py-8">過去走データなし</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RaceEntrantsSection({
  raceId,
  raceKey,
  currentRaceHorses,
  currentHorseName,
  onCountUpdate,
}: {
  raceId: string;
  raceKey?: string | null;
  currentRaceHorses?: string[];
  currentHorseName?: string;
  onCountUpdate?: (raceId: string, count: number) => void;
}) {
  const { status } = useSession();
  const isLoggedIn = status === 'authenticated';
  const [entrants, setEntrants] = useState<RaceEntrant[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null);
  const [memosMap, setMemosMap] = useState<Map<string, string>>(new Map());
  const [memoPopup, setMemoPopup] = useState<{ horseName: string; draft: string } | null>(null);
  const [savingMemo, setSavingMemo] = useState(false);

  useEffect(() => {
    fetch(`/api/race-entrants?raceId=${encodeURIComponent(raceId)}`)
      .then(r => r.ok ? r.json() : { entrants: [] })
      .then(data => {
        const rows: RaceEntrant[] = data.entrants || [];
        setEntrants(rows);
        if (currentRaceHorses && onCountUpdate) {
          const normalizedCurrent = currentRaceHorses.map(n => n.trim());
          const count = rows.filter(e => normalizedCurrent.includes(e.horse_name.trim())).length;
          onCountUpdate(raceId, count);
        }
      })
      .catch(() => setEntrants([]))
      .finally(() => setLoading(false));
  }, [raceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // このレースのメモを一括取得
  useEffect(() => {
    const key = raceKey || raceId;
    if (!key || !isLoggedIn) return;
    fetch(`/api/user/horse-race-memos?raceKey=${encodeURIComponent(key)}`)
      .then(r => r.ok ? r.json() : { memos: [] })
      .then(data => {
        const map = new Map<string, string>();
        for (const m of data.memos || []) {
          map.set(m.horse_name, m.memo);
        }
        setMemosMap(map);
      })
      .catch(() => {});
  }, [raceKey, raceId, isLoggedIn]);

  const saveMemo = useCallback(async (horseName: string, memo: string) => {
    const key = raceKey || raceId;
    if (!key) return;
    setSavingMemo(true);
    try {
      await fetch('/api/user/horse-race-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horseName, raceKey: key, memo }),
      });
      setMemosMap(prev => {
        const next = new Map(prev);
        if (memo.trim()) next.set(horseName, memo.trim());
        else next.delete(horseName);
        return next;
      });
    } finally {
      setSavingMemo(false);
      setMemoPopup(null);
    }
  }, [raceKey, raceId]);

  if (loading) return (
    <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">出走馬取得中...</div>
  );
  if (!entrants || entrants.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-slate-100 w-full">
      <div className="w-full">
        <table className="text-[9px] border-collapse w-full">
          <thead>
            <tr className="text-slate-400 border-b border-slate-200">
              <th className="text-center pb-1 pr-1 font-normal w-5">着</th>
              <th className="text-center pb-1 pr-1 font-normal w-5">馬番</th>
              <th className="text-left pb-1 pr-1 font-normal">馬名</th>
              {/* 通過・斤量・騎手: PCのみヘッダー表示 */}
              <th className="hidden sm:table-cell text-right pb-1 pr-1 font-normal w-16">通過</th>
              <th className="text-right pb-1 pr-1 font-normal w-6">人</th>
              <th className="text-right pb-1 pr-1 font-normal w-10">オッズ</th>
              <th className="text-right pb-1 pr-1 font-normal w-10">着差</th>
              <th className="hidden sm:table-cell text-right pb-1 pr-1 font-normal w-8">斤量</th>
              <th className="text-right pb-1 pr-1 font-normal w-14 tabular-nums">時計</th>
              <th className="text-right pb-1 pr-1 font-normal w-10">上がり</th>
              <th className="hidden sm:table-cell text-right pb-1 font-normal w-16">騎手</th>
            </tr>
          </thead>
          <tbody>
            {entrants.map((e, i) => {
              const passingOrder = getEntrantPassingOrder(e);
              const hasSecondRow = passingOrder || e.jockey || e.weight_carried;
              const hasMemo = memosMap.has(e.horse_name);
              const normalizedCurrent = currentRaceHorses?.map(n => n.trim()) ?? [];
              const isViewingHorse = currentHorseName
                ? e.horse_name.trim() === currentHorseName.trim()
                : false;
              const isOtherCurrentHorse = !isViewingHorse && normalizedCurrent.includes(e.horse_name.trim());
              const stableKey = `${e.horse_name ?? ''}-${e.finish_position ?? ''}-${i}`;
              return (
                <React.Fragment key={stableKey}>
                  <tr
                    className={cn(
                      isViewingHorse
                        ? 'bg-yellow-100'
                        : isOtherCurrentHorse
                          ? 'bg-emerald-100'
                          : e.finish_position === '1' ? 'bg-amber-50' :
                            e.finish_position === '2' ? 'bg-slate-50' :
                            e.finish_position === '3' ? 'bg-orange-50' : ''
                    )}
                  >
                    <td className={cn('py-0.5 pr-1 text-center font-bold', getFinishColor(e.finish_position))}>
                      {toHalfWidth(e.finish_position)}
                    </td>
                    <td className="py-0.5 pr-1 text-center">
                      <span className={cn(
                        'inline-block w-5 h-5 flex items-center justify-center rounded-sm text-[9px] font-bold leading-none',
                        getWakuBadgeClass(e.waku)
                      )}>
                        {toHalfWidth(e.umaban)}
                      </span>
                    </td>
                    <td className="py-0.5 pr-1">
                      <div className="flex items-center justify-between gap-1 w-full">
                        <button
                          onClick={ev => { ev.stopPropagation(); setSelectedHorse(e.horse_name); }}
                          className="text-emerald-600 hover:underline text-left font-medium whitespace-nowrap flex-1 min-w-0 truncate"
                        >
                          {e.horse_name}
                        </button>
                        {/* ✏️ボタンを右端に固定 */}
                        {isLoggedIn && (
                          <button
                            onClick={ev => { ev.stopPropagation(); setMemoPopup({ horseName: e.horse_name, draft: memosMap.get(e.horse_name) || '' }); }}
                            className={`flex-shrink-0 ml-1 text-[10px] px-0.5 rounded leading-none transition-colors ${hasMemo ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                            title={hasMemo ? 'メモあり（タップで編集）' : '今走メモを書く'}
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    </td>
                    {/* 通過: PCのみ */}
                    <td className="hidden sm:table-cell py-0.5 pr-1 text-right text-slate-400 tabular-nums">
                      {passingOrder || '-'}
                    </td>
                    <td className="py-0.5 pr-1 text-right text-slate-500">{toHalfWidth(e.popularity || '-')}</td>
                    <td className="py-0.5 pr-1 text-right text-slate-600 tabular-nums">{toHalfWidth(e.win_odds || '-')}</td>
                    <td className="py-0.5 pr-1 text-right text-slate-500 tabular-nums">{formatMargin(e.margin)}</td>
                    {/* 斤量: PCのみ */}
                    <td className="hidden sm:table-cell py-0.5 pr-1 text-right text-slate-600">{toHalfWidth(e.weight_carried || '-')}</td>
                    <td className="py-0.5 pr-1 text-right text-slate-700 tabular-nums">{formatFinishTime(e.finish_time)}</td>
                    <td className="py-0.5 text-right text-slate-600 tabular-nums">{toHalfWidth(e.last_3f || '-')}</td>
                    {/* 騎手: PCのみ */}
                    <td className="hidden sm:table-cell py-0.5 text-right text-slate-500 truncate max-w-[60px]">{e.jockey || '-'}</td>
                  </tr>
                  {/* モバイルのみ2段目: 通過 + 騎手(斤量) [+ メモ内容] */}
                  {(hasSecondRow || hasMemo) && (
                    <tr className={cn('sm:hidden border-b border-slate-100',
                      e.finish_position === '1' ? 'bg-amber-50' :
                      e.finish_position === '2' ? 'bg-slate-50' :
                      e.finish_position === '3' ? 'bg-orange-50' : ''
                    )}>
                      <td />
                      <td />
                      <td colSpan={6} className="pb-1 text-[8px] text-slate-400 tabular-nums">
                        <span className="flex items-center gap-2 flex-wrap">
                          {passingOrder && <span>通過: {passingOrder}</span>}
                          {e.jockey && (
                            <span className="text-slate-500">
                              {e.jockey}{e.weight_carried ? `(${toHalfWidth(e.weight_carried)})` : ''}
                            </span>
                          )}
                          {hasMemo && (
                            <span className="text-amber-600 font-medium">✏️ {memosMap.get(e.horse_name)}</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedHorse && (
        <HorsePastRaceModal
          horseName={selectedHorse}
          onClose={() => setSelectedHorse(null)}
        />
      )}

      {/* メモポップアップ */}
      {memoPopup && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setMemoPopup(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-4"
            onClick={ev => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm text-amber-700">✏️ {memoPopup.horseName}</span>
              <button onClick={() => setMemoPopup(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
            </div>
            <textarea
              className="w-full border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
              style={{ fontSize: '16px' }}
              rows={4}
              placeholder="このレースでのメモ..."
              value={memoPopup.draft}
              onChange={ev => setMemoPopup(p => p ? { ...p, draft: ev.target.value } : null)}
              autoFocus
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => saveMemo(memoPopup.horseName, memoPopup.draft)}
                disabled={savingMemo}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50"
              >
                {savingMemo ? '保存中...' : '保存'}
              </button>
              {memosMap.has(memoPopup.horseName) && (
                <button
                  onClick={() => saveMemo(memoPopup.horseName, '')}
                  disabled={savingMemo}
                  className="px-3 bg-slate-100 hover:bg-red-50 text-red-500 text-sm rounded-lg disabled:opacity-50"
                >
                  削除
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================
// PC向け: アコーディオン形式（クリックで開閉）
// ========================================

interface CompactRaceRowProps {
  race: PastRaceData;
  index: number;
  isPremium: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onDateClick?: (date: string) => void;
  isClickable?: boolean;
  hasMemo?: boolean;
  onMemoClick?: () => void;
  hideEntrants?: boolean;
  winnerName?: string;
  horseMemo?: string;
  currentRaceHorses?: string[];
  currentHorseName?: string;
  sameRaceCount?: number;
  onSameRaceCountUpdate?: (raceId: string, count: number) => void;
  onAnalysisClick?: (raceId: string) => void;
  /** ログインユーザーが当該レースでこの馬に付けた印 */
  userPredictionMark?: string | null;
  /** 展開前のみ: 馬場メモの簡易タグ（内有利・高速馬場等） */
  collapsedBabaTags?: string[];
  /** 展開前のみ: 馬場メモ自由記述（タグが空のときなど） */
  collapsedBabaFreeLine?: string | null;
}

function CompactRaceRow({ 
  race, 
  index, 
  isPremium,
  isExpanded,
  onToggle,
  onDateClick, 
  isClickable,
  hasMemo,
  onMemoClick,
  hideEntrants,
  winnerName,
  horseMemo,
  currentRaceHorses,
  currentHorseName,
  sameRaceCount,
  onSameRaceCountUpdate,
  onAnalysisClick,
  userPredictionMark,
  collapsedBabaTags = [],
  collapsedBabaFreeLine,
}: CompactRaceRowProps) {
  const { surface, dist } = getSurfaceAndDistance(race.distance);
  const badges = useMemo(() => isPremium ? calculateEvaluationBadges(race) : [], [race, isPremium]);
  const raceLabel = index === 0 ? '前走' : `${index + 1}走前`;
  
  // レース名（race_nameがあればそれを使用、なければclass_name）
  const raceName = race.race_name || race.class_name || '-';
  const kinryo = (race.weight_carried || '').trim();
  const sexAge = [formatSexAbbrev(race.gender), toHalfWidth((race.age || '').trim())].filter(Boolean).join('');
  const bodyW = formatBodyWeightLine(race.horse_weight, race.weight_change);
  const hasSummaryRow = Boolean(
    race.raceLevel?.level || race.raceLevel?.levelLabel
    || race.jockey || kinryo || sexAge
  );

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
      {/* ヘッダー（常に表示・クリックで開閉）展開時はスクロール中も見えるよう sticky */}
      <div
        className={cn(
          'cursor-pointer transition-colors hover:bg-slate-50',
          isExpanded && 'sticky top-0 z-20 rounded-t-lg bg-white border-b border-slate-200 shadow-sm hover:bg-slate-50',
          !isExpanded && 'rounded-lg overflow-hidden'
        )}
        onClick={onToggle}
      >
        <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 flex-wrap sm:flex-nowrap">
        {/* 開閉アイコン */}
        <span className={cn(
          'text-slate-400 transition-transform text-xs flex-shrink-0',
          isExpanded && 'rotate-90'
        )}>
          ▶
        </span>

        {/* ユーザー印（一覧で常に表示） */}
        {userPredictionMark ? (
          <span
            title="あなたがこのレースで付けた印"
            className={cn(
              'flex-shrink-0 text-[11px] font-black px-1 py-0.5 rounded leading-none tabular-nums',
              userMarkChipClass(userPredictionMark)
            )}
          >
            {userPredictionMark}
          </span>
        ) : (
          <span className="w-5 flex-shrink-0" aria-hidden />
        )}
        
        {/* レースラベル（前走/2走前...） */}
        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded w-12 text-center flex-shrink-0">
          {raceLabel}
        </span>
        
        {/* 日付（クリック不可） */}
        <span className="text-xs tabular-nums w-12 flex-shrink-0 text-slate-600">
          {formatDate(race.date)}
        </span>
        
        {/* 場所 + 距離（隣接させる） */}
        <span className="text-xs text-slate-700 flex-shrink-0 whitespace-nowrap">
          {race.place || '-'}
        </span>
        <span className="text-xs text-slate-600 flex-shrink-0 whitespace-nowrap tabular-nums">
          <span className={surface === '芝' ? 'text-green-600' : 'text-amber-700'}>{surface}</span>
          {dist}m
        </span>
        
        {/* レース名 + 勝ち馬名（馬別メモの抜粋は折りたたみ2行目へ） */}
        <span className="text-xs text-slate-800 truncate min-w-0 flex-1">
          {raceName}
          {winnerName && (
            <span className="text-slate-400 ml-1">({winnerName})</span>
          )}
          {horseMemo && isExpanded && (
            <span className="ml-1.5 text-amber-500 text-[10px]" title={horseMemo}>✏️</span>
          )}
        </span>
        
        {/* 同走バッジ */}
        {sameRaceCount != null && sameRaceCount > 0 && (
          <span className="flex-shrink-0 text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-300 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
            {sameRaceCount}頭同走
          </span>
        )}
        
        {/* 人気 → 着順 */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <span className="text-xs text-slate-500 tabular-nums">{toHalfWidth(race.popularity || '-')}人</span>
          <span className="text-slate-400 text-[10px]">→</span>
          <span className={cn('text-sm font-semibold tabular-nums', getFinishColor(race.finish_position || ''))}>
            {toHalfWidth(race.finish_position || '-')}着
          </span>
        </div>
        
        {/* 着差 */}
        <span className="text-xs text-slate-500 w-8 text-right flex-shrink-0 tabular-nums">
          {formatMargin(race.margin)}
        </span>

        {/* 馬体重・増減（着順行の続き） */}
        <span
          className="text-[10px] text-slate-500 w-[3.25rem] shrink-0 text-right tabular-nums"
          title="馬体重(増減)"
        >
          {bodyW || '—'}
        </span>
        
        {/* 巻き返し指数（プレミアムのみ・アイコン形式） */}
        {isPremium && race.indices?.makikaeshi != null && (
          <span className={cn(
            'text-xs font-medium w-8 text-right flex-shrink-0 tabular-nums',
            getMakikaeshiColor(race.indices.makikaeshi)
          )}>
            {race.indices.makikaeshi.toFixed(1)}
          </span>
        )}
        
        {/* 評価バッジ（プレミアムのみ） */}
        {isPremium && badges.length > 0 && (
          <BadgeDots badges={badges} className="flex-shrink-0" />
        )}
        
        {/* メモアイコン */}
        {hasMemo && (
          <button
            onClick={(e) => { e.stopPropagation(); onMemoClick?.(); }}
            className="text-amber-500 text-xs flex-shrink-0"
          >
            📝
          </button>
        )}
        
        {/* netkeibaリンク */}
        {race.race_id && race.race_id.length >= 16 && (
          <a
            href={buildNetkeibaUrl(race.race_id) ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-slate-400 hover:text-blue-500 text-xs flex-shrink-0 leading-none"
            title="netkeibaでレース結果・動画を見る"
          >
            📺
          </a>
        )}
        </div>

        {/* 展開前: 馬場メモ（簡易タグ）＋馬別メモ */}
        {!isExpanded &&
          (collapsedBabaTags.length > 0 ||
            (collapsedBabaFreeLine && collapsedBabaFreeLine.trim()) ||
            horseMemo) && (
            <div className="px-2 sm:px-3 pb-1.5 pt-1 border-t border-dashed border-slate-100 flex flex-wrap gap-1 items-start">
              {collapsedBabaTags.length > 0 && (
                <span className="text-[9px] font-bold text-green-700 bg-green-50 px-1 py-0.5 rounded flex-shrink-0">
                  🌿
                </span>
              )}
              {collapsedBabaTags.map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] px-1.5 py-0.5 bg-green-50 text-green-800 rounded-full border border-green-200 whitespace-nowrap max-w-[8rem] truncate"
                  title={tag}
                >
                  {tag}
                </span>
              ))}
              {collapsedBabaFreeLine && collapsedBabaFreeLine.trim() && collapsedBabaTags.length === 0 && (
                <span className="text-[9px] text-green-800 line-clamp-1 min-w-0 flex-1" title={collapsedBabaFreeLine}>
                  🌿 {collapsedBabaFreeLine}
                </span>
              )}
              {collapsedBabaFreeLine && collapsedBabaFreeLine.trim() && collapsedBabaTags.length > 0 && (
                <span
                  className="text-[9px] text-slate-500 line-clamp-1 w-full basis-full pl-0.5"
                  title={collapsedBabaFreeLine}
                >
                  {collapsedBabaFreeLine}
                </span>
              )}
              {horseMemo && (
                <span
                  className="text-[9px] text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded max-w-full line-clamp-2 min-w-0 flex-1 basis-full sm:basis-auto sm:max-w-[14rem]"
                  title={horseMemo}
                >
                  ✏️ {horseMemo}
                </span>
              )}
            </div>
          )}

        {hasSummaryRow && (
          <div className="px-3 pb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-slate-100 text-[10px] text-slate-600 leading-snug">
            {(race.raceLevel?.level || race.raceLevel?.levelLabel) && (
              <span className={cn('font-medium px-1 py-0.5 rounded', getBadgeColor(raceLevelToBadgeLevel(race.raceLevel)))}>
                Lv{race.raceLevel.levelLabel || race.raceLevel.level}
              </span>
            )}
            {(race.jockey || kinryo) && (
              <span className="text-slate-700">
                {race.jockey || '-'}{kinryo ? `(${toHalfWidth(kinryo)})` : ''}
              </span>
            )}
            {sexAge && <span className="text-slate-500">{sexAge}</span>}
          </div>
        )}
      </div>
      
      {/* 詳細（展開時のみ表示） */}
      {isExpanded && (
        <div className="px-4 py-3 bg-slate-50 rounded-b-lg border-t border-slate-100">
          <div className="grid grid-cols-2 gap-4">
            {/* 左列：レース情報 */}
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-slate-500 w-12">騎手</span>
                <span className="text-slate-800">{race.jockey || '-'}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-slate-500 w-12">通過</span>
                <span className="text-slate-800 tabular-nums">{getPassingOrder(race)}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-slate-500 w-12">タイム</span>
                <span className="text-slate-800 tabular-nums">{formatFinishTime(race.finish_time) || '-'}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-slate-500 w-12">馬場</span>
                <span className="text-slate-800">
                  {race.track_condition || '-'}
                  {race.indices?.cushion != null && ` / クッション ${race.indices.cushion.toFixed(1)}`}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-slate-500 w-12">馬体重</span>
                <span className="text-slate-800 tabular-nums">
                  {formatBodyWeightLine(race.horse_weight, race.weight_change) || '—'}
                </span>
              </div>
            </div>
            
            {/* 右列：指数（プレミアムのみ） */}
            {isPremium && (
              <div>
                {/* 指数グリッド */}
                <div className="grid grid-cols-4 gap-1 text-center mb-3">
                  <div className="bg-white rounded p-1.5 border border-slate-200">
                    <div className="text-[10px] text-slate-500">巻返し</div>
                    <div className={cn('text-sm font-semibold tabular-nums', getMakikaeshiColor(race.indices?.makikaeshi))}>
                      {race.indices?.makikaeshi != null ? race.indices.makikaeshi.toFixed(1) : '-'}
                    </div>
                  </div>
                  <div className="bg-white rounded p-1.5 border border-slate-200">
                    <div className="text-[10px] text-slate-500">L4F</div>
                    <div className="text-sm font-semibold text-slate-700 tabular-nums">
                      {race.indices?.L4F != null ? race.indices.L4F.toFixed(1) : '-'}
                    </div>
                  </div>
                  <div className="bg-white rounded p-1.5 border border-slate-200">
                    <div className="text-[10px] text-slate-500">T2F</div>
                    <div className="text-sm font-semibold text-slate-700 tabular-nums">
                      {race.indices?.T2F != null ? race.indices.T2F.toFixed(1) : '-'}
                    </div>
                  </div>
                  <div className="bg-white rounded p-1.5 border border-slate-200">
                    <div className="text-[10px] text-slate-500">ポテ</div>
                    <div className="text-sm font-semibold text-slate-700 tabular-nums">
                      {race.indices?.potential != null ? race.indices.potential.toFixed(1) : '-'}
                    </div>
                  </div>
                </div>
                
                {/* 評価バッジ */}
                {badges.length > 0 && (
                  <BadgeLabels badges={badges} />
                )}
              </div>
            )}
          </div>
          
          {/* ラップタイム（後半4F強調） */}
          {race.lap_time && (() => {
            const { first, last4, first3Sum, first5Sum, last4Sum, last5Sum } = parseLapTime(race.lap_time);
            return (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-500 mr-1">ラップ</span>
                  {race.race_id && onAnalysisClick && (
                    <button
                      onClick={e => { e.stopPropagation(); onAnalysisClick(race.race_id!); }}
                      className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 transition-colors"
                      title="タイム分析を開く"
                    >
                      📊 タイム分析
                    </button>
                  )}
                  {first3Sum != null && (
                    <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-1 py-0.5 rounded">前半3F {first3Sum.toFixed(1)}</span>
                  )}
                  {first5Sum != null && (
                    <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-1 py-0.5 rounded">前半5F {first5Sum.toFixed(1)}</span>
                  )}
                  {last4Sum != null && (
                    <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1 py-0.5 rounded">後半4F {last4Sum.toFixed(1)}</span>
                  )}
                  {last5Sum != null && (
                    <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1 py-0.5 rounded">後半5F {last5Sum.toFixed(1)}</span>
                  )}
                </div>
                <div className="text-[10px] sm:text-xs font-mono overflow-x-auto whitespace-nowrap bg-white rounded px-2 py-1 border border-slate-200 leading-relaxed">
                  {first.length > 0 && (
                    <span className="text-slate-500">
                      {first.map(l => l.toFixed(1)).join('-')}-
                    </span>
                  )}
                  {last4.length > 0 && (
                    <span className="text-emerald-700 font-semibold">
                      {last4.map(l => l.toFixed(1)).join('-')}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 馬場メモ（当該レース日・開催場・芝ダートに紐づく） */}
          {(() => {
            const { surface } = getSurfaceAndDistance(race.distance);
            return <BabaMemoChip date={race.date} place={race.place} surface={surface} />;
          })()}

          {/* 今走メモ */}
          {horseMemo && (
            <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 whitespace-pre-wrap">
              <span className="font-semibold mr-1">✏️ 当時メモ:</span>{horseMemo}
            </div>
          )}

          {/* 出走馬一覧 */}
          {!hideEntrants && race.race_id && (
            <RaceEntrantsSection
              raceId={race.race_id}
              raceKey={deriveHorseRaceMemoKey(race)}
              currentRaceHorses={currentRaceHorses}
              currentHorseName={currentHorseName}
              onCountUpdate={onSameRaceCountUpdate}
            />
          )}
        </div>
      )}
    </div>
  );
}
const CompactRaceRowMemo = React.memo(CompactRaceRow);

// ========================================
// モバイル向け: 横スクロールカード（横展開版）
// ========================================

interface MobileRaceCardProps {
  race: PastRaceData;
  index: number;
  isPremium: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onDateClick?: (date: string) => void;
  isClickable?: boolean;
  hasMemo?: boolean;
  onMemoClick?: () => void;
  winnerName?: string;
  horseMemo?: string;
  sameRaceCount?: number;
  userPredictionMark?: string | null;
  collapsedBabaTags?: string[];
  collapsedBabaFreeLine?: string | null;
}

function MobileRaceCard({ 
  race, 
  index, 
  isPremium,
  isExpanded,
  onToggle,
  onDateClick,
  isClickable,
  hasMemo,
  onMemoClick,
  winnerName,
  horseMemo,
  sameRaceCount,
  userPredictionMark,
  collapsedBabaTags = [],
  collapsedBabaFreeLine,
}: MobileRaceCardProps) {
  const { surface, dist } = getSurfaceAndDistance(race.distance);
  const badges = useMemo(() => isPremium ? calculateEvaluationBadges(race) : [], [race, isPremium]);
  const raceLabel = index === 0 ? '前走' : `${index + 1}走前`;
  const kinryoM = (race.weight_carried || '').trim();
  const sexAgeM = [formatSexAbbrev(race.gender), toHalfWidth((race.age || '').trim())].filter(Boolean).join('');
  const bodyWM = formatBodyWeightLine(race.horse_weight, race.weight_change);
  const hasLv = Boolean(race.raceLevel?.level || race.raceLevel?.levelLabel);
  
  return (
    <div className="flex-shrink-0 w-[11.25rem] min-w-[11.25rem] sm:w-36 snap-start overflow-hidden">
      <div 
        className={cn(
          'bg-white border rounded-xl shadow-sm transition-all duration-150 active:scale-[0.97] cursor-pointer',
          isExpanded
            ? 'border-emerald-400 bg-emerald-50'
            : badges.some(b => b.level === 'high') ? 'border-red-300' : 'border-slate-200'
        )}
        onClick={onToggle}
      >
        <div className="p-2.5">
          {/* ヘッダー: ラベル + 印 + 日付 + メモバッジ */}
          <div className="flex items-center justify-between mb-1.5 gap-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[9px] font-medium text-slate-500 bg-slate-100 px-1 py-0.5 rounded shrink-0">
                {raceLabel}
              </span>
              {userPredictionMark && (
                <span
                  title="あなたがこのレースで付けた印"
                  className={cn(
                    'text-[10px] font-black px-1 py-0.5 rounded leading-none shrink-0 tabular-nums',
                    userMarkChipClass(userPredictionMark)
                  )}
                >
                  {userPredictionMark}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {horseMemo && (
                <span
                  className="text-[8px] bg-amber-200 text-amber-700 font-bold px-1 py-0.5 rounded leading-tight border border-amber-300"
                  title={`レース別馬メモ: ${horseMemo}`}
                >
                  ✏️メモ
                </span>
              )}
              <span className="text-[9px] tabular-nums text-slate-500">
                {formatDate(race.date)}
              </span>
            </div>
          </div>

          {/* 展開前: 馬場メモタグ + 馬別メモ */}
          {!isExpanded &&
            (collapsedBabaTags.length > 0 ||
              (collapsedBabaFreeLine && collapsedBabaFreeLine.trim()) ||
              horseMemo) && (
              <div className="mb-1.5 space-y-0.5">
                {(collapsedBabaTags.length > 0 || (collapsedBabaFreeLine && collapsedBabaTags.length === 0)) && (
                  <div className="flex flex-wrap gap-0.5 items-center">
                    {collapsedBabaTags.length > 0 && (
                      <span className="text-[7px] font-bold text-green-700">🌿</span>
                    )}
                    {collapsedBabaTags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[7px] px-1 py-0.5 bg-green-50 text-green-800 rounded border border-green-200 max-w-[5.5rem] truncate"
                        title={tag}
                      >
                        {tag}
                      </span>
                    ))}
                    {collapsedBabaFreeLine && collapsedBabaTags.length === 0 && (
                      <span className="text-[7px] text-green-800 line-clamp-2" title={collapsedBabaFreeLine}>
                        🌿 {collapsedBabaFreeLine}
                      </span>
                    )}
                  </div>
                )}
                {collapsedBabaFreeLine && collapsedBabaTags.length > 0 && (
                  <div className="text-[7px] text-slate-500 line-clamp-2" title={collapsedBabaFreeLine}>
                    {collapsedBabaFreeLine}
                  </div>
                )}
                {horseMemo && (
                  <div className="text-[8px] text-amber-900 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded leading-tight line-clamp-3" title={horseMemo}>
                    ✏️ {horseMemo}
                  </div>
                )}
              </div>
            )}
          
          {/* 場所 + 距離 */}
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-medium text-slate-800">{race.place}</span>
            <span className="text-[10px] text-slate-600">
              <span className={surface === '芝' ? 'text-green-600' : 'text-amber-700'}>{surface}</span>
              {dist}
            </span>
          </div>

          {/* レース名 + レースレベル */}
          <div className="mb-1 space-y-0.5">
            <div className="text-[9px] text-slate-600 truncate leading-tight font-medium">
              {race.race_name || race.class_name || ''}
            </div>
            {hasLv && (
              <div className={cn('text-[8px] font-medium px-1 py-0.5 rounded inline-block max-w-full truncate', getBadgeColor(raceLevelToBadgeLevel(race.raceLevel)))}>
                Lv{race.raceLevel!.levelLabel || race.raceLevel!.level}
              </div>
            )}
          </div>

          {/* 騎手・斤量・性齢（展開前に一覧）※馬体重は着順行に表示 */}
          <div className="text-[8px] text-slate-600 mb-1 space-y-0.5 leading-tight">
            {(race.jockey || kinryoM) && (
              <div className="truncate">
                <span className="text-slate-500">騎</span>
                {race.jockey || '-'}{kinryoM ? `(${toHalfWidth(kinryoM)})` : ''}
              </div>
            )}
            {sexAgeM && (
              <div className="text-slate-500">{sexAgeM}</div>
            )}
          </div>

          {/* 勝ち馬名 */}
          {winnerName && (
            <div className="text-[9px] text-slate-400 mb-1 truncate">
              1着: {winnerName}
            </div>
          )}
          
          {/* 同走バッジ */}
          {sameRaceCount != null && sameRaceCount > 0 && (
            <div className="mb-1">
              <span className="text-[8px] bg-emerald-100 text-emerald-700 border border-emerald-300 px-1 py-0.5 rounded-full font-bold leading-tight">
                {sameRaceCount}頭同走
              </span>
            </div>
          )}
          
          {/* 着順 + 人気 + 通過順 + 馬体重 */}
          <div className="flex items-baseline justify-between gap-1 mb-1 min-w-0">
            <div className="flex items-baseline gap-1 min-w-0 flex-wrap">
              <span className={cn('text-lg font-bold tabular-nums', getFinishColor(race.finish_position || ''))}>
                {toHalfWidth(race.finish_position || '-')}着
              </span>
              <span className="text-[10px] text-slate-500">
                {toHalfWidth(race.popularity || '-')}人
              </span>
              {getPassingOrder(race) !== '-' && (
                <span className="text-[9px] text-slate-400 tabular-nums">
                  通{getPassingOrder(race)}
                </span>
              )}
            </div>
            <span
              className="text-[9px] text-slate-500 tabular-nums shrink-0"
              title="馬体重(増減)"
            >
              {bodyWM || '—'}
            </span>
          </div>
          
          {/* 着差 */}
          <div className="text-[10px] text-slate-500 mb-1.5 tabular-nums">
            {formatMargin(race.margin)}
          </div>
          
          {/* 評価バッジ + 選択インジケーター */}
          <div className="flex items-center justify-between">
            {isPremium && badges.length > 0 ? (
              <BadgeDots badges={badges} />
            ) : (
              <span />
            )}
            <div className="flex items-center gap-1">
              {hasMemo && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMemoClick?.(); }}
                  className="text-amber-500 text-[10px]"
                >
                  📝
                </button>
              )}
              {race.race_id && race.race_id.length >= 16 && (
                <a
                  href={buildNetkeibaUrl(race.race_id) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-slate-400 text-[10px] leading-none"
                  title="netkeibaで動画を見る"
                >
                  📺
                </a>
              )}
              <span className={cn(
                'text-[10px] transition-colors',
                isExpanded ? 'text-emerald-500' : 'text-slate-400'
              )}>
                {isExpanded ? '▼' : '▶'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const MobileRaceCardMemo = React.memo(MobileRaceCard);

// ========================================
// モバイル向け: タップ時に表示する詳細パネル
// ========================================

interface MobileDetailPanelProps {
  race: PastRaceData;
  index: number;
  isPremium: boolean;
  hideEntrants?: boolean;
  horseMemo?: string;
  currentRaceHorses?: string[];
  currentHorseName?: string;
  onSameRaceCountUpdate?: (raceId: string, count: number) => void;
  onAnalysisClick?: (raceId: string) => void;
  onClose: () => void;
}

function MobileDetailPanel({ race, index, isPremium, hideEntrants, horseMemo, currentRaceHorses, currentHorseName, onSameRaceCountUpdate, onAnalysisClick, onClose }: MobileDetailPanelProps) {
  const badges = useMemo(() => isPremium ? calculateEvaluationBadges(race) : [], [race, isPremium]);
  const lapData = parseLapTime(race.lap_time);
  const raceLabel = index === 0 ? '前走' : `${index + 1}走前`;
  const { surface } = getSurfaceAndDistance(race.distance);
  const bodyW = formatBodyWeightLine(race.horse_weight, race.weight_change);

  // ── body スクロールロック（iOS Safari 対応）──
  useBodyScrollLock();

  // マウント時にスクロール位置を先頭に戻す
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollBodyRef.current) {
      scrollBodyRef.current.scrollTop = 0;
    }
  }, [race.race_id]);

  return (
    /* ── フルスクリーンオーバーレイ（ボトムシート） ── */
    <div className="fixed inset-0 z-[970] flex flex-col justify-end">
      {/* 背景タップで閉じる（touch スクロールも止める） */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        onTouchMove={e => e.preventDefault()}
      />

      {/* パネル本体（画面下から75vh） */}
      <div
        className="relative flex flex-col bg-white rounded-t-2xl shadow-2xl overflow-hidden"
        style={{ height: '78svh', maxHeight: '78svh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ─── ヘッダー（常に見える・flex-shrink-0）─── */}
        <div className="flex-shrink-0 bg-white border-b border-emerald-100">
          {/* ドラッグハンドル */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          {/* 馬名行 */}
          {currentHorseName && (
            <div className="px-4 pb-1 text-[11px] font-bold text-emerald-800 truncate bg-emerald-50">
              {currentHorseName}
            </div>
          )}

          {/* レース概要行 */}
          <div className="bg-emerald-50 px-4 py-1.5 flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-semibold text-emerald-700 shrink-0">{raceLabel}</span>
            <span className="text-[9px] text-slate-500 truncate min-w-0 flex-1">
              {formatDateFull(race.date)}　{race.place}　{race.class_name || race.race_name || ''}
            </span>
            {race.race_id && race.race_id.length >= 16 && (
              <a
                href={buildNetkeibaUrl(race.race_id) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 text-[11px] shrink-0 leading-none"
                title="netkeibaで動画を見る"
                onClick={e => e.stopPropagation()}
              >
                📺
              </a>
            )}
          </div>

          {/* 着順・人気・着差・タイム行 */}
          <div className="px-4 py-2 flex items-center gap-3 bg-white flex-wrap">
            <span className={cn('text-2xl font-bold tabular-nums leading-none', getFinishColor(race.finish_position || ''))}>
              {toHalfWidth(race.finish_position || '-')}着
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {toHalfWidth(race.popularity || '-')}人気
            </span>
            {formatMargin(race.margin) !== '-' && (
              <span className="text-xs text-slate-500 tabular-nums">
                {formatMargin(race.margin)}
              </span>
            )}
            <span className="text-sm font-semibold text-slate-700 tabular-nums ml-auto">
              {formatFinishTime(race.finish_time) || '-'}
            </span>
            <button
              onClick={onClose}
              className="ml-1 shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-base leading-none"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        </div>

        {/* ─── スクロール可能なボディ ─── */}
        <div
          ref={scrollBodyRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-none p-4 space-y-3"
          style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' } as React.CSSProperties}
        >
          {/* 今走メモ */}
          {horseMemo && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 whitespace-pre-wrap leading-snug">
              <span className="font-semibold mr-1">✏️</span>{horseMemo}
            </div>
          )}

          {/* 基本情報グリッド（2列） */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            {race.jockey && (
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-slate-400 shrink-0 w-8">騎手</span>
                <span className="text-slate-800 truncate font-medium">{race.jockey}</span>
              </div>
            )}
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-slate-400 shrink-0 w-8">通過</span>
              <span className="text-slate-800 tabular-nums">{getPassingOrder(race)}</span>
            </div>
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-slate-400 shrink-0 w-8">馬場</span>
              <span className="text-slate-800">
                {race.track_condition || '-'}
                {race.indices?.cushion != null && (
                  <span className="text-slate-500"> / {race.indices.cushion.toFixed(1)}</span>
                )}
              </span>
            </div>
            {bodyW && (
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-slate-400 shrink-0 w-8">体重</span>
                <span className="text-slate-800 tabular-nums">{bodyW}</span>
              </div>
            )}
          </div>

          {/* 指数チップ（プレミアム） */}
          {isPremium && (
            <div className="flex gap-2">
              {race.indices?.makikaeshi != null && (
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-center">
                  <div className="text-[9px] text-slate-400 leading-none mb-1">巻返し</div>
                  <div className={cn('text-base font-bold tabular-nums leading-none', getMakikaeshiColor(race.indices.makikaeshi))}>
                    {race.indices.makikaeshi.toFixed(1)}
                  </div>
                </div>
              )}
              {race.indices?.L4F != null && (
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-center">
                  <div className="text-[9px] text-slate-400 leading-none mb-1">L4F</div>
                  <div className="text-base font-bold tabular-nums text-slate-700 leading-none">
                    {race.indices.L4F.toFixed(1)}
                  </div>
                </div>
              )}
              {race.indices?.T2F != null && (
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-center">
                  <div className="text-[9px] text-slate-400 leading-none mb-1">T2F</div>
                  <div className="text-base font-bold tabular-nums text-slate-700 leading-none">
                    {race.indices.T2F.toFixed(1)}
                  </div>
                </div>
              )}
              {race.indices?.potential != null && (
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-center">
                  <div className="text-[9px] text-slate-400 leading-none mb-1">ポテ</div>
                  <div className="text-base font-bold tabular-nums text-slate-700 leading-none">
                    {race.indices.potential.toFixed(1)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ラップタイム */}
          {race.lap_time && lapData.all.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-slate-500 font-medium">ラップ</span>
                {race.race_id && onAnalysisClick && (
                  <button
                    onClick={e => { e.stopPropagation(); onClose(); onAnalysisClick(race.race_id!); }}
                    className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200"
                  >
                    📊 タイム分析
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {lapData.first3Sum != null && (
                  <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded">
                    前3F {lapData.first3Sum.toFixed(1)}
                  </span>
                )}
                {lapData.first5Sum != null && (
                  <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded">
                    前5F {lapData.first5Sum.toFixed(1)}
                  </span>
                )}
                {lapData.last4Sum != null && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded">
                    後4F {lapData.last4Sum.toFixed(1)}
                  </span>
                )}
                {lapData.last5Sum != null && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded">
                    後5F {lapData.last5Sum.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto scrollbar-hide">
                <div className="text-[11px] font-mono whitespace-nowrap">
                  {lapData.first.length > 0 && (
                    <span className="text-slate-400">
                      {lapData.first.map(l => l.toFixed(1)).join('-')}-
                    </span>
                  )}
                  {lapData.last4.length > 0 && (
                    <span className="text-emerald-700 font-semibold">
                      {lapData.last4.map(l => l.toFixed(1)).join('-')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 評価バッジ */}
          {isPremium && badges.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <BadgeLabels badges={badges} />
            </div>
          )}

          {/* 馬場メモ */}
          <BabaMemoChip date={race.date} place={race.place} surface={surface} />

          {/* 出走馬一覧 */}
          {!hideEntrants && race.race_id && (
            <RaceEntrantsSection
              raceId={race.race_id}
              raceKey={deriveHorseRaceMemoKey(race)}
              currentRaceHorses={currentRaceHorses}
              currentHorseName={currentHorseName}
              onCountUpdate={onSameRaceCountUpdate}
            />
          )}

          {/* 下部の余白（safe area inset 対応） */}
          <div style={{ height: 'max(1rem, env(safe-area-inset-bottom, 0px))' }} />
        </div>
      </div>
    </div>
  );
}

// ========================================
// メインコンポーネント（内部・再利用用）
// ========================================

function PastRaceDetailInner({
  pastRaces,
  isPremium = false,
  onDateClick,
  isDateClickable,
  raceMemos,
  onMemoClick,
  hideEntrants = false,
  horseRaceMemos,
  currentRaceHorses,
  currentHorseName,
  hideCollapseFab = false,
  collapseFabAvoidGlobalFab = false,
}: PastRaceDetailProps) {
  const { status } = useSession();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [mobileExpandedIndex, setMobileExpandedIndex] = useState<number | null>(null);
  const [winnersMap, setWinnersMap] = useState<Record<string, string>>({});
  // 同走頭数マップ: race_id → 今回の出走馬と同走した頭数（出走馬一覧を展開した際に更新）
  const [sameRaceCountMap, setSameRaceCountMap] = useState<Map<string, number>>(new Map());
  // タイム分析モーダル
  const [analysisRaceId, setAnalysisRaceId] = useState<string | null>(null);
  // レースキー|馬番 → ユーザーが保存した印（/api/user/predictions）
  const [userPredictionMarks, setUserPredictionMarks] = useState<Map<string, string>>(new Map());
  // 馬場メモキャッシュキー（MMDD::場::芝|ダ）→ メモ（ログイン時のみ一括取得）
  const [babaMemoByKey, setBabaMemoByKey] = useState<Map<string, BabaMemoData | null>>(new Map());

  const handleSameRaceCountUpdate = useCallback((raceId: string, count: number) => {
    setSameRaceCountMap(prev => {
      const next = new Map(prev);
      next.set(raceId, count);
      return next;
    });
  }, []);

  // ログイン時: 過去走各行のレースについて、ユーザーが付けた印を一括取得（Hooks は早期 return の前に置く）
  useEffect(() => {
    if (status !== 'authenticated') {
      setUserPredictionMarks(new Map());
      return;
    }
    const list = pastRaces || [];
    const keys = new Set<string>();
    for (const r of list) {
      if (r.date && r.place && r.race_number) {
        keys.add(`${r.date}_${r.place}_${r.race_number}`);
      }
    }
    if (keys.size === 0) {
      setUserPredictionMarks(new Map());
      return;
    }
    const q = Array.from(keys).join(',');
    let cancelled = false;
    fetch(`/api/user/predictions?raceKeys=${encodeURIComponent(q)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.predictions?.length) {
          if (!cancelled) setUserPredictionMarks(new Map());
          return;
        }
        const m = new Map<string, string>();
        for (const p of data.predictions as { race_key: string; horse_number: string; mark: string }[]) {
          if (!p.race_key || p.horse_number == null || !p.mark) continue;
          const hn = normalizeHorseNumberForPrediction(String(p.horse_number));
          if (!hn) continue;
          m.set(`${p.race_key}|${hn}`, p.mark);
        }
        setUserPredictionMarks(m);
      })
      .catch(() => {
        if (!cancelled) setUserPredictionMarks(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [pastRaces, status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setBabaMemoByKey(new Map());
      return;
    }
    const list = pastRaces || [];
    const keys = new Set<string>();
    for (const r of list) {
      const k = babaMemoCacheKeyForRace(r);
      if (k) keys.add(k);
    }
    if (keys.size === 0) {
      setBabaMemoByKey(new Map());
      return;
    }
    let cancelled = false;
    const fetchOne = async (key: string): Promise<[string, BabaMemoData | null]> => {
      const parts = key.split('::');
      if (parts.length < 3) return [key, null];
      const babaDate = parts[0];
      const place = parts[1];
      const surface = parts[2];
      const trackType = surfaceToTrackType(surface);
      try {
        const res = await fetch(
          `/api/user/baba-memos?date=${encodeURIComponent(babaDate)}&place=${encodeURIComponent(place)}&trackType=${encodeURIComponent(trackType)}`
        );
        if (!res.ok) return [key, null];
        const data = (await res.json()) as { memo?: BabaMemoData | null };
        return [key, data.memo ?? null];
      } catch {
        return [key, null];
      }
    };
    Promise.all(Array.from(keys).map(fetchOne)).then((entries) => {
      if (cancelled) return;
      setBabaMemoByKey(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [pastRaces, status]);

  // race_id が存在する過去走の勝ち馬を一括取得（1回のAPIコール）
  useEffect(() => {
    const list = pastRaces || [];
    const raceIds = list
      .map(r => r.race_id)
      .filter((id): id is string => !!id);
    if (raceIds.length === 0) {
      setWinnersMap({});
      return;
    }
    fetch(`/api/race-winners?raceIds=${raceIds.map(encodeURIComponent).join(',')}`)
      .then(r => r.ok ? r.json() : { winners: {} })
      .then(data => setWinnersMap(data.winners || {}))
      .catch(() => {});
  }, [pastRaces]);

  const isAnyExpanded = expandedIndex !== null || mobileExpandedIndex !== null;

  useEffect(() => {
    if (!isAnyExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedIndex(null);
        setMobileExpandedIndex(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAnyExpanded]);

  if (!pastRaces || pastRaces.length === 0) {
    return (
      <div className="text-slate-500 text-sm p-4 text-center">
        過去走データなし
      </div>
    );
  }

  const displayRaces = pastRaces;

  return (
    <div className="space-y-3">
      {/* PC向け: アコーディオン形式 */}
      <div className="hidden sm:block space-y-1">
        {displayRaces.map((race, idx) => {
          const raceKey = race.date && race.place && race.race_number
            ? `${race.date}_${race.place}_${race.race_number}`
            : null;
          const hasMemo = raceKey ? raceMemos?.has(raceKey) : false;
          const memoContent = raceKey ? raceMemos?.get(raceKey) : null;
          const horseRaceMemoKey = deriveHorseRaceMemoKey(race);
          const horseMemo = horseRaceMemoKey ? horseRaceMemos?.get(horseRaceMemoKey) : undefined;
          const babaKey = babaMemoCacheKeyForRace(race);
          const babaMemoRow = babaKey ? babaMemoByKey.get(babaKey) ?? null : null;
          const collapsedBabaTags = buildBabaMemoTagList(babaMemoRow);
          const collapsedBabaFreeLine = babaMemoRow?.free_memo?.trim() ? babaMemoRow.free_memo.trim() : null;

          return (
            <CompactRaceRowMemo
              key={`${race.date}-${race.place}-${idx}`}
              race={race}
              index={idx}
              isPremium={isPremium}
              isExpanded={expandedIndex === idx}
              onToggle={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
              onDateClick={onDateClick}
              isClickable={isDateClickable?.(race.date)}
              hasMemo={hasMemo}
              hideEntrants={hideEntrants}
              winnerName={race.race_id ? winnersMap[race.race_id] : undefined}
              horseMemo={horseMemo}
              currentRaceHorses={currentRaceHorses}
              currentHorseName={currentHorseName}
              sameRaceCount={race.race_id ? sameRaceCountMap.get(race.race_id) : undefined}
              onSameRaceCountUpdate={handleSameRaceCountUpdate}
              onAnalysisClick={setAnalysisRaceId}
              onMemoClick={() => {
                if (raceKey && memoContent) {
                  onMemoClick?.(
                    raceKey,
                    `${race.place} ${race.race_number}R ${race.class_name || ''}`,
                    memoContent
                  );
                }
              }}
              userPredictionMark={lookupUserPredictionMark(race, userPredictionMarks)}
              collapsedBabaTags={collapsedBabaTags}
              collapsedBabaFreeLine={collapsedBabaFreeLine}
            />
          );
        })}
      </div>

      {/* モバイル向け: 横スクロールカード + 下部詳細パネル */}
      <div className="sm:hidden overflow-hidden">
        <div
          className="flex gap-2 overflow-x-scroll pb-2 snap-x snap-mandatory scrollbar-hide"
          style={{ overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
        >
          {displayRaces.map((race, idx) => {
            const raceKey = race.date && race.place && race.race_number
              ? `${race.date}_${race.place}_${race.race_number}`
              : null;
            const hasMemo = raceKey ? raceMemos?.has(raceKey) : false;
            const memoContent = raceKey ? raceMemos?.get(raceKey) : null;
            const horseRaceMemoKey = deriveHorseRaceMemoKey(race);
            const horseMemo = horseRaceMemoKey ? horseRaceMemos?.get(horseRaceMemoKey) : undefined;
            const babaKey = babaMemoCacheKeyForRace(race);
            const babaMemoRow = babaKey ? babaMemoByKey.get(babaKey) ?? null : null;
            const collapsedBabaTags = buildBabaMemoTagList(babaMemoRow);
            const collapsedBabaFreeLine = babaMemoRow?.free_memo?.trim() ? babaMemoRow.free_memo.trim() : null;

            return (
              <MobileRaceCardMemo
                key={race.race_id || `${race.date}-${race.place}-${race.race_number ?? idx}`}
                race={race}
                index={idx}
                isPremium={isPremium}
                isExpanded={mobileExpandedIndex === idx}
                onToggle={() => setMobileExpandedIndex(mobileExpandedIndex === idx ? null : idx)}
                onDateClick={onDateClick}
                isClickable={isDateClickable?.(race.date)}
                hasMemo={hasMemo}
                winnerName={race.race_id ? winnersMap[race.race_id] : undefined}
                horseMemo={horseMemo}
                sameRaceCount={race.race_id ? sameRaceCountMap.get(race.race_id) : undefined}
                onMemoClick={() => {
                  if (raceKey && memoContent) {
                    onMemoClick?.(
                      raceKey,
                      `${race.place} ${race.race_number}R ${race.class_name || ''}`,
                      memoContent
                    );
                  }
                }}
                userPredictionMark={lookupUserPredictionMark(race, userPredictionMarks)}
                collapsedBabaTags={collapsedBabaTags}
                collapsedBabaFreeLine={collapsedBabaFreeLine}
              />
            );
          })}
        </div>

        <p className="text-[10px] text-slate-400 text-center mt-1">
          ← スワイプして前後を確認 →
        </p>

        {mobileExpandedIndex !== null && displayRaces[mobileExpandedIndex] && (
          <MobileDetailPanel
            race={displayRaces[mobileExpandedIndex]}
            index={mobileExpandedIndex}
            isPremium={isPremium}
            hideEntrants={hideEntrants}
            horseMemo={(() => {
              const key = deriveHorseRaceMemoKey(displayRaces[mobileExpandedIndex]);
              return key ? horseRaceMemos?.get(key) : undefined;
            })()}
            currentRaceHorses={currentRaceHorses}
            currentHorseName={currentHorseName}
            onSameRaceCountUpdate={handleSameRaceCountUpdate}
            onAnalysisClick={setAnalysisRaceId}
            onClose={() => setMobileExpandedIndex(null)}
          />
        )}
      </div>

      {!isPremium && (
        <div className="text-center py-2">
          <span className="text-[10px] text-slate-400">
            🔒 評価バッジ・指数はプレミアム機能です
          </span>
        </div>
      )}

      {/* タイム分析モーダル */}
      {analysisRaceId && (
        <RaceTimeAnalysisModal
          raceId={analysisRaceId}
          onClose={() => setAnalysisRaceId(null)}
        />
      )}

      {/* 展開中のみ: 詳細を閉じる（長いスクロール時も操作できるよう固定表示） */}
      {!hideCollapseFab && isAnyExpanded && (
        <button
          type="button"
          className={cn(
            'fixed z-[960] flex items-center gap-1.5 rounded-full bg-emerald-600 text-white shadow-lg px-3.5 py-2.5 text-xs font-semibold hover:bg-emerald-700 active:scale-[0.98] transition-colors',
            'bottom-[max(1rem,env(safe-area-inset-bottom,0px))] sm:bottom-6',
            collapseFabAvoidGlobalFab
              ? 'left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:right-[7.25rem]'
              : 'right-4'
          )}
          onClick={() => {
            setExpandedIndex(null);
            setMobileExpandedIndex(null);
          }}
          title="過去走の詳細を閉じる（Esc でも閉じられます）"
          aria-label="過去走の詳細を閉じる"
        >
          <span className="text-sm leading-none" aria-hidden>
            ▲
          </span>
          閉じる
        </button>
      )}
    </div>
  );
}

// ========================================
// 公開メインコンポーネント
// ========================================

export default function PastRaceDetail(props: PastRaceDetailProps) {
  return <PastRaceDetailInner {...props} />;
}
