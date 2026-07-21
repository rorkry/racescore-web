/**
 * 汎用分析API
 * 任意の条件でDBを検索し、統計を返す
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbAsync } from '@/lib/db';
import type { RuleCondition } from '@/types/rule';

interface GenericAnalysisRequest {
  conditions: RuleCondition[];
}

export async function POST(req: NextRequest) {
  try {
    const body: GenericAnalysisRequest = await req.json();
    const { conditions } = body;

    if (!conditions || conditions.length === 0) {
      return NextResponse.json(
        { error: '条件が指定されていません' },
        { status: 400 }
      );
    }

    const db = await getDbAsync();

    // 条件からWHERE句を構築
    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const condition of conditions) {
      const { field, operator, value } = condition;

      switch (operator) {
        case 'eq':
          whereClauses.push(`${field} = $${paramIndex}`);
          params.push(value);
          paramIndex++;
          break;

        case 'gte':
          whereClauses.push(`${field} >= $${paramIndex}`);
          params.push(value);
          paramIndex++;
          break;

        case 'lte':
          whereClauses.push(`${field} <= $${paramIndex}`);
          params.push(value);
          paramIndex++;
          break;

        case 'in':
          if (Array.isArray(value)) {
            const placeholders = value.map((_, i) => `$${paramIndex + i}`).join(', ');
            whereClauses.push(`${field} IN (${placeholders})`);
            params.push(...value);
            paramIndex += value.length;
          }
          break;

        case 'between':
          if (Array.isArray(value) && value.length === 2) {
            whereClauses.push(`${field} BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
            params.push(value[0], value[1]);
            paramIndex += 2;
          }
          break;

        case 'contains':
          whereClauses.push(`${field} ILIKE $${paramIndex}`);
          params.push(`%${value}%`);
          paramIndex++;
          break;

        default:
          console.warn(`Unknown operator: ${operator}`);
      }
    }

    const whereClause = whereClauses.length > 0 
      ? `WHERE ${whereClauses.join(' AND ')}`
      : '';

    // 統計クエリ
    const statsQuery = `
      SELECT 
        COUNT(*) as sample_size,
        AVG(CASE WHEN 着順 = 1 THEN 1.0 ELSE 0.0 END) as win_rate,
        AVG(CASE WHEN 着順 <= 2 THEN 1.0 ELSE 0.0 END) as place_rate,
        AVG(CASE WHEN 着順 <= 3 THEN 1.0 ELSE 0.0 END) as show_rate,
        AVG(着順) as avg_finish,
        AVG(単勝) as avg_win_odds,
        AVG(複勝) as avg_place_odds_low
      FROM umadata
      ${whereClause}
    `;

    console.log('Generic Analysis Query:', statsQuery);
    console.log('Params:', params);

    const result = await db.query(statsQuery, params);
    const stats = result.rows[0];

    const sample_size = parseInt(stats.sample_size, 10);

    if (sample_size === 0) {
      return NextResponse.json({
        competition_performance: {
          sample_size: 0,
          win_rate: 0,
          place_rate: 0,
          show_rate: 0,
          avg_finish: 0
        },
        investment_performance: {
          win_return_rate: 0,
          place_return_rate: 0,
          total_investment: 0,
          total_return: 0,
          profit: 0
        },
        baseline_comparison: {
          expected_value_diff: 0
        },
        statistics: {
          confidence_level: 0,
          is_significant: false,
          warnings: ['サンプル数が0件です']
        }
      });
    }

    const win_rate = parseFloat(stats.win_rate) || 0;
    const place_rate = parseFloat(stats.place_rate) || 0;
    const show_rate = parseFloat(stats.show_rate) || 0;
    const avg_finish = parseFloat(stats.avg_finish) || 0;
    const avg_win_odds = parseFloat(stats.avg_win_odds) || 0;
    const avg_place_odds_low = parseFloat(stats.avg_place_odds_low) || 0;

    // 回収率計算
    const win_return_rate = avg_win_odds > 0 ? (win_rate * avg_win_odds * 10) : 0;
    const place_return_rate = avg_place_odds_low > 0 ? (show_rate * avg_place_odds_low * 10) : 0;

    // 投資パフォーマンス
    const total_investment = sample_size * 100; // 全レース100円ずつ
    const total_return_win = total_investment * (win_return_rate / 100);
    const total_return_place = total_investment * (place_return_rate / 100);
    const profit_place = total_return_place - total_investment;

    // 期待値（複勝ベース）
    const expected_value_diff = profit_place / sample_size;

    // 信頼度計算
    let confidence_level = 0;
    if (sample_size >= 100) {
      confidence_level = 95;
    } else if (sample_size >= 50) {
      confidence_level = 80;
    } else if (sample_size >= 30) {
      confidence_level = 65;
    } else {
      confidence_level = 40;
    }

    const warnings: string[] = [];
    if (sample_size < 30) {
      warnings.push('サンプル数が少ない（30件未満）');
    }
    if (show_rate < 0.1) {
      warnings.push('三着内率が低い（10%未満）');
    }

    return NextResponse.json({
      competition_performance: {
        sample_size,
        win_rate,
        place_rate,
        show_rate,
        avg_finish
      },
      investment_performance: {
        win_return_rate,
        place_return_rate,
        total_investment,
        total_return: total_return_place,
        profit: profit_place
      },
      baseline_comparison: {
        expected_value_diff
      },
      statistics: {
        confidence_level,
        is_significant: sample_size >= 30,
        warnings
      }
    });

  } catch (error) {
    console.error('Generic analysis error:', error);
    return NextResponse.json(
      { 
        error: 'サーバーエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
