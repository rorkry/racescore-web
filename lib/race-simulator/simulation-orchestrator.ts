/**
 * シミュレーション統括エンジン
 * 
 * 各Phase を順次実行し、最終結果を返す
 */

import type { 
  SimulationInput, 
  SimulationResult, 
  HorseState, 
  CourseInfo,
  TrackBias
} from '@/types/race-simulator';
import { fetchHorseIndices, calculateLeadingIntention, getPastPositionPattern } from './data-fetcher';
import { analyzeCapabilities, logCapabilities } from './capability-analyzer';
import { getCourseInfo } from './course-database';
import { executeStartPhase } from './engines/start-phase';
import { executeFormationPhase } from './engines/formation-phase';
import { executeCornerPhase } from './engines/corner-phase';
import { executeStraightPhase } from './engines/straight-phase';
import { validateSimulation } from './validation';

/**
 * レースシミュレーションを実行
 */
export async function runRaceSimulation(
  db: any,
  input: SimulationInput
): Promise<SimulationResult> {
  const { year, date, place, raceNumber, distance, trackBias, enableDetailedLog } = input;
  
  console.log('========================================');
  console.log(`[Simulator] レースシミュレーション開始`);
  console.log(`  ${year}年${date} ${place} ${raceNumber}R (${distance}m)`);
  console.log('========================================');
  
  // ========================================
  // 1. 出走馬データを取得
  // ========================================
  const wakujunQuery = `
    SELECT umaban, umamei, waku, distance, track_type, kinryo
    FROM wakujun
    WHERE year = $1 AND date = $2 AND place = $3 AND race_number = $4
    ORDER BY umaban::INTEGER
  `;
  
  const horses = await db.prepare(wakujunQuery).all(year, date, place, raceNumber) as Array<{
    umaban: string;
    umamei: string;
    waku: string;
    distance: string;
    track_type: string;
    kinryo: string;
  }>;
  
  if (horses.length === 0) {
    throw new Error(`No horses found for ${year}${date} ${place} ${raceNumber}R`);
  }
  
  const totalHorses = horses.length;
  
  // 距離と馬場を抽出
  const distanceMatch = horses[0].distance.match(/(\d+)/);
  if (!distanceMatch) {
    throw new Error(`Invalid distance format: ${horses[0].distance}`);
  }
  const currentDistance = parseInt(distanceMatch[1], 10);
  const trackType = horses[0].track_type;
  const targetSurface = horses[0].distance.includes('芝') ? '芝' : 'ダート';
  
  // 現在のレース日付（日付フィルタ用）
  const currentRaceDateNum = getCurrentRaceDateNumber(date, year);
  
  // ========================================
  // 2. コース情報を取得
  // ========================================
  console.warn('[Simulator] 距離情報:', {
    入力distance: distance,
    DB_currentDistance: currentDistance,
    不一致: distance !== currentDistance ? 'YES ❌' : 'NO ✓'
  });
  
  // 明示的に入力されたdistanceを使用
  const courseInfo = getCourseInfo(place, distance, trackType as 'turf' | 'dirt');
  
  console.log(`[Simulator] コース: ${place} ${distance}m ${trackType}`);
  if (courseInfo) {
    console.log(`  直線: ${courseInfo.straightLength}m`);
    console.log(`  坂: ${courseInfo.slopes.length}箇所`);
    console.log(`  傾向: ${courseInfo.paceTendency}`);
    console.log(`  CourseInfo.distance: ${courseInfo.distance}m`);
  }
  
  // ========================================
  // 3. 各馬のデータを取得＆能力分析
  // ========================================
  const horseStates: HorseState[] = [];
  
  for (const horse of horses) {
    const horseNumber = parseInt(horse.umaban, 10);
    const horseName = horse.umamei;
    const waku = parseInt(horse.waku, 10);
    const weight = parseFloat(horse.kinryo) || 55.0;
    
    // 指数データ取得
    const indices = await fetchHorseIndices(
      db,
      horseName,
      distance,
      targetSurface,
      currentRaceDateNum
    );
    
    indices.horseNumber = horseNumber;
    
    // 能力分析
    const capabilities = analyzeCapabilities(indices, totalHorses);
    
    // 先行意欲スコア
    const leadingIntention = calculateLeadingIntention(indices);
    
    // 過去通過順パターン
    const pastPositionPattern = getPastPositionPattern(indices.pastPositions);

    // PFS
    const pfs = indices.avgData.pfs || 50;
    
    if (enableDetailedLog) {
      logCapabilities(horseName, capabilities, indices);
    }
    
    // HorseState を構築
    const horseState: HorseState = {
      horseNumber,
      horseName,
      position: 0, // 初期値、StartPhaseで決定
      internalLane: waku,
      distanceFromLeader: 0,
      // 【Phase 4.1】走行データ初期化
      currentDistance: 0, // スタート地点
      currentVelocity: 0, // 停止状態
      lateralPosition: (waku - 4.5) * 2.5, // 枠番に応じた横位置（m）
      capabilities,
      leadingIntention,
      pfs,
      pastPositionPattern,
      staminaRemaining: capabilities.stamina, // 初期値=スタミナ能力値
      blocked: false,
      outerPath: false,
      waku,
      weight,
      trackBiasEffect: 0,
    };
    
    horseStates.push(horseState);
  }
  
  // ========================================
  // 4. Phase別シミュレーション実行
  // ========================================
  
  // Phase 1: スタート〜隊列形成
  const startPhaseResult = executeStartPhase({
    horses: horseStates,
    totalHorses,
  });
  
  // Phase 2: 隊列確定〜ペース形成
  const formationPhaseResult = executeFormationPhase({
    horses: startPhaseResult.horses,
    courseInfo,
    totalHorses,
  }, startPhaseResult);
  
  // Phase 3-4: コーナーフェーズ
  const straightStart = courseInfo ? distance - courseInfo.straightLength : distance * 0.8;
  const cornerPhaseResult = executeCornerPhase({
    horses: formationPhaseResult.horses,
    courseInfo,
    totalHorses,
    straightStart,
  }, formationPhaseResult);
  
  // Phase 5: 直線〜ゴール
  const straightPhaseResult = executeStraightPhase({
    horses: cornerPhaseResult.horses,
    paceType: cornerPhaseResult.paceInfo.paceType,
    trackBias,
    courseInfo,
    totalHorses,
    raceDistance: distance, // API入力のdistanceを明示的に渡す
  }, cornerPhaseResult);
  
  // ========================================
  // 5. 結果をまとめる
  // ========================================
  const raceKey = `${year}${date}_${place}_${raceNumber}`;
  
  const result: SimulationResult = {
    raceKey,
    raceDistance: distance, // レース距離を明示的に保持
    phases: {
      start: startPhaseResult,
      formation: formationPhaseResult,
      pace: formationPhaseResult, // 同じ
      corner3_4: cornerPhaseResult,
      straight: straightPhaseResult,
      goal: straightPhaseResult, // 同じ
    },
    finalStandings: straightPhaseResult.horses,
  };
  
  console.log('========================================');
  console.log('[Simulator] シミュレーション完了');
  console.log('========================================');
  console.log('【予想着順】');
  result.finalStandings.slice(0, 10).forEach((h, idx) => {
    console.log(`  ${idx + 1}着: ${h.horseName} (${h.horseNumber}番, ${h.waku}枠)`);
  });
  console.log('========================================');
  
  // ========================================
  // 【Phase 4.1】整合性検証
  // ========================================
  const validation = validateSimulation(result, distance);
  
  if (!validation.valid) {
    console.error('[Simulator] 整合性エラーが検出されました！');
  } else if (validation.warnings.length > 0) {
    console.warn('[Simulator] 警告がありますが、シミュレーションは有効です。');
  } else {
    console.log('[Simulator] ✅ 整合性検証: すべて正常');
  }
  
  return result;
}

/**
 * 現在のレース日付をYYYYMMDD形式の数値に変換
 */
function getCurrentRaceDateNumber(date: string, year: string): number {
  const dateStr = String(date).padStart(4, '0');
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  const currentYear = parseInt(year, 10) || new Date().getFullYear();
  return currentYear * 10000 + month * 100 + day;
}
