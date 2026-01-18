/**
 * 種牡馬分析API
 * 
 * 競馬場、芝/ダート、距離で絞り込み、種牡馬ごとの成績を集計
 * - 勝率、連対率、複勝率
 * - 単勝回収率、複勝回収率
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface SireStats {
  sire: string;           // 種牡馬名
  totalRuns: number;      // 出走回数
  wins: number;           // 1着数
  seconds: number;        // 2着数
  thirds: number;         // 3着数
  winRate: number;        // 勝率 (%)
  placeRate: number;      // 連対率 (%)
  showRate: number;       // 複勝率 (%)
  winReturn: number;      // 単勝回収率 (%)
  placeReturn: number;    // 複勝回収率 (%)
  avgOdds?: number;       // 平均人気
}

interface QueryParams {
  place?: string;         // 競馬場（中山、東京など）
  surface?: '芝' | 'ダ' | 'all';  // 芝/ダート/全て
  distanceMin?: number;   // 距離下限
  distanceMax?: number;   // 距離上限
  limit?: number;         // 取得件数上限
  minRuns?: number;       // 最低出走回数（少ないデータを除外）
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    const params: QueryParams = {
      place: searchParams.get('place') || undefined,
      surface: (searchParams.get('surface') as '芝' | 'ダ' | 'all') || 'all',
      distanceMin: searchParams.get('distanceMin') ? parseInt(searchParams.get('distanceMin')!, 10) : undefined,
      distanceMax: searchParams.get('distanceMax') ? parseInt(searchParams.get('distanceMax')!, 10) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50,
      minRuns: searchParams.get('minRuns') ? parseInt(searchParams.get('minRuns')!, 10) : 10,
    };

    const db = getDb();

    // クエリを構築
    let whereConditions: string[] = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    // 種牡馬が存在するデータのみ
    whereConditions.push('sire IS NOT NULL');
    whereConditions.push("sire != ''");

    // 着順が有効なデータのみ（競走除外等を除外）
    whereConditions.push("finish_position IS NOT NULL");
    whereConditions.push("finish_position != ''");

    // 競馬場フィルター
    if (params.place) {
      whereConditions.push(`place LIKE $${paramIndex}`);
      queryParams.push(`%${params.place}%`);
      paramIndex++;
    }

    // 芝/ダートフィルター
    if (params.surface && params.surface !== 'all') {
      whereConditions.push(`distance LIKE $${paramIndex}`);
      queryParams.push(`${params.surface}%`);
      paramIndex++;
    }

    // 距離フィルター（"芝1600" から数値部分を抽出して比較）
    // PostgreSQLでは SUBSTRING + CAST を使用
    if (params.distanceMin) {
      whereConditions.push(`CAST(SUBSTRING(distance FROM '[0-9]+') AS INTEGER) >= $${paramIndex}`);
      queryParams.push(params.distanceMin);
      paramIndex++;
    }
    if (params.distanceMax) {
      whereConditions.push(`CAST(SUBSTRING(distance FROM '[0-9]+') AS INTEGER) <= $${paramIndex}`);
      queryParams.push(params.distanceMax);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // 種牡馬ごとの成績を集計するクエリ
    const query = `
      SELECT 
        sire,
        COUNT(*) as total_runs,
        SUM(CASE WHEN finish_position = '１' OR finish_position = '1' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN finish_position IN ('１', '２', '1', '2') THEN 1 ELSE 0 END) as top2,
        SUM(CASE WHEN finish_position IN ('１', '２', '３', '1', '2', '3') THEN 1 ELSE 0 END) as top3,
        AVG(CASE 
          WHEN popularity ~ '^[0-9]+$' THEN CAST(popularity AS INTEGER) 
          ELSE NULL 
        END) as avg_popularity
      FROM umadata
      ${whereClause}
      GROUP BY sire
      HAVING COUNT(*) >= $${paramIndex}
      ORDER BY COUNT(*) DESC
      LIMIT $${paramIndex + 1}
    `;

    queryParams.push(params.minRuns || 10);
    queryParams.push(params.limit || 50);

    const results = await db.prepare(query).all(...queryParams) as any[];

    // 統計値を計算
    const sireStats: SireStats[] = results.map(row => {
      const totalRuns = parseInt(row.total_runs, 10) || 0;
      const wins = parseInt(row.wins, 10) || 0;
      const top2 = parseInt(row.top2, 10) || 0;
      const top3 = parseInt(row.top3, 10) || 0;

      // 回収率を計算するには配当データが必要だが、
      // umadataテーブルに配当データがない場合は概算で計算
      // 勝率ベースの概算回収率：勝率 × 平均配当倍率（約10倍と仮定）
      const winRate = totalRuns > 0 ? (wins / totalRuns) * 100 : 0;
      const placeRate = totalRuns > 0 ? (top2 / totalRuns) * 100 : 0;
      const showRate = totalRuns > 0 ? (top3 / totalRuns) * 100 : 0;

      // 概算回収率（実際の配当データがあれば置き換え）
      // 単勝：勝率 × 想定オッズ（人気順から推測）
      // 複勝：複勝率 × 想定複勝オッズ
      const avgPop = parseFloat(row.avg_popularity) || 8;
      const estimatedWinOdds = Math.max(1.5, avgPop * 1.5); // 人気順から概算オッズ
      const estimatedPlaceOdds = Math.max(1.1, avgPop * 0.4); // 複勝オッズは低め

      const winReturn = winRate * estimatedWinOdds;
      const placeReturn = showRate * estimatedPlaceOdds;

      return {
        sire: row.sire || '不明',
        totalRuns,
        wins,
        seconds: top2 - wins,
        thirds: top3 - top2,
        winRate: Math.round(winRate * 10) / 10,
        placeRate: Math.round(placeRate * 10) / 10,
        showRate: Math.round(showRate * 10) / 10,
        winReturn: Math.round(winReturn * 10) / 10,
        placeReturn: Math.round(placeReturn * 10) / 10,
        avgOdds: Math.round(avgPop * 10) / 10,
      };
    });

    // フィルター条件のサマリー
    const filterSummary = {
      place: params.place || '全場',
      surface: params.surface === 'all' ? '芝・ダート' : params.surface === '芝' ? '芝' : 'ダート',
      distance: params.distanceMin || params.distanceMax 
        ? `${params.distanceMin || 0}m〜${params.distanceMax || '∞'}m`
        : '全距離',
      minRuns: params.minRuns || 10,
    };

    return NextResponse.json({
      success: true,
      filter: filterSummary,
      count: sireStats.length,
      data: sireStats,
    });
  } catch (error) {
    console.error('[sire-analysis] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
