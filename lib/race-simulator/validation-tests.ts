/**
 * Phase 4.1 異常系テスト
 * 
 * 意図的に異常なデータを作成し、validationが検出できるか確認
 */

import type { SimulationResult, HorseState } from '@/types/race-simulator';
import { validateSimulation } from './validation';

/**
 * 異常系テスト実行
 */
export function runAnomalyTests(courseDistance: number): {
  testName: string;
  passed: boolean;
  detectedErrors: string[];
  detectedWarnings: string[];
}[] {
  const results: any[] = [];
  
  console.log('[AnomalyTests] === 異常系テスト開始 ===');
  
  // テスト1: currentDistanceが前Phaseより小さい
  results.push(testBackwardDistance(courseDistance));
  
  // テスト2: currentVelocityが異常値（30m/s）
  results.push(testAbnormalVelocity(courseDistance));
  
  // テスト3: lateralPositionがコース外
  results.push(testOutOfBounds(courseDistance));
  
  // テスト4: staminaRemainingが負数
  results.push(testNegativeStamina(courseDistance));
  
  // テスト5: distanceFromLeaderが不整合
  results.push(testDistanceFromLeaderMismatch(courseDistance));
  
  // テスト6: ブロック中に前方馬を通過
  results.push(testBlockedOvertake(courseDistance));
  
  // テスト7: レーン変更が瞬間移動（1秒で5m）
  results.push(testInstantLaneChange(courseDistance));
  
  // テスト8: 外側の馬の走行距離が内側より短い
  results.push(testOuterShorterDistance(courseDistance));
  
  // テスト9: ゴール順位とゴール時刻が逆転
  results.push(testGoalOrderMismatch(courseDistance));
  
  console.log('[AnomalyTests] === 異常系テスト完了 ===');
  console.log(`  実行: ${results.length}件`);
  console.log(`  成功: ${results.filter(r => r.passed).length}件`);
  console.log(`  失敗: ${results.filter(r => !r.passed).length}件`);
  
  return results;
}

function testBackwardDistance(courseDistance: number) {
  const testName = 'currentDistanceが前Phaseより小さい';
  
  const horse1: HorseState = createDummyHorse(1, 'テスト1号', 200);
  const horse2: HorseState = createDummyHorse(2, 'テスト2号', 195);
  
  const result: SimulationResult = {
    raceKey: 'TEST_001',
    phases: {
      start: createPhaseResult('スタート', 0, 200, [horse1, horse2]),
      formation: createPhaseResult('隊列形成', 200, 600, [
        { ...horse1, currentDistance: 600 },
        { ...horse2, currentDistance: 595 },
      ]),
      pace: createPhaseResult('ペース', 200, 600, [
        { ...horse1, currentDistance: 600 },
        { ...horse2, currentDistance: 595 },
      ]),
      corner3_4: createPhaseResult('3-4コーナー', 600, 1200, [
        { ...horse1, currentDistance: 580 }, // 後退！
        { ...horse2, currentDistance: 575 },
      ]),
      straight: createPhaseResult('直線', 1200, courseDistance, [
        { ...horse1, currentDistance: courseDistance },
        { ...horse2, currentDistance: courseDistance - 1 },
      ]),
      goal: createPhaseResult('ゴール', courseDistance, courseDistance, [
        { ...horse1, currentDistance: courseDistance },
        { ...horse2, currentDistance: courseDistance - 1 },
      ]),
    },
    finalStandings: [horse1, horse2],
  };
  
  const validation = validateSimulation(result, courseDistance);
  
  const passed = validation.errors.some(e => e.includes('後退') || e.includes('減少'));
  
  return {
    testName,
    passed,
    detectedErrors: validation.errors,
    detectedWarnings: validation.warnings,
  };
}

function testAbnormalVelocity(courseDistance: number) {
  const testName = 'currentVelocityが30m/s（異常値）';
  
  const horse1: HorseState = createDummyHorse(1, 'テスト1号', 200);
  horse1.currentVelocity = 30; // 異常！
  
  const result: SimulationResult = {
    raceKey: 'TEST_002',
    phases: {
      start: createPhaseResult('スタート', 0, 200, [horse1]),
      formation: createPhaseResult('隊列形成', 200, 600, [horse1]),
      pace: createPhaseResult('ペース', 200, 600, [horse1]),
      corner3_4: createPhaseResult('3-4コーナー', 600, 1200, [horse1]),
      straight: createPhaseResult('直線', 1200, courseDistance, [horse1]),
      goal: createPhaseResult('ゴール', courseDistance, courseDistance, [horse1]),
    },
    finalStandings: [horse1],
  };
  
  const validation = validateSimulation(result, courseDistance);
  
  const passed = validation.warnings.some(w => w.includes('速度') && w.includes('30'));
  
  return {
    testName,
    passed,
    detectedErrors: validation.errors,
    detectedWarnings: validation.warnings,
  };
}

function testOutOfBounds(courseDistance: number) {
  const testName = 'lateralPositionがコース外（-20m）';
  
  const horse1: HorseState = createDummyHorse(1, 'テスト1号', 200);
  horse1.lateralPosition = -20; // コース外！
  
  const result: SimulationResult = {
    raceKey: 'TEST_003',
    phases: {
      start: createPhaseResult('スタート', 0, 200, [horse1]),
      formation: createPhaseResult('隊列形成', 200, 600, [horse1]),
      pace: createPhaseResult('ペース', 200, 600, [horse1]),
      corner3_4: createPhaseResult('3-4コーナー', 600, 1200, [horse1]),
      straight: createPhaseResult('直線', 1200, courseDistance, [horse1]),
      goal: createPhaseResult('ゴール', courseDistance, courseDistance, [horse1]),
    },
    finalStandings: [horse1],
  };
  
  const validation = validateSimulation(result, courseDistance);
  
  const passed = validation.warnings.some(w => w.includes('横位置') || w.includes('lateral'));
  
  return {
    testName,
    passed,
    detectedErrors: validation.errors,
    detectedWarnings: validation.warnings,
  };
}

function testNegativeStamina(courseDistance: number) {
  const testName = 'staminaRemainingが負数（-10%）';
  
  const horse1: HorseState = createDummyHorse(1, 'テスト1号', 200);
  horse1.staminaRemaining = -10; // 負数！
  
  const result: SimulationResult = {
    raceKey: 'TEST_004',
    phases: {
      start: createPhaseResult('スタート', 0, 200, [horse1]),
      formation: createPhaseResult('隊列形成', 200, 600, [horse1]),
      pace: createPhaseResult('ペース', 200, 600, [horse1]),
      corner3_4: createPhaseResult('3-4コーナー', 600, 1200, [horse1]),
      straight: createPhaseResult('直線', 1200, courseDistance, [horse1]),
      goal: createPhaseResult('ゴール', courseDistance, courseDistance, [horse1]),
    },
    finalStandings: [horse1],
  };
  
  const validation = validateSimulation(result, courseDistance);
  
  const passed = validation.warnings.some(w => w.includes('スタミナ') || w.includes('stamina'));
  
  return {
    testName,
    passed,
    detectedErrors: validation.errors,
    detectedWarnings: validation.warnings,
  };
}

function testDistanceFromLeaderMismatch(courseDistance: number) {
  const testName = 'distanceFromLeaderが不整合';
  
  const horse1: HorseState = createDummyHorse(1, 'テスト1号', courseDistance);
  horse1.position = 1;
  horse1.distanceFromLeader = 0;
  
  const horse2: HorseState = createDummyHorse(2, 'テスト2号', courseDistance - 5);
  horse2.position = 2;
  horse2.distanceFromLeader = 100; // 実際は5mなのに100mと記録（不整合！）
  
  const result: SimulationResult = {
    raceKey: 'TEST_005',
    phases: {
      start: createPhaseResult('スタート', 0, 200, [horse1, horse2]),
      formation: createPhaseResult('隊列形成', 200, 600, [horse1, horse2]),
      pace: createPhaseResult('ペース', 200, 600, [horse1, horse2]),
      corner3_4: createPhaseResult('3-4コーナー', 600, 1200, [horse1, horse2]),
      straight: createPhaseResult('直線', 1200, courseDistance, [horse1, horse2]),
      goal: createPhaseResult('ゴール', courseDistance, courseDistance, [horse1, horse2]),
    },
    finalStandings: [horse1, horse2],
  };
  
  const validation = validateSimulation(result, courseDistance);
  
  const passed = validation.errors.some(e => e.includes('distanceFromLeader') || e.includes('先頭からの距離'));
  
  return {
    testName,
    passed,
    detectedErrors: validation.errors,
    detectedWarnings: validation.warnings,
  };
}

function testBlockedOvertake(courseDistance: number) {
  const testName = 'ブロック中に前方馬を通過';
  
  // この検証は現在のvalidation.tsに未実装のため、将来の拡張として残す
  
  return {
    testName,
    passed: false, // 未実装
    detectedErrors: [],
    detectedWarnings: ['未実装テスト'],
  };
}

function testInstantLaneChange(courseDistance: number) {
  const testName = 'レーン変更が瞬間移動（1秒で5m）';
  
  // この検証は現在のvalidation.tsに未実装のため、将来の拡張として残す
  
  return {
    testName,
    passed: false, // 未実装
    detectedErrors: [],
    detectedWarnings: ['未実装テスト'],
  };
}

function testOuterShorterDistance(courseDistance: number) {
  const testName = '外側の馬の走行距離が内側より短い';
  
  const horse1: HorseState = createDummyHorse(1, 'テスト1号', courseDistance);
  horse1.lateralPosition = -5; // 内側
  horse1.currentDistance = courseDistance + 10;
  
  const horse2: HorseState = createDummyHorse(2, 'テスト2号', courseDistance);
  horse2.lateralPosition = 5; // 外側
  horse2.currentDistance = courseDistance; // 内側より短い！
  
  const result: SimulationResult = {
    raceKey: 'TEST_008',
    phases: {
      start: createPhaseResult('スタート', 0, 200, [horse1, horse2]),
      formation: createPhaseResult('隊列形成', 200, 600, [horse1, horse2]),
      pace: createPhaseResult('ペース', 200, 600, [horse1, horse2]),
      corner3_4: createPhaseResult('3-4コーナー', 600, 1200, [horse1, horse2]),
      straight: createPhaseResult('直線', 1200, courseDistance, [horse1, horse2]),
      goal: createPhaseResult('ゴール', courseDistance, courseDistance, [horse1, horse2]),
    },
    finalStandings: [horse1, horse2],
  };
  
  const validation = validateSimulation(result, courseDistance);
  
  const passed = validation.warnings.some(w => w.includes('外側') || w.includes('outer'));
  
  return {
    testName,
    passed,
    detectedErrors: validation.errors,
    detectedWarnings: validation.warnings,
  };
}

function testGoalOrderMismatch(courseDistance: number) {
  const testName = 'ゴール順位とゴール時刻が逆転';
  
  // この検証は現在のvalidation.tsに未実装のため、将来の拡張として残す
  
  return {
    testName,
    passed: false, // 未実装
    detectedErrors: [],
    detectedWarnings: ['未実装テスト'],
  };
}

// ヘルパー関数
function createDummyHorse(num: number, name: string, distance: number): HorseState {
  return {
    horseNumber: num,
    horseName: name,
    position: num,
    internalLane: num,
    distanceFromLeader: 0,
    currentDistance: distance,
    currentVelocity: 15,
    lateralPosition: 0,
    capabilities: {
      startSpeed: 50,
      cruiseSpeed: 50,
      acceleration: 50,
      stamina: 50,
      cornerSkill: 50,
    },
    leadingIntention: 50,
    pfs: 50,
    pastPositionPattern: '5-5-5-5',
    staminaRemaining: 50,
    blocked: false,
    outerPath: false,
    waku: num,
    weight: 55,
    trackBiasEffect: 0,
  };
}

function createPhaseResult(name: string, start: number, end: number, horses: HorseState[]): any {
  return {
    phaseName: name,
    distanceRange: { start, end },
    timeRange: { start: 0, end: 10 },
    horses,
    paceInfo: {
      averageSpeed: 15,
      leadingHorses: [1],
      paceType: 'middle',
    },
    events: [],
  };
}
