/**
 * CourseStyleRacePace v5.0 - モダンデザイン版
 * 最先端のデータビジュアライゼーションツール風デザイン
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { RacePacePrediction, HorsePositionPrediction, RunningStyle } from '@/types/race-pace-types';

interface Props {
  year: string;
  date: string;
  place: string;
  raceNumber: string;
  kisouScores?: Record<number, number>;
}

const RUNNING_STYLE_LABELS: Record<RunningStyle, string> = {
  escape: '逃げ',
  lead: '先行',
  sashi: '差し',
  oikomi: '追込',
};

const PACE_LABELS = {
  slow: 'スローペース',
  middle: 'ミドルペース',
  high: 'ハイペース',
};

// 枠色（グラデーション対応）
const WAKU_COLORS: Record<string, { from: string; to: string; text: string }> = {
  '1': { from: '#ffffff', to: '#f0f0f0', text: '#000000' },
  '2': { from: '#1a1a1a', to: '#000000', text: '#ffffff' },
  '3': { from: '#ff6b6b', to: '#ee5a6f', text: '#ffffff' },
  '4': { from: '#4dabf7', to: '#339af0', text: '#ffffff' },
  '5': { from: '#ffd43b', to: '#fcc419', text: '#000000' },
  '6': { from: '#51cf66', to: '#37b24d', text: '#ffffff' },
  '7': { from: '#ff922b', to: '#fd7e14', text: '#ffffff' },
  '8': { from: '#ff6ec7', to: '#f06595', text: '#ffffff' },
};

// 脚質ごとの色（グラデーション）
const RUNNING_STYLE_COLORS: Record<RunningStyle, { from: string; to: string }> = {
  escape: { from: '#ff6b6b', to: '#fa5252' },
  lead: { from: '#ffd43b', to: '#ffa94d' },
  sashi: { from: '#74c0fc', to: '#4dabf7' },
  oikomi: { from: '#b197fc', to: '#9775fa' },
};

export default function CourseStyleRacePaceV5({
  year,
  date,
  place,
  raceNumber,
  kisouScores = {},
}: Props) {
  const raceKey = `${year}${date}_${place}_${raceNumber}`;
  
  const [bias, setBias] = useState<
    'none' | 'uchi-mae' | 'soto-mae' | 'mae' | 'ushiro' | 'uchi' | 'soto' | 'soto-ushiro'
  >(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`bias_${raceKey}`);
      return (saved as typeof bias) || 'none';
    }
    return 'none';
  });
  
  const [prediction, setPrediction] = useState<RacePacePrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTable, setExpandedTable] = useState(false);
  const [selectedHorse, setSelectedHorse] = useState<number | null>(null);

  const handleBiasChange = (newBias: typeof bias) => {
    setBias(newBias);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`bias_${raceKey}`, newBias);
    }
  };

  useEffect(() => {
    async function fetchPrediction() {
      try {
        setLoading(true);
        setError(null);
        
        if (!year || !date || !place || !raceNumber) {
          throw new Error(`必須パラメータが不足しています`);
        }
        
        const url = `/api/race-pace?year=${year}&date=${date}&place=${encodeURIComponent(place)}&raceNumber=${raceNumber}`;
        const res = await fetch(url);
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(`APIエラー: ${res.status}`);
        }
        
        const data = await res.json();
        setPrediction(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchPrediction();
  }, [year, date, place, raceNumber]);

  // 馬群グルーピング
  const groupedHorses = useMemo(() => {
    if (!prediction) return [];
    
    const sorted = [...prediction.predictions].sort((a, b) => a.expectedPosition2C - b.expectedPosition2C);
    const groups: HorsePositionPrediction[][] = [];
    let currentGroup: HorsePositionPrediction[] = [];

    sorted.forEach((horse, idx) => {
      if (idx === 0) {
        currentGroup = [horse];
      } else {
        const prevPos = sorted[idx - 1].expectedPosition2C;
        if (horse.expectedPosition2C - prevPos <= 1.5) {
          currentGroup.push(horse);
        } else {
          groups.push(currentGroup);
          currentGroup = [horse];
        }
      }
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }, [prediction]);

  // スコア別分類
  const getScoreClass = (score: number) => {
    if (score >= 70) return 'score-high';
    if (score >= 60) return 'score-medium';
    if (score >= 50) return 'score-low';
    return 'score-minimal';
  };

  // ペース情報
  const getPacePercentage = () => {
    if (!prediction?.avgFront2FLap) return 50;
    // 前半2FラップをPCIに見立てて0-100%に変換（例: 22秒-26秒を0-100%に）
    const minLap = 22.0;
    const maxLap = 26.0;
    const normalized = ((prediction.avgFront2FLap - minLap) / (maxLap - minLap)) * 100;
    return Math.max(0, Math.min(100, normalized));
  };

  const getPaceBadgeClass = () => {
    if (!prediction) return 'badge-middle';
    switch (prediction.expectedPace) {
      case 'high': return 'badge-high';
      case 'middle': return 'badge-middle';
      case 'slow': return 'badge-slow';
      default: return 'badge-middle';
    }
  };

  // 脚質カウント
  const runningStyleCounts = useMemo(() => {
    if (!prediction) return { escape: 0, lead: 0, sashi: 0, oikomi: 0 };
    return {
      escape: prediction.predictions.filter(h => h.runningStyle === 'escape').length,
      lead: prediction.predictions.filter(h => h.runningStyle === 'lead').length,
      sashi: prediction.predictions.filter(h => h.runningStyle === 'sashi').length,
      oikomi: prediction.predictions.filter(h => h.runningStyle === 'oikomi').length,
    };
  }, [prediction]);

  if (loading) {
    return (
      <div className="race-pace-v5-container">
        <div className="glass-card loading-card">
          <div className="loading-spinner"></div>
          <p className="loading-text">展開予想を分析中...</p>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="race-pace-v5-container">
        <div className="glass-card error-card">
          <p className="error-text">⚠️ 展開予想データを取得できませんでした</p>
          {error && <p className="error-detail">{error}</p>}
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  return (
    <div className="race-pace-v5-container">
      {/* ヘッダーセクション */}
      <div className="header-section glass-card fade-in">
        <div className="header-content">
          <h2 className="main-title">🏇 展開予想カード</h2>
          <div className="header-meta">
            <span className={`pace-badge ${getPaceBadgeClass()}`}>
              {PACE_LABELS[prediction.expectedPace]}
            </span>
            <span className="meta-item">
              <span className="meta-label">馬群:</span>
              <span className="meta-value">{groupedHorses.length}</span>
            </span>
            <span className="meta-item">
              <span className="meta-label">頭数:</span>
              <span className="meta-value">{prediction.predictions.length}</span>
            </span>
          </div>
        </div>
      </div>

      {/* コースディスプレイ */}
      <div className="course-grid">
        {/* スタート後 */}
        <div className="course-panel glass-card slide-in-left">
          <div className="panel-header">
            <h3 className="panel-title">スタート後（2コーナー）</h3>
            <span className="panel-meta">{prediction.predictions.length}頭立て</span>
          </div>
          <div className="course-display">
            <div className="direction-indicator">← 進行方向</div>
            {prediction.predictions
              .sort((a, b) => a.expectedPosition2C - b.expectedPosition2C)
              .map((horse, idx) => (
                <div
                  key={`start-${horse.horseNumber}`}
                  className="horse-wrapper"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <HorseIcon
                    horse={horse}
                    kisoScore={kisouScores[horse.horseNumber] || 0}
                    isSelected={selectedHorse === horse.horseNumber}
                    onSelect={setSelectedHorse}
                    showSurge={false}
                  />
                </div>
              ))}
          </div>
        </div>

        {/* ゴール前 */}
        <div className="course-panel glass-card slide-in-right">
          <div className="panel-header">
            <h3 className="panel-title">ゴール前</h3>
            <span className="panel-meta">{groupedHorses.length}馬群</span>
          </div>
          <div className="course-display">
            <div className="direction-indicator">← 進行方向</div>
            {groupedHorses.flatMap((group, groupIdx) =>
              group.map((horse, idx) => (
                <div
                  key={`goal-${horse.horseNumber}`}
                  className="horse-wrapper"
                  style={{ animationDelay: `${(groupIdx * 3 + idx) * 0.05}s` }}
                >
                  <HorseIcon
                    horse={horse}
                    kisoScore={kisouScores[horse.horseNumber] || 0}
                    isSelected={selectedHorse === horse.horseNumber}
                    onSelect={setSelectedHorse}
                    showSurge={kisouScores[horse.horseNumber] >= 60}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 分析パネル */}
      <div className="analysis-grid">
        {/* ペース分析 */}
        <div className="analysis-panel glass-card fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="panel-header-small">
            <h4 className="panel-title-small">ペース分析</h4>
          </div>
          <div className="pace-meter-container">
            <div className="meter-label">想定ペース指標</div>
            <div className="meter-bar">
              <div
                className="meter-fill"
                style={{ width: `${getPacePercentage()}%` }}
              />
              <div className="meter-marker" style={{ left: `${getPacePercentage()}%` }}>
                {prediction.avgFront2FLap ? prediction.avgFront2FLap.toFixed(1) : '--'}
              </div>
            </div>
            <div className="meter-range">
              <span>遅い</span>
              <span>速い</span>
            </div>
          </div>
          <div className="pace-info">
            <span className={`pace-badge-large ${getPaceBadgeClass()}`}>
              {PACE_LABELS[prediction.expectedPace]}
            </span>
            <span className="confidence-text">
              前半2F平均: {prediction.avgFront2FLap ? `${prediction.avgFront2FLap.toFixed(1)}秒` : '---'}
            </span>
          </div>
        </div>

        {/* 脚質マトリックス */}
        <div className="analysis-panel glass-card fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="panel-header-small">
            <h4 className="panel-title-small">脚質構成</h4>
          </div>
          <div className="running-style-matrix">
            <div className="matrix-item escape-style">
              <div className="style-icon">🔥</div>
              <div className="style-label">逃げ</div>
              <div className="style-count">{runningStyleCounts.escape}</div>
            </div>
            <div className="matrix-item lead-style">
              <div className="style-icon">⚡</div>
              <div className="style-label">先行</div>
              <div className="style-count">{runningStyleCounts.lead}</div>
            </div>
            <div className="matrix-item sashi-style">
              <div className="style-icon">💨</div>
              <div className="style-label">差し</div>
              <div className="style-count">{runningStyleCounts.sashi}</div>
            </div>
            <div className="matrix-item oikomi-style">
              <div className="style-icon">🚀</div>
              <div className="style-label">追込</div>
              <div className="style-count">{runningStyleCounts.oikomi}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 詳細テーブル */}
      <div className="detail-section glass-card fade-in-up" style={{ animationDelay: '0.4s' }}>
        <div
          className="detail-header"
          onClick={() => setExpandedTable(!expandedTable)}
        >
          <h4 className="detail-title">詳細分析</h4>
          <span className={`toggle-icon ${expandedTable ? 'expanded' : ''}`}>▼</span>
        </div>
        {expandedTable && (
          <div className="detail-table-container">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>馬番</th>
                  <th>馬名</th>
                  <th>スコア</th>
                  <th>脚質</th>
                  <th>スタート位置</th>
                  <th>評価</th>
                </tr>
              </thead>
              <tbody>
                {prediction.predictions
                  .sort((a, b) => (kisouScores[b.horseNumber] || 0) - (kisouScores[a.horseNumber] || 0))
                  .map((horse) => {
                    const score = kisouScores[horse.horseNumber] || 0;
                    return (
                      <tr key={`table-${horse.horseNumber}`} className={getScoreClass(score)}>
                        <td>
                          <span className="horse-number-badge">{horse.horseNumber}</span>
                        </td>
                        <td className="horse-name-cell">{horse.horseName}</td>
                        <td>
                          <span className={`score-badge ${getScoreClass(score)}`}>
                            {score.toFixed(1)}
                          </span>
                        </td>
                        <td>
                          <span className={`style-badge ${horse.runningStyle}`}>
                            {RUNNING_STYLE_LABELS[horse.runningStyle]}
                          </span>
                        </td>
                        <td>{horse.expectedPosition2C.toFixed(1)}</td>
                        <td>
                          <span className="rating-stars">
                            {score >= 70 ? '★★★' : score >= 60 ? '★★' : score >= 50 ? '★' : '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{styles}</style>
    </div>
  );
}

// 馬アイコンコンポーネント
interface HorseIconProps {
  horse: HorsePositionPrediction;
  kisoScore: number;
  isSelected: boolean;
  onSelect: (num: number | null) => void;
  showSurge?: boolean;
}

function HorseIcon({ horse, kisoScore, isSelected, onSelect, showSurge = false }: HorseIconProps) {
  const wakuColor = WAKU_COLORS[horse.waku] || { from: '#cccccc', to: '#999999', text: '#000000' };
  const styleColor = RUNNING_STYLE_COLORS[horse.runningStyle];
  
  // スコアに応じた発光強度
  const glowIntensity = Math.max(0, Math.min(1, kisoScore / 100));
  const glowSize = 10 + glowIntensity * 20;

  return (
    <div
      className={`horse-icon ${isSelected ? 'selected' : ''} ${showSurge ? 'surge' : ''}`}
      onClick={() => onSelect(isSelected ? null : horse.horseNumber)}
      style={{
        background: `linear-gradient(135deg, ${wakuColor.from}, ${wakuColor.to})`,
        boxShadow: `0 0 ${glowSize}px rgba(${getRgbFromHex(styleColor.from)}, ${glowIntensity})`,
      }}
    >
      <span className="horse-number" style={{ color: wakuColor.text }}>
        {horse.horseNumber}
      </span>
      <div className="horse-tooltip">
        <strong>{horse.horseName}</strong>
        <br />
        スコア: {kisoScore.toFixed(1)}点
        <br />
        脚質: {RUNNING_STYLE_LABELS[horse.runningStyle]}
      </div>
    </div>
  );
}

// ヘックスカラーをRGBに変換
function getRgbFromHex(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '255, 255, 255';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

// スタイル定義
const styles = `
  /* =============== ベース設定 =============== */
  .race-pace-v5-container {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, #0f4c75 0%, #1a6b8f 50%, #2e8b9e 100%);
    padding: 32px;
    border-radius: 24px;
    min-height: 600px;
    position: relative;
  }

  /* =============== グラスモーフィズム =============== */
  .glass-card {
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  /* =============== アニメーション =============== */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-30px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 10px rgba(255, 107, 107, 0.5); }
    50% { box-shadow: 0 0 20px rgba(255, 107, 107, 1); }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .fade-in { animation: fadeIn 0.6s ease-out; }
  .slide-in-left { animation: slideInLeft 0.6s ease-out; }
  .slide-in-right { animation: slideInRight 0.6s ease-out; }
  .fade-in-up { animation: fadeInUp 0.6s ease-out; }

  /* =============== ヘッダーセクション =============== */
  .header-section {
    margin-bottom: 24px;
    padding: 20px 24px;
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }

  .main-title {
    font-size: 28px;
    font-weight: 700;
    margin: 0;
    color: #ffffff;
    letter-spacing: -0.02em;
  }

  .header-meta {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    align-items: center;
  }

  .pace-badge {
    padding: 8px 16px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 13px;
    color: #ffffff;
  }

  .badge-high { background: linear-gradient(135deg, #ff6b6b, #fa5252); }
  .badge-middle { background: linear-gradient(135deg, #ffd43b, #ffa94d); }
  .badge-slow { background: linear-gradient(135deg, #74c0fc, #4dabf7); }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
  }

  .meta-label {
    font-weight: 600;
  }

  .meta-value {
    font-weight: 700;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.15);
    padding: 2px 8px;
    border-radius: 8px;
  }

  /* =============== コースグリッド =============== */
  .course-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
  }

  @media (max-width: 1024px) {
    .course-grid {
      grid-template-columns: 1fr;
    }
  }

  .course-panel {
    padding: 20px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid rgba(255, 255, 255, 0.15);
  }

  .panel-title {
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
  }

  .panel-meta {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.08);
    padding: 4px 12px;
    border-radius: 12px;
  }

  .course-display {
    min-height: 200px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-content: flex-start;
    position: relative;
    padding: 16px;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 12px;
  }

  .direction-indicator {
    position: absolute;
    bottom: 8px;
    right: 12px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  /* =============== 馬アイコン =============== */
  .horse-wrapper {
    animation: fadeIn 0.4s ease-out;
  }

  .horse-icon {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: 2px solid rgba(255, 255, 255, 0.3);
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
  }

  .horse-icon:hover {
    transform: scale(1.15) translateY(-8px);
    filter: brightness(1.3);
  }

  .horse-icon.selected {
    transform: scale(1.2);
    border-color: #ffffff;
  }

  .horse-icon.surge {
    animation: pulse 1.5s ease-in-out infinite;
  }

  .horse-number {
    font-size: 20px;
    font-weight: 700;
  }

  .horse-tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.95);
    color: #ffffff;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s;
    z-index: 10;
    margin-bottom: 8px;
  }

  .horse-icon:hover .horse-tooltip {
    opacity: 1;
  }

  /* =============== 分析グリッド =============== */
  .analysis-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
  }

  @media (max-width: 768px) {
    .analysis-grid {
      grid-template-columns: 1fr;
    }
  }

  .analysis-panel {
    padding: 20px;
  }

  .panel-header-small {
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .panel-title-small {
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
  }

  /* =============== ペースメーター =============== */
  .pace-meter-container {
    margin-bottom: 16px;
  }

  .meter-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 600;
    margin-bottom: 8px;
  }

  .meter-bar {
    position: relative;
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .meter-fill {
    height: 100%;
    background: linear-gradient(90deg, #74c0fc, #ffa94d, #ff6b6b);
    border-radius: 4px;
    transition: width 0.6s ease-out;
  }

  .meter-marker {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    font-size: 11px;
    font-weight: 700;
    color: #ffffff;
    background: rgba(0, 0, 0, 0.5);
    padding: 0 6px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .meter-range {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
  }

  .pace-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .pace-badge-large {
    padding: 8px 14px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
  }

  .confidence-text {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }

  /* =============== 脚質マトリックス =============== */
  .running-style-matrix {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .matrix-item {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .style-icon {
    font-size: 28px;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
  }

  .escape-style .style-icon { background: linear-gradient(135deg, #ff6b6b, #fa5252); }
  .lead-style .style-icon { background: linear-gradient(135deg, #ffd43b, #ffa94d); }
  .sashi-style .style-icon { background: linear-gradient(135deg, #74c0fc, #4dabf7); }
  .oikomi-style .style-icon { background: linear-gradient(135deg, #b197fc, #9775fa); }

  .style-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 600;
  }

  .style-count {
    font-size: 24px;
    font-weight: 700;
    color: #ffffff;
  }

  /* =============== 詳細テーブル =============== */
  .detail-section {
    padding: 0;
    overflow: hidden;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    cursor: pointer;
    user-select: none;
    transition: background 0.2s;
  }

  .detail-header:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .detail-title {
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
  }

  .toggle-icon {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    transition: transform 0.3s;
  }

  .toggle-icon.expanded {
    transform: rotate(180deg);
  }

  .detail-table-container {
    overflow-x: auto;
    padding: 0 20px 20px;
  }

  .detail-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .detail-table th {
    padding: 12px 8px;
    text-align: left;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 600;
    font-size: 12px;
    border-bottom: 2px solid rgba(255, 255, 255, 0.15);
  }

  .detail-table td {
    padding: 12px 8px;
    color: #ffffff;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .detail-table tbody tr {
    transition: background 0.2s;
  }

  .detail-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .horse-number-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-weight: 700;
    background: linear-gradient(135deg, #ffa94d, #ffd89b);
    color: #ffffff;
  }

  .horse-name-cell {
    font-weight: 600;
  }

  .score-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 8px;
    font-weight: 700;
    color: #ffffff;
  }

  .score-badge.score-high { background: linear-gradient(135deg, #ff6b6b, #fa5252); }
  .score-badge.score-medium { background: linear-gradient(135deg, #ffd43b, #ffa94d); }
  .score-badge.score-low { background: linear-gradient(135deg, #74c0fc, #4dabf7); }
  .score-badge.score-minimal { background: rgba(255, 255, 255, 0.2); }

  .style-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 700;
    color: #ffffff;
  }

  .style-badge.escape { background: linear-gradient(135deg, #ff6b6b, #fa5252); }
  .style-badge.lead { background: linear-gradient(135deg, #ffd43b, #ffa94d); }
  .style-badge.sashi { background: linear-gradient(135deg, #74c0fc, #4dabf7); }
  .style-badge.oikomi { background: linear-gradient(135deg, #b197fc, #9775fa); }

  .rating-stars {
    font-size: 16px;
    color: #ffd43b;
  }

  /* =============== ローディング =============== */
  .loading-card,
  .error-card {
    padding: 60px 20px;
    text-align: center;
  }

  .loading-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid rgba(255, 255, 255, 0.2);
    border-top-color: #ffffff;
    border-radius: 50%;
    margin: 0 auto 20px;
    animation: spin 0.8s linear infinite;
  }

  .loading-text {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.8);
    margin: 0;
  }

  .error-text {
    font-size: 16px;
    color: #ff6b6b;
    margin: 0 0 8px;
  }

  .error-detail {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
  }

  /* =============== レスポンシブ =============== */
  @media (max-width: 640px) {
    .race-pace-v5-container {
      padding: 16px;
    }

    .main-title {
      font-size: 22px;
    }

    .horse-icon {
      width: 48px;
      height: 48px;
    }

    .horse-number {
      font-size: 16px;
    }
  }
`;





