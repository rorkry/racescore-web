/**
 * 種牡馬（父）産駒の芝・ダ・距離帯別成績 → 適性診断用
 * GET ?horseName=xxx  または  GET ?sire=種牡馬名（馬名検索をスキップ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const BAND_LABELS: Record<string, string> = {
  dirt_sprint: '短距離ダート（～1200m）',
  dirt_mile: 'ダート（1201〜1800m）',
  dirt_middle: 'ダート中距離（1801〜2200m）',
  dirt_long: 'ダート長距離（2201m～）',
  turf_sprint: '芝短・マイル前（～1600m）',
  turf_mile: '芝中距離（1601〜2000m）',
  turf_long: '芝長距離（2001m～）',
};

type BandRow = {
  bandId: string;
  label: string;
  runs: number;
  wins: number;
  top3: number;
  winRate: number;
  showRate: number;
  badge: '◎' | '○' | '△' | null;
  note: string | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const horseNameRaw = searchParams.get('horseName')?.trim();
    const sireParam = searchParams.get('sire')?.trim();
    const minRuns = Math.max(5, parseInt(searchParams.get('minRuns') || '20', 10) || 20);

    const db = getDb();

    let sire: string | null = sireParam || null;

    if (!sire && horseNameRaw) {
      const row = await db
        .prepare(
          `SELECT sire FROM umadata
           WHERE TRIM(horse_name) = $1
             AND sire IS NOT NULL AND TRIM(sire) != ''
           ORDER BY id DESC LIMIT 1`
        )
        .get(horseNameRaw);
      sire = (row as { sire?: string } | undefined)?.sire?.trim() || null;
    }

    if (!sire) {
      return NextResponse.json({
        success: false,
        error: 'sire_not_found',
        message:
          '父名（種牡馬）がデータベースから取得できませんでした。umadata に馬名・種牡馬列が入っているか確認してください。',
      });
    }

    // 全体（同一種牡馬の全出走）
    const overall = await db
      .prepare(
        `SELECT
           COUNT(*)::int AS total_runs,
           SUM(CASE WHEN finish_position IN ('1','１') THEN 1 ELSE 0 END)::int AS wins,
           SUM(CASE WHEN finish_position IN ('1','２','３','1','2','3') THEN 1 ELSE 0 END)::int AS top3
         FROM umadata
         WHERE TRIM(sire) = $1
           AND finish_position IS NOT NULL AND finish_position != ''
           AND distance ~ '^[芝ダ]'
           AND CAST(SUBSTRING(distance FROM '[0-9]+') AS INTEGER) > 0`
      )
      .get(sire);

    const o = overall as { total_runs?: number; wins?: number; top3?: number } | undefined;
    const totalRuns = o?.total_runs ?? 0;
    const winsAll = o?.wins ?? 0;
    const top3All = o?.top3 ?? 0;
    const winRateAll = totalRuns > 0 ? (winsAll / totalRuns) * 100 : 0;
    const showRateAll = totalRuns > 0 ? (top3All / totalRuns) * 100 : 0;

    // 距離帯別
    const bandQuery = `
      WITH base AS (
        SELECT
          CAST(SUBSTRING(distance FROM '[0-9]+') AS INTEGER) AS dist_m,
          distance,
          finish_position
        FROM umadata
        WHERE TRIM(sire) = $1
          AND finish_position IS NOT NULL AND finish_position != ''
          AND distance ~ '^[芝ダ]'
      ),
      banded AS (
        SELECT
          finish_position,
          CASE
            WHEN distance LIKE 'ダ%' AND dist_m <= 1200 THEN 'dirt_sprint'
            WHEN distance LIKE 'ダ%' AND dist_m BETWEEN 1201 AND 1800 THEN 'dirt_mile'
            WHEN distance LIKE 'ダ%' AND dist_m BETWEEN 1801 AND 2200 THEN 'dirt_middle'
            WHEN distance LIKE 'ダ%' AND dist_m >= 2201 THEN 'dirt_long'
            WHEN distance LIKE '芝%' AND dist_m <= 1600 THEN 'turf_sprint'
            WHEN distance LIKE '芝%' AND dist_m BETWEEN 1601 AND 2000 THEN 'turf_mile'
            WHEN distance LIKE '芝%' AND dist_m >= 2001 THEN 'turf_long'
            ELSE NULL
          END AS band_id
        FROM base
        WHERE dist_m IS NOT NULL AND dist_m > 0
      )
      SELECT
        band_id,
        COUNT(*)::int AS total_runs,
        SUM(CASE WHEN finish_position IN ('1','１') THEN 1 ELSE 0 END)::int AS wins,
        SUM(CASE WHEN finish_position IN ('1','２','３','1','2','3') THEN 1 ELSE 0 END)::int AS top3
      FROM banded
      WHERE band_id IS NOT NULL
      GROUP BY band_id
      ORDER BY band_id
    `;

    const bandRows = (await db.prepare(bandQuery).all(sire)) as Array<{
      band_id: string;
      total_runs: number;
      wins: number;
      top3: number;
    }>;

    const bands: BandRow[] = [];
    const diagnoses: string[] = [];

    const bandOrder = [
      'dirt_sprint',
      'dirt_mile',
      'dirt_middle',
      'dirt_long',
      'turf_sprint',
      'turf_mile',
      'turf_long',
    ];

    for (const id of bandOrder) {
      const row = bandRows.find((r) => r.band_id === id);
      const runs = row?.total_runs || 0;
      const wins = row?.wins || 0;
      const top3 = row?.top3 || 0;
      const winRate = runs > 0 ? (wins / runs) * 100 : 0;
      const showRate = runs > 0 ? (top3 / runs) * 100 : 0;

      const dWin = winRate - winRateAll;
      const dShow = showRate - showRateAll;

      let badge: BandRow['badge'] = null;
      let note: string | null = null;

      if (runs >= minRuns) {
        if (dWin >= 5 || (dWin >= 3 && runs >= minRuns * 2)) {
          badge = '◎';
          note = `勝率が全体平均より +${round1(dWin)}pt（${runs}戦サンプル）`;
          diagnoses.push(
            `${BAND_LABELS[id]}は産駒の勝率が全体平均を大きく上回る傾向があります（${round1(winRate)}%、n=${runs}）。`
          );
        } else if (dWin >= 2.5 || (dWin >= 1.5 && dShow >= 3 && runs >= minRuns)) {
          badge = '○';
          note = `勝率 +${round1(dWin)}pt / 複勝率 +${round1(dShow)}pt（${runs}戦）`;
          diagnoses.push(
            `${BAND_LABELS[id]}で好走しやすい産駒が多い可能性があります（勝率 ${round1(winRate)}%、n=${runs}）。`
          );
        } else if (dWin >= 1 && runs >= minRuns * 1.5) {
          badge = '△';
          note = `やや平均以上（+${round1(dWin)}pt）`;
        }
      }

      bands.push({
        bandId: id,
        label: BAND_LABELS[id] || id,
        runs,
        wins,
        top3,
        winRate: round1(winRate),
        showRate: round1(showRate),
        badge,
        note,
      });
    }

    return NextResponse.json({
      success: true,
      horseName: horseNameRaw || null,
      sire,
      minRuns,
      overall: {
        runs: totalRuns,
        wins: winsAll,
        winRate: round1(winRateAll),
        showRate: round1(showRateAll),
      },
      bands,
      diagnoses: diagnoses.slice(0, 6),
    });
  } catch (error) {
    console.error('[sire-aptitude] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal_error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
