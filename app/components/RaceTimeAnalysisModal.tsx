'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { RaceTimeAnalysisResponse, RaceTimeInfo } from '@/app/api/race-time-analysis/route';

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
  const y = raceId.slice(0, 4);
  const m = raceId.slice(4, 6);
  const d = raceId.slice(6, 8);
  return `${y.slice(2)}/${m}/${d}`;
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

function parseLapSummary(lapTime: string): { last4: number | null; last5: number | null; first3: number | null } {
  if (!lapTime) return { last4: null, last5: null, first3: null };
  const laps = lapTime.split('-').map(l => parseFloat(l.trim())).filter(l => !isNaN(l));
  if (laps.length < 4) return { last4: null, last5: null, first3: null };
  const last4 = laps.slice(-4).reduce((s, v) => s + v, 0);
  const last5 = laps.length >= 5 ? laps.slice(-5).reduce((s, v) => s + v, 0) : null;
  const first3 = laps.length >= 3 ? laps.slice(0, 3).reduce((s, v) => s + v, 0) : null;
  return { last4, last5, first3 };
}

// ========================================
// サブコンポーネント: 前後10日テーブル
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
  // 距離ごとにグループ化
  const grouped = useMemo(() => {
    const map = new Map<string, RaceTimeInfo[]>();
    for (const r of races) {
      const key = r.distance || '不明';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    // 同コース（ベースと同じ距離）を先頭に
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
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-200">
                    <th className="text-left pb-1 pr-2 font-normal whitespace-nowrap">日付</th>
                    <th className="text-left pb-1 pr-2 font-normal whitespace-nowrap">R</th>
                    <th className="text-left pb-1 pr-2 font-normal">クラス</th>
                    <th className="text-center pb-1 pr-2 font-normal whitespace-nowrap">馬場</th>
                    <th className="text-right pb-1 pr-2 font-normal whitespace-nowrap">勝ち時計</th>
                    {isSameDistance && baseTime != null && (
                      <th className="text-right pb-1 font-normal whitespace-nowrap">差</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {group.map((r) => {
                    const isBase = r.race_id === baseRaceId;
                    const raceTime = rawTimeToSeconds(r.winner_time);
                    const diff = isSameDistance && baseTime != null && raceTime != null
                      ? raceTime - baseTime : null;
                    const diffFmt = diff != null ? formatDiff(diff) : null;
                    return (
                      <tr
                        key={r.race_id}
                        className={cn(
                          'border-b border-slate-100',
                          isBase ? 'bg-yellow-50 font-semibold' : 'hover:bg-slate-50'
                        )}
                      >
                        <td className="py-1 pr-2 whitespace-nowrap tabular-nums text-slate-600">
                          {formatDateFromRaceId(r.race_id)}
                          {isBase && <span className="ml-1 text-[9px] bg-yellow-200 text-yellow-700 px-1 rounded">基準</span>}
                        </td>
                        <td className="py-1 pr-2 tabular-nums text-slate-500">{getRaceNumber(r.race_id)}R</td>
                        <td className="py-1 pr-2 text-slate-800 truncate max-w-[120px]">
                          {r.race_name || r.class_name || '-'}
                        </td>
                        <td className={cn('py-1 pr-2 text-center', getTrackConditionColor(r.track_condition))}>
                          {r.track_condition || '-'}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums font-mono">
                          {formatTime(r.winner_time)}
                        </td>
                        {isSameDistance && baseTime != null && (
                          <td className={cn('py-1 text-right tabular-nums', diffFmt?.cls ?? 'text-slate-400')}>
                            {diffFmt?.text ?? '-'}
                          </td>
                        )}
                      </tr>
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
// サブコンポーネント: 同コース全期間テーブル
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
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-slate-400 border-b border-slate-200">
              <th className="text-left pb-1 pr-2 font-normal whitespace-nowrap">日付</th>
              <th className="text-left pb-1 pr-2 font-normal">クラス</th>
              <th className="text-center pb-1 pr-2 font-normal whitespace-nowrap">馬場</th>
              <th className="text-right pb-1 pr-2 font-normal whitespace-nowrap">勝ち時計</th>
              <th className="text-right pb-1 pr-2 font-normal whitespace-nowrap">差</th>
              <th className="text-right pb-1 pr-2 font-normal whitespace-nowrap">後半4F</th>
              <th className="text-right pb-1 font-normal whitespace-nowrap">後半5F</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const isBase = r.race_id === baseRaceId;
              const raceTime = rawTimeToSeconds(r.winner_time);
              const diff = baseTime != null && raceTime != null ? raceTime - baseTime : null;
              const diffFmt = diff != null ? formatDiff(diff) : null;
              const lap = parseLapSummary(r.lap_time);
              return (
                <tr
                  key={r.race_id}
                  className={cn(
                    'border-b border-slate-100',
                    isBase ? 'bg-yellow-50 font-semibold' : 'hover:bg-slate-50'
                  )}
                >
                  <td className="py-1 pr-2 whitespace-nowrap tabular-nums text-slate-600">
                    {formatDateFromRaceId(r.race_id)}
                    {isBase && <span className="ml-1 text-[9px] bg-yellow-200 text-yellow-700 px-1 rounded">基準</span>}
                  </td>
                  <td className="py-1 pr-2 text-slate-800 truncate max-w-[110px]">
                    {r.race_name || r.class_name || '-'}
                  </td>
                  <td className={cn('py-1 pr-2 text-center', getTrackConditionColor(r.track_condition))}>
                    {r.track_condition || '-'}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums font-mono">
                    {formatTime(r.winner_time)}
                  </td>
                  <td className={cn('py-1 pr-2 text-right tabular-nums', diffFmt?.cls ?? 'text-slate-400')}>
                    {diffFmt?.text ?? '-'}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums text-emerald-700">
                    {lap.last4 != null ? lap.last4.toFixed(1) : '-'}
                  </td>
                  <td className="py-1 text-right tabular-nums text-emerald-600">
                    {lap.last5 != null ? lap.last5.toFixed(1) : '-'}
                  </td>
                </tr>
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
  const baseLap = data ? parseLapSummary(data.baseRace.lap_time) : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl max-h-[90vh] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden"
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
              {baseLap?.first3 != null && (
                <span className="text-orange-200">前半3F {baseLap.first3.toFixed(1)}</span>
              )}
              {baseLap?.last4 != null && (
                <span className="text-emerald-200">後半4F {baseLap.last4.toFixed(1)}</span>
              )}
              {baseLap?.last5 != null && (
                <span className="text-emerald-200">後半5F {baseLap.last5.toFixed(1)}</span>
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
        <div className="flex-1 overflow-y-auto p-4">
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
          <span><span className="text-emerald-600 font-semibold">マイナス</span> = 基準より速い</span>
          <span><span className="text-red-500 font-semibold">プラス</span> = 基準より遅い</span>
          <span><span className="bg-yellow-50 px-1 rounded">黄色行</span> = 基準レース</span>
        </div>
      </div>
    </div>
  );
}
