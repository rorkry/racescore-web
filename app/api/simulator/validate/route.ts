import { NextRequest, NextResponse } from 'next/server';
import { getDbAsync } from '@/lib/db';
import { runRaceSimulation } from '@/lib/race-simulator/simulation-orchestrator';

/**
 * Phase 4.1 実データ検証用エンドポイント
 * 
 * 実際のレースデータを使用してシミュレーションを実行し、
 * 詳細なログを返す
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { raceKeys } = body; // レースキーの配列

    const db = await getDbAsync();
    const results = [];

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

      results.push({
        raceKey,
        horseCount: horses.rows.length,
        phaseDetails,
        validation,
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

    return NextResponse.json({ results }, { status: 200 });
  } catch (error: any) {
    console.error('[Validation] エラー:', error);
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
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
    topHorses: phase.horses.slice(0, 10).map((h: any) => ({
      position: h.position,
      horseName: h.horseName,
      horseNumber: h.horseNumber,
      currentDistance: Math.round(h.currentDistance * 10) / 10,
      currentVelocity: Math.round(h.currentVelocity * 10) / 10,
      distanceFromLeader: Math.round(h.distanceFromLeader * 10) / 10,
      staminaRemaining: Math.round(h.staminaRemaining),
      blocked: h.blocked,
      outerPath: h.outerPath,
      lateralPosition: Math.round(h.lateralPosition * 10) / 10,
    })),
  };
}
