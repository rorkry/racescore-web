/**
 * 有望条件の判定ロジック
 * 統計的有意性と偶然性を排除して有望条件を判定する
 */

export interface ConditionStatistics {
  sample_size: number;
  win_rate: number;
  place_rate: number;
  show_rate: number;
  win_return_rate: number;
  place_return_rate: number;
  expected_value_diff: number;
  avg_finish?: number;
  total_investment?: number;
  total_return?: number;
  profit?: number;
}

export interface ConfidenceMetrics {
  confidence_level: number;
  is_significant: boolean;
  p_value?: number;
}

export interface PromisingEvaluation {
  is_promising: boolean;
  score: number;
  reasons: string[];
  warnings: string[];
  recommendation: string;
}

/**
 * 有望条件の判定
 */
export function evaluatePromising(
  statistics: ConditionStatistics,
  confidence: ConfidenceMetrics,
  baseline?: ConditionStatistics
): PromisingEvaluation {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // 1. サンプル数チェック（最も重要）
  const sampleScore = evaluateSampleSize(statistics.sample_size);
  score += sampleScore.score;
  if (sampleScore.message) {
    if (sampleScore.isGood) {
      reasons.push(sampleScore.message);
    } else {
      warnings.push(sampleScore.message);
    }
  }

  // 2. 再現性チェック（三着内率）
  const reproducibilityScore = evaluateReproducibility(statistics.show_rate);
  score += reproducibilityScore.score;
  if (reproducibilityScore.message) {
    if (reproducibilityScore.isGood) {
      reasons.push(reproducibilityScore.message);
    } else {
      warnings.push(reproducibilityScore.message);
    }
  }

  // 3. 期待値チェック
  const expectedValueScore = evaluateExpectedValue(statistics.expected_value_diff);
  score += expectedValueScore.score;
  if (expectedValueScore.message) {
    if (expectedValueScore.isGood) {
      reasons.push(expectedValueScore.message);
    } else {
      warnings.push(expectedValueScore.message);
    }
  }

  // 4. 統計的信頼度チェック
  const confidenceScore = evaluateConfidence(confidence.confidence_level);
  score += confidenceScore.score;
  if (confidenceScore.message) {
    if (confidenceScore.isGood) {
      reasons.push(confidenceScore.message);
    } else {
      warnings.push(confidenceScore.message);
    }
  }

  // 5. 偶然性排除（一撃依存チェック）
  const luckyPunchCheck = detectLuckyPunch(statistics);
  if (luckyPunchCheck.is_lucky_punch) {
    score -= 30; // 大きくペナルティ
    warnings.push(luckyPunchCheck.reason);
  }

  // 6. ベースラインとの比較（あれば）
  if (baseline) {
    const baselineScore = evaluateVsBaseline(statistics, baseline);
    score += baselineScore.score;
    if (baselineScore.message) {
      if (baselineScore.isGood) {
        reasons.push(baselineScore.message);
      } else {
        warnings.push(baselineScore.message);
      }
    }
  }

  // 7. 総合判定
  const is_promising = score >= 60 && !luckyPunchCheck.is_lucky_punch;
  const recommendation = generateRecommendation(score, is_promising, warnings);

  return {
    is_promising,
    score: Math.max(0, Math.min(100, score)),
    reasons,
    warnings,
    recommendation
  };
}

/**
 * サンプル数の評価
 */
function evaluateSampleSize(sampleSize: number): { score: number; message?: string; isGood: boolean } {
  if (sampleSize >= 100) {
    return { score: 30, message: `サンプル数が十分（${sampleSize}走）`, isGood: true };
  } else if (sampleSize >= 50) {
    return { score: 20, message: `サンプル数が中程度（${sampleSize}走）`, isGood: true };
  } else if (sampleSize >= 30) {
    return { score: 10, message: `サンプル数が最低限（${sampleSize}走）`, isGood: false };
  } else {
    return { score: 0, message: `サンプル数が不足（${sampleSize}走、最低30走必要）`, isGood: false };
  }
}

/**
 * 再現性の評価（三着内率）
 */
function evaluateReproducibility(showRate: number): { score: number; message?: string; isGood: boolean } {
  if (showRate >= 0.4) {
    return { score: 25, message: `三着内率が高い（${(showRate * 100).toFixed(1)}%）`, isGood: true };
  } else if (showRate >= 0.25) {
    return { score: 15, message: `三着内率が中程度（${(showRate * 100).toFixed(1)}%）`, isGood: true };
  } else if (showRate >= 0.1) {
    return { score: 5, message: `三着内率が低い（${(showRate * 100).toFixed(1)}%）`, isGood: false };
  } else {
    return { score: 0, message: `三着内率が極端に低い（${(showRate * 100).toFixed(1)}%、偶然の可能性大）`, isGood: false };
  }
}

/**
 * 期待値の評価
 */
function evaluateExpectedValue(expectedValueDiff: number): { score: number; message?: string; isGood: boolean } {
  if (expectedValueDiff >= 50) {
    return { score: 25, message: `期待値が高い（+${expectedValueDiff.toFixed(0)}円）`, isGood: true };
  } else if (expectedValueDiff >= 20) {
    return { score: 15, message: `期待値がプラス（+${expectedValueDiff.toFixed(0)}円）`, isGood: true };
  } else if (expectedValueDiff >= 0) {
    return { score: 5, message: `期待値がわずかにプラス（+${expectedValueDiff.toFixed(0)}円）`, isGood: false };
  } else {
    return { score: 0, message: `期待値がマイナス（${expectedValueDiff.toFixed(0)}円）`, isGood: false };
  }
}

/**
 * 統計的信頼度の評価
 */
function evaluateConfidence(confidenceLevel: number): { score: number; message?: string; isGood: boolean } {
  if (confidenceLevel >= 80) {
    return { score: 20, message: `統計的信頼度が高い（${confidenceLevel.toFixed(0)}%）`, isGood: true };
  } else if (confidenceLevel >= 60) {
    return { score: 10, message: `統計的信頼度が中程度（${confidenceLevel.toFixed(0)}%）`, isGood: true };
  } else {
    return { score: 0, message: `統計的信頼度が低い（${confidenceLevel.toFixed(0)}%）`, isGood: false };
  }
}

/**
 * 一撃依存（ラッキーパンチ）の検出
 */
function detectLuckyPunch(statistics: ConditionStatistics): { is_lucky_punch: boolean; reason: string } {
  // パターン1: 三着内率が低いのに回収率が異常に高い
  if (statistics.show_rate < 0.1 && statistics.place_return_rate > 150) {
    return {
      is_lucky_punch: true,
      reason: '三着内率が低い（<10%）のに回収率が高すぎる（>150%）。一撃依存の可能性が高い'
    };
  }

  // パターン2: サンプル数が少ないのに期待値が異常に高い
  if (statistics.sample_size < 30 && statistics.expected_value_diff > 100) {
    return {
      is_lucky_punch: true,
      reason: 'サンプル数が少ない（<30走）のに期待値が高すぎる（>+100円）。偶然の可能性が高い'
    };
  }

  // パターン3: 勝率が極端に低いのに回収率が高い
  if (statistics.win_rate < 0.02 && statistics.win_return_rate > 200) {
    return {
      is_lucky_punch: true,
      reason: '勝率が極端に低い（<2%）のに単勝回収率が高い（>200%）。一発大穴依存の可能性'
    };
  }

  return { is_lucky_punch: false, reason: '' };
}

/**
 * ベースラインとの比較
 */
function evaluateVsBaseline(
  statistics: ConditionStatistics,
  baseline: ConditionStatistics
): { score: number; message?: string; isGood: boolean } {
  const winRateLift = (statistics.win_rate / baseline.win_rate - 1) * 100;
  const placeReturnLift = statistics.place_return_rate - baseline.place_return_rate;

  if (winRateLift > 50 && placeReturnLift > 20) {
    return {
      score: 10,
      message: `ベースラインより勝率+${winRateLift.toFixed(0)}%、回収率+${placeReturnLift.toFixed(0)}pt向上`,
      isGood: true
    };
  } else if (winRateLift > 20 || placeReturnLift > 10) {
    return {
      score: 5,
      message: `ベースラインより一定の改善あり`,
      isGood: true
    };
  } else {
    return {
      score: 0,
      message: `ベースラインと比較して改善が小さい`,
      isGood: false
    };
  }
}

/**
 * 推奨メッセージの生成
 */
function generateRecommendation(score: number, isPromising: boolean, warnings: string[]): string {
  if (score >= 80) {
    return '非常に有望な条件です。ルール候補として保存することを強く推奨します。';
  } else if (score >= 60) {
    return '有望な条件です。追加検証を行った上で、ルール候補として検討してください。';
  } else if (score >= 40) {
    return '一定の可能性がありますが、さらなる検証が必要です。条件を調整して再検証してください。';
  } else if (score >= 20) {
    return 'この条件は現状では不十分です。別の角度からの検証をおすすめします。';
  } else {
    return 'この条件は期待値が低いか、統計的信頼性に欠けます。別の条件を試してください。';
  }
}

/**
 * 有望度の詳細レポート生成
 */
export function generatePromisingReport(evaluation: PromisingEvaluation): string {
  const lines: string[] = [];
  
  lines.push(`【総合評価】`);
  lines.push(`スコア: ${evaluation.score}/100`);
  lines.push(`判定: ${evaluation.is_promising ? '✅ 有望' : '⚠️ 要検証'}`);
  lines.push('');
  
  if (evaluation.reasons.length > 0) {
    lines.push(`【強み】`);
    evaluation.reasons.forEach(r => lines.push(`• ${r}`));
    lines.push('');
  }
  
  if (evaluation.warnings.length > 0) {
    lines.push(`【注意点】`);
    evaluation.warnings.forEach(w => lines.push(`⚠️ ${w}`));
    lines.push('');
  }
  
  lines.push(`【推奨】`);
  lines.push(evaluation.recommendation);
  
  return lines.join('\n');
}
