'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { RaceLevelBadge, getLevelColor, getLevelScore } from './RaceLevelBadge';

type RaceLevel = 'S+' | 'S' | 'A' | 'B' | 'C' | 'LOW' | 'PENDING';

interface RaceLevelInfo {
  level: RaceLevel;
  levelLabel: string;
  totalHorsesRun: number;
  goodRunCount: number;
  winCount: number;
  aiComment: string;
}

interface PastRaceData {
  date: string;
  place: string;
  distance: string;
  surface: string;
  className: string;
  finishPosition: number;
  finishTime: string;
  margin: string;
  trackCondition: string;
  last3F?: number;
  lapString?: string;
  raceLevel?: RaceLevelInfo;
}

interface PastRaceCardProps {
  race: PastRaceData;
  index: number;  // 0=前走, 1=2走前, ...
  isExpanded?: boolean;
  onToggle?: () => void;
}

/**
 * 過去走カード（縦並び・カード風）
 */
export function PastRaceCard({ race, index, isExpanded = false, onToggle }: PastRaceCardProps) {
  const raceLabel = index === 0 ? '前走' : `${index + 1}走前`;
  const positionColor = getPositionColor(race.finishPosition);
  const level = race.raceLevel;

  // 日付フォーマット（YYYY.MM.DD → MM/DD）
  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('.');
    if (parts.length >= 3) {
      return `${parts[1]}/${parts[2]}`;
    }
    return dateStr;
  };

  return (
    <div 
      className={cn(
        'relative bg-white/95 dark:bg-gray-800/95 rounded-lg border shadow-sm transition-all',
        'hover:shadow-md cursor-pointer',
        level?.level === 'S+' || level?.level === 'S' 
          ? 'border-amber-300 dark:border-amber-600' 
          : level?.level === 'LOW'
            ? 'border-red-300 dark:border-red-600'
            : 'border-gray-200 dark:border-gray-700'
      )}
      onClick={onToggle}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
            {raceLabel}
          </span>
          <span className="text-xs text-gray-400">{formatDate(race.date)}</span>
        </div>
        {level && level.level !== 'PENDING' && level.level !== 'C' && (
          <RaceLevelBadge level={level.level} size="sm" />
        )}
      </div>

      {/* メインコンテンツ */}
      <div className="px-3 py-2">
        {/* レース情報 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {race.place}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {race.surface}{race.distance}m
            </span>
            <span className={cn(
              'text-xs px-1 py-0.5 rounded',
              race.trackCondition === '良' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
              race.trackCondition === '稍' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
              race.trackCondition === '重' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            )}>
              {race.trackCondition}
            </span>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {race.className}
          </span>
        </div>

        {/* 着順・タイム */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* 着順 */}
            <div className="flex items-center gap-1">
              <span 
                className={cn(
                  'text-2xl font-bold tabular-nums',
                  positionColor
                )}
              >
                {race.finishPosition}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">着</span>
            </div>
            
            {/* 着差 */}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {formatMargin(race.margin)}
            </span>
          </div>

          {/* タイム */}
          <div className="text-right">
            <div className="text-sm font-medium tabular-nums text-gray-700 dark:text-gray-300">
              {race.finishTime}
            </div>
            {race.last3F && (
              <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                上がり {race.last3F.toFixed(1)}
              </div>
            )}
          </div>
        </div>

        {/* 展開時：レースレベル詳細 */}
        {isExpanded && level && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            {level.totalHorsesRun > 0 ? (
              <div className="text-xs text-gray-600 dark:text-gray-400">
                <span className="font-medium">レースレベル：</span>
                {level.totalHorsesRun}頭が次走出走 → {level.goodRunCount}頭好走
                {level.winCount > 0 && `（${level.winCount}頭勝ち上がり）`}
              </div>
            ) : (
              <div className="text-xs text-gray-400">
                レースレベル判定：{level.levelLabel}
              </div>
            )}
            {level.aiComment && (
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">
                {level.aiComment}
              </div>
            )}
          </div>
        )}

        {/* ラップ表示（展開時） */}
        {isExpanded && race.lapString && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 font-mono">
            ラップ: {race.lapString}
          </div>
        )}
      </div>

      {/* 展開トグル */}
      {onToggle && (
        <div className="absolute bottom-1 right-2 text-gray-400">
          <svg 
            className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      )}
    </div>
  );
}

/**
 * 過去5走一覧（縦並び）
 */
interface PastRaceListProps {
  races: PastRaceData[];
  maxDisplay?: number;
  expandedIndex?: number | null;
  onToggleExpand?: (index: number) => void;
}

export function PastRaceList({ races, maxDisplay = 5, expandedIndex, onToggleExpand }: PastRaceListProps) {
  const displayRaces = races.slice(0, maxDisplay);

  if (displayRaces.length === 0) {
    return (
      <div className="text-center py-4 text-gray-400 dark:text-gray-500 text-sm">
        過去走データがありません
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayRaces.map((race, index) => (
        <PastRaceCard
          key={`${race.date}-${race.place}-${index}`}
          race={race}
          index={index}
          isExpanded={expandedIndex === index}
          onToggle={onToggleExpand ? () => onToggleExpand(index) : undefined}
        />
      ))}
    </div>
  );
}

// ========================================
// ユーティリティ
// ========================================

function getPositionColor(position: number): string {
  if (position === 1) return 'text-amber-500';
  if (position === 2) return 'text-gray-400';
  if (position === 3) return 'text-orange-600';
  if (position <= 5) return 'text-green-600 dark:text-green-500';
  if (position <= 9) return 'text-gray-600 dark:text-gray-400';
  return 'text-gray-400 dark:text-gray-500';
}

function formatMargin(margin: string): string {
  if (!margin || margin === '0' || margin === '-0.0' || margin === '0.0') {
    return '-';
  }
  const num = parseFloat(margin);
  if (num === 0) return '-';
  if (num > 0) return `+${num.toFixed(1)}`;
  return num.toFixed(1);
}

/**
 * レースレベルサマリーチャート（ミニグラフ）
 */
interface LevelSummaryChartProps {
  races: PastRaceData[];
  width?: number;
  height?: number;
}

export function LevelSummaryChart({ races, width = 120, height = 30 }: LevelSummaryChartProps) {
  const data = races.slice(0, 5).map((race, i) => ({
    index: i,
    level: race.raceLevel?.level || 'PENDING',
    score: getLevelScore(race.raceLevel?.level || 'PENDING'),
    color: getLevelColor(race.raceLevel?.level || 'PENDING'),
  })).reverse();

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* ベースライン */}
      <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="#e5e7eb" strokeWidth="1" />
      
      {/* バー */}
      {data.map((d, i) => {
        const barWidth = (width - 8) / data.length - 2;
        const barHeight = (d.score / 100) * (height - 4);
        const x = i * ((width - 8) / data.length) + 4;
        const y = height - 2 - barHeight;
        
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill={d.color}
            rx="1"
            className="opacity-80"
          />
        );
      })}
    </svg>
  );
}
