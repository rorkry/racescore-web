'use client';

import React from 'react';
import { cn } from '@/lib/utils';

type RaceLevel = 'S+' | 'S' | 'A' | 'B' | 'C' | 'LOW' | 'PENDING';

interface RaceLevelBadgeProps {
  level: RaceLevel;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const LEVEL_STYLES: Record<RaceLevel, { bg: string; text: string; border: string; label: string }> = {
  'S+': {
    bg: 'bg-gradient-to-r from-amber-400 to-yellow-300',
    text: 'text-amber-900',
    border: 'border-amber-500',
    label: '超ハイレベル',
  },
  'S': {
    bg: 'bg-gradient-to-r from-orange-400 to-amber-400',
    text: 'text-orange-900',
    border: 'border-orange-500',
    label: 'ハイレベル',
  },
  'A': {
    bg: 'bg-gradient-to-r from-green-400 to-emerald-400',
    text: 'text-green-900',
    border: 'border-green-500',
    label: '高レベル',
  },
  'B': {
    bg: 'bg-gradient-to-r from-blue-400 to-cyan-400',
    text: 'text-blue-900',
    border: 'border-blue-500',
    label: 'やや高い',
  },
  'C': {
    bg: 'bg-gray-200',
    text: 'text-gray-600',
    border: 'border-gray-400',
    label: '標準',
  },
  'LOW': {
    bg: 'bg-gradient-to-r from-red-400 to-rose-400',
    text: 'text-red-900',
    border: 'border-red-500',
    label: '低レベル',
  },
  'PENDING': {
    bg: 'bg-gray-100',
    text: 'text-gray-400',
    border: 'border-gray-300',
    label: '判定保留',
  },
};

const SIZE_STYLES = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-3 py-1.5',
};

export function RaceLevelBadge({ level, size = 'sm', showLabel = false, className }: RaceLevelBadgeProps) {
  const style = LEVEL_STYLES[level];
  
  return (
    <span
      className={cn(
        'inline-flex items-center font-bold rounded border',
        style.bg,
        style.text,
        style.border,
        SIZE_STYLES[size],
        className
      )}
    >
      <span className="font-mono">{level}</span>
      {showLabel && <span className="ml-1 font-normal">{style.label}</span>}
    </span>
  );
}

/**
 * レベルの色を取得（グラフ用）
 */
export function getLevelColor(level: RaceLevel): string {
  switch (level) {
    case 'S+': return '#F59E0B';  // amber-500
    case 'S': return '#F97316';   // orange-500
    case 'A': return '#22C55E';   // green-500
    case 'B': return '#3B82F6';   // blue-500
    case 'C': return '#9CA3AF';   // gray-400
    case 'LOW': return '#EF4444'; // red-500
    case 'PENDING': return '#D1D5DB'; // gray-300
    default: return '#9CA3AF';
  }
}

/**
 * レベルのスコア値を取得（グラフ用）
 */
export function getLevelScore(level: RaceLevel): number {
  switch (level) {
    case 'S+': return 100;
    case 'S': return 85;
    case 'A': return 70;
    case 'B': return 55;
    case 'C': return 40;
    case 'LOW': return 20;
    case 'PENDING': return 30;
    default: return 30;
  }
}
