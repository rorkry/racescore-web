/**
 * ラップタイム分析モジュール
 * 
 * レースのラップタイムを解析し、以下を判定:
 * 1. ハイレベル判定 - 勝ち馬の強さの根拠
 * 2. 巻き返し判定 - 不利なレースで健闘した馬の評価
 */

import { getCourseCharacteristicsForCondition } from '@/lib/course-characteristics';

// ========================================
// 型定義
// ========================================

export interface LapTimeData {
  lapTimes: number[];           // 1Fごとのラップ [12.3, 10.5, 11.8, ...]
  totalTime: number;            // 走破タイム
  first2F: number;              // 前半2F
  first3F: number;              // 前半3F
  first4F: number;              // 前半4F
  first5F: number;              // 前半5F (1000m)
  last3F: number;               // 上がり3F
  last4F: number;               // 後半4F
  last5F: number;               // 後半5F
}

export interface RaceCondition {
  place: string;                // 競馬場
  surface: '芝' | 'ダ';         // 芝/ダート
  distance: number;             // 距離
  trackCondition: string;       // 馬場状態
  className: string;            // クラス
  horseAge?: number;            // 年齢（新馬戦判定用）
}

export interface HorseRaceData {
  finishPosition: number;       // 着順
  margin: number;               // 着差（秒換算）
  corner4Position: number;      // 4角通過順位
  corner4Wide: number;          // 4角位置（内外: 0-4）
  ownLast3F: number;            // 自身の上がり3F
  runningStyle: 'escape' | 'lead' | 'mid' | 'closer'; // 脚質
}

export interface LapAnalysisResult {
  // ペース判定
  paceType: 'super_high' | 'high' | 'average' | 'slow' | 'super_slow';
  paceComment: string;
  
  // ハイレベル判定
  isHighLevel: boolean;
  highLevelType?: 'historical' | 'acceleration' | 'non_deceleration' | 'reverse';
  highLevelComment?: string;
  historicalRank?: number;      // 歴代順位
  
  // 歴代比較
  historicalComparison?: HistoricalComparisonResult;
  
  // 巻き返し判定（該当馬のみ）
  isRecoveryCandidate: boolean;
  recoveryComment?: string;
  recoveryReason?: string;
  
  // 不利パターン
  disadvantagePattern?: string;
  
  // スコア調整
  scoreAdjustment: number;      // 加減点
}

// 歴代比較用データ
export interface HistoricalLapRecord {
  date: string;
  place: string;
  className: string;
  trackCondition: string;
  last4F: number;
  last5F: number;
  winnerName?: string;
}

// 歴代比較結果
export interface HistoricalComparisonResult {
  last4FRank: number;           // 後半4F歴代順位
  last4FTotal: number;          // 比較対象レース数
  last4FValue: number;          // 後半4F値
  last5FRank: number;           // 後半5F歴代順位
  last5FTotal: number;          // 比較対象レース数
  last5FValue: number;          // 後半5F値
  isHistoricalHighLevel: boolean;  // 歴代上位（トップ10%以内）
  comment: string;
}

// ========================================
// ラップ解析ユーティリティ
// ========================================

/**
 * ラップ文字列をパース
 * 例: "12.3-10.5-11.8-12.1-12.4-12.6" → [12.3, 10.5, 11.8, 12.1, 12.4, 12.6]
 */
export function parseLapTimes(lapString: string | null | undefined): number[] {
  if (!lapString || typeof lapString !== 'string') return [];
  return lapString.split('-')
    .map(lap => parseFloat(lap.trim()))
    .filter(n => !isNaN(n) && n > 0);
}

/**
 * ラップデータを計算
 */
export function calculateLapData(laps: number[]): LapTimeData | null {
  if (!laps || laps.length < 3) return null;
  
  const len = laps.length;
  
  return {
    lapTimes: laps,
    totalTime: laps.reduce((a, b) => a + b, 0),
    first2F: laps.slice(0, 2).reduce((a, b) => a + b, 0),
    first3F: laps.slice(0, 3).reduce((a, b) => a + b, 0),
    first4F: laps.slice(0, Math.min(4, len)).reduce((a, b) => a + b, 0),
    first5F: laps.slice(0, Math.min(5, len)).reduce((a, b) => a + b, 0),
    last3F: laps.slice(-3).reduce((a, b) => a + b, 0),
    last4F: laps.slice(-Math.min(4, len)).reduce((a, b) => a + b, 0),
    last5F: laps.slice(-Math.min(5, len)).reduce((a, b) => a + b, 0),
  };
}

/**
 * 着差を秒数に変換
 */
export function parseMargin(margin: string | number | null | undefined): number {
  if (margin === null || margin === undefined) return 0;
  if (typeof margin === 'number') return margin;
  
  const str = margin.toString().trim();
  
  // 数値の場合
  const num = parseFloat(str);
  if (!isNaN(num)) return num;
  
  // 着差表記の変換
  const marginMap: { [key: string]: number } = {
    'ハナ': 0.0,
    'アタマ': 0.1,
    'クビ': 0.2,
    '1/2': 0.5,
    '3/4': 0.75,
    '1': 1.0,
    '1 1/4': 1.25,
    '1 1/2': 1.5,
    '1 3/4': 1.75,
    '2': 2.0,
    '3': 3.0,
    '大': 10.0,
  };
  
  return marginMap[str] ?? 0;
}

/**
 * 脚質を判定
 */
export function determineRunningStyle(
  corner2: number | undefined,
  corner4: number | undefined,
  totalHorses: number
): 'escape' | 'lead' | 'mid' | 'closer' {
  const pos = corner4 || corner2 || 99;
  const ratio = pos / totalHorses;
  
  if (pos === 1) return 'escape';
  if (ratio <= 0.25) return 'lead';
  if (ratio <= 0.6) return 'mid';
  return 'closer';
}

/**
 * 芝スタートかどうかを判定
 */
function isTurfStartCourse(place: string, surface: '芝' | 'ダ', distance: number): boolean {
  if (surface === '芝') return false;
  
  try {
    const courseInfo = getCourseCharacteristicsForCondition(place, `${surface}${distance}`, '良');
    return courseInfo?.turfStartDirt ?? false;
  } catch {
    return false;
  }
}

// ========================================
// ペース判定ロジック（距離別）
// ========================================

interface PaceThresholds {
  slow: number;
  avgLow: number;
  avgHigh: number;
  high: number;
  superHigh?: number;
}

/**
 * 距離・コース別のペース基準を取得
 */
function getPaceThresholds(
  surface: '芝' | 'ダ',
  distance: number,
  isTurfStart: boolean
): { first2F?: PaceThresholds; first3F?: PaceThresholds } {
  
  // 芝1200m
  if (surface === '芝' && distance >= 1100 && distance <= 1300) {
    return {
      first2F: { slow: 22.8, avgLow: 22.3, avgHigh: 22.7, high: 22.2, superHigh: 21.9 },
      first3F: { slow: 34.5, avgLow: 33.8, avgHigh: 34.4, high: 33.7, superHigh: 33.0 }
    };
  }
  
  // 芝1400m
  if (surface === '芝' && distance >= 1300 && distance <= 1500) {
    return {
      first2F: { slow: 23.0, avgLow: 22.5, avgHigh: 22.9, high: 22.4, superHigh: 21.9 },
      first3F: { slow: 34.8, avgLow: 34.0, avgHigh: 34.7, high: 33.9, superHigh: 33.3 }
    };
  }
  
  // 芝1600m
  if (surface === '芝' && distance >= 1500 && distance <= 1700) {
    return {
      first3F: { slow: 35.0, avgLow: 34.3, avgHigh: 34.9, high: 34.2, superHigh: 33.9 }
    };
  }
  
  // 芝1800-2000m
  if (surface === '芝' && distance >= 1700 && distance <= 2100) {
    return {
      first3F: { slow: 35.3, avgLow: 34.6, avgHigh: 35.2, high: 34.5, superHigh: 33.9 }
    };
  }
  
  // ダート1200m（芝スタート）
  if (surface === 'ダ' && distance >= 1100 && distance <= 1300 && isTurfStart) {
    return {
      first3F: { slow: 35.0, avgLow: 34.0, avgHigh: 34.9, high: 33.9, superHigh: 33.4 }
    };
  }
  
  // ダート1200m（オールダート）
  if (surface === 'ダ' && distance >= 1100 && distance <= 1300 && !isTurfStart) {
    return {
      first3F: { slow: 35.5, avgLow: 34.7, avgHigh: 35.5, high: 34.6, superHigh: 34.0 }
    };
  }
  
  // ダート1400m（芝スタート）
  if (surface === 'ダ' && distance >= 1300 && distance <= 1500 && isTurfStart) {
    return {
      first3F: { slow: 35.8, avgLow: 34.5, avgHigh: 35.7, high: 34.4, superHigh: 33.9 }
    };
  }
  
  // ダート1400m（オールダート）
  if (surface === 'ダ' && distance >= 1300 && distance <= 1500 && !isTurfStart) {
    return {
      first3F: { slow: 35.5, avgLow: 35.0, avgHigh: 35.5, high: 34.9, superHigh: 34.5 }
    };
  }
  
  // ダート1600m
  if (surface === 'ダ' && distance >= 1500 && distance <= 1700) {
    return {
      first3F: { slow: 36.0, avgLow: 34.5, avgHigh: 35.9, high: 34.4, superHigh: 34.0 }
    };
  }
  
  // ダート1800m
  if (surface === 'ダ' && distance >= 1700 && distance <= 1900) {
    return {
      first3F: { slow: 37.5, avgLow: 36.5, avgHigh: 37.4, high: 35.9, superHigh: 35.4 }
    };
  }
  
  // デフォルト
  return {
    first3F: { slow: 36.0, avgLow: 34.5, avgHigh: 35.5, high: 34.0, superHigh: 33.5 }
  };
}

/**
 * ペースタイプを判定
 */
function judgePaceType(
  lapData: LapTimeData,
  thresholds: { first2F?: PaceThresholds; first3F?: PaceThresholds }
): { type: 'super_high' | 'high' | 'average' | 'slow' | 'super_slow'; comment: string } {
  
  // 前半3Fで判定（優先）
  if (thresholds.first3F) {
    const f3 = lapData.first3F;
    const t = thresholds.first3F;
    
    if (t.superHigh && f3 <= t.superHigh) {
      return { type: 'super_high', comment: `前半3F ${f3.toFixed(1)}秒は超ハイペース` };
    }
    if (f3 <= t.high) {
      return { type: 'high', comment: `前半3F ${f3.toFixed(1)}秒はハイペース` };
    }
    if (f3 >= t.slow) {
      return { type: 'slow', comment: `前半3F ${f3.toFixed(1)}秒はスローペース` };
    }
    return { type: 'average', comment: `前半3F ${f3.toFixed(1)}秒は平均ペース` };
  }
  
  // 前半2Fで判定
  if (thresholds.first2F) {
    const f2 = lapData.first2F;
    const t = thresholds.first2F;
    
    if (t.superHigh && f2 <= t.superHigh) {
      return { type: 'super_high', comment: `前半2F ${f2.toFixed(1)}秒は超ハイペース` };
    }
    if (f2 <= t.high) {
      return { type: 'high', comment: `前半2F ${f2.toFixed(1)}秒はハイペース` };
    }
    if (f2 >= t.slow) {
      return { type: 'slow', comment: `前半2F ${f2.toFixed(1)}秒はスローペース` };
    }
    return { type: 'average', comment: `前半2F ${f2.toFixed(1)}秒は平均ペース` };
  }
  
  return { type: 'average', comment: '平均ペース' };
}

// ========================================
// 不利パターン判定
// ========================================

interface DisadvantageResult {
  pattern: string;
  description: string;
  affectedStyles: ('escape' | 'lead' | 'mid' | 'closer')[];
  isDisadvantaged: boolean;
}

/**
 * 不利パターンを判定
 */
function checkDisadvantagePattern(
  lapData: LapTimeData,
  condition: RaceCondition,
  isTurfStart: boolean
): DisadvantageResult | null {
  const { surface, distance } = condition;
  const { first3F, last3F, last4F, lapTimes } = lapData;
  
  // === 芝1200m ===
  if (surface === '芝' && distance >= 1100 && distance <= 1300) {
    // 前傾消耗戦: テン3F33秒台前半＋後半35.5-36秒台
    if (first3F <= 33.5 && last3F >= 35.5) {
      return {
        pattern: 'front_collapse_sprint',
        description: `前傾消耗戦（前半${first3F.toFixed(1)}秒→上がり${last3F.toFixed(1)}秒）`,
        affectedStyles: ['escape', 'lead'],
        isDisadvantaged: true
      };
    }
    // スロー瞬発戦: テン3F34.5秒前後＋上がり33秒台
    if (first3F >= 34.3 && last3F <= 33.9) {
      return {
        pattern: 'slow_sprint',
        description: `スロー瞬発戦（前半${first3F.toFixed(1)}秒→上がり${last3F.toFixed(1)}秒）`,
        affectedStyles: ['closer'],
        isDisadvantaged: true
      };
    }
  }
  
  // === 芝1400m ===
  if (surface === '芝' && distance >= 1300 && distance <= 1500) {
    // 前傾消耗戦
    if (first3F <= 33.5 && last3F >= 35.5) {
      return {
        pattern: 'front_collapse_1400',
        description: `前傾消耗戦（前半${first3F.toFixed(1)}秒→上がり${last3F.toFixed(1)}秒）`,
        affectedStyles: ['escape', 'lead'],
        isDisadvantaged: true
      };
    }
    // 中盤締め付け: 34秒台なのに中盤11秒台連発
    const midLaps = lapTimes.slice(2, 5);
    const hasHardMid = midLaps.some(l => l <= 11.5);
    if (first3F >= 34.0 && first3F <= 34.9 && hasHardMid && last3F >= 35.0) {
      return {
        pattern: 'mid_squeeze',
        description: `中盤締め付け（中盤に11秒台連発）`,
        affectedStyles: ['lead'],
        isDisadvantaged: true
      };
    }
    // スロー瞬発戦
    if (first3F >= 34.8 && last3F <= 33.5) {
      return {
        pattern: 'slow_sprint_1400',
        description: `スロー瞬発戦（前半${first3F.toFixed(1)}秒→上がり${last3F.toFixed(1)}秒）`,
        affectedStyles: ['closer'],
        isDisadvantaged: true
      };
    }
  }
  
  // === 芝1600m ===
  if (surface === '芝' && distance >= 1500 && distance <= 1700) {
    // 前傾戦: テン3F33秒台＋上がり35.5秒以上
    if (first3F <= 33.9 && last3F >= 35.5) {
      return {
        pattern: 'front_collapse_mile',
        description: `前傾戦（前半${first3F.toFixed(1)}秒→上がり${last3F.toFixed(1)}秒）`,
        affectedStyles: ['escape', 'lead'],
        isDisadvantaged: true
      };
    }
    // 極端な瞬発戦: スロー＋上がり33秒前後
    if (first3F >= 34.8 && last3F <= 33.3) {
      return {
        pattern: 'extreme_sprint_mile',
        description: `極端な瞬発戦（前半${first3F.toFixed(1)}秒→上がり${last3F.toFixed(1)}秒）`,
        affectedStyles: ['closer'],
        isDisadvantaged: true
      };
    }
  }
  
  // === 芝1800-2000m ===
  if (surface === '芝' && distance >= 1700 && distance <= 2100) {
    const first5F = lapData.first5F;
    
    // ロングスパート戦: 残り5Fから11秒台続く
    const last5Laps = lapTimes.slice(-5);
    const longSpurt = last5Laps.filter(l => l <= 12.0).length >= 4;
    if (longSpurt) {
      return {
        pattern: 'long_spurt',
        description: `ロングスパート戦（後半5F${lapData.last5F.toFixed(1)}秒）`,
        affectedStyles: ['escape', 'lead'],
        isDisadvantaged: true
      };
    }
    
    // 乱ペース: 中盤のアップダウン
    const midLaps = lapTimes.slice(2, -2);
    let upDownCount = 0;
    for (let i = 1; i < midLaps.length; i++) {
      if (Math.abs(midLaps[i] - midLaps[i-1]) >= 0.8) upDownCount++;
    }
    if (upDownCount >= 2) {
      return {
        pattern: 'uneven_pace',
        description: `乱ペース（中盤でラップの上下動）`,
        affectedStyles: ['lead'],
        isDisadvantaged: true
      };
    }
    
    // 極端なスロー4F戦: 前半1000m63秒以上＋後半4F加速
    if (first5F >= 63.0 && last4F <= 47.0) {
      return {
        pattern: 'slow_4f_sprint',
        description: `スロー4F戦（前半1000m${first5F.toFixed(1)}秒）`,
        affectedStyles: ['closer'],
        isDisadvantaged: true
      };
    }
  }
  
  // === ダート1200m ===
  if (surface === 'ダ' && distance >= 1100 && distance <= 1300) {
    // 前総崩れ: 前半33秒台＋上がり37秒台
    if (first3F <= 33.9 && last3F >= 37.0) {
      return {
        pattern: 'front_collapse_dirt_sprint',
        description: `前総崩れ（前半${first3F.toFixed(1)}秒→上がり${last3F.toFixed(1)}秒）`,
        affectedStyles: ['escape', 'lead'],
        isDisadvantaged: true
      };
    }
  }
  
  // === ダート1400m ===
  if (surface === 'ダ' && distance >= 1300 && distance <= 1500) {
    if (isTurfStart) {
      // 前傾戦: 前半34秒前半＋後半37.5秒以上
      if (first3F <= 34.3 && last3F >= 37.5) {
        return {
          pattern: 'front_collapse_dirt_1400',
          description: `前傾戦（前半${first3F.toFixed(1)}秒→上がり${last3F.toFixed(1)}秒）`,
          affectedStyles: ['escape', 'lead'],
          isDisadvantaged: true
        };
      }
      // スロー瞬発: 35秒台後半＋上がり35秒前後
      if (first3F >= 35.5 && last3F <= 35.3) {
        return {
          pattern: 'slow_sprint_dirt_1400',
          description: `スロー瞬発戦`,
          affectedStyles: ['closer'],
          isDisadvantaged: true
        };
      }
    } else {
      // ハイペース判定
      if (first3F <= 34.9) {
        return {
          pattern: 'high_pace_dirt_1400',
          description: `ハイペース（前半${first3F.toFixed(1)}秒）`,
          affectedStyles: ['escape', 'lead'],
          isDisadvantaged: true
        };
      }
    }
  }
  
  // === ダート1600m ===
  if (surface === 'ダ' && distance >= 1500 && distance <= 1700) {
    // 4.5F目で緩まない一貫速いラップ
    const midLaps = lapTimes.slice(3, 6);
    const allFast = midLaps.every(l => l <= 12.3);
    if (allFast && midLaps.length >= 2) {
      return {
        pattern: 'no_breather_mile',
        description: `緩みのない一貫ペース（中盤${midLaps.map(l => l.toFixed(1)).join('-')}）`,
        affectedStyles: ['lead'],
        isDisadvantaged: true
      };
    }
    // 前総崩れ
    if (first3F <= 34.5 && last3F >= 37.0) {
      return {
        pattern: 'front_collapse_dirt_mile',
        description: `前総崩れ（前半${first3F.toFixed(1)}秒→上がり${last3F.toFixed(1)}秒）`,
        affectedStyles: ['escape', 'lead'],
        isDisadvantaged: true
      };
    }
  }
  
  // === ダート1800m ===
  if (surface === 'ダ' && distance >= 1700 && distance <= 1900) {
    // 距離延長組のハイペース
    if (first3F <= 35.9) {
      return {
        pattern: 'high_pace_dirt_1800',
        description: `ハイペース（前半${first3F.toFixed(1)}秒）`,
        affectedStyles: ['escape', 'lead'],
        isDisadvantaged: true
      };
    }
    // ロングスパート
    const last5Laps = lapTimes.slice(-5);
    const longSpurt = last5Laps.filter(l => l <= 12.3).length >= 4;
    if (longSpurt) {
      return {
        pattern: 'long_spurt_dirt',
        description: `ロングスパート戦`,
        affectedStyles: ['escape', 'lead'],
        isDisadvantaged: true
      };
    }
    // 極端なスロー
    const first5F = lapData.first5F;
    if (first5F >= 63.0 && last4F <= 49.0) {
      return {
        pattern: 'slow_sprint_dirt_1800',
        description: `スロー4F戦`,
        affectedStyles: ['closer'],
        isDisadvantaged: true
      };
    }
  }
  
  return null;
}

// ========================================
// ハイレベル判定
// ========================================

/**
 * 加速・非減速・微減速ラップを判定
 * 
 * 定義:
 * - 加速ラップ: 各ラップが前より速くなる（11.5 -> 11.4 -> 11.3）
 * - 非減速ラップ: 全く減速しない（11.5 -> 11.5 = 0.0差）
 * - 微減速ラップ: 0.1〜0.2秒の減速（ペース次第で評価）
 * - 減速ラップ: 0.3秒以上の減速
 */
interface AccelerationResult {
  isAcceleration: boolean;      // 加速ラップ
  isNonDeceleration: boolean;   // 非減速ラップ（完全）
  isSlightDecel: boolean;       // 微減速ラップ（0.1-0.2）
  maxDeceleration: number;      // 最大減速幅
  comment: string;
  lapPattern: string;           // ラップパターン表示用
}

function checkAccelerationPattern(lapData: LapTimeData): AccelerationResult {
  const laps = lapData.lapTimes;
  const defaultResult: AccelerationResult = {
    isAcceleration: false,
    isNonDeceleration: false,
    isSlightDecel: false,
    maxDeceleration: 999,
    comment: '',
    lapPattern: ''
  };
  
  if (laps.length < 4) return defaultResult;
  
  // 後半3Fを確認
  const last3 = laps.slice(-3);
  const lapPattern = last3.map(l => l.toFixed(1)).join('-');
  
  // 各ラップ間の変化を計算（正=減速、負=加速）
  const decel1 = last3[1] - last3[0];  // 2F目 - 1F目
  const decel2 = last3[2] - last3[1];  // 3F目 - 2F目
  const maxDecel = Math.max(decel1, decel2);
  
  // 加速ラップ: 両方とも加速している（負の値）
  const isAcceleration = decel1 < 0 && decel2 < 0;
  
  // 非減速ラップ（厳密）: 全く減速しない（0.0以下）
  // 11.5-11.5 = 0.0差、11.5-11.4 = -0.1差（加速）
  const isNonDeceleration = maxDecel <= 0;
  
  // 微減速ラップ: 最大0.2秒以内の減速（0.1〜0.2）
  const isSlightDecel = maxDecel > 0 && maxDecel <= 0.2;
  
  if (isAcceleration) {
    return {
      isAcceleration: true,
      isNonDeceleration: true,  // 加速は非減速を包含
      isSlightDecel: false,
      maxDeceleration: maxDecel,
      comment: `加速ラップ（${lapPattern}）`,
      lapPattern
    };
  }
  
  if (isNonDeceleration) {
    return {
      isAcceleration: false,
      isNonDeceleration: true,
      isSlightDecel: false,
      maxDeceleration: maxDecel,
      comment: `非減速ラップ（${lapPattern}）`,
      lapPattern
    };
  }
  
  if (isSlightDecel) {
    return {
      isAcceleration: false,
      isNonDeceleration: false,
      isSlightDecel: true,
      maxDeceleration: maxDecel,
      comment: `微減速ラップ（${lapPattern}）-${maxDecel.toFixed(1)}秒`,
      lapPattern
    };
  }
  
  return {
    ...defaultResult,
    maxDeceleration: maxDecel,
    lapPattern,
    comment: `減速ラップ（${lapPattern}）-${maxDecel.toFixed(1)}秒`
  };
}

/**
 * ペースを考慮したラップ評価
 * 
 * ミドル以上のペース + 加速/非減速/微減速(0.2以内) → 強い競馬
 * スローペース + 少しでも減速 → 低レベルの可能性
 */
function evaluateLapWithPace(
  accel: AccelerationResult,
  paceType: 'super_high' | 'high' | 'average' | 'slow' | 'super_slow'
): {
  isStrongRace: boolean;
  isWeakRace: boolean;
  adjustedComment: string;
  scoreBonus: number;
} {
  const isFastPace = paceType === 'super_high' || paceType === 'high' || paceType === 'average';
  const isSlowPace = paceType === 'slow' || paceType === 'super_slow';
  
  // 加速ラップ
  if (accel.isAcceleration) {
    if (isFastPace) {
      return {
        isStrongRace: true,
        isWeakRace: false,
        adjustedComment: `ミドル以上のペースで加速ラップ（${accel.lapPattern}）は非常に強い内容`,
        scoreBonus: 10
      };
    } else {
      return {
        isStrongRace: true,
        isWeakRace: false,
        adjustedComment: `スローからの加速ラップ（${accel.lapPattern}）`,
        scoreBonus: 6
      };
    }
  }
  
  // 非減速ラップ（完全）
  if (accel.isNonDeceleration) {
    if (isFastPace) {
      return {
        isStrongRace: true,
        isWeakRace: false,
        adjustedComment: `ミドル以上のペースで非減速（${accel.lapPattern}）は強い内容`,
        scoreBonus: 7
      };
    } else {
      return {
        isStrongRace: true,
        isWeakRace: false,
        adjustedComment: `非減速ラップ（${accel.lapPattern}）`,
        scoreBonus: 4
      };
    }
  }
  
  // 微減速ラップ（0.1〜0.2秒）
  if (accel.isSlightDecel) {
    if (isFastPace) {
      // ミドル以上のペースで0.2以内の減速 → まだ強い
      return {
        isStrongRace: true,
        isWeakRace: false,
        adjustedComment: `ミドル以上のペースで微減速${accel.maxDeceleration.toFixed(1)}秒（${accel.lapPattern}）は評価できる`,
        scoreBonus: 4
      };
    } else {
      // スローで少しでも減速 → 低レベルの可能性
      return {
        isStrongRace: false,
        isWeakRace: true,
        adjustedComment: `スローペースで減速（${accel.lapPattern}）は低レベルの可能性`,
        scoreBonus: -2
      };
    }
  }
  
  // 通常の減速ラップ（0.3秒以上）
  if (isSlowPace) {
    return {
      isStrongRace: false,
      isWeakRace: true,
      adjustedComment: `スローから減速（${accel.lapPattern}）は低レベル`,
      scoreBonus: -3
    };
  }
  
  return {
    isStrongRace: false,
    isWeakRace: false,
    adjustedComment: '',
    scoreBonus: 0
  };
}

// ========================================
// メイン分析関数
// ========================================

/**
 * レースのラップを分析
 */
export function analyzeRaceLap(
  lapString: string | null | undefined,
  condition: RaceCondition,
  horse: HorseRaceData
): LapAnalysisResult | null {
  // ラップをパース
  const laps = parseLapTimes(lapString);
  if (laps.length < 4) return null;
  
  const lapData = calculateLapData(laps);
  if (!lapData) return null;
  
  const { surface, distance, place } = condition;
  const isTurfStart = isTurfStartCourse(place, surface, distance);
  
  // ペース判定
  const thresholds = getPaceThresholds(surface, distance, isTurfStart);
  const pace = judgePaceType(lapData, thresholds);
  
  // 不利パターン判定
  const disadvantage = checkDisadvantagePattern(lapData, condition, isTurfStart);
  
  // 加速・非減速判定
  const acceleration = checkAccelerationPattern(lapData);
  
  // ペースを考慮したラップ評価
  const lapWithPace = evaluateLapWithPace(acceleration, pace.type);
  
  // 初期結果
  const result: LapAnalysisResult = {
    paceType: pace.type,
    paceComment: pace.comment,
    isHighLevel: false,
    isRecoveryCandidate: false,
    scoreAdjustment: 0,
  };
  
  // === ハイレベル判定 ===
  
  // ペース連動でハイレベルと判定された場合（勝ち馬のみ）
  if (lapWithPace.isStrongRace && horse.finishPosition === 1) {
    result.isHighLevel = true;
    
    // 加速ラップか非減速ラップかで分類
    if (acceleration.isAcceleration) {
      result.highLevelType = 'acceleration';
      result.highLevelComment = `加速ラップで勝利。${lapWithPace.adjustedComment}`;
    } else if (acceleration.isNonDeceleration) {
      result.highLevelType = 'non_deceleration';
      result.highLevelComment = `非減速ラップで勝利。${lapWithPace.adjustedComment}`;
    } else if (acceleration.isSlightDecel) {
      // 微減速でもペース次第で評価
      result.highLevelType = 'non_deceleration';
      result.highLevelComment = `微減速でも評価できる勝利。${lapWithPace.adjustedComment}`;
    }
    
    result.scoreAdjustment += lapWithPace.scoreBonus;
  }
  // 逆行ハイレベル: 不利パターンで1-2着
  else if (
    disadvantage &&
    disadvantage.affectedStyles.includes(horse.runningStyle) &&
    horse.finishPosition <= 2 &&
    horse.corner4Wide >= 2  // 中〜外を回っていた
  ) {
    result.isHighLevel = true;
    result.highLevelType = 'reverse';
    result.highLevelComment = `${disadvantage.description}で${horse.finishPosition}着。不利を跳ね返す強さ。`;
    result.scoreAdjustment += 10;
  }
  // スローで減速 → 低レベルの可能性（勝ち馬でも注意）
  else if (lapWithPace.isWeakRace && horse.finishPosition === 1) {
    result.highLevelComment = lapWithPace.adjustedComment;
    result.scoreAdjustment += lapWithPace.scoreBonus;  // 負のボーナス
  }
  
  // === 巻き返し判定 ===
  
  if (disadvantage && horse.margin <= 1.0 && horse.finishPosition > 2) {
    const wasAffected = disadvantage.affectedStyles.includes(horse.runningStyle);
    const ranWide = horse.corner4Wide >= 3;  // 外を回った
    
    if (wasAffected || ranWide) {
      result.isRecoveryCandidate = true;
      result.disadvantagePattern = disadvantage.pattern;
      
      const wideNote = ranWide ? `4角外${horse.corner4Wide}番手で` : '';
      const styleNote = wasAffected ? `${getStyleName(horse.runningStyle)}で不利な展開` : '';
      
      result.recoveryReason = `${disadvantage.description}`;
      result.recoveryComment = `${wideNote}${styleNote}。着差${horse.margin.toFixed(1)}秒なら巻き返し候補。`;
      result.scoreAdjustment += 5;
    }
  }
  
  return result;
}

/**
 * 脚質名を取得
 */
function getStyleName(style: 'escape' | 'lead' | 'mid' | 'closer'): string {
  const names = { escape: '逃げ', lead: '先行', mid: '中団', closer: '差し・追込' };
  return names[style];
}

/**
 * 過去走のラップ分析を実行
 */
export function analyzePastRaceLap(
  pastRace: {
    lapString?: string;
    place: string;
    surface: '芝' | 'ダ';
    distance: number;
    trackCondition: string;
    className: string;
    finishPosition: number;
    margin: string | number;
    corner4?: number;
    corner4Wide?: number;  // index_value
    ownLast3F?: number;
    totalHorses?: number;
    corner2?: number;
  }
): LapAnalysisResult | null {
  const condition: RaceCondition = {
    place: pastRace.place,
    surface: pastRace.surface,
    distance: pastRace.distance,
    trackCondition: pastRace.trackCondition,
    className: pastRace.className,
  };
  
  const horse: HorseRaceData = {
    finishPosition: pastRace.finishPosition,
    margin: parseMargin(pastRace.margin),
    corner4Position: pastRace.corner4 || 99,
    corner4Wide: pastRace.corner4Wide || 2,  // デフォルト中
    ownLast3F: pastRace.ownLast3F || 0,
    runningStyle: determineRunningStyle(
      pastRace.corner2,
      pastRace.corner4,
      pastRace.totalHorses || 16
    ),
  };
  
  return analyzeRaceLap(pastRace.lapString, condition, horse);
}

// ========================================
// 歴代比較機能
// ========================================

/**
 * 歴代データと比較してランキングを算出
 * 
 * @param currentLapData - 現在のレースのラップデータ
 * @param historicalRecords - 同条件の歴代レコード（API側で取得）
 * @param condition - レース条件
 */
export function compareWithHistorical(
  currentLapData: LapTimeData,
  historicalRecords: HistoricalLapRecord[],
  condition: RaceCondition
): HistoricalComparisonResult | null {
  if (historicalRecords.length < 5) {
    // サンプル数が少なすぎる場合は比較しない
    return null;
  }

  const { last4F, last5F } = currentLapData;
  
  // 後半4Fでソート（速い順）
  const sorted4F = historicalRecords
    .filter(r => r.last4F > 0)
    .map(r => r.last4F)
    .sort((a, b) => a - b);
  
  // 後半5Fでソート（速い順）
  const sorted5F = historicalRecords
    .filter(r => r.last5F > 0)
    .map(r => r.last5F)
    .sort((a, b) => a - b);

  // 順位を計算
  const last4FRank = sorted4F.filter(v => v < last4F).length + 1;
  const last5FRank = sorted5F.filter(v => v < last5F).length + 1;
  
  const last4FTotal = sorted4F.length;
  const last5FTotal = sorted5F.length;

  // トップ10%以内ならハイレベル
  const isTop10Percent4F = last4FRank <= Math.max(1, Math.floor(last4FTotal * 0.1));
  const isTop10Percent5F = last5FRank <= Math.max(1, Math.floor(last5FTotal * 0.1));
  const isHistoricalHighLevel = isTop10Percent4F || isTop10Percent5F;

  // コメント生成（2019年以降のデータに基づく）
  let comment = '';
  const placeDistance = `${condition.place}${condition.surface}${condition.distance}m`;
  const classLabel = normalizeClassForDisplay(condition.className);

  if (isTop10Percent4F && last4FTotal >= 10) {
    comment = `後半4F ${last4F.toFixed(1)}秒は${classLabel}${placeDistance}で'19年以降${last4FRank}位/${last4FTotal}レース中`;
  } else if (isTop10Percent5F && last5FTotal >= 10) {
    comment = `後半5F ${last5F.toFixed(1)}秒は${classLabel}${placeDistance}で'19年以降${last5FRank}位/${last5FTotal}レース中`;
  } else if (last4FRank <= 3 && last4FTotal >= 5) {
    comment = `後半4F ${last4F.toFixed(1)}秒は${classLabel}${placeDistance}で'19年以降${last4FRank}位`;
  } else if (last5FRank <= 3 && last5FTotal >= 5) {
    comment = `後半5F ${last5F.toFixed(1)}秒は${classLabel}${placeDistance}で'19年以降${last5FRank}位`;
  }

  return {
    last4FRank,
    last4FTotal,
    last4FValue: last4F,
    last5FRank,
    last5FTotal,
    last5FValue: last5F,
    isHistoricalHighLevel,
    comment,
  };
}

/**
 * クラス名を表示用に正規化
 */
function normalizeClassForDisplay(className: string): string {
  if (!className) return '';
  
  const normalized = className.trim();
  
  // 新馬・未勝利
  if (normalized.includes('新馬')) return '新馬戦';
  if (normalized.includes('未勝利')) return '未勝利';
  
  // 〇勝クラス
  if (normalized.includes('1勝') || normalized.includes('1勝')) return '1勝クラス';
  if (normalized.includes('2勝') || normalized.includes('2勝')) return '2勝クラス';
  if (normalized.includes('3勝') || normalized.includes('3勝')) return '3勝クラス';
  
  // 重賞
  if (normalized.includes('G1') || normalized.includes('Ｇ１')) return 'G1';
  if (normalized.includes('G2') || normalized.includes('Ｇ２')) return 'G2';
  if (normalized.includes('G3') || normalized.includes('Ｇ３')) return 'G3';
  
  // オープン
  if (normalized.includes('OP') || normalized.includes('オープン') || normalized.includes('ｵｰﾌﾟﾝ')) return 'OP';
  
  return normalized;
}

/**
 * 歴代比較用のラップデータを抽出（勝ち馬のデータ）
 * APIから渡される過去レースデータから歴代記録を生成
 */
export function extractHistoricalRecord(
  race: {
    date: string;
    place: string;
    className: string;
    trackCondition: string;
    lapString?: string;
    winnerName?: string;
    finishPosition?: number;
  }
): HistoricalLapRecord | null {
  // 勝ち馬のデータのみ抽出（1着のみ歴代記録に含める）
  if (race.finishPosition !== undefined && race.finishPosition !== 1) {
    return null;
  }

  const laps = parseLapTimes(race.lapString);
  if (laps.length < 4) return null;

  const lapData = calculateLapData(laps);
  if (!lapData) return null;

  return {
    date: race.date,
    place: race.place,
    className: race.className,
    trackCondition: race.trackCondition,
    last4F: lapData.last4F,
    last5F: lapData.last5F,
    winnerName: race.winnerName,
  };
}
