import { NextRequest, NextResponse } from 'next/server';
import { getDbAsync } from '@/lib/db';
import { auth } from '@/lib/auth';
import type { TrackBias } from '@/types/race-simulator';
import { buildSimulatorResponse, mapSimulatorError } from './handler';

/**
 * POST /api/simulator
 * レースシミュレーションを実行し、3D可視化用のタイムラインを返す。
 *
 * コース解決は buildSimulatorResponse 内で resolveCourseLayout を 1 回だけ実行し、
 * 同じ ResolvedCourse を orchestrator と API レスポンス（courseInfo）で共有する。
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
    // レース情報取得（距離・馬場の生値）
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
    if (!distanceMatch) {
      console.error('[API] レース距離の解析失敗:', raceInfo.distance);
      return NextResponse.json(
        { error: `Invalid distance format: ${raceInfo.distance}` },
        { status: 400 }
      );
    }
    const distance = parseInt(distanceMatch[1], 10);
    const rawTrackType = raceInfo.track_type;

    console.log(`[API] シミュレーション開始: ${year}${date} ${place} ${raceNumber}R ${distance}m`);

    // ========================================
    // コース解決 → シミュレーション → タイムライン → レスポンス
    // （resolveCourseLayout は buildSimulatorResponse 内で 1 回だけ）
    // ========================================
    const payload = await buildSimulatorResponse(db, {
      year,
      date,
      place,
      raceNumber,
      distance,
      rawTrackType,
      trackBias: trackBias as TrackBias | undefined,
    });

    return NextResponse.json(payload);
  } catch (error) {
    // CourseInputError → 400 / CourseBoundariesError → 422 / その他 → 500
    console.error('[API] シミュレーションエラー:', error);
    const { status, body } = mapSimulatorError(error);
    return NextResponse.json(body, { status });
  }
}
