/**
 * ギャップ判定ロジック
 * 
 * 着順と中身の乖離を検出し、「過大評価」「過小評価」を判定
 */

import type { GapEvaluation } from './types';

interface HorseEvaluationInput {
  horseName: string;
  horseNumber: number;
  
  // 表面
  lastFinish: number;        // 前走着順
  margin: number;            // 着差（秒）
  popularity: number;        // 前走人気
  
  // 中身（Strideデータ）
  timeRating?: string;       // タイム評価 (S/A/B/C or undefined)
  lapRating?: string;        // ラップ評価 (S/A/B/C or undefined)
  comebackIndex?: number;    // 巻き返し指数 (0-10)
  potentialIndex?: number;   // ポテンシャル指数 (0-10)
  raceLevel?: string;        // レースレベル (S/A/B/C/D/LOW)
}

/**
 * レーティングをスコアに変換
 */
function ratingToScore(rating: string | undefined): number {
  if (!rating) return 50;
  
  const map: Record<string, number> = {
    'S': 100,
    'S+': 100,
    'S++': 100,
    'A': 80,
    'A+': 85,
    'A++': 90,
    'B': 60,
    'B+': 65,
    'B++': 70,
    'C': 40,
    'C+': 45,
    'D': 30,
    'LOW': 20,
    'UNKNOWN': 50,
  };
  
  // レベルラベルから基本レベルを抽出
  const baseLevel = rating.replace(/\+/g, '').toUpperCase();
  return map[rating.toUpperCase()] || map[baseLevel] || 50;
}

/**
 * 着差文字列を秒数に変換
 */
function parseMargin(margin: string): number {
  if (!margin) return 0;
  
  // "0.5" や "1.0" の形式
  const numMatch = margin.match(/(\d+\.?\d*)/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }
  
  // "ハナ", "クビ", "アタマ" などの特殊表記
  const specialMargins: Record<string, number> = {
    'ハナ': 0.05,
    'クビ': 0.1,
    'アタマ': 0.15,
    '同着': 0,
  };
  
  for (const [key, val] of Object.entries(specialMargins)) {
    if (margin.includes(key)) {
      return val;
    }
  }
  
  return 0;
}

/**
 * ギャップ判定を実行
 */
export function evaluateGap(horse: HorseEvaluationInput): GapEvaluation {
  const reasons: string[] = [];
  let score = 0;
  
  // 中身スコア計算（タイム + ラップの平均）
  const timeScore = ratingToScore(horse.timeRating);
  const lapScore = ratingToScore(horse.lapRating);
  const substanceScore = (timeScore + lapScore) / 2;
  
  // レースレベルスコア
  const levelScore = ratingToScore(horse.raceLevel);
  
  // 着差（秒）
  const marginSeconds = typeof horse.margin === 'number' 
    ? horse.margin 
    : parseMargin(String(horse.margin));
  
  // ========================================
  // ケース1: 着順良い × 中身悪い → 過大評価
  // ========================================
  if (horse.lastFinish <= 3 && substanceScore < 50) {
    score -= 30;
    reasons.push('着順は良いが中身（タイム・ラップ）が伴っていない');
  }
  
  // レースレベルが低い中での好走
  if (horse.lastFinish <= 3 && levelScore < 40) {
    score -= 20;
    reasons.push('低レベル戦での好走で過信禁物');
  }
  
  // ========================================
  // ケース2: 着順悪い × 中身良い × 着差小 → 過小評価
  // ========================================
  if (horse.lastFinish > 5 && substanceScore > 70 && marginSeconds <= 1.0) {
    score += 30;
    reasons.push(`着順は悪いが着差${marginSeconds}秒以内で中身は評価できる`);
  }
  
  // レースレベルが高い中での凡走
  if (horse.lastFinish > 5 && levelScore >= 60 && marginSeconds <= 1.0) {
    score += 20;
    reasons.push('ハイレベル戦での凡走は見直し余地あり');
  }
  
  // ========================================
  // ケース3: 巻き返し指数による判定
  // ========================================
  if (horse.comebackIndex !== undefined) {
    if (horse.comebackIndex < 2) {
      score -= 15;
      reasons.push('巻き返し指数が低く前走は恵まれた可能性');
    } else if (horse.comebackIndex > 5) {
      score += 20;
      reasons.push('巻き返し指数が高く前走は不利があった');
    }
  }
  
  // ========================================
  // ケース4: ポテンシャル指数による判定
  // ========================================
  if (horse.potentialIndex !== undefined) {
    if (horse.potentialIndex > 5) {
      score += 10;
      reasons.push('ポテンシャル指数が高く上積みに期待');
    }
  }
  
  // ========================================
  // ケース5: 人気と着順の乖離
  // ========================================
  if (horse.popularity <= 3 && horse.lastFinish > 5) {
    // 人気馬が凡走 → 原因次第で過大か過小
    if (substanceScore > 60) {
      score += 10;
      reasons.push('人気馬の凡走だが中身は悪くない');
    } else {
      score -= 10;
      reasons.push('人気馬の凡走で中身も伴わず');
    }
  }
  
  if (horse.popularity > 6 && horse.lastFinish <= 3) {
    // 人気薄が好走
    if (substanceScore > 60) {
      score += 15;
      reasons.push('人気薄の好走で中身も伴っており本物');
    } else {
      score -= 15;
      reasons.push('人気薄の好走だが中身は伴わず（フロック濃厚）');
    }
  }
  
  // ========================================
  // 判定結果
  // ========================================
  let type: '過大評価' | '妥当' | '過小評価';
  
  if (score <= -20) {
    type = '過大評価';
  } else if (score >= 20) {
    type = '過小評価';
  } else {
    type = '妥当';
  }
  
  return {
    horseName: horse.horseName,
    horseNumber: horse.horseNumber,
    type,
    reasons: reasons.length > 0 ? reasons : ['特筆すべき乖離なし'],
    score,
  };
}

/**
 * 複数馬のギャップ判定を一括実行
 */
export function evaluateGapForRace(horses: HorseEvaluationInput[]): GapEvaluation[] {
  return horses.map(evaluateGap);
}
