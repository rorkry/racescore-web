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
 * 着差を数値に変換（秒単位）
 */
function parseMargin(margin: string): number {
  if (!margin) return 99;
  
  // 特殊表記を先にチェック（数値マッチより優先）
  const shortMargins: { [key: string]: number } = {
    'ハナ': 0.05,
    'アタマ': 0.1,
    'クビ': 0.15,
    '1/2': 0.3,
    '3/4': 0.4,
    '1 1/2': 0.8,
    '1 1/4': 0.7,
    '2 1/2': 1.3,
  };
  
  for (const [key, val] of Object.entries(shortMargins)) {
    if (margin.includes(key)) return val;
  }
  
  // 数値形式 "0.1", "1.5" など
  const numMatch = margin.match(/(\d+\.?\d*)/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }
  
  return 99;
}

/**
 * 予想ルール定義
 */
export const PREDICTION_RULES = {
  // ============================================
  // 評価UP系（POSITIVE）
  // ============================================
  
  // ============================================
  // 価値あるレースでの好走（タイム・ラップ・レースレベル複合評価）
  // 「1着だから高評価」ではなく「価値あるレースで好走したか」が重要
  // ============================================
  
  // === 高レベル戦 + 好走 → 高評価 ===
  HIGH_VALUE_WIN: {
    id: 'high_value_win',
    name: '価値ある勝利',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      const isHighLevel = last.raceLevel === 'A' || last.raceLevel === 'B';
      const goodLap = horse.lapRating === 'S' || horse.lapRating === 'A';
      const goodTime = horse.timeRating === 'S' || horse.timeRating === 'A';
      
      // レースレベルA/B + 1着 = 価値ある勝利
      if (isHighLevel && last.finishPosition === 1) {
        return {
          reason: `レースレベル${last.raceLevel}で勝利、相手関係から高評価`,
          confidence: 'high' as const,
          scoreAdjust: 10,
        };
      }
      
      // ラップ/タイム優秀 + 1着 = 中身のある勝利
      if ((goodLap || goodTime) && last.finishPosition === 1) {
        const quality = goodLap && goodTime ? 'ラップ・時計ともに優秀' : 
                        goodLap ? 'ラップ優秀' : '時計優秀';
        return {
          reason: `${quality}な中身のある勝利`,
          confidence: 'high' as const,
          scoreAdjust: 8,
        };
      }
      
      // レースレベル不明 + 1着 = 一応プラスだが過信禁物
      if (last.finishPosition === 1 && !isHighLevel && !goodLap && !goodTime) {
        return {
          reason: '前走勝利も中身の評価待ち',
          confidence: 'low' as const,
          scoreAdjust: 3,
        };
      }
      
      return null;
    },
  },
  
  // === 低レベル戦 + 好走 → 評価フラット（過信禁物） ===
  LOW_VALUE_WIN: {
    id: 'low_value_win',
    name: '低レベル戦勝利（過信禁物）',
    type: 'NEGATIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      const isLowLevel = last.raceLevel === 'C' || last.raceLevel === 'D';
      const badLap = horse.lapRating === 'C' || horse.lapRating === 'D' || horse.lapRating === 'LOW';
      const badTime = horse.timeRating === 'C' || horse.timeRating === 'D' || horse.timeRating === 'LOW';
      
      // レースレベルC/D + 勝利 = 過信禁物
      if (isLowLevel && last.finishPosition === 1) {
        return {
          reason: `レースレベル${last.raceLevel}での勝利、メンバーレベルから過信禁物`,
          confidence: 'medium' as const,
          scoreAdjust: -3,
        };
      }
      
      // ラップ/タイム悪い + 勝利 = 価値低い
      if ((badLap && badTime) && last.finishPosition === 1) {
        return {
          reason: 'ラップ・時計ともに平凡な勝利、評価据え置き',
          confidence: 'medium' as const,
          scoreAdjust: -2,
        };
      }
      
      return null;
    },
  },
  
  // === 着差ベース（レースレベルと組み合わせ） ===
  CLOSE_MARGIN_HIGH_LEVEL: {
    id: 'close_margin_high_level',
    name: '高レベル戦で僅差',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      const isHighLevel = last.raceLevel === 'A' || last.raceLevel === 'B';
      const marginSec = parseMargin(last.margin);
      
      // 高レベル戦で2-5着、着差0.5秒以内
      if (isHighLevel && last.finishPosition >= 2 && last.finishPosition <= 5 && marginSec <= 0.5) {
        return {
          reason: `レースレベル${last.raceLevel}で${last.finishPosition}着、着差${last.margin}秒と僅差で高評価`,
          confidence: 'high' as const,
          scoreAdjust: 7,
        };
      }
      
      // 高レベル戦で6着以下でも着差1秒以内なら見直し
      if (isHighLevel && last.finishPosition > 5 && marginSec <= 1.0) {
        return {
          reason: `レースレベル${last.raceLevel}で着差${last.margin}秒、力負けではなく見直し`,
          confidence: 'medium' as const,
          scoreAdjust: 5,
        };
      }
      
      return null;
    },
  },
  
  CLOSE_MARGIN_UNKNOWN_LEVEL: {
    id: 'close_margin_unknown_level',
    name: '僅差の負け（レベル不明）',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      // レースレベル不明の場合
      if (last.raceLevel && (last.raceLevel === 'A' || last.raceLevel === 'B' || last.raceLevel === 'C' || last.raceLevel === 'D')) {
        return null; // レベル判明してる場合は他のルールで処理
      }
      
      const marginSec = parseMargin(last.margin);
      
      // 2-5着で着差0.3秒以内（レベル不明なので控えめ評価）
      if (last.finishPosition >= 2 && last.finishPosition <= 5 && marginSec <= 0.3) {
        return {
          reason: `前走${last.finishPosition}着、着差${last.margin}秒と僅差`,
          confidence: 'medium' as const,
          scoreAdjust: 4,
        };
      }
      return null;
    },
  },
  
  IMPROVING_FORM: {
    id: 'improving_form',
    name: '着順良化',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      if (horse.pastRaces.length < 2) return null;
      
      const last = horse.pastRaces[0];
      const prev = horse.pastRaces[1];
      
      // 着順が2つ以上良化
      if (last.finishPosition < prev.finishPosition - 1) {
        return {
          reason: `着順が${prev.finishPosition}着→${last.finishPosition}着と良化、上昇気配`,
          confidence: 'medium' as const,
          scoreAdjust: 3,
        };
      }
      return null;
    },
  },
  
  CONSISTENT_TOP5_HIGH_LEVEL: {
    id: 'consistent_top5_high_level',
    name: '高レベル戦で安定好走',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const recent3 = horse.pastRaces.slice(0, 3);
      if (recent3.length < 3) return null;
      
      const allTop5 = recent3.every(r => r.finishPosition <= 5);
      const hasHighLevel = recent3.some(r => r.raceLevel === 'A' || r.raceLevel === 'B');
      
      if (allTop5 && hasHighLevel) {
        return {
          reason: '近走は高レベル戦含め安定して5着内、信頼度高い',
          confidence: 'high' as const,
          scoreAdjust: 8,
        };
      }
      
      // 安定5着内だがレベル不明
      if (allTop5) {
        return {
          reason: '近3走すべて5着内、安定感あり（レベル評価は別途）',
          confidence: 'medium' as const,
          scoreAdjust: 4,
        };
      }
      return null;
    },
  },
  
  // === 指数ベース（タイム・ラップ） ===
  // ラップ評価（価値判断の3要素の1つ）
  GOOD_LAP_RATING: {
    id: 'good_lap_rating',
    name: 'ラップ評価が優秀',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const lapGood = horse.lapRating === 'S' || horse.lapRating === 'A';
      const last = horse.pastRaces[0];
      
      if (lapGood && last) {
        // ラップ優秀 + 好走 = 中身のある好走
        if (last.finishPosition <= 5) {
          return {
            reason: `ラップ評価${horse.lapRating}で${last.finishPosition}着、後半の脚に見所あり`,
            confidence: 'high' as const,
            scoreAdjust: 6,
          };
        }
        // ラップ優秀 + 凡走 = 展開向かず
        return {
          reason: `ラップ評価${horse.lapRating}も${last.finishPosition}着、展開向けば浮上`,
          confidence: 'medium' as const,
          scoreAdjust: 3,
        };
      }
      return null;
    },
  },
  
  // 時計評価（価値判断の3要素の1つ）
  GOOD_TIME_RATING: {
    id: 'good_time_rating',
    name: '時計評価が優秀',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const timeGood = horse.timeRating === 'S' || horse.timeRating === 'A';
      const last = horse.pastRaces[0];
      
      if (timeGood && last) {
        // 時計優秀 + 好走 = 中身のある好走
        if (last.finishPosition <= 5) {
          return {
            reason: `時計評価${horse.timeRating}で${last.finishPosition}着、格上と遜色ないタイム`,
            confidence: 'high' as const,
            scoreAdjust: 6,
          };
        }
        // 時計優秀 + 凡走 = 力は見せている
        return {
          reason: `時計評価${horse.timeRating}、着順以上の力はある`,
          confidence: 'medium' as const,
          scoreAdjust: 3,
        };
      }
      return null;
    },
  },
  
  // ラップ・時計ともに悪い
  BAD_LAP_AND_TIME: {
    id: 'bad_lap_and_time',
    name: 'ラップ・時計ともに平凡',
    type: 'NEGATIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const lapBad = horse.lapRating === 'C' || horse.lapRating === 'D' || horse.lapRating === 'LOW';
      const timeBad = horse.timeRating === 'C' || horse.timeRating === 'D' || horse.timeRating === 'LOW';
      const last = horse.pastRaces[0];
      
      // ラップ・時計ともに悪いのに好走 = 恵まれた可能性
      if (lapBad && timeBad && last && last.finishPosition <= 3) {
        return {
          reason: `ラップ・時計ともに平凡な好走、中身が伴っていない`,
          confidence: 'medium' as const,
          scoreAdjust: -4,
        };
      }
      return null;
    },
  },
  
  HIGH_POTENTIAL: {
    id: 'high_potential',
    name: 'ポテンシャル指数が高い',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      // ポテンシャル指数は最大10までの数値
      if (horse.potential !== null && horse.potential >= 8) {
        return {
          reason: `ポテンシャル指数${horse.potential.toFixed(1)}と高く、能力上位`,
          confidence: 'high' as const,
          scoreAdjust: 8,
        };
      }
      if (horse.potential !== null && horse.potential >= 6) {
        return {
          reason: `ポテンシャル指数${horse.potential.toFixed(1)}、まずまずの能力`,
          confidence: 'medium' as const,
          scoreAdjust: 5,
        };
      }
      if (horse.potential !== null && horse.potential >= 4) {
        return {
          reason: `ポテンシャル指数${horse.potential.toFixed(1)}、平均的`,
          confidence: 'low' as const,
          scoreAdjust: 2,
        };
      }
      return null;
    },
  },
  
  // === 巻き返し系 ===
  MAKIKAESHI_CANDIDATE: {
    id: 'makikaeshi_candidate',
    name: '巻き返し候補',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      if (horse.makikaeshi !== null && horse.makikaeshi >= 3.0) {
        return {
          reason: `巻き返し指数${horse.makikaeshi.toFixed(1)}と高く、前走は不利があった可能性大、巻き返しに期待`,
          confidence: 'high' as const,
          scoreAdjust: 8,
        };
      }
      if (horse.makikaeshi !== null && horse.makikaeshi >= 2.0) {
        return {
          reason: `巻き返し指数${horse.makikaeshi.toFixed(1)}、前走より上積み期待`,
          confidence: 'medium' as const,
          scoreAdjust: 5,
        };
      }
      return null;
    },
  },
  
  UNLUCKY_LAST_RUN: {
    id: 'unlucky_last_run',
    name: '前走不利',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const blessed = calculateBlessed(horse.makikaeshi, horse.blessedManual);
      const last = horse.pastRaces[0];
      
      if (blessed === 'unlucky' && last) {
        // 不利があったのに着差小
        const marginSec = parseMargin(last.margin);
        if (marginSec <= 1.0) {
          return {
            reason: '前走は不利がありながら着差は僅か、巻き返しに期待',
            confidence: 'high' as const,
            scoreAdjust: 7,
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
  
  // === 枠順・位置取り系 ===
  WAKU_CHANGE_POSITIVE: {
    id: 'waku_change_positive',
    name: '外枠替わりで好転',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last || !last.corner4) return null;
      
      // 前走が後方（60%以降）で今回外枠
      const wasBack = last.corner4 > last.totalHorses * 0.6;
      const nowOuter = horse.waku >= 6;
      
      if (wasBack && nowOuter) {
        return {
          reason: '前走は後方から、外枠替わりでスムーズに運べそう',
          confidence: 'medium' as const,
          scoreAdjust: 4,
        };
      }
      return null;
    },
  },
  
  FRONT_RUNNER: {
    id: 'front_runner',
    name: '先行力がある',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last || !last.corner4) return null;
      
      // 前走4角3番手以内
      const isFront = last.corner4 <= 3;
      
      if (isFront) {
        // スローペース予想なら加点
        if (settings.paceExpectation === 'slow') {
          return {
            reason: `先行力あり（前走4角${last.corner4}番手）、スローなら逃げ粘り期待`,
            confidence: 'high' as const,
            scoreAdjust: 6,
          };
        }
        return {
          reason: `先行力あり（前走4角${last.corner4}番手）、前で競馬できる`,
          confidence: 'medium' as const,
          scoreAdjust: 3,
        };
      }
      return null;
    },
  },
  
  CLOSER_ABILITY: {
    id: 'closer_ability',
    name: '差し脚が使える',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last || !last.corner4) return null;
      
      // 前走4角10番手以降で5着以内
      const wasBack = last.corner4 >= 10;
      const goodFinish = last.finishPosition <= 5;
      
      if (wasBack && goodFinish) {
        // ハイペース予想なら加点
        if (settings.paceExpectation === 'fast') {
          return {
            reason: `差し脚あり（4角${last.corner4}番手→${last.finishPosition}着）、ハイペースで浮上`,
            confidence: 'high' as const,
            scoreAdjust: 6,
          };
        }
        return {
          reason: `差し脚あり（4角${last.corner4}番手→${last.finishPosition}着）、展開一つで台頭`,
          confidence: 'medium' as const,
          scoreAdjust: 4,
        };
      }
      return null;
    },
  },
  
  // === 人気薄での好走（穴候補） ===
  UPSET_CANDIDATE: {
    id: 'upset_candidate',
    name: '人気薄でも実力あり',
    type: 'ANA' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      // 人気薄（6番人気以下）で5着以内
      if (last.popularity >= 6 && last.finishPosition <= 5) {
        return {
          reason: `前走${last.popularity}番人気で${last.finishPosition}着と好走、人気以上の実力`,
          confidence: 'medium' as const,
          scoreAdjust: 5,
        };
      }
      return null;
    },
  },
  
  // ============================================
  // 評価DOWN系（NEGATIVE）
  // ============================================
  
  // === 着順・成績悪化系 ===
  DECLINING_FORM: {
    id: 'declining_form',
    name: '着順悪化',
    type: 'NEGATIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      if (horse.pastRaces.length < 2) return null;
      
      const last = horse.pastRaces[0];
      const prev = horse.pastRaces[1];
      
      // 着順が3つ以上悪化
      if (last.finishPosition > prev.finishPosition + 2) {
        return {
          reason: `着順が${prev.finishPosition}着→${last.finishPosition}着と悪化、下降気配`,
          confidence: 'medium' as const,
          scoreAdjust: -4,
        };
      }
      return null;
    },
  },
  
  CONSECUTIVE_LOSSES: {
    id: 'consecutive_losses',
    name: '連続凡走',
    type: 'NEGATIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const recent3 = horse.pastRaces.slice(0, 3);
      if (recent3.length < 3) return null;
      
      const allBad = recent3.every(r => r.finishPosition >= 6);
      
      if (allBad) {
        return {
          reason: '近3走すべて6着以下、調子が上がらない',
          confidence: 'high' as const,
          scoreAdjust: -6,
        };
      }
      return null;
    },
  },
  
  LARGE_MARGIN_LOSS: {
    id: 'large_margin_loss',
    name: '大差負け',
    type: 'NEGATIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      const marginSec = parseMargin(last.margin);
      
      // 着差2秒以上
      if (marginSec >= 2.0) {
        return {
          reason: `前走着差${last.margin}秒と大敗、力負けの可能性`,
          confidence: 'high' as const,
          scoreAdjust: -6,
        };
      }
      return null;
    },
  },
  
  // === 低レベル戦での凡走 → マイナス評価 ===
  LOW_LEVEL_RACE_BAD: {
    id: 'low_level_race_bad',
    name: '低レベル戦での凡走',
    type: 'NEGATIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      const isLowLevel = last.raceLevel === 'C' || last.raceLevel === 'D';
      const badFinish = last.finishPosition >= 6;
      
      if (isLowLevel && badFinish) {
        return {
          reason: `メンバーレベル${last.raceLevel}のところで${last.finishPosition}着と凡走、マイナス評価`,
          confidence: 'high' as const,
          scoreAdjust: -5,
        };
      }
      return null;
    },
  },
  
  // === 恵まれ系 ===
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
            scoreAdjust: -6,
          };
        }
      }
      return null;
    },
  },
  
  // === 人気と実力の乖離 ===
  OVERRATED_POPULAR: {
    id: 'overrated_popular',
    name: '人気先行（過大評価）',
    type: 'NEGATIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      const lapBad = horse.lapRating === 'C' || horse.lapRating === 'D' || horse.lapRating === 'LOW';
      const timeBad = horse.timeRating === 'C' || horse.timeRating === 'D' || horse.timeRating === 'LOW';
      const isLowLevel = last.raceLevel === 'C' || last.raceLevel === 'D';
      const popular = horse.estimatedPopularity <= 3;
      
      // 低レベル戦 + ラップ/時計悪い + 人気 = 過大評価
      if ((lapBad || timeBad || isLowLevel) && popular && last.finishPosition <= 3) {
        return {
          reason: '前走好走も中身が伴わず人気、過大評価の可能性',
          confidence: 'medium' as const,
          scoreAdjust: -5,
        };
      }
      return null;
    },
  },
  
  LOW_POTENTIAL_POPULAR: {
    id: 'low_potential_popular',
    name: '低ポテンシャルで人気',
    type: 'NEGATIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      // ポテンシャル指数は最大10までの数値
      const lowPotential = horse.potential !== null && horse.potential < 3;
      const popular = horse.estimatedPopularity <= 3;
      
      if (lowPotential && popular) {
        return {
          reason: `ポテンシャル指数${horse.potential?.toFixed(1)}と低いが人気、妙味なし`,
          confidence: 'medium' as const,
          scoreAdjust: -4,
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
      if (!last || !last.corner4) return null;
      
      const isFront = last.corner4 <= 3;
      
      if (isFront) {
        return {
          reason: '前有利馬場で先行脚質、展開も向きそう',
          confidence: 'high' as const,
          scoreAdjust: 6,
        };
      }
      return null;
    },
  },
  
  TRACK_BIAS_CLOSER: {
    id: 'track_bias_closer',
    name: '差し有利馬場×差し馬',
    type: 'POSITIVE' as EvaluationType,
    check: (horse: HorseAnalysisData, settings: RaceConditionSettings) => {
      if (settings.trackBias !== 'closer') return null;
      
      const last = horse.pastRaces[0];
      if (!last || !last.corner4) return null;
      
      const isCloser = last.corner4 >= 8;
      
      if (isCloser) {
        return {
          reason: '差し有利馬場で差し脚質、展開向きそう',
          confidence: 'high' as const,
          scoreAdjust: 6,
        };
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
      if (!last || !last.corner4) return null;
      
      const isFront = last.corner4 <= 3;
      
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
      if (!last || !last.corner4) return null;
      
      const isCloser = last.corner4 >= 8;
      
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
  
  // ============================================
  // 度外視系（DISMISS）
  // ============================================
  
  DISMISS_DIFFERENT_CONDITION: {
    id: 'dismiss_different_condition',
    name: '条件替わりで度外視',
    type: 'DISMISS' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      const last2 = horse.pastRaces[1];
      if (!last || !last2) return null;
      
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
  
  DISMISS_SURFACE_CHANGE: {
    id: 'dismiss_surface_change',
    name: '芝ダ替わりで度外視',
    type: 'DISMISS' as EvaluationType,
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      const last2 = horse.pastRaces[1];
      if (!last || !last2) return null;
      
      // 芝⇔ダート替わり
      if (last.surface !== last2.surface) {
        return {
          reason: `前走は${last.surface === '芝' ? '芝' : 'ダート'}で参考外`,
          confidence: 'medium' as const,
          scoreAdjust: 0,
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
    try {
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
    } catch (e) {
      // ルール適用エラーは無視
      console.error(`[Rules] Error applying rule ${rule.id}:`, e);
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
  if (score >= 60 && popularity >= 6) return '▲';
  
  // 高スコア → 本命候補
  if (score >= 70) return '◎';
  if (score >= 60) return '○';
  if (score >= 50) return '△';
  
  // 低スコア＋高人気 → 消し
  if (score < 45 && popularity <= 3) return '×';
  
  return '-';
}
