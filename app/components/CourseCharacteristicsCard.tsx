'use client';

import React from 'react';
import type { CourseCharacteristics } from '@/types/course-characteristics';

interface CourseCharacteristicsCardProps {
  courseData: CourseCharacteristics | null;
  compact?: boolean;
}

/**
 * コース特性表示カード
 * 
 * ※ distanceToFirstCorner, coursePattern は内部データなので表示しない
 */
export function CourseCharacteristicsCard({ 
  courseData,
  compact = false
}: CourseCharacteristicsCardProps) {
  if (!courseData) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <p className="text-slate-400 text-sm">コース情報がありません</p>
      </div>
    );
  }

  // コンパクトモード
  if (compact) {
    return (
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-lg p-3 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🏇</span>
          <h4 className="text-white font-bold text-sm">
            {courseData.racecourse} {courseData.surface}{courseData.distance}m
          </h4>
          {courseData.trackSize && (
            <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300">
              {courseData.trackSize}
            </span>
          )}
        </div>
        
        <div className="flex flex-wrap gap-1">
          {courseData.characteristics.slice(0, 3).map((char, idx) => (
            <span 
              key={idx}
              className="text-xs bg-slate-700/50 px-2 py-0.5 rounded text-slate-300"
            >
              {char}
            </span>
          ))}
        </div>
        
        {courseData.gateAdvantage && (
          <p className="text-xs text-amber-400 mt-2">
            📍 {courseData.gateAdvantage}
          </p>
        )}
      </div>
    );
  }

  // フルモード
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-5 border border-slate-700 shadow-lg">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xl">
          🏇
        </div>
        <div>
          <h3 className="text-white font-bold text-lg">
            {courseData.racecourse} {courseData.surface}{courseData.distance}m
          </h3>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>{courseData.direction}</span>
            {courseData.trackSize && (
              <>
                <span>•</span>
                <span>{courseData.trackSize}</span>
              </>
            )}
            {courseData.straightLength && (
              <>
                <span>•</span>
                <span>直線{courseData.straightLength}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 特徴リスト */}
      <div className="mb-4">
        <h4 className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">
          コース特徴
        </h4>
        <div className="space-y-1">
          {courseData.characteristics.map((char, idx) => (
            <div 
              key={idx}
              className="flex items-center gap-2 text-slate-200 text-sm"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {char}
            </div>
          ))}
        </div>
      </div>

      {/* ペース傾向 */}
      {courseData.paceTendency && (
        <div className="mb-4 p-3 bg-slate-800/50 rounded-lg">
          <h4 className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">
            ペース傾向
          </h4>
          <p className="text-amber-400 text-sm font-medium">
            📊 {courseData.paceTendency}
          </p>
        </div>
      )}

      {/* 枠順・脚質 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {courseData.gateAdvantage && (
          <div className="p-3 bg-slate-800/50 rounded-lg">
            <h4 className="text-slate-400 text-xs font-medium mb-1">枠順</h4>
            <p className="text-cyan-400 text-sm font-medium">
              📍 {courseData.gateAdvantage}
            </p>
          </div>
        )}
        
        {courseData.runningStyleAdvantage && courseData.runningStyleAdvantage.length > 0 && (
          <div className="p-3 bg-slate-800/50 rounded-lg">
            <h4 className="text-slate-400 text-xs font-medium mb-1">有利な脚質</h4>
            <div className="flex gap-1">
              {courseData.runningStyleAdvantage.map((style, idx) => (
                <span 
                  key={idx}
                  className="text-xs bg-blue-900/50 px-2 py-0.5 rounded text-blue-300"
                >
                  {style}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 時期別特性 */}
      {courseData.seasonalNotes && Object.keys(courseData.seasonalNotes).length > 0 && (
        <div className="mb-4 p-3 bg-slate-800/50 rounded-lg">
          <h4 className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">
            時期別特性
          </h4>
          <div className="space-y-1">
            {Object.entries(courseData.seasonalNotes).map(([month, note]) => (
              <div key={month} className="text-sm">
                <span className="text-purple-400 font-medium">{month}:</span>
                <span className="text-slate-300 ml-2">{note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* メモ */}
      {courseData.notes && (
        <div className="p-3 bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-lg border border-amber-700/30">
          <p className="text-amber-200 text-sm">
            💡 {courseData.notes}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * コース特性ミニバッジ
 */
export function CourseCharacteristicsBadge({ 
  courseData 
}: { 
  courseData: CourseCharacteristics | null 
}) {
  if (!courseData) return null;

  return (
    <div className="inline-flex items-center gap-2 bg-slate-800/80 rounded-full px-3 py-1 text-xs">
      <span className="text-emerald-400 font-medium">
        {courseData.racecourse}{courseData.surface}{courseData.distance}m
      </span>
      {courseData.gateAdvantage && (
        <>
          <span className="text-slate-500">|</span>
          <span className="text-cyan-400">{courseData.gateAdvantage}</span>
        </>
      )}
    </div>
  );
}

/**
 * コース特性タグ一覧
 */
export function CourseCharacteristicsTags({ 
  characteristics,
  maxTags = 5
}: { 
  characteristics: string[];
  maxTags?: number;
}) {
  const displayTags = characteristics.slice(0, maxTags);
  const remaining = characteristics.length - maxTags;

  return (
    <div className="flex flex-wrap gap-1">
      {displayTags.map((char, idx) => (
        <span 
          key={idx}
          className="text-xs bg-slate-700/70 px-2 py-0.5 rounded text-slate-300 border border-slate-600/50"
        >
          {char}
        </span>
      ))}
      {remaining > 0 && (
        <span className="text-xs text-slate-500">+{remaining}</span>
      )}
    </div>
  );
}

export default CourseCharacteristicsCard;











