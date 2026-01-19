/**
 * レース展開予想 - ゴール位置調整ロジック
 * 
 * 偏差値ベースの相対評価による位置調整を行う
 */

import type { RunningStyle } from '@/types/race-pace-types';

export interface BadPerformanceResult {
  isBadPerformer: boolean;
  avgTimeDiff: number;
  worstTimeDiff: number;
  badRaceCount?: number;
}

export interface CourseCharacteristics {
  straightLength: number;
  hasSlope: boolean;
  slopePosition?: string;
  outerFrameAdvantage: number;
  innerFrameAdvantage: number;
}

/**
 * 偏差値に基づく最大前進制限を取得
 */
export function getMaxAdvanceByDeviation(scoreDeviation: number): number {
  if (scoreDeviation >= 70) {
    return 15.0; // レース内圧倒的 = 大幅浮上OK
  } else if (scoreDeviation >= 65) {
    return 12.0;
  } else if (scoreDeviation >= 60) {
    return 10.0;
  } else if (scoreDeviation >= 55) {
    return 8.0;
  } else if (scoreDeviation >= 50) {
    return 6.0;
  } else if (scoreDeviation >= 45) {
    return 4.0;
  } else if (scoreDeviation >= 40) {
    return 2.5;
  } else if (scoreDeviation >= 35) {
    return 1.5;
  } else {
    return 0; // 偏差値35未満 = 前進不可
  }
}

/**
 * ゴール位置調整を計算（偏差値ベース版）
 * 
 * レース内相対評価による精密な調整
 * 
 * @param startPosition - スタート位置（2コーナー予想位置）
 * @param runningStyle - 脚質
 * @param scoreDeviation - 競うスコアの偏差値（レース内相対評価）
 * @param pace - ペース予想
 * @param courseInfo - コース特性
 * @param waku - 枠番
 * @param totalHorses - 出走頭数
 * @param badPerformance - 大敗判定結果
 * @returns 調整量（馬身）
 */
export function calculateGoalPositionAdjustment(
  startPosition: number,
  runningStyle: RunningStyle,
  scoreDeviation: number,
  pace: 'slow' | 'middle' | 'high',
  courseInfo: CourseCharacteristics | null,
  waku: string,
  totalHorses: number,
  badPerformance?: BadPerformanceResult
): number {
  let adjustment = 0;
  const wakuNum = parseInt(waku, 10);
  let favorableFactors = 0;
  let unfavorableFactors = 0;
  
  // ========================================
  // 1. 大敗馬は無条件で最後尾
  // ========================================
  if (badPerformance?.isBadPerformer) {
    if (badPerformance.worstTimeDiff >= 4.0) {
      return totalHorses * 2.0; // 超大敗 = 最後尾のさらに後ろ
    } else if (badPerformance.avgTimeDiff >= 2.0) {
      return totalHorses * 1.8; // 大敗 = 最後尾
    } else {
      adjustment += 12.0; // 中程度の大敗 = 大きく後退
      unfavorableFactors += 3;
    }
  }
  
  // ========================================
  // 2. 偏差値による基本調整（相対評価）
  // ========================================
  
  // 偏差値 70以上（レース内で圧倒的）
  if (scoreDeviation >= 70) {
    adjustment -= 8.0; // 大幅浮上
    favorableFactors += 3;
  }
  // 偏差値 65-70（レース内で上位）
  else if (scoreDeviation >= 65) {
    adjustment -= 6.0;
    favorableFactors += 2;
  }
  // 偏差値 60-65（レース内で有力）
  else if (scoreDeviation >= 60) {
    adjustment -= 4.5;
    favorableFactors += 2;
  }
  // 偏差値 55-60（レース内で中堅上位）
  else if (scoreDeviation >= 55) {
    adjustment -= 2.5;
    favorableFactors += 1;
  }
  // 偏差値 50-55（レース内で平均やや上）
  else if (scoreDeviation >= 50) {
    adjustment -= 1.0;
  }
  // 偏差値 45-50（レース内で平均やや下）
  else if (scoreDeviation >= 45) {
    adjustment += 1.0;
  }
  // 偏差値 40-45（レース内で下位）
  else if (scoreDeviation >= 40) {
    adjustment += 3.0;
    unfavorableFactors += 1;
  }
  // 偏差値 35-40（レース内で劣勢）
  else if (scoreDeviation >= 35) {
    adjustment += 5.0;
    unfavorableFactors += 2;
  }
  // 偏差値 30-35（レース内で見込み薄）
  else if (scoreDeviation >= 30) {
    adjustment += 8.0;
    unfavorableFactors += 3;
  }
  // 偏差値 30未満（レース内で最弱）
  else {
    adjustment += 12.0; // 大幅後退
    unfavorableFactors += 4;
  }
  
  // ========================================
  // 3. 前方位置と偏差値の組み合わせ評価
  // ========================================
  const isInFrontHalf = startPosition / totalHorses <= 0.4;
  const isInFrontQuarter = startPosition / totalHorses <= 0.25;
  
  if (isInFrontHalf) {
    // 偏差値 65以上で前方にいる = 恵まれる展開、好位維持
    if (scoreDeviation >= 65) {
      adjustment -= 1.5; // 前方好位のボーナス
      favorableFactors += 1;
    }
    // 偏差値 55-65で前方にいる = まずまず有利
    else if (scoreDeviation >= 55) {
      adjustment -= 0.5;
    }
    // 偏差値 50-55の馬が前方にいる = 少し不利
    else if (scoreDeviation < 55 && scoreDeviation >= 50) {
      adjustment += 1.5;
    }
    // 偏差値 40-50の馬が前方にいる = やや不利
    else if (scoreDeviation < 50 && scoreDeviation >= 40) {
      adjustment += 4.0;
      unfavorableFactors += 1;
    }
    // 偏差値 40未満の馬が前方にいる = 惰性で残っているだけ
    else {
      adjustment += 10.0; // 超厳格
      unfavorableFactors += 3;
    }
  }
  
  // 偏差値上位で前の方にいる馬への追加ボーナス（ペースに依存しない）
  if (isInFrontQuarter && scoreDeviation >= 70) {
    adjustment -= 2.0; // レース内圧倒的 + 好位 = 大きく有利
    favorableFactors += 1;
  }
  
  // ========================================
  // 4. ペース調整（偏差値考慮）
  // ※ ペースの影響は控えめに。競うスコア上位馬は粘る
  // ========================================
  
  if (pace === 'high') {
    // ハイペース = 後方有利だが、影響は控えめに
    if (runningStyle === 'sashi' || runningStyle === 'oikomi') {
      const isInRearHalf = startPosition / totalHorses >= 0.5;
      
      if (scoreDeviation >= 65 && isInRearHalf) {
        adjustment -= 2.0; // 偏差値65以上 + 後方位置 = チャンス（控えめに）
        favorableFactors += 1;
      } else if (scoreDeviation >= 55 && isInRearHalf) {
        adjustment -= 1.0;
      } else if (scoreDeviation >= 50) {
        adjustment -= 0.3; // 位置が悪くても最小限の恩恵
      } else if (scoreDeviation < 45) {
        // 偏差値45未満は逆にペナルティ
        adjustment += 1.5;
        unfavorableFactors += 1;
      }
    }
    
    // 【修正】先行馬のハイペース時ペナルティを大幅軽減
    // 偏差値上位の先行馬は粘れる（ペナルティなしまたは軽微）
    if (runningStyle === 'escape' || runningStyle === 'lead') {
      if (startPosition < totalHorses * 0.3) {
        if (scoreDeviation >= 65) {
          // 偏差値65以上の先行馬はペナルティなし（粘れる）
          adjustment += 0;
        } else if (scoreDeviation >= 55) {
          // 偏差値55-65の先行馬は軽微なペナルティ
          adjustment += 0.5;
        } else if (scoreDeviation >= 45) {
          adjustment += 1.5;
          unfavorableFactors += 1;
        } else {
          adjustment += 3.0; // 偏差値低い先行馬は大きくバテる
          unfavorableFactors += 2;
        }
      }
    }
  }
  
  else if (pace === 'slow') {
    // スローペース = 前残り有利だが、影響は控えめに
    if (runningStyle === 'escape' || runningStyle === 'lead') {
      if (scoreDeviation >= 60) {
        adjustment -= 1.8; // 偏差値60以上の先行馬は前残り
        favorableFactors += 1;
      } else if (scoreDeviation >= 50) {
        adjustment -= 0.5;
      } else if (scoreDeviation < 45) {
        // 偏差値45未満は前残りできない
        adjustment += 2.5;
        unfavorableFactors += 1;
      }
    }
    
    // 前方にいても偏差値が低ければ前残り不可
    if (startPosition < totalHorses * 0.3) {
      if (scoreDeviation >= 55) {
        adjustment -= 1.5;
        favorableFactors += 1;
      } else if (scoreDeviation >= 45) {
        adjustment -= 0.3;
      } else {
        // 偏差値45未満は前残り不可
        adjustment += 3.5;
        unfavorableFactors += 2;
      }
    }
    
    // 後方の馬は届きにくい（偏差値上位でも厳しめ）
    if (runningStyle === 'sashi' || runningStyle === 'oikomi') {
      if (scoreDeviation >= 65) {
        adjustment += 1.5; // 偏差値65以上でも少し届きにくい
      } else {
        adjustment += 2.5;
        unfavorableFactors += 1;
      }
    }
  }
  
  else {
    // ミドルペース = 偏差値がより重要
    if (runningStyle === 'sashi') {
      if (scoreDeviation >= 60) {
        adjustment -= 2.0;
        favorableFactors += 1;
      } else if (scoreDeviation >= 50) {
        adjustment -= 0.8;
      } else if (scoreDeviation < 40) {
        adjustment += 2.0;
        unfavorableFactors += 1;
      }
    }
  }
  
  // ========================================
  // 5. コース特性調整（偏差値フィルタ）
  // ========================================
  
  if (courseInfo) {
    // 直線長い = 差し有利（偏差値が必要）
    if (courseInfo.straightLength >= 500) {
      if (runningStyle === 'sashi' || runningStyle === 'oikomi') {
        if (scoreDeviation >= 55) {
          adjustment -= 3.5;
          favorableFactors += 1;
        } else if (scoreDeviation >= 45) {
          adjustment -= 1.5;
        }
        // 偏差値45未満は恩恵なし
      }
      
      // 前に行き過ぎた馬は届かれやすい（偏差値低いと顕著）
      if (runningStyle === 'escape' && startPosition < totalHorses * 0.2) {
        if (scoreDeviation < 50) {
          adjustment += 3.0; // 偏差値低い逃げ馬は捕まる
          unfavorableFactors += 1;
        } else if (scoreDeviation < 60) {
          adjustment += 1.5;
        }
      }
    }
    
    // 直線短い = 先行有利（偏差値が必要）
    if (courseInfo.straightLength < 350) {
      if (runningStyle === 'escape' || runningStyle === 'lead') {
        if (scoreDeviation >= 55) {
          adjustment -= 2.5;
          favorableFactors += 1;
        } else if (scoreDeviation >= 45) {
          adjustment -= 1.0;
        }
        // 偏差値45未満は恩恵なし
      }
      
      if (runningStyle === 'oikomi' && startPosition > totalHorses * 0.7) {
        adjustment += 3.5; // 追込は届きにくい
        unfavorableFactors += 1;
      }
    }
    
    // 枠順有利不利（偏差値によるフィルタ）
    if (courseInfo.outerFrameAdvantage < -0.3 && wakuNum >= 6) {
      if (runningStyle === 'sashi' || runningStyle === 'oikomi') {
        if (scoreDeviation >= 50) {
          adjustment -= 2.5;
          favorableFactors += 1;
        }
        // 偏差値50未満は恩恵なし
      }
    }
    
    if (courseInfo.innerFrameAdvantage < -0.5 && wakuNum <= 3) {
      if (runningStyle === 'escape' || runningStyle === 'lead') {
        if (scoreDeviation >= 50) {
          adjustment -= 2.0;
          favorableFactors += 1;
        }
      }
    }
    
    // 坂の影響（偏差値フィルタ）
    if (courseInfo.hasSlope && courseInfo.slopePosition === 'finish') {
      if (runningStyle === 'escape' || runningStyle === 'lead') {
        if (scoreDeviation >= 50) {
          adjustment -= 2.0;
          favorableFactors += 1;
        }
      }
      if (runningStyle === 'oikomi') {
        adjustment += 1.5;
        unfavorableFactors += 1;
      }
    }
  }
  
  // ========================================
  // 6. 総合判定ボーナス
  // ========================================
  
  if (favorableFactors >= 4) {
    adjustment -= 4.0; // 4つ以上の有利要素 = 大きく浮上
  } else if (favorableFactors >= 3) {
    adjustment -= 2.5;
  } else if (favorableFactors >= 2) {
    adjustment -= 1.2;
  }
  
  if (unfavorableFactors >= 5) {
    adjustment += 10.0; // 5つ以上の不利要素 = 完全に見込みなし
  } else if (unfavorableFactors >= 4) {
    adjustment += 7.0;
  } else if (unfavorableFactors >= 3) {
    adjustment += 5.0;
  } else if (unfavorableFactors >= 2) {
    adjustment += 3.0;
  }
  
  // ========================================
  // 7. 低偏差値馬の有利要素無効化（超厳格）
  // ========================================
  
  if (scoreDeviation < 35) {
    // 偏差値35未満 = 有利要素を完全に無効化 + さらに後退
    if (favorableFactors >= 3) {
      adjustment += 10.0;
    } else if (favorableFactors >= 2) {
      adjustment += 7.0;
    } else if (favorableFactors >= 1) {
      adjustment += 5.0;
    }
  } else if (scoreDeviation < 40) {
    // 偏差値35-40 = 有利要素を大幅に減衰
    if (favorableFactors >= 3) {
      adjustment += 7.0;
    } else if (favorableFactors >= 2) {
      adjustment += 5.0;
    } else if (favorableFactors >= 1) {
      adjustment += 3.0;
    }
  } else if (scoreDeviation < 45) {
    // 偏差値40-45 = 有利要素を少し減衰
    if (favorableFactors >= 3) {
      adjustment += 4.0;
    } else if (favorableFactors >= 2) {
      adjustment += 2.5;
    }
  }
  
  // ========================================
  // 8. 噴射ボーナス（偏差値ベース）
  // ========================================
  
  if (scoreDeviation >= 70) {
    adjustment -= 4.0; // 超有力馬は大きく浮上
  } else if (scoreDeviation >= 65) {
    adjustment -= 3.0;
  } else if (scoreDeviation >= 60) {
    adjustment -= 2.0;
  } else if (scoreDeviation >= 55) {
    adjustment -= 1.0;
  }
  
  return adjustment;
}


