'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { RaceEntrantsSection } from '@/app/components/PastRaceDetail';
import type { RaceTimeAnalysisResponse, RaceTimeInfo } from '@/app/api/race-time-analysis/route';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

// ========================================
// ユーティリティ
// ========================================

function formatTime(raw: string): string {
  if (!raw) return '-';
  const cleaned = raw.replace(/[^\d]/g, '');
  if (cleaned.length === 4) return `${cleaned[0]}:${cleaned.slice(1, 3)}.${cleaned[3]}`;
  if (cleaned.length === 3) return `${cleaned.slice(0, 2)}.${cleaned[2]}`;
  return raw || '-';
}

function rawTimeToSeconds(raw: string): number | null {
  const cleaned = raw?.replace(/[^\d]/g, '');
  if (!cleaned) return null;
  if (cleaned.length === 4) {
    return parseInt(cleaned[0]) * 60 + parseInt(cleaned.slice(1, 3)) + parseInt(cleaned[3]) / 10;
  }
  if (cleaned.length === 3) {
    return parseInt(cleaned.slice(0, 2)) + parseInt(cleaned[2]) / 10;
  }
  return null;
}

function formatDiff(diff: number): { text: string; cls: string } {
  if (Math.abs(diff) < 0.05) return { text: '±0.0', cls: 'text-slate-500' };
  if (diff < 0) return { text: diff.toFixed(1), cls: 'text-emerald-600 font-semibold' };
  return { text: `+${diff.toFixed(1)}`, cls: 'text-red-500 font-semibold' };
}

function formatDateFromRaceId(raceId: string): string {
  if (!raceId || raceId.length < 8) return '';
  return `${raceId.slice(2, 4)}/${raceId.slice(4, 6)}/${raceId.slice(6, 8)}`;
}

function getRaceNumber(raceId: string): string {
  if (!raceId || raceId.length < 16) return '';
  return String(parseInt(raceId.slice(14, 16)));
}

function getTrackConditionColor(condition: string): string {
  switch (condition) {
    case '良': return 'text-sky-600';
    case '稍重': return 'text-yellow-600';
    case '重': return 'text-orange-600';
    case '不良': return 'text-red-600';
    default: return 'text-slate-500';
  }
}

function getSurface(distance: string): string {
  if (!distance) return '';
  if (distance.startsWith('芝') || distance.includes('芝')) return '芝';
  if (distance.startsWith('ダ')) return 'ダ';
  return '';
}

function getDistanceNum(distance: string): string {
  return distance.replace(/[^0-9]/g, '');
}

// ラップ解析（PastRaceDetail と同等のロジック）
interface LapSummary {
  all: number[];
  first: number[];
  last4: number[];
  first3Sum: number | null;
  first5Sum: number | null;
  last4Sum: number | null;
  last5Sum: number | null;
}

function parseLapTime(lapTime: string | undefined): LapSummary {
  const empty: LapSummary = { all: [], first: [], last4: [], first3Sum: null, first5Sum: null, last4Sum: null, last5Sum: null };
  if (!lapTime) return empty;
  const laps = lapTime.split('-').map(l => parseFloat(l.trim())).filter(l => !isNaN(l));
  if (laps.length < 4) return { ...empty, all: laps, first: laps };
  const last4 = laps.slice(-4);
  const first = laps.slice(0, -4);
  return {
    all: laps,
    first,
    last4,
    first3Sum: laps.length >= 3 ? laps.slice(0, 3).reduce((s, v) => s + v, 0) : null,
    first5Sum: laps.length >= 5 ? laps.slice(0, 5).reduce((s, v) => s + v, 0) : null,
    last4Sum: last4.reduce((s, v) => s + v, 0),
    last5Sum: laps.length >= 5 ? laps.slice(-5).reduce((s, v) => s + v, 0) : null,
  };
}

// ========================================
// 展開ディテールパネル（ラップ + 出走馬）
// ========================================

function RaceDetailPanel({ race }: { race: RaceTimeInfo }) {
  const lap = parseLapTime(race.lap_time);
  const hasLap = lap.all.length >= 4;

  return (
    <div className="bg-slate-50 border-t border-slate-200 px-3 py-2.5 space-y-2">
      {/* ラップタイム */}
      {hasLap ? (
        <div>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {lap.first3Sum != null && (
              <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded">
                前半3F {lap.first3Sum.toFixed(1)}
              </span>
            )}
            {lap.first5Sum != null && (
              <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded">
                前半5F {lap.first5Sum.toFixed(1)}
              </span>
            )}
            {lap.last4Sum != null && (
              <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded">
                後半4F {lap.last4Sum.toFixed(1)}
              </span>
            )}
            {lap.last5Sum != null && (
              <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded">
                後半5F {lap.last5Sum.toFixed(1)}
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono bg-white border border-slate-200 rounded px-2 py-1 overflow-x-auto whitespace-nowrap">
            {lap.first.length > 0 && (
              <span className="text-slate-400">{lap.first.map(l => l.toFixed(1)).join('-')}-</span>
            )}
            {lap.last4.length > 0 && (
              <span className="text-emerald-700 font-semibold">{lap.last4.map(l => l.toFixed(1)).join('-')}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-slate-400">ラップデータなし</div>
      )}

      {/* 出走馬一覧 */}
      <RaceEntrantsSection raceId={race.race_id} />
    </div>
  );
}

// ========================================
// 前後10日テーブル
// ========================================

function NearbyTable({
  races,
  baseRaceId,
  baseTime,
  baseDistance,
}: {
  races: RaceTimeInfo[];
  baseRaceId: string;
  baseTime: number | null;
  baseDistance: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, RaceTimeInfo[]>();
    for (const r of races) {
      const key = r.distance || '不明';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const sorted: [string, RaceTimeInfo[]][] = [];
    if (map.has(baseDistance)) sorted.push([baseDistance, map.get(baseDistance)!]);
    for (const [k, v] of map) {
      if (k !== baseDistance) sorted.push([k, v]);
    }
    return sorted;
  }, [races, baseDistance]);

  if (races.length === 0) {
    return <div className="text-slate-400 text-sm text-center py-8">データなし</div>;
  }

  return (
    <div className="space-y-4">
      {grouped.map(([distance, group]) => {
        const surface = getSurface(distance);
        const distNum = getDistanceNum(distance);
        const isSameDistance = distance === baseDistance;
        return (
          <div key={distance}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn(
                'text-xs font-bold px-2 py-0.5 rounded',
                surface === '芝' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              )}>
                {surface}{distNum}m
              </span>
              {isSameDistance && (
                <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">ベースと同距離</span>
              )}
            </div>
            <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400 bg-slate-50 border-b border-slate-200">
                    <th className="text-left py-1 px-2 font-normal whitespace-nowrap">日付</th>
                    <th className="text-left py-1 px-1 font-normal whitespace-nowrap">R</th>
                    <th className="text-left py-1 px-1 font-normal">クラス</th>
                    <th className="text-center py-1 px-1 font-normal whitespace-nowrap">馬場</th>
                    <th className="text-right py-1 px-2 font-normal whitespace-nowrap">勝ち時計</th>
                    {isSameDistance && baseTime != null && (
                      <th className="text-right py-1 px-2 font-normal whitespace-nowrap">差</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {group.map((r) => {
                    const isBase = r.race_id === baseRaceId;
                    const isExpanded = expandedId === r.race_id;
                    const raceTime = rawTimeToSeconds(r.winner_time);
                    const diff = isSameDistance && baseTime != null && raceTime != null
                      ? raceTime - baseTime : null;
                    const diffFmt = diff != null ? formatDiff(diff) : null;
                    return (
                      <React.Fragment key={r.race_id}>
                        <tr
                          className={cn(
                            'border-b border-slate-100 cursor-pointer transition-colors',
                            isBase ? 'bg-yellow-50' : isExpanded ? 'bg-slate-100' : 'hover:bg-slate-50'
                          )}
                          onClick={() => setExpandedId(isExpanded ? null : r.race_id)}
                        >
                          <td className="py-1.5 px-2 whitespace-nowrap tabular-nums text-slate-600">
                            {formatDateFromRaceId(r.race_id)}
                            {isBase && <span className="ml-1 text-[9px] bg-yellow-200 text-yellow-700 px-1 rounded">基準</span>}
                          </td>
                          <td className="py-1.5 px-1 tabular-nums text-slate-500">{getRaceNumber(r.race_id)}R</td>
                          <td className="py-1.5 px-1 text-slate-800 truncate max-w-[120px]">
                            {r.race_name || r.class_name || '-'}
                          </td>
                          <td className={cn('py-1.5 px-1 text-center', getTrackConditionColor(r.track_condition))}>
                            {r.track_condition || '-'}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums font-mono">
                            {formatTime(r.winner_time)}
                            <span className="ml-1 text-slate-300 text-[9px]">{isExpanded ? '▲' : '▼'}</span>
                          </td>
                          {isSameDistance && baseTime != null && (
                            <td className={cn('py-1.5 px-2 text-right tabular-nums', diffFmt?.cls ?? 'text-slate-400')}>
                              {diffFmt?.text ?? '-'}
                            </td>
                          )}
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={isSameDistance && baseTime != null ? 6 : 5} className="p-0">
                              <RaceDetailPanel race={r} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ========================================
// 同コース全期間テーブル
// ========================================

function SameCourseTable({
  races,
  baseRaceId,
  baseTime,
}: {
  races: RaceTimeInfo[];
  baseRaceId: string;
  baseTime: number | null;
}) {
  const [sortBy, setSortBy] = useState<'date' | 'time'>('date');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...races].sort((a, b) => {
      if (sortBy === 'time') {
        const ta = rawTimeToSeconds(a.winner_time) ?? 9999;
        const tb = rawTimeToSeconds(b.winner_time) ?? 9999;
        return ta - tb;
      }
      return b.race_id.localeCompare(a.race_id);
    });
  }, [races, sortBy]);

  if (races.length === 0) {
    return <div className="text-slate-400 text-sm text-center py-8">データなし</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-slate-500">{races.length}レース分のデータ</span>
        <div className="flex rounded overflow-hidden border border-slate-200 text-[10px]">
          <button
            className={cn('px-2 py-0.5', sortBy === 'date' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
            onClick={() => setSortBy('date')}
          >日付順</button>
          <button
            className={cn('px-2 py-0.5', sortBy === 'time' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
            onClick={() => setSortBy('time')}
          >時計順</button>
        </div>
      </div>
      <div className="border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-slate-400 bg-slate-50 border-b border-slate-200">
              <th className="text-left py-1 px-2 font-normal whitespace-nowrap">日付</th>
              <th className="text-left py-1 px-1 font-normal">クラス</th>
              <th className="text-center py-1 px-1 font-normal whitespace-nowrap">馬場</th>
              <th className="text-right py-1 px-2 font-normal whitespace-nowrap">勝ち時計</th>
              <th className="text-right py-1 px-1 font-normal whitespace-nowrap">差</th>
              <th className="text-right py-1 px-1 font-normal whitespace-nowrap">後4F</th>
              <th className="text-right py-1 px-2 font-normal whitespace-nowrap">後5F</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const isBase = r.race_id === baseRaceId;
              const isExpanded = expandedId === r.race_id;
              const raceTime = rawTimeToSeconds(r.winner_time);
              const diff = baseTime != null && raceTime != null ? raceTime - baseTime : null;
              const diffFmt = diff != null ? formatDiff(diff) : null;
              const lap = parseLapTime(r.lap_time);
              return (
                <React.Fragment key={r.race_id}>
                  <tr
                    className={cn(
                      'border-b border-slate-100 cursor-pointer transition-colors',
                      isBase ? 'bg-yellow-50' : isExpanded ? 'bg-slate-100' : 'hover:bg-slate-50'
                    )}
                    onClick={() => setExpandedId(isExpanded ? null : r.race_id)}
                  >
                    <td className="py-1.5 px-2 whitespace-nowrap tabular-nums text-slate-600">
                      {formatDateFromRaceId(r.race_id)}
                      {isBase && <span className="ml-1 text-[9px] bg-yellow-200 text-yellow-700 px-1 rounded">基準</span>}
                    </td>
                    <td className="py-1.5 px-1 text-slate-800 truncate max-w-[100px]">
                      {r.race_name || r.class_name || '-'}
                    </td>
                    <td className={cn('py-1.5 px-1 text-center', getTrackConditionColor(r.track_condition))}>
                      {r.track_condition || '-'}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-mono">
                      {formatTime(r.winner_time)}
                      <span className="ml-1 text-slate-300 text-[9px]">{isExpanded ? '▲' : '▼'}</span>
                    </td>
                    <td className={cn('py-1.5 px-1 text-right tabular-nums', diffFmt?.cls ?? 'text-slate-400')}>
                      {diffFmt?.text ?? '-'}
                    </td>
                    <td className="py-1.5 px-1 text-right tabular-nums text-emerald-700">
                      {lap.last4Sum != null ? lap.last4Sum.toFixed(1) : '-'}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-emerald-600">
                      {lap.last5Sum != null ? lap.last5Sum.toFixed(1) : '-'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <RaceDetailPanel race={r} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ========================================
// メインモーダル
// ========================================

interface RaceTimeAnalysisModalProps {
  raceId: string;
  onClose: () => void;
}

export default function RaceTimeAnalysisModal({ raceId, onClose }: RaceTimeAnalysisModalProps) {
  useBodyScrollLock();
  const [data, setData] = useState<RaceTimeAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'nearby' | 'same'>('nearby');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/race-time-analysis?raceId=${encodeURIComponent(raceId)}`)
      .then(r => r.ok ? r.json() : r.json().then((e: { error: string }) => Promise.reject(e.error)))
      .then(d => setData(d))
      .catch(e => setError(typeof e === 'string' ? e : 'データの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [raceId]);

  const baseTime = data ? rawTimeToSeconds(data.baseRace.winner_time) : null;
  const surface = data ? getSurface(data.baseRace.distance) : '';
  const distNum = data ? getDistanceNum(data.baseRace.distance) : '';
  const baseLap = data ? parseLapTime(data.baseRace.lap_time) : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[1000] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl max-h-[90dvh] rounded-t-2xl sm:rounded-2xl flex flex-col min-h-0 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-600 px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-bold text-sm">📊 タイム分析</div>
              {data && (
                <div className="text-slate-300 text-[11px] mt-0.5">
                  {formatDateFromRaceId(raceId)}　{data.baseRace.place}　
                  <span className={surface === '芝' ? 'text-green-300' : 'text-yellow-300'}>
                    {surface}{distNum}m
                  </span>　
                  {data.baseRace.race_name || data.baseRace.class_name}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-slate-300 hover:text-white text-xl leading-none px-1"
            >×</button>
          </div>

          {/* ベースレース情報バー */}
          {data && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="text-white font-mono font-semibold">
                勝ち時計 {formatTime(data.baseRace.winner_time)}
              </span>
              <span className={getTrackConditionColor(data.baseRace.track_condition) + ' bg-white/10 px-1.5 py-0.5 rounded text-white'}>
                {data.baseRace.track_condition || '不明'}
              </span>
              {baseLap?.first3Sum != null && (
                <span className="text-orange-200">前半3F {baseLap.first3Sum.toFixed(1)}</span>
              )}
              {baseLap?.last4Sum != null && (
                <span className="text-emerald-200">後半4F {baseLap.last4Sum.toFixed(1)}</span>
              )}
              {baseLap?.last5Sum != null && (
                <span className="text-emerald-200">後半5F {baseLap.last5Sum.toFixed(1)}</span>
              )}
            </div>
          )}
        </div>

        {/* タブ */}
        <div className="flex border-b border-slate-200 bg-white flex-shrink-0">
          <button
            className={cn(
              'flex-1 py-2.5 text-sm font-medium transition-colors',
              tab === 'nearby'
                ? 'border-b-2 border-slate-700 text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            )}
            onClick={() => setTab('nearby')}
          >
            前後10日　同会場
            {data && <span className="ml-1 text-[10px] text-slate-400">({data.nearbyRaces.length}R)</span>}
          </button>
          <button
            className={cn(
              'flex-1 py-2.5 text-sm font-medium transition-colors',
              tab === 'same'
                ? 'border-b-2 border-slate-700 text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            )}
            onClick={() => setTab('same')}
          >
            同コース全期間
            {data && <span className="ml-1 text-[10px] text-slate-400">({data.sameCourseRaces.length}R)</span>}
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' } as React.CSSProperties}>
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
              読み込み中...
            </div>
          )}
          {error && (
            <div className="text-red-500 text-sm text-center py-8">{error}</div>
          )}
          {data && !loading && (
            <>
              {tab === 'nearby' && (
                <NearbyTable
                  races={data.nearbyRaces}
                  baseRaceId={raceId}
                  baseTime={baseTime}
                  baseDistance={data.baseRace.distance}
                />
              )}
              {tab === 'same' && (
                <SameCourseTable
                  races={data.sameCourseRaces}
                  baseRaceId={raceId}
                  baseTime={baseTime}
                />
              )}
            </>
          )}
        </div>

        {/* 凡例フッター */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 flex-shrink-0 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-slate-500">
          <span>行をタップで詳細展開</span>
          <span><span className="text-emerald-600 font-semibold">マイナス</span> = 基準より速い</span>
          <span><span className="text-red-500 font-semibold">プラス</span> = 基準より遅い</span>
          <span><span className="bg-yellow-100 px-1 rounded">黄色</span> = 基準レース</span>
        </div>
      </div>
    </div>
  );
}
