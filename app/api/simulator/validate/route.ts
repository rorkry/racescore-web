import { NextRequest, NextResponse } from 'next/server';
import { getDbAsync } from '@/lib/db';
import { runRaceSimulation } from '@/lib/race-simulator/simulation-orchestrator';
import { runAnomalyTests } from '@/lib/race-simulator/validation-tests';

/**
 * Phase 4.1 実データ検証用エンドポイント
 * 
 * 実際のレースデータを使用してシミュレーションを実行し、
 * 詳細なログを返す
 * 
 * オプション:
 * - raceKeys: 実データで検証するレースキーの配列
 * - runAnomalyTests: 異常系テストを実行するか（デフォルト: false）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { raceKeys, runAnomalyTests: shouldRunAnomalyTests } = body;

    const db = await getDbAsync();
    const results = [];
    
    // 異常系テストを実行
    let anomalyTestResults: any[] = [];
    if (shouldRunAnomalyTests) {
      console.log('[Validation] === 異常系テスト実行 ===');
      anomalyTestResults = runAnomalyTests(1600); // 仮の距離
      console.log(`[Validation] 異常系テスト: ${anomalyTestResults.filter(t => t.passed).length}/${anomalyTestResults.length}件成功`);
    }

    for (const raceKey of raceKeys) {
      console.log('========================================');
      console.log(`[Validation] レース検証開始: ${raceKey}`);
      console.log('========================================');

      // レースキーから情報を抽出
      // 例: "20230101_東京_01" → year="2023", date="0101", place="東京", raceNumber="01"
      const match = raceKey.match(/^(\d{4})(\d{4})_(.+?)_(\d{2})$/);
      if (!match) {
        console.error(`[Validation] 不正なレースキー: ${raceKey}`);
        continue;
      }

      const [, year, date, place, raceNumber] = match;

      // 出馬表を取得
      const horses = await db.query(
        `SELECT * FROM umadata WHERE year = $1 AND date = $2 AND place = $3 AND race_number = $4 ORDER BY umaban::int`,
        [year, date, place, raceNumber]
      );

      if (horses.rows.length === 0) {
        console.error(`[Validation] レースデータが見つかりません: ${raceKey}`);
        continue;
      }

      console.log(`[Validation] 出走頭数: ${horses.rows.length}頭`);

      // シミュレーション実行（trackBiasはデフォルト）
      const simulation = await runRaceSimulation({
        year,
        date,
        place,
        raceNumber,
        trackBias: {
          innerAdvantage: 0,
          frontRunnerAdvantage: 0,
        },
      });

      // 検証結果を取得
      const validation = simulation.validation;

      // 各フェーズの詳細ログを構築
      const phaseDetails = {
        start: extractPhaseDetails(simulation.phases.start),
        formation: extractPhaseDetails(simulation.phases.formation),
        corner3_4: extractPhaseDetails(simulation.phases.corner3_4),
        straight: extractPhaseDetails(simulation.phases.straight),
        goal: extractPhaseDetails(simulation.phases.goal),
      };

      // 統計情報を計算
      const stats = calculateRaceStats(simulation, horses.rows.length);
      
      results.push({
        raceKey,
        course: `${place} ${simulation.phases.start.distanceRange.end}m`,
        distance: simulation.phases.goal.distanceRange.end,
        horseCount: horses.rows.length,
        courseInfo: simulation.validation?.stats?.courseInfo || 'fallback使用',
        usedFallback: simulation.validation?.warnings?.some((w: string) => w.includes('FALLBACK')) || false,
        validationErrors: simulation.validation?.errors?.length || 0,
        validationWarnings: simulation.validation?.warnings?.length || 0,
        phaseDetails,
        validation: simulation.validation,
        stats,
        finalStandings: simulation.finalStandings.slice(0, 10).map(h => ({
          position: h.position,
          horseName: h.horseName,
          horseNumber: h.horseNumber,
          currentDistance: h.currentDistance,
          distanceFromLeader: h.distanceFromLeader,
          staminaRemaining: h.staminaRemaining,
        })),
      });
    }

    return NextResponse.json({ 
      realDataTests: results,
      anomalyTests: anomalyTestResults,
      summary: {
        realDataCount: results.length,
        anomalyTestCount: anomalyTestResults.length,
        anomalyTestsPassed: anomalyTestResults.filter(t => t.passed).length,
      }
    }, { status: 200 });
  } catch (error: any) {
    console.error('[Validation] エラー:', error);
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}

/**
 * レース統計を計算
 */
function calculateRaceStats(simulation: any, horseCount: number) {
  const allHorses = simulation.finalStandings;
  
  const maxVelocity = Math.max(...allHorses.map((h: any) => h.currentVelocity));
  const minVelocity = Math.min(...allHorses.map((h: any) => h.currentVelocity));
  
  const maxExtraDistance = Math.max(...allHorses.map((h: any) => 
    Math.max(0, h.currentDistance - simulation.phases.goal.distanceRange.end)
  ));
  
  const lateralPositions = allHorses.map((h: any) => h.lateralPosition);
  const maxLateralMove = Math.max(...lateralPositions) - Math.min(...lateralPositions);
  
  const blockEvents = Object.values(simulation.phases).flatMap((phase: any) => 
    phase.events?.filter((e: any) => e.event === 'blocked') || []
  ).length;
  
  const laneChangeEvents = Object.values(simulation.phases).flatMap((phase: any) => 
    phase.events?.filter((e: any) => e.event === 'cut-in') || []
  ).length;
  
  const accelerationEvents = Object.values(simulation.phases).flatMap((phase: any) => 
    phase.events?.filter((e: any) => e.event === 'accelerate') || []
  );
  
  const accelerationDistances = accelerationEvents.map((e: any) => {
    const horse = simulation.phases.corner3_4?.horses?.find((h: any) => h.horseNumber === e.horseNumber);
    return horse?.accelerationStartDistance || 0;
  }).filter(d => d > 0);
  
  const accelerationSpread = accelerationDistances.length > 0
    ? `${Math.min(...accelerationDistances).toFixed(0)}m 〜 ${Math.max(...accelerationDistances).toFixed(0)}m`
    : 'なし';
  
  return {
    maxVelocity: maxVelocity.toFixed(1) + ' m/s',
    minVelocity: minVelocity.toFixed(1) + ' m/s',
    maxExtraDistance: maxExtraDistance.toFixed(1) + ' m',
    maxLateralMove: maxLateralMove.toFixed(1) + ' m',
    blockEventCount: blockEvents,
    laneChangeCount: laneChangeEvents,
    accelerationSpread,
  };
}

/**
 * フェーズ結果から詳細情報を抽出
 */
function extractPhaseDetails(phase: any) {
  return {
    phaseName: phase.phaseName,
    distanceRange: phase.distanceRange,
    timeRange: phase.timeRange,
    paceInfo: phase.paceInfo,
    events: phase.events,
    allHorses: phase.horses.map((h: any) => ({
      position: h.position,
      horseName: h.horseName,
      horseNumber: h.horseNumber,
      waku: h.waku,
      currentDistance: Math.round(h.currentDistance * 10) / 10,
      currentVelocity: Math.round(h.currentVelocity * 10) / 10,
      acceleration: h.acceleration || 0,
      distanceFromLeader: Math.round(h.distanceFromLeader * 10) / 10,
      staminaRemaining: Math.round(h.staminaRemaining),
      blocked: h.blocked,
      outerPath: h.outerPath,
      lateralPosition: Math.round(h.lateralPosition * 10) / 10,
      internalLane: h.internalLane,
    })),
  };
}
