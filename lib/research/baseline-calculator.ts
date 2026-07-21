/**
 * ベースライン統計計算
 * 全体統計と条件統計を比較するための基準値
 */

import { getDb } from '@/lib/db';

export interface BaselineStats {
  sample_size: number;
  win_rate: number;
  place_rate: number;
  show_rate: number;
  avg_finish: number;
  win_return_rate: number;
  place_return_rate: number;
}

export interface ComparisonResult {
  baseline: BaselineStats;
  condition: BaselineStats;
  lift: {
    win_rate_lift: number;        // 改善率（%）
    show_rate_lift: number;
    return_rate_lift: number;      // 回収率改善率
    absolute_diff: number;         // 絶対差（回収率）
  };
  expected_value_diff: number;     // 100円あたりの期待値差
  is_better: boolean;              // ベースラインより良いか
}

/**
 * ベースライン統計を取得（キャッシュから or 計算）
 */
export async function getBaselineStats(
  surface: '芝' | 'ダート',
  distanceMin?: number,
  distanceMax?: number
): Promise<BaselineStats> {
  const db = getDb();
  
  // クエリ構築
  let query = `
    SELECT 
      COUNT(*) as sample_size,
      AVG(CASE WHEN finish_position = '1' THEN 1.0 ELSE 0.0 END) as win_rate,
      AVG(CASE WHEN finish_position <= '2' THEN 1.0 ELSE 0.0 END) as place_rate,
      AVG(CASE WHEN finish_position <= '3' THEN 1.0 ELSE 0.0 END) as show_rate,
      AVG(CAST(finish_position AS FLOAT)) as avg_finish,
      SUM(CASE 
        WHEN finish_position = '1' AND win_odds IS NOT NULL 
        THEN CAST(win_odds AS FLOAT) * 100 
        ELSE 0 
      END) / (COUNT(*) * 100.0) * 100 as win_return_rate,
      SUM(CASE 
        WHEN finish_position <= '3' AND place_odds_low IS NOT NULL 
        THEN CAST(place_odds_low AS FLOAT) * 100 
        ELSE 0 
      END) / (COUNT(*) * 100.0) * 100 as place_return_rate
    FROM umadata
    WHERE distance LIKE $1
  `;
  
  const params: any[] = [`${surface}%`];
  
  // 距離範囲指定
  if (distanceMin && distanceMax) {
    query += ` AND CAST(SUBSTRING(distance FROM '\\d+') AS INTEGER) BETWEEN $2 AND $3`;
    params.push(distanceMin, distanceMax);
  }
  
  const result = await db.prepare(query).get<any>(...params);
  
  if (!result || result.sample_size === 0) {
    // デフォルト値（全体平均）
    return {
      sample_size: 0,
      win_rate: 0.1,
      place_rate: 0.2,
      show_rate: 0.3,
      avg_finish: 6.0,
      win_return_rate: 80.0,
      place_return_rate: 85.0
    };
  }
  
  return {
    sample_size: result.sample_size || 0,
    win_rate: result.win_rate || 0,
    place_rate: result.place_rate || 0,
    show_rate: result.show_rate || 0,
    avg_finish: result.avg_finish || 6.0,
    win_return_rate: result.win_return_rate || 80.0,
    place_return_rate: result.place_return_rate || 85.0
  };
}

/**
 * 条件とベースラインを比較
 */
export function compareToBaseline(
  condition: BaselineStats,
  baseline: BaselineStats
): ComparisonResult {
  // リフト率計算（%表示）
  const winRateLift = baseline.win_rate > 0 
    ? ((condition.win_rate - baseline.win_rate) / baseline.win_rate) * 100 
    : 0;
  
  const showRateLift = baseline.show_rate > 0
    ? ((condition.show_rate - baseline.show_rate) / baseline.show_rate) * 100
    : 0;
  
  const returnRateLift = baseline.place_return_rate > 0
    ? ((condition.place_return_rate - baseline.place_return_rate) / baseline.place_return_rate) * 100
    : 0;
  
  // 絶対差（回収率）
  const absoluteDiff = condition.place_return_rate - baseline.place_return_rate;
  
  // 期待値差（100円購入あたり）
  const expectedValueDiff = absoluteDiff; // 100円あたりの差額
  
  // ベースラインより良いか
  const isBetter = 
    condition.show_rate >= baseline.show_rate * 0.8 && // 出走率が極端に低くない
    condition.place_return_rate > baseline.place_return_rate; // 回収率が上
  
  return {
    baseline,
    condition,
    lift: {
      win_rate_lift: winRateLift,
      show_rate_lift: showRateLift,
      return_rate_lift: returnRateLift,
      absolute_diff: absoluteDiff
    },
    expected_value_diff: expectedValueDiff,
    is_better: isBetter
  };
}

/**
 * 比較結果を文章化
 */
export function formatComparisonSummary(comparison: ComparisonResult): string {
  const { lift, expected_value_diff, is_better } = comparison;
  
  if (!is_better) {
    return `ベースラインと比べて優位性なし（回収率${lift.return_rate_lift >= 0 ? '+' : ''}${lift.return_rate_lift.toFixed(1)}%）`;
  }
  
  const parts: string[] = [];
  
  // 回収率改善
  if (Math.abs(lift.return_rate_lift) > 5) {
    parts.push(`回収率${lift.return_rate_lift >= 0 ? '+' : ''}${lift.return_rate_lift.toFixed(1)}%`);
  }
  
  // 期待値差
  if (Math.abs(expected_value_diff) > 5) {
    parts.push(`期待値${expected_value_diff >= 0 ? '+' : ''}${expected_value_diff.toFixed(1)}円/100円`);
  }
  
  // 勝率改善
  if (Math.abs(lift.win_rate_lift) > 20) {
    parts.push(`勝率${lift.win_rate_lift >= 0 ? '+' : ''}${lift.win_rate_lift.toFixed(0)}%UP`);
  }
  
  if (parts.length === 0) {
    return 'ベースライン並み';
  }
  
  return `✅ 全体より${parts.join('、')}の改善`;
}
