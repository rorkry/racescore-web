'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';

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
}

// ========================================
// ユーティリティ関数
// ========================================

function toHalfWidth(str: string): string {
  return str.replace(/[！-～]/g, s =>
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
}

// 今走メモのキーを生成（race_id先頭8桁 + 場所 + R番号）
function deriveHorseRaceMemoKey(race: PastRaceData): string | null {
  if (!race.race_id) return null;
  const yyyymmdd = race.race_id.substring(0, 8);
  const place = (race.place || '').replace(/[0-9０-９]+回.*$/, '').trim();
  const raceNum = race.race_number || '';
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
  first: number[]; 
  last4: number[];
  last4Sum: number | null;
} {
  if (!lapTime) return { all: [], first: [], last4: [], last4Sum: null };
  
  const laps = lapTime.split('-').map(l => parseFloat(l.trim())).filter(l => !isNaN(l));
  if (laps.length < 4) return { all: laps, first: laps, last4: [], last4Sum: null };
  
  const last4 = laps.slice(-4);
  const first = laps.slice(0, -4);
  const last4Sum = last4.reduce((sum, v) => sum + v, 0);
  
  return { all: laps, first, last4, last4Sum };
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
    let badgeLevel: BadgeLevel = 'none';
    let label = level;
    
    if (level === 'S+' || level === 'S' || level === 'A') {
      badgeLevel = 'high';
    } else if (level === 'B') {
      badgeLevel = 'mid';
    } else if (level === 'C' || level === 'LOW') {
      badgeLevel = 'low';
    }
    
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
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 resize-none h-14 focus:outline-none focus:border-emerald-300"
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

function HorsePastRaceModal({ horseName, onClose }: { horseName: string; onClose: () => void }) {
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
        <div className="overflow-y-auto flex-1 p-4">
          {loading && (
            <div className="text-sm text-slate-400 text-center py-8">読み込み中...</div>
          )}
          {!loading && pastRaces && pastRaces.length > 0 && (
            <PastRaceDetailInner pastRaces={pastRaces} isPremium={false} hideEntrants />
          )}
          {!loading && (!pastRaces || pastRaces.length === 0) && (
            <div className="text-sm text-slate-400 text-center py-8">過去走データなし</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RaceEntrantsSection({ raceId }: { raceId: string }) {
  const [entrants, setEntrants] = useState<RaceEntrant[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/race-entrants?raceId=${encodeURIComponent(raceId)}`)
      .then(r => r.ok ? r.json() : { entrants: [] })
      .then(data => setEntrants(data.entrants || []))
      .catch(() => setEntrants([]))
      .finally(() => setLoading(false));
  }, [raceId]);

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
              return (
                <React.Fragment key={i}>
                  <tr
                    className={cn(
                      e.finish_position === '1' ? 'bg-amber-50' :
                      e.finish_position === '2' ? 'bg-slate-50' :
                      e.finish_position === '3' ? 'bg-orange-50' : ''
                    )}
                  >
                    <td className={cn('py-0.5 pr-1 text-center font-bold', getFinishColor(e.finish_position))}>
                      {toHalfWidth(e.finish_position)}
                    </td>
                    <td className="py-0.5 pr-1">
                      <button
                        onClick={ev => { ev.stopPropagation(); setSelectedHorse(e.horse_name); }}
                        className="text-emerald-600 hover:underline text-left font-medium whitespace-nowrap"
                      >
                        {e.horse_name}
                      </button>
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
                  {/* モバイルのみ2段目: 通過 + 騎手(斤量) */}
                  {hasSecondRow && (
                    <tr className={cn('sm:hidden border-b border-slate-100',
                      e.finish_position === '1' ? 'bg-amber-50' :
                      e.finish_position === '2' ? 'bg-slate-50' :
                      e.finish_position === '3' ? 'bg-orange-50' : ''
                    )}>
                      <td />
                      <td colSpan={6} className="pb-1 text-[8px] text-slate-400 tabular-nums">
                        <span className="flex items-center gap-2 flex-wrap">
                          {passingOrder && <span>通過: {passingOrder}</span>}
                          {e.jockey && (
                            <span className="text-slate-500">
                              {e.jockey}{e.weight_carried ? `(${toHalfWidth(e.weight_carried)})` : ''}
                            </span>
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
}: CompactRaceRowProps) {
  const { surface, dist } = getSurfaceAndDistance(race.distance);
  const badges = useMemo(() => isPremium ? calculateEvaluationBadges(race) : [], [race, isPremium]);
  const raceLabel = index === 0 ? '前走' : `${index + 1}走前`;
  
  // レース名（race_nameがあればそれを使用、なければclass_name）
  const raceName = race.race_name || race.class_name || '-';
  
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      {/* ヘッダー行（常に表示・クリックで開閉） */}
      <div 
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors',
          'hover:bg-slate-50',
          isExpanded && 'bg-slate-50 border-b border-slate-200'
        )}
        onClick={onToggle}
      >
        {/* 開閉アイコン */}
        <span className={cn(
          'text-slate-400 transition-transform text-xs flex-shrink-0',
          isExpanded && 'rotate-90'
        )}>
          ▶
        </span>
        
        {/* レースラベル（前走/2走前...） */}
        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded w-12 text-center flex-shrink-0">
          {raceLabel}
        </span>
        
        {/* 日付（クリック不可） */}
        <span className="text-xs tabular-nums w-12 flex-shrink-0 text-slate-600">
          {formatDate(race.date)}
        </span>
        
        {/* 場所 */}
        <span className="text-xs text-slate-700 w-8 flex-shrink-0">{race.place || '-'}</span>
        
        {/* レース名 + 勝ち馬名 */}
        <span className="text-xs text-slate-800 truncate min-w-0 flex-1">
          {raceName}
          {winnerName && (
            <span className="text-slate-400 ml-1">({winnerName})</span>
          )}
          {horseMemo && (
            <span className="ml-1.5 text-amber-500 text-[10px]" title={horseMemo}>📓</span>
          )}
        </span>
        
        {/* 芝/ダ + 距離 */}
        <span className="text-xs text-slate-600 w-14 flex-shrink-0 tabular-nums">
          <span className={surface === '芝' ? 'text-green-600' : 'text-amber-700'}>{surface}</span>
          {dist}m
        </span>
        
        {/* 人気 → 着順 */}
        <div className="flex items-center gap-1 w-20 flex-shrink-0">
          <span className="text-xs text-slate-500 tabular-nums">{toHalfWidth(race.popularity || '-')}人</span>
          <span className="text-slate-400">→</span>
          <span className={cn('text-sm font-semibold tabular-nums', getFinishColor(race.finish_position || ''))}>
            {toHalfWidth(race.finish_position || '-')}着
          </span>
        </div>
        
        {/* 着差 */}
        <span className="text-xs text-slate-500 w-10 text-right flex-shrink-0 tabular-nums">
          {formatMargin(race.margin)}
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
      </div>
      
      {/* 詳細（展開時のみ表示） */}
      {isExpanded && (
        <div className="px-4 py-3 bg-slate-50">
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
            const { first, last4, last4Sum } = parseLapTime(race.lap_time);
            return (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500">ラップ</span>
                  {last4Sum && (
                    <span className="text-xs font-medium text-emerald-600">
                      後半4F合計: {last4Sum.toFixed(1)}秒
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono overflow-x-auto whitespace-nowrap bg-white rounded px-2 py-1 border border-slate-200">
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
              <span className="font-semibold mr-1">📓 当時メモ:</span>{horseMemo}
            </div>
          )}

          {/* 出走馬一覧 */}
          {!hideEntrants && race.race_id && <RaceEntrantsSection raceId={race.race_id} />}
        </div>
      )}
    </div>
  );
}

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
}: MobileRaceCardProps) {
  const { surface, dist } = getSurfaceAndDistance(race.distance);
  const badges = useMemo(() => isPremium ? calculateEvaluationBadges(race) : [], [race, isPremium]);
  const raceLabel = index === 0 ? '前走' : `${index + 1}走前`;
  
  return (
    <div className="flex-shrink-0 w-32 snap-start overflow-hidden">
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
          {/* ヘッダー: ラベル + 日付 */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-medium text-slate-500 bg-slate-100 px-1 py-0.5 rounded">
              {raceLabel}
            </span>
            <span className="text-[9px] tabular-nums text-slate-500">
              {formatDate(race.date)}
            </span>
          </div>
          
          {/* 場所 + 距離 */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-800">{race.place}</span>
            <span className="text-[10px] text-slate-600">
              <span className={surface === '芝' ? 'text-green-600' : 'text-amber-700'}>{surface}</span>
              {dist}
            </span>
          </div>

          {/* 勝ち馬名 */}
          {winnerName && (
            <div className="text-[9px] text-slate-400 mb-1 truncate">
              1着: {winnerName}
            </div>
          )}
          
          {/* 着順 + 人気 */}
          <div className="flex items-baseline gap-1 mb-1">
            <span className={cn('text-lg font-bold tabular-nums', getFinishColor(race.finish_position || ''))}>
              {toHalfWidth(race.finish_position || '-')}着
            </span>
            <span className="text-[10px] text-slate-500">
              {toHalfWidth(race.popularity || '-')}人
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
              {horseMemo && (
                <span className="text-amber-500 text-[10px]" title={horseMemo}>📓</span>
              )}
              {hasMemo && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMemoClick?.(); }}
                  className="text-amber-500 text-[10px]"
                >
                  📝
                </button>
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

// ========================================
// モバイル向け: タップ時に表示する詳細パネル
// ========================================

interface MobileDetailPanelProps {
  race: PastRaceData;
  index: number;
  isPremium: boolean;
  hideEntrants?: boolean;
  horseMemo?: string;
}

function MobileDetailPanel({ race, index, isPremium, hideEntrants, horseMemo }: MobileDetailPanelProps) {
  const badges = useMemo(() => isPremium ? calculateEvaluationBadges(race) : [], [race, isPremium]);
  const lapData = parseLapTime(race.lap_time);
  const raceLabel = index === 0 ? '前走' : `${index + 1}走前`;

  return (
    <div className="mt-2 w-full bg-white border border-emerald-200 rounded-xl shadow-sm overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-100 flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-emerald-700 flex-shrink-0">{raceLabel} 詳細</span>
        <span className="text-[10px] text-slate-500 truncate min-w-0">
          {formatDateFull(race.date)}　{race.place}　{race.class_name || race.race_name || ''}
        </span>
      </div>

      <div className="p-3">
        {/* 今走メモ */}
        {horseMemo && (
          <div className="mb-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 whitespace-pre-wrap">
            <span className="font-semibold mr-1">📓</span>{horseMemo}
          </div>
        )}
        {/* 基本情報 + 指数 */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mb-2">
          <div className="flex justify-between gap-1 min-w-0">
            <span className="text-slate-500 flex-shrink-0">騎手</span>
            <span className="text-slate-800 truncate">{race.jockey || '-'}</span>
          </div>
          <div className="flex justify-between gap-1 min-w-0">
            <span className="text-slate-500 flex-shrink-0">通過</span>
            <span className="text-slate-800 tabular-nums">{getPassingOrder(race)}</span>
          </div>
          <div className="flex justify-between gap-1 min-w-0">
            <span className="text-slate-500 flex-shrink-0">タイム</span>
            <span className="text-slate-800 tabular-nums font-medium">{formatFinishTime(race.finish_time) || '-'}</span>
          </div>
          <div className="flex justify-between gap-1 min-w-0">
            <span className="text-slate-500 flex-shrink-0">馬場</span>
            <span className="text-slate-800 tabular-nums">
              {race.track_condition || '-'}
              {race.indices?.cushion != null && `/${race.indices.cushion.toFixed(1)}`}
            </span>
          </div>

          {isPremium && (
            <>
              <div className="flex justify-between gap-1 min-w-0">
                <span className="text-slate-500 flex-shrink-0">巻返し</span>
                <span className={cn('tabular-nums font-semibold', getMakikaeshiColor(race.indices?.makikaeshi))}>
                  {race.indices?.makikaeshi?.toFixed(1) || '-'}
                </span>
              </div>
              <div className="flex justify-between gap-1 min-w-0">
                <span className="text-slate-500 flex-shrink-0">L4F</span>
                <span className="text-slate-800 tabular-nums">{race.indices?.L4F?.toFixed(1) || '-'}</span>
              </div>
              <div className="flex justify-between gap-1 min-w-0">
                <span className="text-slate-500 flex-shrink-0">T2F</span>
                <span className="text-slate-800 tabular-nums">{race.indices?.T2F?.toFixed(1) || '-'}</span>
              </div>
              <div className="flex justify-between gap-1 min-w-0">
                <span className="text-slate-500 flex-shrink-0">ポテ</span>
                <span className="text-slate-800 tabular-nums">{race.indices?.potential?.toFixed(1) || '-'}</span>
              </div>
            </>
          )}
        </div>

        {/* ラップタイム */}
        {race.lap_time && lapData.all.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500">ラップ</span>
              {lapData.last4Sum != null && (
                <span className="text-[10px] font-medium text-emerald-600">
                  後半4F: {lapData.last4Sum.toFixed(1)}
                </span>
              )}
            </div>
            <div className="overflow-x-auto scrollbar-hide">
              <div className="text-[10px] font-mono whitespace-nowrap">
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
          <div className="pt-2 mt-1 border-t border-slate-100">
            <BadgeLabels badges={badges} />
          </div>
        )}

        {/* 馬場メモ */}
        {(() => {
          const { surface } = getSurfaceAndDistance(race.distance);
          return <BabaMemoChip date={race.date} place={race.place} surface={surface} />;
        })()}

        {/* 出走馬一覧 */}
        {!hideEntrants && race.race_id && <RaceEntrantsSection raceId={race.race_id} />}
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
}: PastRaceDetailProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [mobileExpandedIndex, setMobileExpandedIndex] = useState<number | null>(null);
  const [winnersMap, setWinnersMap] = useState<Record<string, string>>({});

  if (!pastRaces || pastRaces.length === 0) {
    return (
      <div className="text-slate-500 text-sm p-4 text-center">
        過去走データなし
      </div>
    );
  }

  const displayRaces = pastRaces;

  // race_id が存在する過去走の勝ち馬を一括取得（1回のAPIコール）
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const raceIds = displayRaces
      .map(r => r.race_id)
      .filter((id): id is string => !!id);
    if (raceIds.length === 0) return;
    fetch(`/api/race-winners?raceIds=${raceIds.map(encodeURIComponent).join(',')}`)
      .then(r => r.ok ? r.json() : { winners: {} })
      .then(data => setWinnersMap(data.winners || {}))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastRaces]);

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
          
          return (
            <CompactRaceRow
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
              onMemoClick={() => {
                if (raceKey && memoContent) {
                  onMemoClick?.(
                    raceKey,
                    `${race.place} ${race.race_number}R ${race.class_name || ''}`,
                    memoContent
                  );
                }
              }}
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
            
            return (
              <MobileRaceCard
                key={`${race.date}-${race.place}-${idx}`}
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
                onMemoClick={() => {
                  if (raceKey && memoContent) {
                    onMemoClick?.(
                      raceKey,
                      `${race.place} ${race.race_number}R ${race.class_name || ''}`,
                      memoContent
                    );
                  }
                }}
              />
            );
          })}
        </div>

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
          />
        )}

        <p className="text-[10px] text-slate-400 text-center mt-1">
          {mobileExpandedIndex === null ? '← スワイプして前後を確認 →' : '← カードをもう一度タップで閉じる →'}
        </p>
      </div>

      {!isPremium && (
        <div className="text-center py-2">
          <span className="text-[10px] text-slate-400">
            🔒 評価バッジ・指数はプレミアム機能です
          </span>
        </div>
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
