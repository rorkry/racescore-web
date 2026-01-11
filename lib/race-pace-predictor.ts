import type Database from 'better-sqlite3';
import type { 
  PaceType, 
  RunningStyle, 
  RacePacePrediction,
  HorsePositionPrediction,
  WakujunRecord
} from '@/types/race-pace-types';
import { getCourseCharacteristics } from './course-characteristics';

/**
 * 偏差値を計算（平均50、標準偏差10）
 */
function calculateDeviation(
  value: number,
  mean: number,
  stdDev: number
): number {
  if (stdDev === 0) return 50; // 全員同じスコアの場合
  return 50 + ((value - mean) / stdDev) * 10;
}

/**
 * レース内の競うスコア偏差値を計算
 */
export function calculateScoreDeviations(
  kisouScores: Record<number, number>
): Record<number, number> {
  const scores = Object.values(kisouScores).filter(s => s > 0);
  
  if (scores.length === 0) {
    return {};
  }
  
  // 平均値
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  
  // 標準偏差
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  
  // ✅ デバッグログ
  console.log('[calculateScoreDeviations]',
    `平均スコア=${mean.toFixed(1)}`,
    `標準偏差=${stdDev.toFixed(1)}`,
    `スコア範囲=${Math.min(...scores)}-${Math.max(...scores)}`
  );
  
  // 各馬の偏差値を計算
  const deviations: Record<number, number> = {};
  
  for (const [horseNum, score] of Object.entries(kisouScores)) {
    if (score > 0) {
      deviations[parseInt(horseNum, 10)] = calculateDeviation(score, mean, stdDev);
    } else {
      deviations[parseInt(horseNum, 10)] = 25; // データなし = 偏差値25
    }
  }
  
  return deviations;
}

/**
 * =====================================================
 * 【新シンプルロジック】スタート後位置を計算
 * 
 * 主要ファクター:
 * 1. T2Fパーセンタイル（メンバー内での相対速度）
 * 2. 逃げ経験（2C=1位の回数）
 * 3. 枠番（内枠やや有利）
 * =====================================================
 */
export function calculateSimpleStartPosition(
  horseNumber: number,
  t2fPercentile: number | null,  // 低いほど速い（1-100）
  hasT2FData: boolean,
  escapeCount: number,
  wakuNumber: number,
  totalHorses: number
): number {
  // デフォルト: 中団
  let position = totalHorses * 0.5;
  
  // =====================================================
  // 1. T2Fパーセンタイルが最重要（メンバー内相対評価）
  // =====================================================
  if (hasT2FData && t2fPercentile !== null) {
    // T2Fパーセンタイルをそのまま位置に変換
    // パーセンタイル10% → 位置 10% = 1-2番手
    // パーセンタイル50% → 位置 50% = 中団
    // パーセンタイル90% → 位置 90% = 後方
    position = (t2fPercentile / 100) * totalHorses;
    
    console.log(`[SimpleStart] 馬${horseNumber}: T2F%=${t2fPercentile} → 基本位置=${position.toFixed(1)}`);
  } else {
    // T2Fデータなし → 中団やや後ろ
    position = totalHorses * 0.6;
    console.log(`[SimpleStart] 馬${horseNumber}: T2Fデータなし → 位置=${position.toFixed(1)}`);
  }
  
  // =====================================================
  // 2. 逃げ経験による補正（前へ）
  // =====================================================
  if (escapeCount >= 3) {
    position -= 2.0;
  } else if (escapeCount >= 1) {
    position -= 1.0;
  }
  
  // =====================================================
  // 3. 枠番による微調整（内枠やや前、外枠やや後ろ）
  // =====================================================
  const wakuAdjust = (wakuNumber - 4.5) * 0.3;  // -1.05 〜 +1.05
  position += wakuAdjust;
  
  // 最小1、最大=頭数+1に制限
  position = Math.max(1, Math.min(totalHorses + 1, position));
  
  return position;
}

/**
 * =====================================================
 * 【新シンプルロジック】脚質を推定
 * =====================================================
 */
export function estimateSimpleRunningStyle(
  startPosition: number,
  totalHorses: number
): RunningStyle {
  const positionRatio = startPosition / totalHorses;
  
  if (positionRatio <= 0.15) return 'escape';
  if (positionRatio <= 0.35) return 'lead';
  if (positionRatio <= 0.70) return 'sashi';
  return 'oikomi';
}

/**
 * 既存のindicesテーブルからT2F（前半2Fラップ）とL4Fを取得
 * 【改善版】今回の距離±200m以内のレースのみを対象
 * 
 * race_id: 18桁（例: 202501050701010102）
 * - 最初の16桁 = race_id（馬番なし）
 * - 最後の2桁 = 馬番号
 */
function calculateAvgIndicesForDistance(
  db: Database.Database,
  horseName: string,
  targetDistance: number, // 今回のレース距離
  targetSurface: string   // '芝' or 'ダート'
): { 
  avgT2F: number | null;  // 平均T2F（前半2F秒数）
  avgL4F: number | null;  // 平均L4F（後半4F指数）
  t2fRaceCount: number;   // T2Fデータがあるレース数
  l4fRaceCount: number;   // L4Fデータがあるレース数
  fastestT2F: number | null; 
  avgPotential: number | null;
  avgMakikaeshi: number | null;
  // デバッグ用：対象レースの詳細
  relevantRaces: Array<{ date: string; distance: number; T2F: number; L4F: number }>;
} {
  try {
    // umadataからこの馬の距離±200mのレースを取得
    const raceIdsQuery = `
      SELECT DISTINCT 
        race_id_new_no_horse_num, 
        horse_number, 
        corner_2,
        date,
        distance
      FROM umadata
      WHERE horse_name = ?
      ORDER BY race_id_new_no_horse_num DESC
    `;
    
    const raceRecords = db.prepare(raceIdsQuery).all(horseName) as Array<{
      race_id_new_no_horse_num: string;
      horse_number: string;
      corner_2: string;
      date: string;
      distance: string;
    }>;
    
    if (raceRecords.length === 0) {
      return { 
        avgT2F: null, 
        avgL4F: null,
        t2fRaceCount: 0, 
        l4fRaceCount: 0,
        fastestT2F: null, 
        avgPotential: null,
        avgMakikaeshi: null,
        relevantRaces: []
      };
    }
    
    const t2fValues: number[] = [];
    const l4fValues: number[] = [];
    const potentialScores: number[] = [];
    const makikaeshiScores: number[] = [];
    const relevantRaces: Array<{ date: string; distance: number; T2F: number; L4F: number }> = [];
    
    // 芝/ダート判定
    const isTargetTurf = targetSurface === '芝';
    
    for (const record of raceRecords) {
      // 距離を抽出
      const distMatch = record.distance?.match(/(\d+)/);
      const raceDist = distMatch ? parseInt(distMatch[1], 10) : 0;
      
      // 距離±200mフィルタ
      if (Math.abs(raceDist - targetDistance) > 200) {
        continue;
      }
      
      // 芝/ダートフィルタ
      const isTurf = record.distance?.includes('芝');
      if (isTargetTurf !== isTurf) {
        continue;
      }
      
      // 18桁のrace_idを構築
      const raceId16 = record.race_id_new_no_horse_num;
      const horseNum = record.horse_number.padStart(2, '0');
      const fullRaceId = raceId16 + horseNum;
      
      // indicesテーブルからT2F、L4F、potential、makikaeshiを取得
      const indexQuery = `
        SELECT T2F, L4F, potential, makikaeshi
        FROM indices
        WHERE race_id = ?
      `;
      
      const indexRecord = db.prepare(indexQuery).get(fullRaceId) as { 
        T2F: number;
        L4F: number;
        potential: number;
        makikaeshi: number;
      } | undefined;
      
      if (indexRecord) {
        const raceInfo = { 
          date: record.date, 
          distance: raceDist, 
          T2F: indexRecord.T2F || 0, 
          L4F: indexRecord.L4F || 0 
        };
        relevantRaces.push(raceInfo);
        
        if (indexRecord.T2F > 0) {
          t2fValues.push(indexRecord.T2F);
        }
        if (indexRecord.L4F > 0) {
          l4fValues.push(indexRecord.L4F);
        }
        if (indexRecord.potential !== null && indexRecord.potential !== undefined) {
          potentialScores.push(indexRecord.potential);
        }
        if (indexRecord.makikaeshi !== null && indexRecord.makikaeshi !== undefined) {
          makikaeshiScores.push(indexRecord.makikaeshi);
        }
      }
    }
    
    const avgT2F = t2fValues.length > 0 
      ? t2fValues.reduce((sum, t) => sum + t, 0) / t2fValues.length 
      : null;
    const avgL4F = l4fValues.length > 0
      ? l4fValues.reduce((sum, t) => sum + t, 0) / l4fValues.length
      : null;
    const fastestT2F = t2fValues.length > 0 ? Math.min(...t2fValues) : null;
    const avgPotential = potentialScores.length > 0
      ? potentialScores.reduce((sum, s) => sum + s, 0) / potentialScores.length
      : null;
    const avgMakikaeshi = makikaeshiScores.length > 0
      ? makikaeshiScores.reduce((sum, s) => sum + s, 0) / makikaeshiScores.length
      : null;
    
    // ✅ デバッグログ
    console.log(`[calculateAvgIndices] ${horseName} (${targetDistance}m±200m):`,
      `T2F=${avgT2F?.toFixed(1) || 'N/A'}秒 (${t2fValues.length}件)`,
      `L4F=${avgL4F?.toFixed(1) || 'N/A'} (${l4fValues.length}件)`,
      `対象レース=${relevantRaces.length}件`
    );
    
    return { 
      avgT2F, 
      avgL4F,
      t2fRaceCount: t2fValues.length, 
      l4fRaceCount: l4fValues.length,
      fastestT2F,
      avgPotential,
      avgMakikaeshi,
      relevantRaces
    };
  } catch (error) {
    console.error('Error calculating avg indices for distance:', error);
    return { 
      avgT2F: null, 
      avgL4F: null,
      t2fRaceCount: 0, 
      l4fRaceCount: 0,
      fastestT2F: null, 
      avgPotential: null,
      avgMakikaeshi: null,
      relevantRaces: []
    };
  }
}

/**
 * 過去の2コーナー通過順位の平均を計算（全走遡り版＋逃げ経験チェック）
 * - データがある限りすべて遡る
 * - 逃げた経験（2C=1位）もチェック
 */
function calculateAvgPosition2C(
  db: Database.Database,
  horseName: string,
  currentDistance: number
): { 
  avgPosition: number | null; 
  raceCount: number;
  hasEscapeExperience: boolean; // 逃げた経験
  escapeCount: number; // 逃げた回数
} {
  try {
    const query = `
      SELECT corner_2, distance
      FROM umadata
      WHERE horse_name = ?
        AND corner_2 IS NOT NULL
        AND corner_2 != ''
      ORDER BY race_id_new_no_horse_num DESC
    `;
    
    const records = db.prepare(query).all(horseName) as Array<{
      corner_2: string;
      distance: string;
    }>;
    
    if (records.length === 0) {
      return { avgPosition: null, raceCount: 0, hasEscapeExperience: false, escapeCount: 0 };
    }
    
    // 距離が近いレースを優先（±200m範囲内）
    const nearDistancePositions: number[] = [];
    const allPositions: number[] = [];
    let escapeCount = 0;
    
    for (const record of records) {
      const distMatch = record.distance?.match(/(\d+)/);
      const raceDist = distMatch ? parseInt(distMatch[1], 10) : 0;
      const pos = parseInt(record.corner_2, 10);
      
      if (!isNaN(pos) && pos > 0) {
        allPositions.push(pos);
        
        // 逃げた経験（2C=1位）をカウント
        if (pos === 1) {
          escapeCount++;
        }
        
        // 距離±200m範囲内
        if (Math.abs(raceDist - currentDistance) <= 200) {
          nearDistancePositions.push(pos);
        }
      }
    }
    
    // 優先順位: 近距離データ（3件以上あれば） → 全データ
    const positions = nearDistancePositions.length >= 3 ? nearDistancePositions : allPositions;
    
    if (positions.length === 0) {
      return { avgPosition: null, raceCount: 0, hasEscapeExperience: false, escapeCount: 0 };
    }
    
    const avgPosition = positions.reduce((sum, p) => sum + p, 0) / positions.length;
    const hasEscapeExperience = escapeCount > 0;
    
    return { avgPosition, raceCount: positions.length, hasEscapeExperience, escapeCount };
  } catch (error) {
    console.error('Error calculating avg position 2C:', error);
    return { avgPosition: null, raceCount: 0, hasEscapeExperience: false, escapeCount: 0 };
  }
}

/**
 * 前走の距離を取得
 */
function getLastDistance(db: Database.Database, horseName: string): number | null {
  const query = `
    SELECT distance
    FROM umadata
    WHERE horse_name = ?
    ORDER BY race_id_new_no_horse_num DESC
    LIMIT 1
  `;
  
  const row = db.prepare(query).get(horseName) as { distance: string } | undefined;
  
  if (!row || !row.distance) {
    return null;
  }
  
  const match = row.distance.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * タイム文字列または数値を秒数に変換
 * 例: "1:13.1" → 73.1, 1131 → 73.1（MMSSd形式として解釈）, 73.1 → 73.1
 */
function parseTimeToSeconds(time: number | string | null | undefined): number | null {
  if (time === null || time === undefined) return null;
  
  // 文字列の場合
  if (typeof time === 'string') {
    // "1:13.1" 形式
    const colonMatch = time.match(/(\d+):(\d+\.?\d*)/);
    if (colonMatch) {
      return parseInt(colonMatch[1], 10) * 60 + parseFloat(colonMatch[2]);
    }
    // 数値文字列
    const num = parseFloat(time);
    if (!isNaN(num)) {
      return parseTimeToSeconds(num);
    }
    return null;
  }
  
  // 数値の場合
  if (typeof time === 'number') {
    // 100未満ならすでに秒数
    if (time < 100) return time;
    
    // 100以上なら MMSSd 形式として解釈（例: 1131 → 1:13.1 → 73.1秒）
    // 4桁: MMSSd (例: 1131 = 1分13.1秒)
    // 3桁: MSSd (例: 731 = 7分31秒? or 73.1秒?) → 3桁は曖昧なので SSS.d として解釈
    if (time >= 1000) {
      // 4桁以上: 最初の1-2桁が分、残りが秒.1/10
      const str = time.toString();
      const minutes = parseInt(str.slice(0, -3), 10);
      const secondsTenths = parseInt(str.slice(-3), 10);
      const seconds = secondsTenths / 10;
      return minutes * 60 + seconds;
    } else if (time >= 100) {
      // 3桁: SS.S形式として解釈（例: 731 → 73.1秒）
      return time / 10;
    }
    
    return time;
  }
  
  return null;
}

/**
 * 近走での大敗を判定（相対評価＋厳格化版）
 * 
 * 着差（margin）フィールドを使って判定
 */
export function checkRecentBadPerformance(
  db: Database.Database,
  horseName: string,
  recentRaces: number = 3
): {
  isBadPerformer: boolean;
  avgTimeDiff: number;
  worstTimeDiff: number;
  badRaceCount: number;
} {
  try {
    // 直近N走の着差データを取得（marginフィールドを使用）
    const query = `
      SELECT finish_position, margin, corner_2, corner_4
      FROM umadata
      WHERE horse_name = ?
      ORDER BY race_id_new_no_horse_num DESC
      LIMIT ?
    `;
    
    const records = db.prepare(query).all(horseName, recentRaces) as Array<{
      finish_position: string;
      margin: string;
      corner_2: string;
      corner_4: string;
    }>;
    
    if (records.length === 0) {
      return {
        isBadPerformer: false,
        avgTimeDiff: 0,
        worstTimeDiff: 0,
        badRaceCount: 0
      };
    }
    
    const timeDiffs: number[] = [];
    let badRaceCount = 0;
    let worstTimeDiff = 0;
    
    for (const record of records) {
      // 着差をパース（例: "1.5", "大差", "アタマ", "クビ" など）
      let timeDiff = 0;
      const marginStr = record.margin || '';
      
      // 数値形式の着差（秒）
      const numMatch = marginStr.match(/^[\d.]+$/);
      if (numMatch) {
        timeDiff = parseFloat(numMatch[0]);
      }
      // "大差" = 10馬身以上 ≒ 2.0秒以上
      else if (marginStr.includes('大差')) {
        timeDiff = 2.5;
      }
      // 着順が10着以下で着差が "大" を含む
      else if (marginStr.includes('大')) {
        timeDiff = 2.0;
      }
      // 着順から推定（10着以下は大敗傾向）
      else {
        const pos = parseInt(record.finish_position?.replace(/[^\d]/g, '') || '0', 10);
        if (pos >= 10) {
          timeDiff = 1.5 + (pos - 10) * 0.3; // 10着以降は着順に応じて加算
        } else if (pos >= 7) {
          timeDiff = 0.5 + (pos - 7) * 0.3;
        }
      }
      
      timeDiffs.push(timeDiff);
      
      if (timeDiff > worstTimeDiff) {
        worstTimeDiff = timeDiff;
      }
      
      // 2.0秒以上の大敗
      if (timeDiff >= 2.0) {
        badRaceCount++;
      }
    }
    
    const avgTimeDiff = timeDiffs.length > 0 
      ? timeDiffs.reduce((sum, t) => sum + t, 0) / timeDiffs.length 
      : 0;
    
    // 大敗判定条件（厳格化）
    const isBadPerformer = 
      // 1走のみで4.0秒以上の超大敗
      (records.length === 1 && worstTimeDiff >= 4.0) ||
      // 直近3走中2走以上が2.5秒以上の大敗
      (records.length >= 2 && badRaceCount >= 2 && worstTimeDiff >= 2.5) ||
      // 平均着差が1.5秒以上
      (avgTimeDiff >= 1.5);
    
    // ✅ デバッグログ
    if (isBadPerformer) {
      console.log(`[checkRecentBadPerformance] ${horseName}: 大敗馬判定`,
        `平均着差=${avgTimeDiff.toFixed(1)}秒`,
        `最大着差=${worstTimeDiff.toFixed(1)}秒`,
        `大敗回数=${badRaceCount}/${records.length}走`
      );
    }
    
    return {
      isBadPerformer,
      avgTimeDiff,
      worstTimeDiff,
      badRaceCount
    };
  } catch (error) {
    console.error('Error checking recent bad performance:', error);
    return {
      isBadPerformer: false,
      avgTimeDiff: 0,
      worstTimeDiff: 0,
      badRaceCount: 0
    };
  }
}

/**
 * 近走の着差を取得して平均大敗度を計算（厳格化版）
 * 
 * ※ 互換性のために残す（内部でcheckRecentBadPerformanceを呼ぶ）
 */
function checkConsistentLoser(
  db: Database.Database,
  horseName: string
): boolean {
  const result = checkRecentBadPerformance(db, horseName, 3);
  return result.isBadPerformer;
}

/**
 * コース特性を考慮した枠順補正
 */
function adjustPositionByCourseAndWaku(
  avgPosition2C: number | null,
  waku: string,
  totalHorses: number,
  place: string,
  distance: number,
  trackType: string
): number {
  const wakuNum = parseInt(waku, 10);
  
  if (avgPosition2C === null) {
    return wakuNum;
  }

  const courseChar = getCourseCharacteristics(place, distance, trackType);
  
  let adjustment = 0;

  if (courseChar) {
    const distToCorner = courseChar.distanceToFirstCorner;
    
    // 最初のコーナーまでが短いコース（300m未満）= 内枠有利（影響強化）
    if (distToCorner < 300) {
      if (wakuNum <= 2) {
        // innerFrameAdvantageが負 = 有利 = 前に行く
        adjustment = courseChar.innerFrameAdvantage * 1.5; // 0.8 → 1.5
      } else if (wakuNum <= 4) {
        adjustment = courseChar.innerFrameAdvantage * 0.8; // 0.4 → 0.8
      } else if (wakuNum >= 7) {
        // 外枠は不利になる
        adjustment = courseChar.outerFrameAdvantage * 1.2; // 0.5 → 1.2
      } else if (wakuNum >= 6) {
        adjustment = courseChar.outerFrameAdvantage * 0.7; // 0.3 → 0.7
      }
    }
    // 最初のコーナーまで余裕あり（500m以上）= 外枠有利（影響強化）
    else if (distToCorner >= 500) {
      if (wakuNum >= 7) {
        // outerFrameAdvantageが負 = 有利 = 前に行く
        adjustment = courseChar.outerFrameAdvantage * 1.5; // 0.8 → 1.5
      } else if (wakuNum >= 5) {
        adjustment = courseChar.outerFrameAdvantage * 0.8; // 0.4 → 0.8
      } else if (wakuNum <= 2) {
        // 内枠は不利
        adjustment = courseChar.innerFrameAdvantage * 0.8; // 0.4 → 0.8
      }
    }
    // 中間（300-500m）= どちらもあまり影響なし（やや強化）
    else {
      if (wakuNum <= 2) {
        adjustment = courseChar.innerFrameAdvantage * 0.6; // 0.3 → 0.6
      } else if (wakuNum >= 7) {
        adjustment = courseChar.outerFrameAdvantage * 0.6; // 0.3 → 0.6
      }
    }
    
    // 芝スタートダートの場合、外枠有利（強化）
    if (courseChar.turfStartDirt && wakuNum >= 6) {
      adjustment -= 0.8; // -0.5 → -0.8 前に行く補正
    }
    
    // タイトなコーナーの場合、内枠有利（強化）
    if (courseChar.tightCorner && wakuNum <= 3) {
      adjustment -= 0.7; // -0.4 → -0.7 前に行く補正
    }
  }
  // デフォルト補正（控えめに）
  else {
    if (totalHorses >= 16) {
      if (wakuNum <= 2) adjustment = -0.8;
      else if (wakuNum >= 7) adjustment = +1.2;
    } else if (totalHorses >= 12) {
      if (wakuNum <= 2) adjustment = -0.5;
      else if (wakuNum >= 6) adjustment = +0.8;
    }
  }

  return Math.max(1, avgPosition2C + adjustment);
}

/**
 * 距離変更＋逃げ経験を考慮した脚質推定
 */
function estimateRunningStyleWithDistanceChange(
  avgLapTime: number | null,
  avgPosition2C: number | null,
  currentDistance: number,
  lastDistance: number | null,
  lapConfidence: number,
  hasEscapeExperience: boolean, // 逃げた経験
  escapeCount: number // 逃げた回数
): RunningStyle {
  // 前半2Fが速い馬は先行力が高い（最重要・影響を強化）
  let styleBias = 0;
  
  if (avgLapTime !== null && lapConfidence >= 3) {
    if (avgLapTime < 23.0) {
      styleBias = -4.0; // 強化
    } else if (avgLapTime < 23.5) {
      styleBias = -3.0; // 強化
    } else if (avgLapTime < 24.0) {
      styleBias = -1.5;
    } else if (avgLapTime > 25.5) {
      styleBias = +3.0; // 強化
    } else if (avgLapTime > 25.0) {
      styleBias = +1.5;
    }
  }
  
  // 距離変更の影響（さらに強化）
  let distanceChangeBias = 0;
  
  if (lastDistance !== null) {
    const distanceChange = currentDistance - lastDistance;
    
    // 距離延長 → 前回の記憶で行き脚がつく
    if (distanceChange >= 400) {
      distanceChangeBias = -3.5; // 3.0 → 3.5
    } else if (distanceChange >= 200) {
      distanceChangeBias = -2.5; // 2.0 → 2.5
    }
    // 距離短縮 → 控える傾向
    else if (distanceChange <= -400) {
      distanceChangeBias = +3.5; // 3.0 → 3.5
    } else if (distanceChange <= -200) {
      distanceChangeBias = +2.5; // 2.0 → 2.5
    }
  }
  
  // 逃げた経験による補正（新設）
  let escapeExperienceBias = 0;
  if (hasEscapeExperience) {
    if (escapeCount >= 3) {
      // 3回以上逃げた経験 = 逃げ馬
      escapeExperienceBias = -3.0;
    } else if (escapeCount >= 2) {
      // 2回逃げた経験 = 先行馬
      escapeExperienceBias = -2.0;
    } else {
      // 1回だけ逃げた経験 = やや前
      escapeExperienceBias = -1.0;
    }
  }
  
  // avgPosition2Cがない場合の処理
  let basePosition: number;
  if (avgPosition2C !== null) {
    basePosition = avgPosition2C;
  } else {
    // データがない場合、前半2Fラップから推測
    if (avgLapTime !== null) {
      if (avgLapTime < 23.5) {
        basePosition = 3.0; // 速い → 先行タイプ
      } else if (avgLapTime < 24.5) {
        basePosition = 6.0; // 中間 → 差しタイプ
      } else {
        basePosition = 9.0; // 遅い → 追込タイプ
      }
    } else {
      // すべてのデータがない場合は中間的な「差し」
      return 'sashi';
    }
  }
  
  // 最終的な位置取り（ウェイトも調整 + 逃げ経験追加）
  const adjustedPosition = basePosition 
    + (styleBias * 1.0) // 0.6 → 1.0
    + (distanceChangeBias * 1.0) // 0.8 → 1.0
    + (escapeExperienceBias * 0.8); // 新設
  
  // 脚質判定
  if (adjustedPosition <= 2) {
    return 'escape';
  } else if (adjustedPosition <= 5) {
    return 'lead';
  } else if (adjustedPosition <= 10) {
    return 'sashi';
  } else {
    return 'oikomi';
  }
}

/**
 * ペース判定
 */
function determinePaceWithCourse(
  frontRunners: number,
  totalHorses: number,
  avgFront2FLap: number | null,
  place: string,
  distance: number,
  trackType: string
): PaceType {
  const courseChar = getCourseCharacteristics(place, distance, trackType);
  
  let basePace: PaceType = 'middle';
  
  if (courseChar) {
    basePace = courseChar.paceTendency;
  }
  
  const frontRatio = frontRunners / totalHorses;
  
  // 前半2Fラップでペース判定
  if (avgFront2FLap !== null) {
    if (avgFront2FLap < 23.0 && frontRunners >= 3) {
      return 'high';
    }
    if (avgFront2FLap < 23.5 && frontRunners >= 4) {
      return 'high';
    }
    if (avgFront2FLap < 24.0 && frontRunners >= 5) {
      return 'high';
    }
    
    if (avgFront2FLap >= 26.0 && frontRunners <= 1) {
      return 'slow';
    }
    if (avgFront2FLap >= 25.5 && frontRunners <= 2) {
      return 'slow';
    }
  }
  
  // 逃げ・先行馬の割合
  if (frontRatio >= 0.45 || frontRunners >= 6) {
    return 'high';
  } else if (frontRatio <= 0.15 || frontRunners <= 1) {
    return 'slow';
  }
  
  // 短距離（1400m以下）は基本ハイ傾向
  if (distance <= 1400 && frontRunners >= 3) {
    return basePace === 'slow' ? 'middle' : 'high';
  }
  
  return basePace;
}

/**
 * メイン関数: 展開予想を生成（ブラッシュアップ版）
 */
export function predictRacePace(
  db: Database.Database,
  params: {
    year: string;
    date: string;
    place: string;
    raceNumber: string;
  }
): RacePacePrediction {
  const { year, date, place, raceNumber } = params;

  const wakujunQuery = `
    SELECT umaban, umamei, waku, distance, track_type, kinryo
    FROM wakujun
    WHERE year = ? AND date = ? AND place = ? AND race_number = ?
    ORDER BY CAST(umaban AS INTEGER)
  `;

  const horses = db.prepare(wakujunQuery).all(year, date, place, raceNumber) as WakujunRecord[];

  if (horses.length === 0) {
    throw new Error(`No horses found`);
  }

  const distanceMatch = horses[0].distance.match(/(\d+)/);
  if (!distanceMatch) {
    throw new Error(`Invalid distance format: ${horses[0].distance}`);
  }
  const currentDistance = parseInt(distanceMatch[1], 10);
  const trackType = horses[0].track_type;

  // コース特性を取得
  const courseChar = getCourseCharacteristics(place, currentDistance, trackType);

  const predictions: HorsePositionPrediction[] = [];
  let frontRunners = 0;
  const front2FLaps: number[] = [];

  // 全頭の指数を収集してメンバー内で相対評価するための一時配列
  const tempHorseData: Array<{
    horse: WakujunRecord;
    horseNumber: number;
    horseName: string;
    avgPosition: number | null;
    posRaceCount: number;
    avgT2F: number | null;     // 距離フィルタ済みT2F
    avgL4F: number | null;     // 距離フィルタ済みL4F
    fastestT2F: number | null;
    t2fRaceCount: number;      // T2Fデータがある対象レース数
    l4fRaceCount: number;      // L4Fデータがある対象レース数
    lastDistance: number | null;
    hasEscapeExperience: boolean;
    escapeCount: number;
    avgPotential: number | null;
    avgMakikaeshi: number | null;
    relevantRaces: Array<{ date: string; distance: number; T2F: number; L4F: number }>;
  }> = [];

  // 第1ループ：データ収集（距離±200mでフィルタ）
  for (const horse of horses) {
    const horseNumber = parseInt(horse.umaban, 10);
    const horseName = horse.umamei;

    const { avgPosition, raceCount: posRaceCount, hasEscapeExperience, escapeCount } = calculateAvgPosition2C(
      db,
      horseName,
      currentDistance
    );

    // 【改善】距離±200mでフィルタした指数を取得
    const indexData = calculateAvgIndicesForDistance(
      db,
      horseName,
      currentDistance,
      trackType
    );

    const lastDistance = getLastDistance(db, horseName);

    tempHorseData.push({
      horse,
      horseNumber,
      horseName,
      avgPosition,
      posRaceCount,
      avgT2F: indexData.avgT2F,
      avgL4F: indexData.avgL4F,
      fastestT2F: indexData.fastestT2F,
      t2fRaceCount: indexData.t2fRaceCount,
      l4fRaceCount: indexData.l4fRaceCount,
      lastDistance,
      hasEscapeExperience,
      escapeCount,
      avgPotential: indexData.avgPotential,
      avgMakikaeshi: indexData.avgMakikaeshi,
      relevantRaces: indexData.relevantRaces,
    });
  }

  // =====================================================
  // 【改善】メンバー内での相対順位（パーセンタイル）を計算
  // =====================================================
  
  // T2Fでデータがある馬だけで比較（小さいほど速い = 昇順ソート）
  const t2fWithData = tempHorseData
    .filter(d => d.avgT2F !== null && d.t2fRaceCount > 0)
    .sort((a, b) => (a.avgT2F || 999) - (b.avgT2F || 999));
  
  // L4Fでデータがある馬だけで比較（大きいほど速い = 降順ソート）
  const l4fWithData = tempHorseData
    .filter(d => d.avgL4F !== null && d.l4fRaceCount > 0)
    .sort((a, b) => (b.avgL4F || 0) - (a.avgL4F || 0));
  
  // パーセンタイル計算用
  const getT2FPercentile = (horseNum: number) => {
    const idx = t2fWithData.findIndex(d => d.horseNumber === horseNum);
    if (idx < 0 || t2fWithData.length === 0) return 100;
    return Math.round(((idx + 1) / t2fWithData.length) * 100);
  };
  
  const getL4FPercentile = (horseNum: number) => {
    const idx = l4fWithData.findIndex(d => d.horseNumber === horseNum);
    if (idx < 0 || l4fWithData.length === 0) return 100;
    return Math.round(((idx + 1) / l4fWithData.length) * 100);
  };
  
  // ✅ デバッグログ：メンバー内順位
  console.log(`[predictRacePace] === メンバー内T2F順位（距離${currentDistance}m±200m）===`);
  t2fWithData.forEach((d, idx) => {
    console.log(`  ${idx + 1}位: ${d.horseName} T2F=${d.avgT2F?.toFixed(1)}秒 (${d.t2fRaceCount}レース)`);
  });
  
  console.log(`[predictRacePace] === メンバー内L4F順位（距離${currentDistance}m±200m）===`);
  l4fWithData.forEach((d, idx) => {
    console.log(`  ${idx + 1}位: ${d.horseName} L4F=${d.avgL4F?.toFixed(1)} (${d.l4fRaceCount}レース)`);
  });

  // 全頭の最速T2Fを集めて相対評価の閾値を計算
  const allFastestT2Fs = tempHorseData
    .map(d => d.fastestT2F)
    .filter((lap): lap is number => lap !== null && lap > 0)
    .sort((a, b) => a - b);

  const fastestLapTop25Threshold = allFastestT2Fs.length > 0
    ? allFastestT2Fs[Math.floor(allFastestT2Fs.length * 0.25)]
    : null;

  const fastestLapTop10Threshold = allFastestT2Fs.length > 0
    ? allFastestT2Fs[Math.floor(allFastestT2Fs.length * 0.10)]
    : null;

  // 第2ループ：位置計算
  for (const data of tempHorseData) {
    const { horse, horseNumber, horseName, avgPosition, posRaceCount, avgT2F, avgL4F, fastestT2F, t2fRaceCount, l4fRaceCount, lastDistance, hasEscapeExperience, escapeCount, avgPotential, avgMakikaeshi, relevantRaces } = data;

    // メンバー内パーセンタイルを取得
    const t2fPercentile = getT2FPercentile(horseNumber);
    const l4fPercentile = getL4FPercentile(horseNumber);
    
    // ✅ デバッグログ：各馬の詳細
    console.log(`[predictRacePace] ${horseName}: T2F=${avgT2F?.toFixed(1) || 'N/A'}秒 (${t2fWithData.length}頭中${t2fPercentile}%) L4F=${avgL4F?.toFixed(1) || 'N/A'} (${l4fWithData.length}頭中${l4fPercentile}%) 対象レース=${relevantRaces.length}件`);

    // =====================================================
    // 【新シンプルロジック】スタート後位置を計算
    // T2Fパーセンタイルを最重要ファクターとして使用
    // =====================================================
    const hasT2FData = t2fRaceCount > 0;
    const wakuNum = parseInt(horse.waku, 10);
    
    const adjustedPosition = calculateSimpleStartPosition(
      horseNumber,
      t2fPercentile,
      hasT2FData,
      escapeCount,
      wakuNum,
      horses.length
    );

    // 【新シンプルロジック】脚質推定
    const runningStyle = estimateSimpleRunningStyle(adjustedPosition, horses.length);

    if (runningStyle === 'escape' || runningStyle === 'lead') {
      frontRunners++;
    }

    if (avgT2F !== null) {
      front2FLaps.push(avgT2F);
    }

    let confidence: 'high' | 'medium' | 'low';
    if (posRaceCount >= 5 && t2fRaceCount >= 3) {
      confidence = 'high';
    } else if (posRaceCount >= 2 || t2fRaceCount >= 1) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // expectedPosition2CはcalculateSimpleStartPositionで計算済み（枠番補正含む）
    const expectedPosition2C = adjustedPosition;
    
    // 斤量をパース（例: "58.0" → 58.0）
    const kinryo = parseFloat(horse.kinryo) || 0;
    
    // 大敗続きかどうかをチェック
    const isConsistentLoser = checkConsistentLoser(db, horseName);
    
    predictions.push({
      horseNumber,
      horseName,
      runningStyle,
      expectedPosition2C,
      avgFront2FLap: avgT2F,
      avgL4F,                    // L4Fも追加
      avgPosition2C: avgPosition,
      pastRaceCount: Math.max(posRaceCount, t2fRaceCount),
      confidence,
      waku: horse.waku,
      kinryo,
      isConsistentLoser, // 大敗続きフラグ
      avgPotential, // 平均ポテンシャル指数
      avgMakikaeshi, // 平均巻き返し指数
      // デバッグ情報
      t2fRaceCount,              // 距離フィルタ済みT2F対象レース数
      l4fRaceCount,              // 距離フィルタ済みL4F対象レース数
      t2fPercentile,             // メンバー内T2Fパーセンタイル
      l4fPercentile,             // メンバー内L4Fパーセンタイル
      t2fMemberCount: t2fWithData.length,  // T2Fデータがあるメンバー数
      l4fMemberCount: l4fWithData.length,  // L4Fデータがあるメンバー数
    });
  }

  predictions.sort((a, b) => a.expectedPosition2C - b.expectedPosition2C);

  const avgFront2FLap = front2FLaps.length > 0
    ? front2FLaps.reduce((sum, t) => sum + t, 0) / front2FLaps.length
    : null;

  const expectedPace = determinePaceWithCourse(
    frontRunners,
    horses.length,
    avgFront2FLap,
    place,
    currentDistance,
    trackType
  );

  const raceKey = `${year}${date}_${place}_${raceNumber}`;

  // コース情報を返す
  const courseInfo = courseChar ? {
    place: courseChar.place,
    distance: courseChar.distance,
    trackType: courseChar.trackType,
    straightLength: courseChar.straightLength,
    hasSlope: courseChar.hasSlope,
    slopePosition: courseChar.slopePosition,
    innerFrameAdvantage: courseChar.innerFrameAdvantage,
    outerFrameAdvantage: courseChar.outerFrameAdvantage,
  } : null;

  return {
    raceKey,
    expectedPace,
    frontRunners,
    avgFront2FLap,
    predictions,
    courseInfo,
  };
}
