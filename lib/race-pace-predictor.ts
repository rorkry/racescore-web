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
 * 日付文字列をYYYYMMDD形式の数値に変換（比較用）
 * 例: "2024. 1. 5" -> 20240105, "2024.01.05" -> 20240105
 */
function parseDateToNumber(dateStr: string): number {
  if (!dateStr) return 0;
  const cleaned = dateStr.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return 0;
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;
  return year * 10000 + month * 100 + day;
}

/**
 * 現在のレース日付をYYYYMMDD形式の数値に変換
 * date: "0125" (MMDD形式), year: "2025" -> 20250125
 */
function getCurrentRaceDateNumber(date: string, year: string): number {
  const dateStr = String(date).padStart(4, '0');
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  const currentYear = parseInt(year, 10) || new Date().getFullYear();
  return currentYear * 10000 + month * 100 + day;
}

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
 * 【改良版】基礎テンスピードを計算
 * 
 * テン1F（最初の200m）とテン3F（600m）を分離して評価
 * =====================================================
 */
export interface BaseSpeedData {
  horseNumber: number;
  horseName: string;
  wakuNumber: number;
  // テンの速さ（基礎スコア: 0-100）
  baseSpeedScore: number;
  // 逃げ経験ブースト適用後のスコア
  boostedSpeedScore: number;
  // 構成要素
  t2fScore: number;          // T2F（前半2F）スコア
  first1FScore: number;      // テン1F推定スコア（通過順から推定）
  escapeBoost: number;       // 逃げ経験ブースト
  distanceBonus: number;     // 距離変更ボーナス
  // フラグ
  hasEscapeExperience: boolean;
  escapeCount: number;
  recentT2FWeight: number;   // 近走T2Fの重み
}

/**
 * テン1F（最初の200m）スコアを推定
 * T2Fデータがない場合は、最初のコーナー通過順位から推定
 */
function estimateFirst1FScore(
  firstCornerPositions: number[],  // 近走の1コーナー通過順位
  totalHorses: number
): number {
  if (firstCornerPositions.length === 0) return 50; // データなし = 平均
  
  // 1-3番手だった回数をカウント
  const frontCount = firstCornerPositions.filter(pos => pos <= 3).length;
  const frontRatio = frontCount / firstCornerPositions.length;
  
  // 比率をスコアに変換（0-100、高いほど速い）
  // frontRatio=1.0（100%前）→ score=90
  // frontRatio=0.5（50%前）→ score=70
  // frontRatio=0（0%前）→ score=30
  return 30 + frontRatio * 60;
}

/**
 * 近走T2Fの重み付き平均を計算（近3走を重視: 7:3）
 */
function calculateWeightedT2F(
  recentRaces: Array<{ date: string; T2F: number; distance: number }>,
  targetDistance: number
): { weightedT2F: number | null; recentWeight: number } {
  if (recentRaces.length === 0) {
    return { weightedT2F: null, recentWeight: 0 };
  }
  
  // 日付でソート（新しい順）
  const sorted = [...recentRaces]
    .filter(r => r.T2F > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  
  if (sorted.length === 0) {
    return { weightedT2F: null, recentWeight: 0 };
  }
  
  // 近3走と4走以降で重み付け
  const recent3 = sorted.slice(0, 3);
  const older = sorted.slice(3);
  
  // 距離延長の場合、過去のテン3Fを-1.0秒補正
  const distanceCorrection = (raceDistance: number) => {
    const diff = targetDistance - raceDistance;
    if (diff >= 400) return -1.0;  // 大幅延長: 短距離経験者は速い
    if (diff >= 200) return -0.5;  // 延長
    if (diff <= -400) return +0.8; // 大幅短縮: 長距離経験者は遅れる
    if (diff <= -200) return +0.4; // 短縮
    return 0;
  };
  
  let recentSum = 0;
  let recentCount = 0;
  for (const r of recent3) {
    recentSum += r.T2F + distanceCorrection(r.distance);
    recentCount++;
  }
  
  let olderSum = 0;
  let olderCount = 0;
  for (const r of older) {
    olderSum += r.T2F + distanceCorrection(r.distance);
    olderCount++;
  }
  
  // 近3走: 70%, 4走以降: 30%
  const recentAvg = recentCount > 0 ? recentSum / recentCount : null;
  const olderAvg = olderCount > 0 ? olderSum / olderCount : null;
  
  let weightedT2F: number | null = null;
  let recentWeight = 0;
  
  if (recentAvg !== null && olderAvg !== null) {
    weightedT2F = recentAvg * 0.7 + olderAvg * 0.3;
    recentWeight = 0.7;
  } else if (recentAvg !== null) {
    weightedT2F = recentAvg;
    recentWeight = 1.0;
  } else if (olderAvg !== null) {
    weightedT2F = olderAvg;
    recentWeight = 0;
  }
  
  return { weightedT2F, recentWeight };
}

/**
 * 基礎テンスピードスコアを計算
 */
export function calculateBaseSpeedScore(
  horseNumber: number,
  horseName: string,
  wakuNumber: number,
  avgT2F: number | null,
  weightedT2F: number | null,
  first1FScore: number,
  escapeCount: number,
  lastDistance: number | null,
  currentDistance: number,
  t2fPercentile: number | null,
  totalHorses: number,
  recentWeight: number
): BaseSpeedData {
  // =====================================================
  // 1. T2Fスコア（0-100、高いほど速い）
  // =====================================================
  let t2fScore = 50; // デフォルト
  
  if (t2fPercentile !== null) {
    // パーセンタイルを反転（低い%=速い → 高いスコア）
    t2fScore = 100 - t2fPercentile;
  } else if (avgT2F !== null) {
    // 絶対値から推定（22.0秒=100点, 26.0秒=0点）
    t2fScore = Math.max(0, Math.min(100, (26.0 - avgT2F) / 4.0 * 100));
  }
  
  // =====================================================
  // 2. 距離変更ボーナス
  // =====================================================
  let distanceBonus = 0;
  if (lastDistance !== null) {
    const distanceChange = currentDistance - lastDistance;
    
    // 距離延長 → 前走の短距離経験で行き脚がつく
    if (distanceChange >= 400) {
      distanceBonus = 15;
    } else if (distanceChange >= 200) {
      distanceBonus = 8;
    }
    // 距離短縮 → ペースについていけず控える傾向
    else if (distanceChange <= -400) {
      distanceBonus = -12;
    } else if (distanceChange <= -200) {
      distanceBonus = -6;
    }
  }
  
  // =====================================================
  // 3. 逃げ経験ブースト（1.5倍相当）
  // =====================================================
  let escapeBoost = 0;
  const hasEscapeExperience = escapeCount > 0;
  
  if (escapeCount >= 3) {
    // 常習逃げ馬: 強力なブースト（+25点 ≒ 1.5倍効果）
    escapeBoost = 25;
  } else if (escapeCount >= 2) {
    escapeBoost = 18;
  } else if (escapeCount >= 1) {
    escapeBoost = 10;
  }
  
  // =====================================================
  // 4. 基礎スコア合成
  // =====================================================
  // T2Fスコア(60%) + テン1Fスコア(20%) + 距離ボーナス(20%)
  const baseSpeedScore = Math.max(0, Math.min(100,
    t2fScore * 0.6 + 
    first1FScore * 0.2 + 
    distanceBonus + 
    20 // ベース20点
  ));
  
  // 逃げブースト適用後
  const boostedSpeedScore = Math.min(100, baseSpeedScore + escapeBoost);
  
  console.log(`[BaseSpeed] ${horseName}: T2F=${t2fScore.toFixed(0)} 1F=${first1FScore.toFixed(0)} dist=${distanceBonus} escape=${escapeBoost} → base=${baseSpeedScore.toFixed(0)} boosted=${boostedSpeedScore.toFixed(0)}`);
  
  return {
    horseNumber,
    horseName,
    wakuNumber,
    baseSpeedScore,
    boostedSpeedScore,
    t2fScore,
    first1FScore,
    escapeBoost,
    distanceBonus,
    hasEscapeExperience,
    escapeCount,
    recentT2FWeight: recentWeight,
  };
}

/**
 * =====================================================
 * 【椅子取りゲーム】ロジック
 * 
 * 内枠から順にポジションを確定させる相対評価シミュレーション
 * =====================================================
 */
export interface ChairGameResult {
  horseNumber: number;
  horseName: string;
  finalPosition: number;       // 最終的なスタート後位置（1=最前）
  positionType: 'hana' | 'bantte' | 'senkou_uchi' | 'senkou_soto' | 'sashi' | 'oikomi';
  cutInFlag: boolean;          // 内に切れ込んだか
  pushedOutFlag: boolean;      // 外に押し出されたか
  baseSpeedScore: number;
}

/**
 * 椅子取りゲームシミュレーション
 */
export function runChairGameSimulation(
  baseSpeedDataList: BaseSpeedData[],
  totalHorses: number
): ChairGameResult[] {
  // 枠番順にソート（内枠から処理）
  const sortedByWaku = [...baseSpeedDataList].sort((a, b) => a.wakuNumber - b.wakuNumber);
  
  const results: ChairGameResult[] = [];
  const occupiedPositions: Map<number, { horseNumber: number; score: number }> = new Map();
  
  // スコア差の閾値
  const DOMINANT_THRESHOLD = 15;  // これ以上速ければ内に切れ込める
  const EQUAL_THRESHOLD = 5;      // この範囲内は同等
  
  console.log(`[ChairGame] === シミュレーション開始 (${totalHorses}頭) ===`);
  
  for (const horse of sortedByWaku) {
    const { horseNumber, horseName, wakuNumber, boostedSpeedScore } = horse;
    
    // 現在占有されているポジションの平均スコアを計算
    const occupiedList = Array.from(occupiedPositions.values());
    const innerHorsesAvgScore = occupiedList.length > 0
      ? occupiedList.reduce((sum, h) => sum + h.score, 0) / occupiedList.length
      : 0;
    
    let finalPosition: number;
    let positionType: ChairGameResult['positionType'];
    let cutInFlag = false;
    let pushedOutFlag = false;
    
    if (occupiedList.length === 0) {
      // 最初の馬（1枠）: スコアに応じてポジション決定
      // ★重要: 内枠でもスコアが低ければ前に行かない
      if (boostedSpeedScore >= 85) {
        // 高スコア: ハナ争い
        finalPosition = 1;
        positionType = 'hana';
      } else if (boostedSpeedScore >= 70) {
        // 中スコア: 先行
        finalPosition = 2;
        positionType = 'bantte';
      } else if (boostedSpeedScore >= 55) {
        // 低スコア: 中団
        finalPosition = totalHorses * 0.35;
        positionType = 'sashi';
      } else {
        // 非常に低いスコア: 後方
        finalPosition = totalHorses * 0.6;
        positionType = 'oikomi';
      }
      occupiedPositions.set(Math.ceil(finalPosition), { horseNumber, score: boostedSpeedScore });
      
      console.log(`[ChairGame] ${horseName}(${wakuNumber}枠): スコア${boostedSpeedScore.toFixed(0)} → ${positionType} 位置${finalPosition.toFixed(1)}`);
    }
    else {
      const scoreDiff = boostedSpeedScore - innerHorsesAvgScore;
      
      // Case A: 内側より著しく速い → ハナまたは番手を奪う
      if (scoreDiff >= DOMINANT_THRESHOLD) {
        // 最前のポジションを探す
        const frontPositions = Array.from(occupiedPositions.keys()).sort((a, b) => a - b);
        const currentFront = frontPositions[0] || 1;
        
        if (boostedSpeedScore >= 80) {
          // 圧倒的に速い: ハナを奪う
          finalPosition = 1;
          positionType = 'hana';
          cutInFlag = true;
          
          // 既存の馬を1つ後ろにずらす
          const displaced = occupiedPositions.get(1);
          if (displaced) {
            occupiedPositions.delete(1);
            const newPos = 2;
            occupiedPositions.set(newPos, displaced);
            console.log(`[ChairGame]   → 馬${displaced.horseNumber}を位置${newPos}に押し出し`);
          }
        } else {
          // 番手を確保
          finalPosition = currentFront + 1;
          positionType = 'bantte';
          cutInFlag = true;
        }
        
        occupiedPositions.set(finalPosition, { horseNumber, score: boostedSpeedScore });
        console.log(`[ChairGame] ${horseName}(${wakuNumber}枠): 内より速い(+${scoreDiff.toFixed(0)}) → 切れ込み位置${finalPosition}`);
      }
      // Case B: 内側と同等 → スコアに応じて位置決定
      else if (Math.abs(scoreDiff) <= EQUAL_THRESHOLD) {
        // スコアに応じてポジション決定（枠番の影響は最小限）
        if (boostedSpeedScore >= 70) {
          const maxOccupied = Math.max(...Array.from(occupiedPositions.keys()));
          finalPosition = maxOccupied + 0.5 + wakuNumber * 0.03; // 枠番の影響を最小限に
          positionType = 'senkou_uchi';
        } else {
          // スコアが低ければ中団
          finalPosition = totalHorses * 0.4 + wakuNumber * 0.03;
          positionType = 'sashi';
        }
        pushedOutFlag = wakuNumber >= 6;
        
        occupiedPositions.set(Math.ceil(finalPosition), { horseNumber, score: boostedSpeedScore });
        console.log(`[ChairGame] ${horseName}(${wakuNumber}枠): 内と同等(スコア${boostedSpeedScore.toFixed(0)}) → ${positionType} 位置${finalPosition.toFixed(1)}`);
      }
      // Case C: 内側より遅い → 控える
      else {
        // 後方へ（スコアに応じて、枠番の影響は最小限）
        const basePosition = totalHorses * 0.5 + (100 - boostedSpeedScore) / 100 * totalHorses * 0.5;
        finalPosition = Math.min(totalHorses, basePosition + wakuNumber * 0.05); // 枠番の影響を最小限に
        
        if (finalPosition <= totalHorses * 0.35) {
          positionType = 'sashi';
        } else {
          positionType = 'oikomi';
        }
        
        console.log(`[ChairGame] ${horseName}(${wakuNumber}枠): 内より遅い(${scoreDiff.toFixed(0)}) → ${positionType} 位置${finalPosition.toFixed(1)}`);
      }
    }
    
    results.push({
      horseNumber,
      horseName,
      finalPosition,
      positionType,
      cutInFlag,
      pushedOutFlag,
      baseSpeedScore: boostedSpeedScore,
    });
  }
  
  // 位置で再ソート
  results.sort((a, b) => a.finalPosition - b.finalPosition);
  
  // 位置を1から連番に正規化
  results.forEach((r, idx) => {
    r.finalPosition = idx + 1;
  });
  
  console.log(`[ChairGame] === シミュレーション完了 ===`);
  results.forEach(r => {
    console.log(`  ${r.finalPosition}番手: ${r.horseName} (${r.positionType}${r.cutInFlag ? ' 切込' : ''}${r.pushedOutFlag ? ' 外回り' : ''})`);
  });
  
  return results;
}

/**
 * =====================================================
 * 【旧シンプルロジック】スタート後位置を計算（互換性維持）
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
  // 3. 枠番による微調整（スパイス程度に弱める）
  // =====================================================
  const wakuAdjust = (wakuNumber - 4.5) * 0.1;  // -0.35 〜 +0.35（非常に控えめ）
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
async function calculateAvgIndicesForDistance(
  db: any,
  horseName: string,
  targetDistance: number, // 今回のレース距離
  targetSurface: string,  // '芝' or 'ダート'
  currentRaceDateNum: number = 99999999 // 日付フィルタ（デフォルトは全取得）
): Promise<{ 
  avgT2F: number | null;  // 平均T2F（前半2F秒数）
  avgL4F: number | null;  // 平均L4F（後半4F指数）
  t2fRaceCount: number;   // T2Fデータがあるレース数
  l4fRaceCount: number;   // L4Fデータがあるレース数
  fastestT2F: number | null; 
  avgPotential: number | null;
  avgMakikaeshi: number | null;
  // デバッグ用：対象レースの詳細
  relevantRaces: Array<{ date: string; distance: number; T2F: number; L4F: number }>;
}> {
  try {
    // umadataからこの馬のレースを取得
    const raceIdsQuery = `
      SELECT DISTINCT 
        race_id, 
        umaban, 
        corner_2,
        date,
        distance
      FROM umadata
      WHERE horse_name = $1
      ORDER BY race_id DESC
    `;
    
    const allRaceRecords = await db.prepare(raceIdsQuery).all(horseName) as Array<{
      race_id: string;
      umaban: string;
      corner_2: string;
      date: string;
      distance: string;
    }>;
    
    // 現在のレース日付以前のデータのみをフィルタリング
    const raceRecords = allRaceRecords.filter(r => parseDateToNumber(r.date) < currentRaceDateNum);
    
    console.log(`[calculateAvgIndices] ${horseName}: 全レコード=${allRaceRecords.length}, 日付フィルタ後=${raceRecords.length}, targetDist=${targetDistance}, targetSurface=${targetSurface}`);
    
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
    let skippedByDistance = 0;
    let skippedBySurface = 0;
    let matchedRaces = 0;
    
    for (const record of raceRecords) {
      // 距離を抽出
      const distMatch = record.distance?.match(/(\d+)/);
      const raceDist = distMatch ? parseInt(distMatch[1], 10) : 0;
      
      // 距離±200mフィルタ
      if (Math.abs(raceDist - targetDistance) > 200) {
        skippedByDistance++;
        continue;
      }
      
      // 芝/ダートフィルタ
      const isTurf = record.distance?.includes('芝');
      if (isTargetTurf !== isTurf) {
        skippedBySurface++;
        continue;
      }
      matchedRaces++;
      
      // 18桁のrace_idを構築
      const raceId16 = record.race_id;
      const horseNum = record.umaban.padStart(2, '0');
      const fullRaceId = raceId16 + horseNum;
      
      // indicesテーブルからT2F、L4F、potential、makikaeshiを取得
      const indexQuery = `
        SELECT T2F, L4F, potential, makikaeshi
        FROM indices
        WHERE race_id = $1
      `;
      
      const indexRecord = await db.prepare(indexQuery).get(fullRaceId) as { 
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
    console.log(`[calculateAvgIndices] ${horseName} (${targetDistance}m±200m, ${targetSurface}):`,
      `T2F=${avgT2F?.toFixed(1) || 'N/A'}秒 (${t2fValues.length}件)`,
      `L4F=${avgL4F?.toFixed(1) || 'N/A'} (${l4fValues.length}件)`,
      `対象レース=${matchedRaces}件`,
      `除外: 距離=${skippedByDistance}件, 馬場=${skippedBySurface}件`
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
 * 【重要】前走のT2Fと1コーナー通過順位を取得
 * 隊列予想で最重要視するデータ
 */
async function getLastRaceData(
  db: any,
  horseName: string,
  currentRaceDateNum: number = 99999999
): Promise<{
  lastT2F: number | null;
  lastFirstCornerPos: number | null;
  lastSecondCornerPos: number | null;
  lastDistance: number | null;
  lastSurface: string | null;
}> {
  try {
    // umadataから前走を取得
    const query = `
      SELECT race_id, umaban, corner_1, corner_2, date, distance
      FROM umadata
      WHERE horse_name = $1
      ORDER BY race_id DESC
      LIMIT 10
    `;
    
    const allRecords = await db.prepare(query).all(horseName) as Array<{
      race_id: string;
      umaban: string;
      corner_1: string;
      corner_2: string;
      date: string;
      distance: string;
    }>;
    
    // 現在のレース日付以前のデータから最新のものを取得
    const lastRace = allRecords.find(r => parseDateToNumber(r.date) < currentRaceDateNum);
    
    if (!lastRace) {
      return { lastT2F: null, lastFirstCornerPos: null, lastSecondCornerPos: null, lastDistance: null, lastSurface: null };
    }
    
    // 距離と馬場を抽出
    const distMatch = lastRace.distance?.match(/(\d+)/);
    const lastDistance = distMatch ? parseInt(distMatch[1], 10) : null;
    const lastSurface = lastRace.distance?.includes('芝') ? '芝' : 'ダ';
    
    // 1コーナー、2コーナー通過順位を抽出
    const lastFirstCornerPos = lastRace.corner_1 ? parseInt(lastRace.corner_1, 10) : null;
    const lastSecondCornerPos = lastRace.corner_2 ? parseInt(lastRace.corner_2, 10) : null;
    
    // indicesテーブルからT2Fを取得
    const raceId16 = lastRace.race_id;
    const horseNum = lastRace.umaban?.padStart(2, '0') || '00';
    const fullRaceId = raceId16 + horseNum;
    
    const indexQuery = `SELECT "T2F" FROM indices WHERE race_id = $1`;
    const indexRecord = await db.prepare(indexQuery).get(fullRaceId) as { T2F: number } | undefined;
    
    const lastT2F = indexRecord?.T2F && indexRecord.T2F > 0 ? indexRecord.T2F : null;
    
    console.log(`[getLastRaceData] ${horseName}: 前走T2F=${lastT2F?.toFixed(1) || 'N/A'}秒, 1C=${lastFirstCornerPos || 'N/A'}番手, 2C=${lastSecondCornerPos || 'N/A'}番手`);
    
    return { lastT2F, lastFirstCornerPos, lastSecondCornerPos, lastDistance, lastSurface };
  } catch (error) {
    console.error('Error getting last race data:', error);
    return { lastT2F: null, lastFirstCornerPos: null, lastSecondCornerPos: null, lastDistance: null, lastSurface: null };
  }
}

/**
 * 過去の1コーナー通過順位を取得（テン1F推定用）
 * 現在のレース日付以前のデータのみを使用
 */
async function getFirstCornerPositions(
  db: any,
  horseName: string,
  limit: number = 10,
  currentRaceDateNum: number = 99999999
): Promise<number[]> {
  try {
    const query = `
      SELECT corner_1, date
      FROM umadata
      WHERE horse_name = $1
        AND corner_1 IS NOT NULL
        AND corner_1 != ''
      ORDER BY race_id DESC
      LIMIT $2
    `;
    
    const allRecords = await db.prepare(query).all(horseName, limit * 2) as Array<{ corner_1: string; date: string }>;
    
    // 現在のレース日付以前のデータのみをフィルタリング
    const records = allRecords.filter(r => parseDateToNumber(r.date) < currentRaceDateNum).slice(0, limit);
    
    const positions: number[] = [];
    for (const record of records) {
      const pos = parseInt(record.corner_1, 10);
      if (!isNaN(pos) && pos > 0) {
        positions.push(pos);
      }
    }
    
    return positions;
  } catch (error) {
    console.error('Error getting first corner positions:', error);
    return [];
  }
}

/**
 * 過去の2コーナー通過順位の平均を計算（全走遡り版＋逃げ経験チェック）
 * - データがある限りすべて遡る
 * - 逃げた経験（2C=1位）もチェック
 */
async function calculateAvgPosition2C(
  db: any,
  horseName: string,
  currentDistance: number,
  currentRaceDateNum: number = 99999999 // 日付フィルタ（デフォルトは全取得）
): Promise<{ 
  avgPosition: number | null; 
  raceCount: number;
  hasEscapeExperience: boolean; // 逃げた経験
  escapeCount: number; // 逃げた回数
}> {
  try {
    const query = `
      SELECT corner_2, distance, date
      FROM umadata
      WHERE horse_name = $1
        AND corner_2 IS NOT NULL
        AND corner_2 != ''
      ORDER BY race_id DESC
    `;
    
    const records = await db.prepare(query).all(horseName) as Array<{
      corner_2: string;
      distance: string;
      date: string;
    }>;
    
    // 現在のレース日付以前のデータのみをフィルタリング
    const filteredRecords = records.filter(r => parseDateToNumber(r.date) < currentRaceDateNum);
    
    if (filteredRecords.length === 0) {
      return { avgPosition: null, raceCount: 0, hasEscapeExperience: false, escapeCount: 0 };
    }
    
    // 距離が近いレースを優先（±200m範囲内）
    const nearDistancePositions: number[] = [];
    const allPositions: number[] = [];
    let escapeCount = 0;
    
    for (const record of filteredRecords) {
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
 * 前走の距離を取得（現在のレース日付以前のデータのみ）
 */
async function getLastDistance(
  db: any, 
  horseName: string,
  currentRaceDateNum: number = 99999999
): Promise<number | null> {
  const query = `
    SELECT distance, date
    FROM umadata
    WHERE horse_name = $1
    ORDER BY race_id DESC
    LIMIT 10
  `;
  
  const rows = await db.prepare(query).all(horseName) as Array<{ distance: string; date: string }>;
  
  // 現在のレース日付以前のデータから最新のものを取得
  const filteredRow = rows.find(r => parseDateToNumber(r.date) < currentRaceDateNum);
  
  if (!filteredRow || !filteredRow.distance) {
    return null;
  }
  
  const match = filteredRow.distance.match(/(\d+)/);
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
 * 現在のレース日付以前のデータのみを使用
 */
export async function checkRecentBadPerformance(
  db: any,
  horseName: string,
  recentRaces: number = 3,
  currentRaceDateNum: number = 99999999
): Promise<{
  isBadPerformer: boolean;
  avgTimeDiff: number;
  worstTimeDiff: number;
  badRaceCount: number;
}> {
  try {
    // 直近N走の着差データを取得（marginフィールドを使用）
    const query = `
      SELECT finish_position, margin, corner_2, corner_4, date
      FROM umadata
      WHERE horse_name = $1
      ORDER BY race_id DESC
      LIMIT $2
    `;
    
    const allRecords = await db.prepare(query).all(horseName, recentRaces * 2) as Array<{
      finish_position: string;
      margin: string;
      corner_2: string;
      corner_4: string;
      date: string;
    }>;
    
    // 現在のレース日付以前のデータのみをフィルタリング
    const records = allRecords.filter(r => parseDateToNumber(r.date) < currentRaceDateNum).slice(0, recentRaces);
    
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
async function checkConsistentLoser(
  db: any,
  horseName: string,
  currentRaceDateNum: number = 99999999
): Promise<boolean> {
  const result = await checkRecentBadPerformance(db, horseName, 3, currentRaceDateNum);
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
    
    // ★枠順はスパイス程度に（補正値を大幅に弱める）
    // 最初のコーナーまでが短いコース（300m未満）= 内枠やや有利
    if (distToCorner < 300) {
      if (wakuNum <= 2) {
        adjustment = courseChar.innerFrameAdvantage * 0.3; // スパイス程度
      } else if (wakuNum <= 4) {
        adjustment = courseChar.innerFrameAdvantage * 0.15;
      } else if (wakuNum >= 7) {
        adjustment = courseChar.outerFrameAdvantage * 0.3;
      } else if (wakuNum >= 6) {
        adjustment = courseChar.outerFrameAdvantage * 0.15;
      }
    }
    // 最初のコーナーまで余裕あり（500m以上）= 外枠やや有利
    else if (distToCorner >= 500) {
      if (wakuNum >= 7) {
        adjustment = courseChar.outerFrameAdvantage * 0.3;
      } else if (wakuNum >= 5) {
        adjustment = courseChar.outerFrameAdvantage * 0.15;
      } else if (wakuNum <= 2) {
        adjustment = courseChar.innerFrameAdvantage * 0.15;
      }
    }
    // 中間（300-500m）= ほぼ影響なし
    else {
      if (wakuNum <= 2) {
        adjustment = courseChar.innerFrameAdvantage * 0.1;
      } else if (wakuNum >= 7) {
        adjustment = courseChar.outerFrameAdvantage * 0.1;
      }
    }
    
    // 芝スタートダートの場合、外枠やや有利（スパイス程度）
    if (courseChar.turfStartDirt && wakuNum >= 6) {
      adjustment -= 0.2;
    }
    
    // タイトなコーナーの場合、内枠やや有利（スパイス程度）
    if (courseChar.tightCorner && wakuNum <= 3) {
      adjustment -= 0.15;
    }
  }
  // デフォルト補正（非常に控えめに）
  else {
    if (totalHorses >= 16) {
      if (wakuNum <= 2) adjustment = -0.2;
      else if (wakuNum >= 7) adjustment = +0.3;
    } else if (totalHorses >= 12) {
      if (wakuNum <= 2) adjustment = -0.15;
      else if (wakuNum >= 6) adjustment = +0.2;
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
export async function predictRacePace(
  db: any,
  params: {
    year: string;
    date: string;
    place: string;
    raceNumber: string;
  }
): Promise<RacePacePrediction> {
  const { year, date, place, raceNumber } = params;

  const wakujunQuery = `
    SELECT umaban, umamei, waku, distance, track_type, kinryo
    FROM wakujun
    WHERE year = $1 AND date = $2 AND place = $3 AND race_number = $4
    ORDER BY umaban::INTEGER
  `;

  const horses = await db.prepare(wakujunQuery).all(year, date, place, raceNumber) as WakujunRecord[];

  if (horses.length === 0) {
    throw new Error(`No horses found`);
  }

  const distanceMatch = horses[0].distance.match(/(\d+)/);
  if (!distanceMatch) {
    throw new Error(`Invalid distance format: ${horses[0].distance}`);
  }
  const currentDistance = parseInt(distanceMatch[1], 10);
  const trackType = horses[0].track_type;

  // ========================================
  // 重要: 現在表示中のレース日付以前のデータのみを使用
  // （当日や未来のデータを含めると、結果を知った上での評価になってしまう）
  // ========================================
  const currentRaceDateNum = getCurrentRaceDateNumber(date, year);

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
    // 【重要】前走データ（隊列予想で最重要）
    lastT2F: number | null;
    lastFirstCornerPos: number | null;
    lastSecondCornerPos: number | null;
  }> = [];

  // 第1ループ：データ収集（距離±200mでフィルタ）
  for (const horse of horses) {
    const horseNumber = parseInt(horse.umaban, 10);
    const horseName = horse.umamei;

    const { avgPosition, raceCount: posRaceCount, hasEscapeExperience, escapeCount } = await calculateAvgPosition2C(
      db,
      horseName,
      currentDistance,
      currentRaceDateNum
    );

    // 【改善】距離±200mでフィルタした指数を取得（日付フィルタも適用）
    const indexData = await calculateAvgIndicesForDistance(
      db,
      horseName,
      currentDistance,
      trackType,
      currentRaceDateNum
    );

    const lastDistanceData = await getLastDistance(db, horseName, currentRaceDateNum);
    
    // 【重要】前走データを取得（隊列予想で最重要）
    const lastRaceData = await getLastRaceData(db, horseName, currentRaceDateNum);

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
      lastDistance: lastDistanceData,
      hasEscapeExperience,
      escapeCount,
      avgPotential: indexData.avgPotential,
      avgMakikaeshi: indexData.avgMakikaeshi,
      // 【重要】前走データ
      lastT2F: lastRaceData.lastT2F,
      lastFirstCornerPos: lastRaceData.lastFirstCornerPos,
      lastSecondCornerPos: lastRaceData.lastSecondCornerPos,
      relevantRaces: indexData.relevantRaces,
    });
  }

  // =====================================================
  // 【重要】前走T2Fでメンバー内比較（最重要）
  // =====================================================
  
  // 前走T2Fでデータがある馬だけで比較（小さいほど速い = 昇順ソート）
  const lastT2FWithData = tempHorseData
    .filter(d => d.lastT2F !== null)
    .sort((a, b) => (a.lastT2F || 999) - (b.lastT2F || 999));
  
  // 前走1コーナー3番手以内の馬を特定（先行馬判定）
  const frontRunnersByCorner = tempHorseData
    .filter(d => d.lastFirstCornerPos !== null && d.lastFirstCornerPos <= 3)
    .map(d => d.horseNumber);
  
  // 従来のT2F（平均）でデータがある馬（フォールバック用）
  const t2fWithData = tempHorseData
    .filter(d => d.avgT2F !== null && d.t2fRaceCount > 0)
    .sort((a, b) => (a.avgT2F || 999) - (b.avgT2F || 999));
  
  // L4Fでデータがある馬だけで比較
  const l4fWithData = tempHorseData
    .filter(d => d.avgL4F !== null && d.l4fRaceCount > 0)
    .sort((a, b) => (b.avgL4F || 0) - (a.avgL4F || 0));
  
  // 【最重要】前走T2Fパーセンタイル計算
  const getLastT2FPercentile = (horseNum: number) => {
    const idx = lastT2FWithData.findIndex(d => d.horseNumber === horseNum);
    if (idx < 0 || lastT2FWithData.length === 0) return null; // データなし
    return Math.round(((idx + 1) / lastT2FWithData.length) * 100);
  };
  
  // 従来のT2F（フォールバック用）
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
  
  // ✅ デバッグログ：前走T2Fメンバー内順位（最重要）
  console.log(`[predictRacePace] === 【最重要】前走T2Fメンバー内順位 ===`);
  lastT2FWithData.forEach((d, idx) => {
    const corner = d.lastFirstCornerPos ? `1C=${d.lastFirstCornerPos}番手` : '1C=N/A';
    const isFront = frontRunnersByCorner.includes(d.horseNumber) ? '★先行' : '';
    console.log(`  ${idx + 1}位: ${d.horseName} 前走T2F=${d.lastT2F?.toFixed(1)}秒 ${corner} ${isFront}`);
  });
  
  console.log(`[predictRacePace] === 前走1コーナー3番手以内（先行判定）===`);
  console.log(`  ${frontRunnersByCorner.length}頭: ${tempHorseData.filter(d => frontRunnersByCorner.includes(d.horseNumber)).map(d => d.horseName).join(', ') || 'なし'}`);
  
  console.log(`[predictRacePace] === 参考：平均T2F順位（距離${currentDistance}m±200m）===`);
  t2fWithData.slice(0, 5).forEach((d, idx) => {
    console.log(`  ${idx + 1}位: ${d.horseName} 平均T2F=${d.avgT2F?.toFixed(1)}秒 (${d.t2fRaceCount}レース)`);
  });

  // =====================================================
  // 【重要】椅子取りゲーム用の基礎データを準備
  // 前走T2Fを最重要視、前走1コーナー3番手以内は先行判定
  // =====================================================
  const baseSpeedDataList: BaseSpeedData[] = [];
  
  for (const data of tempHorseData) {
    const { horse, horseNumber, horseName, avgT2F, t2fRaceCount, lastDistance, escapeCount, relevantRaces, lastT2F, lastFirstCornerPos } = data;
    
    // 【最重要】前走T2Fパーセンタイル（なければ平均T2Fを使用）
    const lastT2FPct = getLastT2FPercentile(horseNumber);
    const avgT2FPct = getT2FPercentile(horseNumber);
    const t2fPercentile = lastT2FPct !== null ? lastT2FPct : avgT2FPct;
    
    const wakuNum = parseInt(horse.waku, 10);
    
    // 【重要】前走1コーナー3番手以内なら先行判定（大きなボーナス）
    const wasFrontRunner = lastFirstCornerPos !== null && lastFirstCornerPos <= 3;
    let first1FScore = 50; // デフォルト
    if (wasFrontRunner) {
      // 前走で前にいた馬は今回も前に行く可能性が高い
      first1FScore = 85 + (3 - lastFirstCornerPos) * 5; // 1番手=95, 2番手=90, 3番手=85
    } else if (lastFirstCornerPos !== null) {
      // 前走の位置取りをスコア化
      first1FScore = Math.max(20, 80 - lastFirstCornerPos * 5);
    } else {
      // 前走データなし → 過去複数走から推定
      const firstCornerPositions = await getFirstCornerPositions(db, horseName, 10, currentRaceDateNum);
      first1FScore = estimateFirst1FScore(firstCornerPositions, horses.length);
    }
    
    // 重み付きT2F計算（近3走重視）
    const { weightedT2F, recentWeight } = calculateWeightedT2F(
      relevantRaces.map(r => ({ date: r.date, T2F: r.T2F, distance: r.distance })),
      currentDistance
    );
    
    // 基礎テンスピードスコアを計算
    const speedData = calculateBaseSpeedScore(
      horseNumber,
      horseName,
      wakuNum,
      avgT2F,
      weightedT2F,
      first1FScore,
      escapeCount,
      lastDistance,
      currentDistance,
      t2fPercentile,
      horses.length,
      recentWeight
    );
    
    // 前走先行馬は追加ブースト
    if (wasFrontRunner) {
      speedData.boostedSpeedScore = Math.min(100, speedData.boostedSpeedScore + 10);
      console.log(`[BaseSpeed] ${horseName}: 前走1C=${lastFirstCornerPos}番手 → 先行ブースト+10`);
    }
    
    baseSpeedDataList.push(speedData);
  }
  
  // =====================================================
  // 【椅子取りゲーム】シミュレーション実行
  // =====================================================
  const chairGameResults = runChairGameSimulation(baseSpeedDataList, horses.length);
  
  // 椅子取りゲーム結果をマップ化
  const chairGameMap = new Map<number, ChairGameResult>();
  for (const result of chairGameResults) {
    chairGameMap.set(result.horseNumber, result);
  }

  // 第2ループ：位置計算（椅子取りゲーム結果を反映）
  for (const data of tempHorseData) {
    const { horse, horseNumber, horseName, avgPosition, posRaceCount, avgT2F, avgL4F, t2fRaceCount, l4fRaceCount, hasEscapeExperience, escapeCount, avgPotential, avgMakikaeshi, relevantRaces, lastT2F, lastFirstCornerPos } = data;

    // 【最重要】前走T2Fパーセンタイル（なければ平均T2Fを使用）
    const lastT2FPct = getLastT2FPercentile(horseNumber);
    const avgT2FPct = getT2FPercentile(horseNumber);
    const t2fPercentile = lastT2FPct !== null ? lastT2FPct : avgT2FPct;
    const l4fPercentile = getL4FPercentile(horseNumber);
    
    // 前走1コーナー3番手以内かどうか
    const wasFrontRunner = lastFirstCornerPos !== null && lastFirstCornerPos <= 3;
    
    // 椅子取りゲーム結果を取得
    const chairResult = chairGameMap.get(horseNumber);
    
    // ✅ デバッグログ：各馬の詳細（前走データを重視）
    const frontFlag = wasFrontRunner ? '★先行' : '';
    console.log(`[predictRacePace] ${horseName}: 前走T2F=${lastT2F?.toFixed(1) || 'N/A'}秒 前走1C=${lastFirstCornerPos || 'N/A'}番手 ${frontFlag} | メンバー内${t2fPercentile}%`);

    // 椅子取りゲームの結果を使用（フォールバック: 旧ロジック）
    let adjustedPosition: number;
    let runningStyle: RunningStyle;
    
    if (chairResult) {
      adjustedPosition = chairResult.finalPosition;
      // positionTypeからRunningStyleへ変換
      switch (chairResult.positionType) {
        case 'hana':
          runningStyle = 'escape';
          break;
        case 'bantte':
        case 'senkou_uchi':
        case 'senkou_soto':
          runningStyle = 'lead';
          break;
        case 'sashi':
          runningStyle = 'sashi';
          break;
        case 'oikomi':
          runningStyle = 'oikomi';
          break;
        default:
          runningStyle = 'sashi';
      }
    } else {
      // フォールバック: 旧ロジック
      const hasT2FData = t2fRaceCount > 0;
      const wakuNum = parseInt(horse.waku, 10);
      adjustedPosition = calculateSimpleStartPosition(
        horseNumber,
        t2fPercentile,
        hasT2FData,
        escapeCount,
        wakuNum,
        horses.length
      );
      runningStyle = estimateSimpleRunningStyle(adjustedPosition, horses.length);
    }

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

    // expectedPosition2Cは椅子取りゲームの結果を使用
    const expectedPosition2C = adjustedPosition;
    
    // 斤量をパース（例: "58.0" → 58.0）
    const kinryo = parseFloat(horse.kinryo) || 0;
    
    // 大敗続きかどうかをチェック（日付フィルタ適用）
    const isConsistentLoser = checkConsistentLoser(db, horseName, currentRaceDateNum);
    
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
      // 椅子取りゲーム追加情報
      chairGameCutIn: chairResult?.cutInFlag || false,
      chairGamePushedOut: chairResult?.pushedOutFlag || false,
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
