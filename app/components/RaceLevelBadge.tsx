'use client';

import React from 'react';
import { cn } from '@/lib/utils';

// レベルは levelLabel（"S++", "A+", "C", "UNKNOWN+"など）として渡されることを想定
// 基本レベルは S, A, B, C, D, LOW, UNKNOWN
type BaseLevel = 'S' | 'A' | 'B' | 'C' | 'D' | 'LOW' | 'UNKNOWN';

interface RaceLevelBadgeProps {
  level: string;  // "S+++", "A+", "C", "UNKNOWN+" など
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

// 基本レベルからスタイルを取得
const LEVEL_STYLES: Record<BaseLevel, { bg: string; text: string; border: string; label: string }> = {
  'S': {
    bg: 'bg-gradient-to-r from-amber-400 to-yellow-300',
    text: 'text-amber-900',
    border: 'border-amber-500',
    label: '超ハイレベル',
  },
  'A': {
    bg: 'bg-gradient-to-r from-orange-400 to-amber-400',
    text: 'text-orange-900',
    border: 'border-orange-500',
    label: 'ハイレベル',
  },
  'B': {
    bg: 'bg-gradient-to-r from-green-400 to-emerald-400',
    text: 'text-green-900',
    border: 'border-green-500',
    label: 'やや高い',
  },
  'C': {
    bg: 'bg-gradient-to-r from-blue-400 to-cyan-400',
    text: 'text-blue-900',
    border: 'border-blue-500',
    label: '標準',
  },
  'D': {
    bg: 'bg-gray-200',
    text: 'text-gray-600',
    border: 'border-gray-400',
    label: 'やや低い',
  },
  'LOW': {
    bg: 'bg-gradient-to-r from-red-400 to-rose-400',
    text: 'text-red-900',
    border: 'border-red-500',
    label: '低レベル',
  },
  'UNKNOWN': {
    bg: 'bg-gray-100',
    text: 'text-gray-400',
    border: 'border-gray-300',
    label: '判定中',
  },
};

/**
 * levelLabel から基本レベルを抽出
 * 例: "S+++" → "S", "UNKNOWN+" → "UNKNOWN"
 */
function extractBaseLevel(levelLabel: string): BaseLevel {
  const normalized = levelLabel.replace(/\+/g, '').toUpperCase();
  if (normalized in LEVEL_STYLES) {
    return normalized as BaseLevel;
  }
  return 'UNKNOWN';
}

const SIZE_STYLES = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-3 py-1.5',
};

export function RaceLevelBadge({ level, size = 'sm', showLabel = false, className }: RaceLevelBadgeProps) {
  const baseLevel = extractBaseLevel(level);
  const style = LEVEL_STYLES[baseLevel];
  const plusCount = (level.match(/\+/g) || []).length;
  
  // UNKNOWN+の特殊処理
  const isUnknownPlus = baseLevel === 'UNKNOWN' && plusCount > 0;
  
  return (
    <span
      className={cn(
        'inline-flex items-center font-bold rounded border',
        isUnknownPlus ? 'bg-gradient-to-r from-gray-300 to-gray-200' : style.bg,
        style.text,
        style.border,
        SIZE_STYLES[size],
        className
      )}
    >
      <span className="font-mono">{level}</span>
      {showLabel && <span className="ml-1 font-normal">{isUnknownPlus ? 'ハイレベル可能性' : style.label}</span>}
    </span>
  );
}

/**
 * レベルの色を取得（グラフ用）
 * @param level - "S+++", "A+", "C", "UNKNOWN+" など
 */
export function getLevelColor(level: string): string {
  const baseLevel = extractBaseLevel(level);
  switch (baseLevel) {
    case 'S': return '#F59E0B';    // amber-500
    case 'A': return '#F97316';    // orange-500
    case 'B': return '#22C55E';    // green-500
    case 'C': return '#3B82F6';    // blue-500
    case 'D': return '#9CA3AF';    // gray-400
    case 'LOW': return '#EF4444';  // red-500
    case 'UNKNOWN': return '#D1D5DB'; // gray-300
    default: return '#9CA3AF';
  }
}

/**
 * レベルのスコア値を取得（グラフ用）
 * +の数に応じてボーナスを加算
 * @param level - "S+++", "A+", "C", "UNKNOWN+" など
 */
export function getLevelScore(level: string): number {
  const baseLevel = extractBaseLevel(level);
  const plusCount = (level.match(/\+/g) || []).length;
  const plusBonus = plusCount * 5;  // +1つにつき+5点
  
  let baseScore: number;
  switch (baseLevel) {
    case 'S': baseScore = 90; break;
    case 'A': baseScore = 75; break;
    case 'B': baseScore = 60; break;
    case 'C': baseScore = 45; break;
    case 'D': baseScore = 30; break;
    case 'LOW': baseScore = 15; break;
    case 'UNKNOWN': baseScore = 35; break;
    default: baseScore = 35;
  }
  
  return Math.min(baseScore + plusBonus, 100);  // 上限100
}

/**
 * レベルのラベルを取得
 */
export function getLevelLabel(level: string): string {
  const baseLevel = extractBaseLevel(level);
  return LEVEL_STYLES[baseLevel]?.label || '';
}
