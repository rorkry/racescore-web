'use client';

import React, { useState, useEffect } from 'react';
import { HorsePastRaceModal } from './PastRaceDetail';

interface AlertHorse {
  horse_name: string;
  place: string;
  race_number: string;
  class_name: string;
  memo?: string;
}

interface TodayAlerts {
  favorites: AlertHorse[];
  memoHorses: AlertHorse[];
}

interface TodayAlertsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function HorseRow({
  horse,
  badge,
  onSelect,
}: {
  horse: AlertHorse;
  badge: React.ReactNode;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-1.5 min-w-0">
        {badge}
        <button
          onClick={() => onSelect(horse.horse_name)}
          className="text-sm font-medium text-emerald-600 hover:underline truncate text-left"
        >
          {horse.horse_name}
        </button>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="text-[11px] text-slate-600 whitespace-nowrap">
          {horse.place} {horse.race_number}R
        </div>
        {horse.class_name && (
          <div className="text-[10px] text-slate-400 truncate max-w-[80px]">{horse.class_name}</div>
        )}
        {horse.memo && (
          <div className="text-[10px] text-amber-600 truncate max-w-[100px] mt-0.5">
            &ldquo;{horse.memo}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}

export default function TodayAlertsPanel({ isOpen, onClose }: TodayAlertsPanelProps) {
  const [alerts, setAlerts] = useState<TodayAlerts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(false);
    fetch('/api/user/today-alerts')
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then(data => setAlerts(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const totalCount = (alerts?.favorites.length ?? 0) + (alerts?.memoHorses.length ?? 0);

  return (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* panel */}
      <div className="fixed bottom-20 right-4 sm:right-6 z-50 w-72 sm:w-80 max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* header */}
        <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-amber-100 border-b border-amber-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base">🔔</span>
            <h3 className="font-bold text-sm text-amber-900">今日の注目馬</h3>
            {!loading && totalCount > 0 && (
              <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                {totalCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-white/60 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1 p-3 space-y-3">
          {loading && (
            <div className="py-8 text-center text-slate-400 text-sm">読み込み中...</div>
          )}

          {!loading && error && (
            <div className="py-6 text-center text-slate-400 text-sm">
              <div className="text-2xl mb-2">⚠️</div>
              ログインが必要です
            </div>
          )}

          {!loading && !error && alerts && (
            <>
              {/* お気に入り馬 */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-amber-500 text-sm">★</span>
                  <span className="text-xs font-bold text-slate-700">お気に入り馬 出走</span>
                  <span className="text-[10px] text-slate-400">({alerts.favorites.length}頭)</span>
                </div>
                {alerts.favorites.length === 0 ? (
                  <p className="text-xs text-slate-400 pl-4">今日の出走はありません</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {alerts.favorites.map(h => (
                      <HorseRow
                        key={h.horse_name}
                        horse={h}
                        badge={<span className="text-amber-400 text-sm flex-shrink-0">★</span>}
                        onSelect={setSelectedHorse}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 今走メモ馬 */}
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-amber-600 text-sm">✏️</span>
                  <span className="text-xs font-bold text-slate-700">今走メモ馬 出走</span>
                  <span className="text-[10px] text-slate-400">({alerts.memoHorses.length}頭)</span>
                </div>
                {alerts.memoHorses.length === 0 ? (
                  <p className="text-xs text-slate-400 pl-4">今日の出走はありません</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {alerts.memoHorses.map(h => (
                      <HorseRow
                        key={h.horse_name}
                        horse={h}
                        badge={<span className="text-[10px] flex-shrink-0">✏️</span>}
                        onSelect={setSelectedHorse}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 馬過去走モーダル */}
      {selectedHorse && (
        <HorsePastRaceModal horseName={selectedHorse} onClose={() => setSelectedHorse(null)} />
      )}
    </>
  );
}
