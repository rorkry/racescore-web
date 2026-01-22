/**
 * 予想ロジックのルール定義
 * 
 * ユーザーの予想スタイルを構造化したもの
 * これを基にAIが「思考」して予想を組み立てる
 */

// 評価タイプ
export type EvaluationType = 
  | 'POSITIVE'    // 評価UP
  | 'NEGATIVE'    // 評価DOWN（嫌う）
  | 'DISMISS'     // 度外視
  | 'HONMEI'      // 本命候補
  | 'ANA'         // 穴候補
  | 'KESHI';      // 消し候補

// ルール適用結果
export interface RuleMatchResult {
  ruleId: string;
  ruleName: string;
  type: EvaluationType;
  reason: string;        // AIが使う理由文
  confidence: 'high' | 'medium' | 'low';
  scoreAdjust: number;   // スコア調整値
}

// 馬の分析データ（AIに渡す形式）
export interface HorseAnalysisData {
  number: number;
  name: string;
  
  // Stride分析結果
  lapRating: 'S' | 'A' | 'B' | 'C' | 'D' | 'LOW' | 'UNKNOWN';
  timeRating: 'S' | 'A' | 'B' | 'C' | 'D' | 'LOW' | 'UNKNOWN';
  potential: number | null;
  makikaeshi: number | null;
  
  // 過去走情報
  pastRaces: Array<{
    date: string;
    place: string;
    distance: number;
    surface: '芝' | 'ダ';
    finishPosition: number;
    popularity: number;
    margin: string;
    trackCondition: string;
    raceLevel: string | null;
    lapRating: string | null;
    timeRating: string | null;
    corner4: number | null;      // 4角位置
    totalHorses: number;
    className: string;
  }>;
  
  // 今回の条件
  waku: number;
  jockey: string;
  trainer: string;
  weight: number | null;        // 馬体重
  weightChange: number | null;  // 馬体重増減
  
  // 恵まれ判定（自動 + 手動オーバーライド）
  blessedAuto: 'blessed' | 'unlucky' | 'neutral';  // 巻き返し指数ベース
  blessedManual?: 'blessed' | 'unlucky' | 'neutral'; // ユーザー設定
  
  // 想定人気（近走から推定）
  estimatedPopularity: number;
}

// ユーザー設定（馬場・展開）
export interface RaceConditionSettings {
  // 馬場傾向
  trackBias?: 'inner' | 'outer' | 'front' | 'closer' | 'flat';
  // 展開予想
  paceExpectation?: 'slow' | 'middle' | 'fast';
  // 馬場質
  trackType?: 'power' | 'speed' | 'stamina';
}

/**
 * 恵まれ判定を計算
 * 巻き返し指数ベース、手動オーバーライドがあればそちらを優先
 */
export function calculateBlessed(
  makikaeshi: number | null,
  manual?: 'blessed' | 'unlucky' | 'neutral'
): 'blessed' | 'unlucky' | 'neutral' {
  // 手動設定があれば優先
  if (manual) return manual;
  
  // 巻き返し指数ベース
  if (makikaeshi === null) return 'neutral';
  if (makikaeshi < 1.0) return 'blessed';    // 恵まれた
  if (makikaeshi >= 3.0) return 'unlucky';   // 不利があった
  return 'neutral';
}

/**
 * 想定人気を計算
 * 近走の人気と着順から推定
 */
export function estimatePopularity(pastRaces: HorseAnalysisData['pastRaces']): number {
  if (pastRaces.length === 0) return 8; // データなしは中位
  
  const recent3 = pastRaces.slice(0, 3);
  let score = 0;
  
  for (const race of recent3) {
    // 着順が良いほど人気しやすい
    if (race.finishPosition <= 3) score += 3;
    else if (race.finishPosition <= 5) score += 1;
    else score -= 1;
    
    // 前走人気も考慮
    if (race.popularity <= 3) score += 2;
    else if (race.popularity <= 5) score += 1;
  }
  
  // スコアから人気を推定（1-16）
  if (score >= 12) return 1;
  if (score >= 9) return 2;
  if (score >= 6) return 3;
  if (score >= 3) return 5;
  if (score >= 0) return 8;
  return 12;
}

/**
 * 予想ルール定義
 */
export const PREDICTION_RULES = {
  // ============================================
  // 評価UP系
  // ============================================
  
  WAKU_CHANGE_POSITIVE: {
    id: 'waku_change_positive',
    name: '外枠替わりで好転',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      // 前走が内枠（1-4枠）で後方から、今回外枠（5-8枠）
      const wasInner = last.corner4 && last.corner4 > last.totalHorses * 0.6;
      const nowOuter = horse.waku >= 5;
      
      if (wasInner && nowOuter) {
        return {
          reason: '内枠で後手を踏んでいたが外枠替わりでレースぶりは変わりそう',
          confidence: 'medium' as const,
          scoreAdjust: 5,
        };
      }
      return null;
    },
  },
  
  JOCKEY_POSITIVE: {
    id: 'jockey_positive',
    name: '鞍上変更で好転',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      const last2 = horse.pastRaces[1];
      if (!last || !last2) return null;
      
      // 前走乗り替わりで凡走、今回手戻り
      // TODO: 騎手の成績データがあれば精度向上
      
      return null; // 現状はデータ不足で判定不可
    },
  },
  
  GROWTH_SIGN: {
    id: 'growth_sign',
    name: '成長の兆候',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      // 馬体増＋着順良化
      if (horse.weightChange && horse.weightChange > 0) {
        const recent = horse.pastRaces.slice(0, 3);
        const improving = recent.length >= 2 && 
          recent[0].finishPosition < recent[1].finishPosition;
        
        if (improving) {
          return {
            reason: '馬体を増やしながら着順も良化、成長の兆候',
            confidence: 'medium' as const,
            scoreAdjust: 4,
          };
        }
      }
      return null;
    },
  },
  
  HIGH_LEVEL_RACE_GOOD: {
    id: 'high_level_race_good',
    name: 'ハイレベル戦で好走',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      const isHighLevel = last.raceLevel === 'A' || last.raceLevel === 'B';
      const goodFinish = last.finishPosition <= 5;
      
      if (isHighLevel && goodFinish) {
        return {
          reason: `レースレベル${last.raceLevel}の中での好走、相手関係で評価`,
          confidence: 'high' as const,
          scoreAdjust: 8,
        };
      }
      return null;
    },
  },
  
  GOOD_LAP_TIME: {
    id: 'good_lap_time',
    name: 'ラップ・時計が優秀',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const lapGood = horse.lapRating === 'S' || horse.lapRating === 'A';
      const timeGood = horse.timeRating === 'S' || horse.timeRating === 'A';
      
      if (lapGood && timeGood) {
        return {
          reason: '中身の伴った好走、ラップ・時計ともに優秀',
          confidence: 'high' as const,
          scoreAdjust: 10,
        };
      } else if (lapGood || timeGood) {
        const which = lapGood ? 'ラップ' : '時計';
        return {
          reason: `${which}評価が高く内容は評価できる`,
          confidence: 'medium' as const,
          scoreAdjust: 5,
        };
      }
      return null;
    },
  },
  
  UNLUCKY_BOUNCE_BACK: {
    id: 'unlucky_bounce_back',
    name: '巻き返し候補',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const blessed = calculateBlessed(horse.makikaeshi, horse.blessedManual);
      const last = horse.pastRaces[0];
      
      if (blessed === 'unlucky' && last) {
        // 不利があったのに着差小
        const marginNum = parseFloat(last.margin) || 99;
        if (marginNum <= 1.0) {
          return {
            reason: '前走は不利がありながら着差は僅か、巻き返しに期待',
            confidence: 'high' as const,
            scoreAdjust: 8,
          };
        } else {
          return {
            reason: '前走は不利があった、立て直しに期待',
            confidence: 'medium' as const,
            scoreAdjust: 4,
          };
        }
      }
      return null;
    },
  },
  
  MARGIN_CLOSE_HIGH_LEVEL: {
    id: 'margin_close_high_level',
    name: '着差僅差のハイレベル戦',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      const isHighLevel = last.raceLevel === 'A' || last.raceLevel === 'B';
      const badFinish = last.finishPosition > 5;
      const marginNum = parseFloat(last.margin) || 99;
      const closeMargin = marginNum <= 1.0;
      
      if (isHighLevel && badFinish && closeMargin) {
        return {
          reason: `着順は悪いがレースレベル${last.raceLevel}で着差${last.margin}秒、力負けではない`,
          confidence: 'high' as const,
          scoreAdjust: 7,
        };
      }
      return null;
    },
  },
  
  // ============================================
  // 評価DOWN系（嫌う理由）
  // ============================================
  
  BLESSED_LOW_LEVEL: {
    id: 'blessed_low_level',
    name: '恵まれた低レベル戦',
    type: 'NEGATIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const blessed = calculateBlessed(horse.makikaeshi, horse.blessedManual);
      const last = horse.pastRaces[0];
      
      if (blessed === 'blessed' && last) {
        const isLowLevel = last.raceLevel === 'C' || last.raceLevel === 'D';
        const goodFinish = last.finishPosition <= 3;
        
        if (isLowLevel && goodFinish) {
          return {
            reason: 'レースレベルが低い中で恵まれた好走、再現性に疑問',
            confidence: 'high' as const,
            scoreAdjust: -8,
          };
        } else if (blessed === 'blessed') {
          return {
            reason: '前走は恵まれた印象、中身が伴っていない',
            confidence: 'medium' as const,
            scoreAdjust: -5,
          };
        }
      }
      return null;
    },
  },
  
  MEDIOCRE_LAP_TIME_POPULAR: {
    id: 'mediocre_lap_time_popular',
    name: '平凡な内容で人気',
    type: 'NEGATIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const lapBad = horse.lapRating === 'C' || horse.lapRating === 'D' || horse.lapRating === 'LOW';
      const timeBad = horse.timeRating === 'C' || horse.timeRating === 'D' || horse.timeRating === 'LOW';
      const popular = horse.estimatedPopularity <= 3;
      
      if ((lapBad || timeBad) && popular) {
        return {
          reason: 'ラップ・時計が平凡なのに人気、過大評価の可能性',
          confidence: 'medium' as const,
          scoreAdjust: -5,
        };
      }
      return null;
    },
  },
  
  LOW_LEVEL_RACE_GOOD: {
    id: 'low_level_race_good',
    name: '低レベル戦での好走',
    type: 'NEGATIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      const isLowLevel = last.raceLevel === 'C' || last.raceLevel === 'D';
      const goodFinish = last.finishPosition <= 3;
      const popular = horse.estimatedPopularity <= 3;
      
      if (isLowLevel && goodFinish && popular) {
        return {
          reason: `メンバーレベル${last.raceLevel}のところでの好走、過信禁物`,
          confidence: 'medium' as const,
          scoreAdjust: -4,
        };
      }
      return null;
    },
  },
  
  // ============================================
  // 度外視系
  // ============================================
  
  DISMISS_DIFFERENT_CONDITION: {
    id: 'dismiss_different_condition',
    name: '条件替わりで度外視',
    type: 'DISMISS' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      const last2 = horse.pastRaces[1];
      if (!last || !last2) return null;
      
      // ワンターン→周回や、芝⇔ダート替わりなど
      // 距離が大きく違う場合（±400m以上）
      const distanceDiff = Math.abs(last.distance - last2.distance);
      
      if (distanceDiff >= 400) {
        return {
          reason: `前走は履歴にない距離（${last.distance}m）、度外視可能`,
          confidence: 'medium' as const,
          scoreAdjust: 0, // 度外視なのでスコア影響なし
        };
      }
      return null;
    },
  },
  
  DISMISS_SLOW_PACE_STUCK: {
    id: 'dismiss_slow_pace_stuck',
    name: 'スローで後手',
    type: 'DISMISS' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last || !last.corner4 || !last.totalHorses) return null;
      
      // 4角で後方（60%以降）かつ上がりだけ使う競馬
      const wasBack = last.corner4 > last.totalHorses * 0.6;
      const badFinish = last.finishPosition > 5;
      
      // TODO: ペース情報があればより正確に判定
      if (wasBack && badFinish) {
        return {
          reason: 'スローの中を後手から上がりだけ使う競馬とかみ合っていない',
          confidence: 'low' as const,
          scoreAdjust: 0,
        };
      }
      return null;
    },
  },
  
  // ============================================
  // 馬場・展開連動系
  // ============================================
  
  TRACK_BIAS_INNER: {
    id: 'track_bias_inner',
    name: '内有利馬場×内枠',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, settings: RaceConditionSettings) => {
      if (settings.trackBias !== 'inner') return null;
      
      if (horse.waku <= 3) {
        return {
          reason: '内有利馬場で内枠、立ち回りの利がある',
          confidence: 'high' as const,
          scoreAdjust: 6,
        };
      } else if (horse.waku >= 6) {
        return {
          reason: '内有利馬場で外枠、不利な条件',
          confidence: 'medium' as const,
          scoreAdjust: -4,
        };
      }
      return null;
    },
  },
  
  TRACK_BIAS_OUTER: {
    id: 'track_bias_outer',
    name: '外有利馬場×外枠',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, settings: RaceConditionSettings) => {
      if (settings.trackBias !== 'outer') return null;
      
      if (horse.waku >= 6) {
        return {
          reason: '外有利馬場で外枠、馬場を生かせる',
          confidence: 'high' as const,
          scoreAdjust: 6,
        };
      } else if (horse.waku <= 3) {
        return {
          reason: '外有利馬場で内枠、揉まれると厳しい',
          confidence: 'medium' as const,
          scoreAdjust: -4,
        };
      }
      return null;
    },
  },
  
  TRACK_BIAS_FRONT: {
    id: 'track_bias_front',
    name: '前有利馬場×先行馬',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, settings: RaceConditionSettings) => {
      if (settings.trackBias !== 'front') return null;
      
      const last = horse.pastRaces[0];
      if (!last || !last.corner4 || !last.totalHorses) return null;
      
      const isFront = last.corner4 <= Math.ceil(last.totalHorses * 0.3);
      
      if (isFront) {
        return {
          reason: '前有利馬場で先行脚質、展開も向きそう',
          confidence: 'high' as const,
          scoreAdjust: 6,
        };
      } else {
        const isBack = last.corner4 > last.totalHorses * 0.6;
        if (isBack) {
          return {
            reason: '前有利馬場で差し脚質、展開不向き',
            confidence: 'medium' as const,
            scoreAdjust: -4,
          };
        }
      }
      return null;
    },
  },
  
  PACE_SLOW_FRONT: {
    id: 'pace_slow_front',
    name: 'スロー予想×先行馬',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, settings: RaceConditionSettings) => {
      if (settings.paceExpectation !== 'slow') return null;
      
      const last = horse.pastRaces[0];
      if (!last || !last.corner4 || !last.totalHorses) return null;
      
      const isFront = last.corner4 <= Math.ceil(last.totalHorses * 0.3);
      
      if (isFront) {
        return {
          reason: 'スローペース予想で先行脚質、行った行ったになりやすい',
          confidence: 'medium' as const,
          scoreAdjust: 5,
        };
      }
      return null;
    },
  },
  
  PACE_FAST_CLOSER: {
    id: 'pace_fast_closer',
    name: 'ハイペース予想×差し馬',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, settings: RaceConditionSettings) => {
      if (settings.paceExpectation !== 'fast') return null;
      
      const last = horse.pastRaces[0];
      if (!last || !last.corner4 || !last.totalHorses) return null;
      
      const isCloser = last.corner4 > last.totalHorses * 0.5;
      
      if (isCloser) {
        return {
          reason: 'ハイペース予想で差し脚質、前が潰れれば浮上',
          confidence: 'medium' as const,
          scoreAdjust: 5,
        };
      }
      return null;
    },
  },
};

/**
 * 全ルールを馬に適用して判定結果を返す
 */
export function applyAllRules(
  horse: HorseAnalysisData,
  settings: RaceConditionSettings
): RuleMatchResult[] {
  const results: RuleMatchResult[] = [];
  
  for (const [_key, rule] of Object.entries(PREDICTION_RULES)) {
    const match = rule.check(horse, settings);
    if (match) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        type: rule.type,
        reason: match.reason,
        confidence: match.confidence,
        scoreAdjust: match.scoreAdjust,
      });
    }
  }
  
  return results;
}

/**
 * ルール判定結果から総合スコアを計算
 */
export function calculateTotalScore(matches: RuleMatchResult[]): number {
  return matches.reduce((sum, m) => sum + m.scoreAdjust, 50); // 基準点50
}

/**
 * スコアから推奨印を決定
 */
export function determineRecommendation(
  score: number,
  popularity: number
): '◎' | '○' | '▲' | '△' | '×' | '-' {
  // 高スコア＋低人気 → 穴
  if (score >= 65 && popularity >= 6) return '▲';
  
  // 高スコア → 本命候補
  if (score >= 70) return '◎';
  if (score >= 60) return '○';
  if (score >= 50) return '△';
  
  // 低スコア＋高人気 → 消し
  if (score < 40 && popularity <= 3) return '×';
  
  return '-';
}
