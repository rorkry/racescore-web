/**
 * 統計的信頼性の計算
 * ラッキーパンチ指標を排除するための判定
 */

export interface ConfidenceResult {
  confidence_level: number;        // 0-100（信頼度）
  is_significant: boolean;         // 統計的有意性
  confidence_interval?: {          // 信頼区間
    lower: number;
    upper: number;
  };
  warnings: string[];              // 警告メッセージ
}

/**
 * 統計的信頼性を計算
 */
export function calculateStatisticalConfidence(
  sampleSize: number,
  showRate: number,
  returnRate: number
): ConfidenceResult {
  const warnings: string[] = [];
  
  // 1. サンプル数チェック
  const minSampleSize = 30;
  const sampleConfidence = Math.min(100, (sampleSize / 100) * 100);
  
  if (sampleSize < minSampleSize) {
    warnings.push(`サンプル数不足（${sampleSize}走 < ${minSampleSize}走）`);
  }
  
  // 2. 出走率チェック（再現性の指標）
  const minShowRate = 0.05; // 5%
  const stabilityFactor = showRate >= minShowRate ? 1.0 : showRate / minShowRate;
  
  if (showRate < minShowRate) {
    warnings.push(`出走率が低い（${(showRate * 100).toFixed(1)}% < 5%）- 一撃依存の可能性`);
  }
  
  // 3. 回収率の信頼区間（簡易版）
  let confidenceInterval: { lower: number; upper: number } | undefined;
  
  if (sampleSize >= 10) {
    // 標準誤差の簡易計算
    const stdError = Math.sqrt((returnRate * (200 - returnRate)) / sampleSize);
    const margin = 1.96 * stdError; // 95%信頼区間
    
    confidenceInterval = {
      lower: Math.max(0, returnRate - margin),
      upper: returnRate + margin
    };
    
    // 信頼区間が広すぎる場合
    if (margin > 50) {
      warnings.push('信頼区間が広い - データ不足の可能性');
    }
  }
  
  // 4. 総合信頼度
  const confidenceLevel = sampleConfidence * stabilityFactor;
  
  // 5. 統計的有意性の判定
  const isSignificant = 
    sampleSize >= minSampleSize && 
    showRate >= minShowRate &&
    confidenceLevel >= 50;
  
  return {
    confidence_level: Math.round(confidenceLevel),
    is_significant: isSignificant,
    confidence_interval: confidenceInterval,
    warnings
  };
}

/**
 * 信頼性レベルのラベル取得
 */
export function getConfidenceLabel(confidenceLevel: number): string {
  if (confidenceLevel >= 80) return '⭐⭐⭐ 高信頼';
  if (confidenceLevel >= 60) return '⭐⭐ 中信頼';
  if (confidenceLevel >= 40) return '⭐ 低信頼';
  return '⚠️ 信頼性不足';
}

/**
 * 最小サンプル数の推奨値取得
 */
export function getRecommendedSampleSize(targetConfidence: number = 80): number {
  // 信頼度80%を得るために必要なサンプル数
  return Math.ceil((targetConfidence / 100) * 100);
}
