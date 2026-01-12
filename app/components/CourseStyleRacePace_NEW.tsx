// この関数だけを一時ファイルに保存して確認します
// 後で本ファイルに統合します

/**
 * ゴール前の位置調整を計算（偏差値ベース版）
 * レース内相対評価による精密な調整
 */
function calculateGoalPositionAdjustment(
  startPosition: number,
  runningStyle: 'escape' | 'lead' | 'sashi' | 'oikomi',
  scoreDeviation: number, // 偏差値を使用
  pace: 'slow' | 'middle' | 'high',
  courseInfo: any,
  waku: string,
  totalHorses: number,
  badPerformance?: { // 大敗判定結果
    isBadPerformer: boolean;
    avgTimeDiff: number;
    worstTimeDiff: number;
  }
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
      return totalHorses * 2.0; // 超大敗
    } else if (badPerformance.avgTimeDiff >= 2.0) {
      return totalHorses * 1.8; // 大敗
    } else {
      adjustment += 12.0; // 中程度の大敗
      unfavorableFactors += 3;
    }
  }
  
  // ========================================
  // 2. 偏差値による基本調整（相対評価）
  // ========================================
  if (scoreDeviation >= 70) {
    adjustment -= 8.0;
    favorableFactors += 3;
  } else if (scoreDeviation >= 65) {
    adjustment -= 6.0;
    favorableFactors += 2;
  } else if (scoreDeviation >= 60) {
    adjustment -= 4.5;
    favorableFactors += 2;
  } else if (scoreDeviation >= 55) {
    adjustment -= 2.5;
    favorableFactors += 1;
  } else if (scoreDeviation >= 50) {
    adjustment -= 1.0;
  } else if (scoreDeviation >= 45) {
    adjustment += 1.0;
  } else if (scoreDeviation >= 40) {
    adjustment += 3.0;
    unfavorableFactors += 1;
  } else if (scoreDeviation >= 35) {
    adjustment += 5.0;
    unfavorableFactors += 2;
  } else if (scoreDeviation >= 30) {
    adjustment += 8.0;
    unfavorableFactors += 3;
  } else {
    adjustment += 12.0;
    unfavorableFactors += 4;
  }
  
  // ========================================
  // 3. 前残り低偏差値馬への厳しいペナルティ
  // ========================================
  const isInFrontHalf = startPosition / totalHorses <= 0.4;
  
  if (isInFrontHalf) {
    if (scoreDeviation < 40) {
      adjustment += 10.0;
      unfavorableFactors += 3;
    } else if (scoreDeviation < 50) {
      adjustment += 4.0;
      unfavorableFactors += 1;
    } else if (scoreDeviation < 55) {
      adjustment += 2.0;
    }
  }
  
  // ========================================
  // 4. ペース調整（偏差値考慮）
  // ========================================
  if (pace === 'high') {
    // ハイペース = 後方有利だが、偏差値が必要
    if (runningStyle === 'sashi' || runningStyle === 'oikomi') {
      const isInRearHalf = startPosition / totalHorses >= 0.5;
      
      if (scoreDeviation >= 65 && isInRearHalf) {
        adjustment -= 5.0;
        favorableFactors += 2;
      } else if (scoreDeviation >= 55 && isInRearHalf) {
        adjustment -= 3.0;
        favorableFactors += 1;
      } else if (scoreDeviation >= 50) {
        adjustment -= 1.0;
      } else if (scoreDeviation < 45) {
        adjustment += 2.0;
        unfavorableFactors += 1;
      }
    }
    
    // 先行馬はバテる
    if (runningStyle === 'escape' || runningStyle === 'lead') {
      if (startPosition < totalHorses * 0.3) {
        if (scoreDeviation >= 65) {
          adjustment += 1.5;
        } else if (scoreDeviation >= 55) {
          adjustment += 3.0;
          unfavorableFactors += 1;
        } else {
          adjustment += 5.0;
          unfavorableFactors += 2;
        }
      }
    }
  } else if (pace === 'slow') {
    // スローペース = 前残りだが、偏差値が必要
    if (runningStyle === 'escape' || runningStyle === 'lead') {
      if (scoreDeviation >= 60) {
        adjustment -= 2.5;
        favorableFactors += 1;
      } else if (scoreDeviation >= 50) {
        adjustment -= 0.5;
      } else if (scoreDeviation < 45) {
        adjustment += 3.0;
        unfavorableFactors += 1;
      }
    }
    
    // 前方にいても偏差値が低ければ前残り不可
    if (startPosition < totalHorses * 0.3) {
      if (scoreDeviation >= 55) {
        adjustment -= 2.0;
        favorableFactors += 1;
      } else if (scoreDeviation >= 45) {
        adjustment -= 0.3;
      } else {
        adjustment += 4.0;
        unfavorableFactors += 2;
      }
    }
    
    // 後方の馬は届きにくい
    if (runningStyle === 'sashi' || runningStyle === 'oikomi') {
      adjustment += 2.5;
      unfavorableFactors += 1;
    }
  } else {
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
      }
      
      if (runningStyle === 'escape' && startPosition < totalHorses * 0.2) {
        if (scoreDeviation < 50) {
          adjustment += 3.0;
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
      }
      
      if (runningStyle === 'oikomi' && startPosition > totalHorses * 0.7) {
        adjustment += 3.5;
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
    adjustment -= 4.0;
  } else if (favorableFactors >= 3) {
    adjustment -= 2.5;
  } else if (favorableFactors >= 2) {
    adjustment -= 1.2;
  }
  
  if (unfavorableFactors >= 5) {
    adjustment += 10.0;
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
    if (favorableFactors >= 3) {
      adjustment += 10.0;
    } else if (favorableFactors >= 2) {
      adjustment += 7.0;
    } else if (favorableFactors >= 1) {
      adjustment += 5.0;
    }
  } else if (scoreDeviation < 40) {
    if (favorableFactors >= 3) {
      adjustment += 7.0;
    } else if (favorableFactors >= 2) {
      adjustment += 5.0;
    } else if (favorableFactors >= 1) {
      adjustment += 3.0;
    }
  } else if (scoreDeviation < 45) {
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
    adjustment -= 4.0;
  } else if (scoreDeviation >= 65) {
    adjustment -= 3.0;
  } else if (scoreDeviation >= 60) {
    adjustment -= 2.0;
  } else if (scoreDeviation >= 55) {
    adjustment -= 1.0;
  }
  
  return adjustment;
}










