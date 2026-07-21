/**
 * 競争成績・投資成績の計算ユーティリティ
 * 再現性と期待値を重視した評価を行う
 */

import type { BaselineStats, ComparisonResult } from './baseline-calculator';
import type { ConfidenceResult } from './statistical-confidence';

export interface CompetitionPerformance {
  sample_size: number;
  win_rate: number;        // 勝率
  place_rate: number;      // 連対率（2着内率）
  show_rate: number;       // 三着内率
  avg_finish: number;      // 平均着順
}

export interface InvestmentPerformance {
  win_return_rate: number;     // 単勝回収率
  place_return_rate: number;   // 複勝回収率
  total_investment: number;    // 投資額
  total_return: number;        // 払い戻し額
  profit: number;              // 利益額
}

export interface PerformanceScore {
  total_score: number;         // 総合スコア (0-100)
  reliability_score: number;   // 再現性スコア
  profitability_score: number; // 収益性スコア
  statistical_confidence?: number; // 統計的信頼度 (0-100)
  evaluation: string;          // 評価コメント
}

/**
 * 標準分析結果（ベースライン比較と統計的信頼性を含む）
 */
export interface StandardAnalysisResult {
  schema_version: string;
  
  // 統計データ
  statistics?: {
    sample_size: number;
    confidence_level: number;
    is_significant: boolean;
    warnings?: string[];
  };
  
  // 競争成績
  competition_performance: CompetitionPerformance;
  
  // 投資成績
  investment_performance: InvestmentPerformance;
  
  // ベースライン比較
  baseline_comparison?: {
    baseline: BaselineStats;
    lift: {
      win_rate_lift: number;
      show_rate_lift: number;
      return_rate_lift: number;
      absolute_diff: number;
    };
    expected_value_diff: number;
    is_better: boolean;
    summary: string;
  };
  
  // 期待値評価
  performance_score: PerformanceScore;
  
  // サマリー
  summary: string;
  
  // ツール固有データ
  [key: string]: any;
}

/**
 * 競走馬データから競争成績を計算
 */
export function calculateCompetitionPerformance(
  races: Array<{ finish_position: string | number; field_size?: number }>
): CompetitionPerformance {
  const sampleSize = races.length;
  
  if (sampleSize === 0) {
    return {
      sample_size: 0,
      win_rate: 0,
      place_rate: 0,
      show_rate: 0,
      avg_finish: 0
    };
  }
  
  let wins = 0;
  let places = 0;
  let shows = 0;
  let totalFinish = 0;
  
  for (const race of races) {
    const finish = typeof race.finish_position === 'string' 
      ? parseInt(race.finish_position, 10) 
      : race.finish_position;
    
    if (isNaN(finish) || finish <= 0) continue;
    
    if (finish === 1) wins++;
    if (finish <= 2) places++;
    if (finish <= 3) shows++;
    totalFinish += finish;
  }
  
  return {
    sample_size: sampleSize,
    win_rate: wins / sampleSize,
    place_rate: places / sampleSize,
    show_rate: shows / sampleSize,
    avg_finish: totalFinish / sampleSize
  };
}

/**
 * 投資成績を計算（実際のオッズデータを使用）
 */
export function calculateInvestmentPerformance(
  races: Array<{ 
    finish_position: string | number;
    win_odds?: string | number;       // 単勝オッズ
    place_odds_low?: string | number; // 複勝オッズ下限
    place_odds_high?: string | number; // 複勝オッズ上限
    place_odds?: string | number;     // 複勝オッズ（単一値の場合）
    popularity?: string | number;     // 人気（オッズがない場合の予備）
  }>
): InvestmentPerformance {
  const sampleSize = races.length;
  const totalInvestment = sampleSize * 100; // 1レース100円と仮定
  
  let winReturn = 0;
  let placeReturn = 0;
  
  for (const race of races) {
    const finish = typeof race.finish_position === 'string' 
      ? parseInt(race.finish_position, 10) 
      : race.finish_position;
    
    if (isNaN(finish) || finish <= 0) continue;
    
    // 単勝（1着のみ）
    if (finish === 1) {
      const winOdds = parseFloat(String(race.win_odds || '0'));
      if (winOdds > 0) {
        winReturn += winOdds * 100;
      } else {
        // オッズデータがない場合は人気から推定
        const popularity = parseFloat(String(race.popularity || '5'));
        winReturn += popularity * 2 * 100;
      }
    }
    
    // 複勝（3着以内）
    if (finish <= 3) {
      // 複勝オッズの優先順位: place_odds > place_odds_low > win_odds * 0.2
      let placeOdds = 0;
      if (race.place_odds) {
        placeOdds = parseFloat(String(race.place_odds));
      } else if (race.place_odds_low) {
        placeOdds = parseFloat(String(race.place_odds_low));
      } else if (race.win_odds) {
        placeOdds = parseFloat(String(race.win_odds)) * 0.2;
      } else {
        const popularity = parseFloat(String(race.popularity || '5'));
        placeOdds = popularity * 0.4;
      }
      
      if (placeOdds > 0) {
        placeReturn += placeOdds * 100;
      }
    }
  }
  
  const winReturnRate = totalInvestment > 0 ? (winReturn / totalInvestment) * 100 : 0;
  const placeReturnRate = totalInvestment > 0 ? (placeReturn / totalInvestment) * 100 : 0;
  
  return {
    win_return_rate: winReturnRate,
    place_return_rate: placeReturnRate,
    total_investment: totalInvestment,
    total_return: winReturn + placeReturn,
    profit: (winReturn + placeReturn) - (totalInvestment * 2) // 単複両方買い
  };
}

/**
 * 再現性と期待値を評価
 * 
 * 評価基準:
 * - サンプル数が多い
 * - 好走率（三着内率）が一定以上
 * - 回収率がプラス
 * - 一撃依存ではない（安定性）
 */
export function evaluatePerformance(
  competition: CompetitionPerformance,
  investment: InvestmentPerformance
): PerformanceScore {
  // 1. 再現性スコア (0-50)
  let reliabilityScore = 0;
  
  // サンプル数評価 (0-20)
  if (competition.sample_size >= 100) reliabilityScore += 20;
  else if (competition.sample_size >= 50) reliabilityScore += 15;
  else if (competition.sample_size >= 30) reliabilityScore += 10;
  else if (competition.sample_size >= 10) reliabilityScore += 5;
  
  // 好走率評価 (0-30)
  if (competition.show_rate >= 0.40) reliabilityScore += 30;
  else if (competition.show_rate >= 0.33) reliabilityScore += 25;
  else if (competition.show_rate >= 0.25) reliabilityScore += 20;
  else if (competition.show_rate >= 0.15) reliabilityScore += 10;
  else if (competition.show_rate >= 0.10) reliabilityScore += 5;
  
  // 2. 収益性スコア (0-50)
  let profitabilityScore = 0;
  
  // 回収率評価 (0-35)
  const avgReturnRate = (investment.win_return_rate + investment.place_return_rate) / 2;
  if (avgReturnRate >= 120) profitabilityScore += 35;
  else if (avgReturnRate >= 100) profitabilityScore += 30;
  else if (avgReturnRate >= 90) profitabilityScore += 20;
  else if (avgReturnRate >= 80) profitabilityScore += 10;
  
  // 安定性評価 (0-15): 回収率が高すぎる場合は一撃依存の可能性
  const stability = competition.show_rate * 100 / Math.max(avgReturnRate, 1);
  if (stability >= 0.3 && stability <= 0.8) profitabilityScore += 15; // バランス良好
  else if (stability >= 0.2 && stability <= 1.0) profitabilityScore += 10;
  else if (stability >= 0.1) profitabilityScore += 5;
  
  // 一撃依存ペナルティ
  // 例: サンプル100、三着内率5%、単勝回収率180% → 低評価
  if (competition.sample_size >= 50 && competition.show_rate < 0.10 && avgReturnRate > 150) {
    profitabilityScore = Math.max(0, profitabilityScore - 20);
    reliabilityScore = Math.max(0, reliabilityScore - 15);
  }
  
  const totalScore = reliabilityScore + profitabilityScore;
  
  // 評価コメント生成
  let evaluation = '';
  if (totalScore >= 80) {
    evaluation = '期待値高: 再現性・収益性ともに優秀';
  } else if (totalScore >= 60) {
    evaluation = '期待値あり: 実用的な条件';
  } else if (totalScore >= 40) {
    evaluation = '要検証: サンプル不足または収益性が低い';
  } else if (competition.sample_size < 30) {
    evaluation = '評価不能: サンプル数不足';
  } else if (competition.show_rate < 0.10 && avgReturnRate > 120) {
    evaluation = '一撃依存: 再現性に疑問';
  } else {
    evaluation = '期待値低: 投資対象外';
  }
  
  return {
    total_score: totalScore,
    reliability_score: reliabilityScore,
    profitability_score: profitabilityScore,
    evaluation
  };
}

/**
 * 成績サマリーを生成
 */
export function generatePerformanceSummary(
  competition: CompetitionPerformance,
  investment: InvestmentPerformance,
  score: PerformanceScore
): string {
  return `【成績】${competition.sample_size}戦: 勝率${(competition.win_rate * 100).toFixed(1)}%、三着内率${(competition.show_rate * 100).toFixed(1)}%、平均${competition.avg_finish.toFixed(1)}着。` +
    `【回収率】単勝${investment.win_return_rate.toFixed(0)}%、複勝${investment.place_return_rate.toFixed(0)}%。` +
    `【評価】${score.evaluation}（スコア${score.total_score}/100）`;
}
