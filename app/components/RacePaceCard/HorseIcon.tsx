/**
 * HorseIcon - 馬アイコンコンポーネント
 * 
 * 馬番を表示し、噴射エフェクトやツールチップを含む
 */

import React from 'react';
import type { HorsePositionPrediction, RunningStyle } from '@/types/race-pace-types';
import type { SurgeIntensity } from '@/lib/race-pace-surge';

// 枠色定義
const WAKU_COLORS: Record<string, { bg: string; text: string; border?: string }> = {
  '1': { bg: 'bg-white', text: 'text-black', border: 'border-2 border-black' },
  '2': { bg: 'bg-black', text: 'text-white' },
  '3': { bg: 'bg-red-500', text: 'text-white' },
  '4': { bg: 'bg-blue-500', text: 'text-white' },
  '5': { bg: 'bg-yellow-400', text: 'text-black' },
  '6': { bg: 'bg-green-500', text: 'text-white' },
  '7': { bg: 'bg-orange-500', text: 'text-white' },
  '8': { bg: 'bg-pink-400', text: 'text-white' },
};

// 脚質ラベル
const RUNNING_STYLE_LABELS: Record<RunningStyle, string> = {
  escape: '逃げ',
  lead: '先行',
  sashi: '差し',
  oikomi: '追込',
};

interface HorseIconProps {
  horse: HorsePositionPrediction;
  surgeLevel: SurgeIntensity;
  kisoScore: number;
  size?: 'tiny' | 'small' | 'normal';
}

export function HorseIcon({
  horse,
  surgeLevel,
  kisoScore,
  size = 'normal',
}: HorseIconProps) {
  const wakuColor = WAKU_COLORS[horse.waku] || { bg: 'bg-gray-200', text: 'text-black' };
  
  // スコアに応じた発光強度
  const glowIntensity = Math.max(0, Math.min(1, kisoScore / 100));
  const glowColor = 
    kisoScore >= 70 ? '255, 107, 107' : 
    kisoScore >= 60 ? '255, 212, 59' : 
    kisoScore >= 50 ? '116, 192, 252' : 
    '200, 200, 200';

  return (
    <>
      <style jsx>{`
        .horse-icon-modern {
          position: relative;
          cursor: pointer;
          flex-shrink: 0;
        }
        
        .horse-circle {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 13px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 0 ${10 + glowIntensity * 15}px rgba(${glowColor}, ${glowIntensity * 0.6}),
                      0 4px 8px rgba(0, 0, 0, 0.2);
        }
        
        .horse-circle:hover {
          transform: scale(1.15) translateY(-4px);
          border-color: rgba(255, 255, 255, 0.6);
          box-shadow: 0 0 ${15 + glowIntensity * 20}px rgba(${glowColor}, ${glowIntensity * 0.8}),
                      0 6px 12px rgba(0, 0, 0, 0.3);
        }
        
        .surge-effect-strong {
          animation: pulse 1.5s ease-in-out infinite;
        }
        
        @keyframes pulse {
          0%, 100% { 
            box-shadow: 0 0 20px rgba(255, 107, 107, 0.6),
                        0 4px 8px rgba(0, 0, 0, 0.2);
          }
          50% { 
            box-shadow: 0 0 30px rgba(255, 107, 107, 1),
                        0 6px 12px rgba(0, 0, 0, 0.3);
          }
        }
        
        .horse-tooltip {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.95);
          color: #ffffff;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 11px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s;
          z-index: 30;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .horse-icon-modern:hover .horse-tooltip {
          opacity: 1;
        }
        
        .surge-lines-strong {
          position: absolute;
          top: -2px;
          right: -36px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          animation: surgePulse 1.5s ease-in-out infinite;
        }
        
        @keyframes surgePulse {
          0%, 100% { opacity: 0.95; transform: scaleX(1); }
          50% { opacity: 1; transform: scaleX(1.1); }
        }
        
        .surge-line {
          border-radius: 0 3px 3px 0;
          background: linear-gradient(to left, transparent, rgba(255, 149, 43, 0.95), rgba(253, 82, 82, 0.95));
          box-shadow: 0 0 8px rgba(255, 149, 43, 0.6);
        }
        
        .surge-line-1 { height: 5px; width: 36px; }
        .surge-line-2 { height: 4px; width: 32px; background: linear-gradient(to left, transparent, rgba(255, 184, 77, 0.9), rgba(255, 149, 43, 0.9)); }
        .surge-line-3 { height: 3px; width: 28px; background: linear-gradient(to left, transparent, rgba(255, 212, 100, 0.85), rgba(255, 184, 77, 0.85)); }
        .surge-line-4 { height: 3px; width: 24px; background: linear-gradient(to left, transparent, rgba(255, 235, 153, 0.75), rgba(255, 212, 100, 0.75)); }
        .surge-line-5 { height: 2px; width: 20px; background: linear-gradient(to left, transparent, rgba(255, 245, 200, 0.65), rgba(255, 235, 153, 0.65)); }
        
        .surge-lines-medium {
          position: absolute;
          top: 2px;
          right: -30px;
          display: flex;
          flex-direction: column;
          gap: 1.5px;
          animation: surgePulse 2s ease-in-out infinite;
        }
        
        .surge-line-med-1 { height: 4px; width: 30px; box-shadow: 0 0 6px rgba(255, 149, 43, 0.5); }
        .surge-line-med-2 { height: 3px; width: 26px; background: linear-gradient(to left, transparent, rgba(255, 184, 77, 0.8), rgba(255, 149, 43, 0.8)); }
        .surge-line-med-3 { height: 3px; width: 22px; background: linear-gradient(to left, transparent, rgba(255, 212, 100, 0.7), rgba(255, 184, 77, 0.7)); }
        .surge-line-med-4 { height: 2px; width: 18px; background: linear-gradient(to left, transparent, rgba(255, 235, 153, 0.6), rgba(255, 212, 100, 0.6)); }
        
        .surge-lines-weak {
          position: absolute;
          top: 4px;
          right: -24px;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        
        .surge-line-weak-1 { height: 3px; width: 24px; background: linear-gradient(to left, transparent, rgba(255, 184, 77, 0.75), rgba(255, 149, 43, 0.75)); box-shadow: 0 0 4px rgba(255, 149, 43, 0.4); }
        .surge-line-weak-2 { height: 2px; width: 20px; background: linear-gradient(to left, transparent, rgba(255, 212, 100, 0.65), rgba(255, 184, 77, 0.65)); }
        .surge-line-weak-3 { height: 2px; width: 16px; background: linear-gradient(to left, transparent, rgba(255, 235, 153, 0.55), rgba(255, 212, 100, 0.55)); }
      `}</style>
      
      <div className="horse-icon-modern">
        <div
          className={`horse-circle ${wakuColor.bg} ${wakuColor.text} ${wakuColor.border || ''} ${surgeLevel === 'strong' ? 'surge-effect-strong' : ''}`}
        >
          {horse.horseNumber}
        </div>
        
        {/* 噴射エフェクト */}
        {surgeLevel === 'strong' && (
          <div className="surge-lines-strong">
            <div className="surge-line surge-line-1"></div>
            <div className="surge-line surge-line-2"></div>
            <div className="surge-line surge-line-3"></div>
            <div className="surge-line surge-line-4"></div>
            <div className="surge-line surge-line-5"></div>
          </div>
        )}
        {surgeLevel === 'medium' && (
          <div className="surge-lines-medium">
            <div className="surge-line surge-line-med-1"></div>
            <div className="surge-line surge-line-med-2"></div>
            <div className="surge-line surge-line-med-3"></div>
            <div className="surge-line surge-line-med-4"></div>
          </div>
        )}
        {surgeLevel === 'weak' && (
          <div className="surge-lines-weak">
            <div className="surge-line surge-line-weak-1"></div>
            <div className="surge-line surge-line-weak-2"></div>
            <div className="surge-line surge-line-weak-3"></div>
          </div>
        )}
        
        {/* ツールチップ */}
        <div className="horse-tooltip">
          <strong>{horse.horseName}</strong>
          <br />
          スコア: {kisoScore.toFixed(1)}点
          <br />
          脚質: {RUNNING_STYLE_LABELS[horse.runningStyle]}
        </div>
      </div>
    </>
  );
}










