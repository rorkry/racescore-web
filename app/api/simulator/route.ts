import { NextRequest, NextResponse } from 'next/server';
import { getDbAsync } from '@/lib/db';
import { auth } from '@/lib/auth';
import { runRaceSimulation } from '@/lib/race-simulator/simulation-orchestrator';
import { generateTimeline } from '@/lib/race-simulator/timeline-generator';
import { getCourseInfo } from '@/lib/race-simulator/course-database';
import type { TrackBias } from '@/types/race-simulator';

/**
 * POST /api/simulator
 * レースシミュレーションを実行し、3D可視化用のタイムラインを返す
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { year, date, place, raceNumber, trackBias } = body;

    if (!year || !date || !place || !raceNumber) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const db = await getDbAsync();

    // ========================================
    // 1. シミュレーション実行
    // ========================================
    console.log(`[API] シミュレーション開始: ${year}${date} ${place} ${raceNumber}R`);

    const result = await runRaceSimulation(db, {
      year,
      date,
      place,
      raceNumber,
      trackBias: trackBias as TrackBias | undefined,
      enableDetailedLog: true,
    });

    // ========================================
    // 2. コース情報取得
    // ========================================
    const wakujunQuery = `
      SELECT distance, track_type
      FROM wakujun
      WHERE year = $1 AND date = $2 AND place = $3 AND race_number = $4
      LIMIT 1
    `;

    const raceInfo = await db.prepare(wakujunQuery).get(year, date, place, raceNumber) as {
      distance: string;
      track_type: string;
    } | undefined;

    if (!raceInfo) {
      return NextResponse.json({ error: 'Race not found' }, { status: 404 });
    }

    const distanceMatch = raceInfo.distance.match(/(\d+)/);
    const distance = distanceMatch ? parseInt(distanceMatch[1], 10) : 1600;
    const trackType = raceInfo.track_type;

    const courseInfo = getCourseInfo(place, distance, trackType as 'turf' | 'dirt');

    // ========================================
    // 3. タイムライン生成
    // ========================================
    console.log('[API] タイムライン生成中...');

    const timeline = generateTimeline(result);

    console.log(`[API] タイムライン生成完了: ${timeline.keyframes.length}フレーム`);

    // ========================================
    // 4. レスポンス
    // ========================================
    return NextResponse.json({
      success: true,
      raceKey: result.raceKey,
      courseName: `${place} ${distance}m ${trackType}`,
      distance,
      finalStandings: result.finalStandings.slice(0, 10).map(h => ({
        position: h.position,
        horseNumber: h.horseNumber,
        horseName: h.horseName,
        waku: h.waku,
      })),
      timeline: {
        raceKey: timeline.raceKey,
        totalDuration: timeline.totalDuration,
        courseDistance: timeline.courseDistance,
        keyframes: timeline.keyframes.map(f => ({
          time: parseFloat(f.time.toFixed(2)),
          phase: f.phase,
          horses: f.horses.map(h => ({
            horseNumber: h.horseNumber,
            horseName: h.horseName,
            currentDistance: parseFloat(h.currentDistance.toFixed(1)),
            currentVelocity: parseFloat(h.currentVelocity.toFixed(1)),
            acceleration: parseFloat(h.acceleration.toFixed(2)),
            lateralPosition: parseFloat(h.lateralPosition.toFixed(2)),
            position: h.position,
            distanceFromLeader: parseFloat(h.distanceFromLeader.toFixed(1)),
            staminaRemaining: parseFloat(h.staminaRemaining.toFixed(1)),
            blocked: h.blocked,
            outerPath: h.outerPath,
          })),
        })),
      },
      phaseEvents: {
        start: result.phases.start.events,
        formation: result.phases.formation.events,
        straight: result.phases.straight.events,
      },
      // Phase 4.2プロトタイプ用
      simulation: result,
      courseInfo: courseInfo,
    });
  } catch (error) {
    console.error('[API] シミュレーションエラー:', error);
    return NextResponse.json(
      {
        error: 'Simulation failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
