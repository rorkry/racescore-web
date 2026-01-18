/**
 * レースレベル分析モジュール
 * 
 * 出走馬の次走成績からレースのレベルを判定
 * 
 * ## 好走率によるクラス分け（次走出走馬の好走率=3着以内率）
 * - S: 80%以上
 * - A: 60%以上
 * - B: 40%以上
 * - C: 30%以上
 * - D: 20%以上
 * - LOW: 20%未満（低レベル戦）
 * 
 * ## +の付与（好走率とは独立、勝ち上がり頭数で決定）
 * - +: 勝ち上がり2頭以上
 * - ++: 勝ち上がり3頭以上
 * - +++: 勝ち上がり4頭以上
 * 
 * ## 特殊ケース
 * - 次走出走が1頭のみ → UNKNOWN
 * - 次走出走が1頭のみ + その1頭が好走or勝ち上がり → UNKNOWN+（ハイレベルの可能性）
 */

// ========================================
// 型定義
// ========================================

export interface NextRaceResult {
  horseName: string;
  finishPosition: number;  // 着順
  isFirstRun: boolean;     // 次の1走目かどうか
  raceDate: string;        // レース日付
  className: string;       // クラス名
}

export interface RaceLevelInput {
  raceId: string;          // レースID（馬番無し）
  raceDate: string;        // レース日付
  place: string;           // 競馬場
  className: string;       // クラス名
  distance: string;        // 距離
  trackCondition: string;  // 馬場状態
  finishTime?: number;     // 走破タイム（秒）
  lapString?: string;      // ラップタイム
}

export interface RaceLevelResult {
  // レベル判定
  level: 'S' | 'A' | 'B' | 'C' | 'D' | 'LOW' | 'UNKNOWN';
  levelLabel: string;      // 表示用ラベル（例: "S++", "A+", "UNKNOWN+"）
  
  // 詳細データ
  totalHorsesRun: number;  // 次走に出走した馬の総数（実頭数）
  totalRuns: number;       // 次走以降の出走回数（延べ）
  goodRunCount: number;    // 好走数（3着以内）
  firstRunGoodCount: number; // 次1走目での好走数
  winCount: number;        // 勝ち上がり数（1着）
  
  // 好走率
  goodRunRate: number;     // 好走率（%）
  firstRunGoodRate: number; // 次1走目好走率（%）
  
  // コメント用データ
  commentData: {
    totalHorses: number;   // 「5頭走って」の数
    goodRuns: number;      // 「3頭好走」の数
    winners: number;       // 勝ち上がり数
    details: string[];     // 詳細コメント配列
  };
  
  // 表示用コメント
  displayComment: string;  // 馬柱用短縮コメント
  aiComment: string;       // おれAI用詳細コメント
  
  // 追加情報
  plusCount: number;       // +の数（0, 1, 2, 3）
  plusLabel: string;       // '+', '++', '+++'
  isUnknownWithPotential: boolean;  // UNKNOWN+かどうか
  isDataInsufficient: boolean;      // データ不足フラグ
}

// ========================================
// 定数
// ========================================

const GOOD_RUN_THRESHOLD = 3;  // 好走 = 3着以内

// 好走率による判定閾値
const RATE_THRESHOLDS = {
  S: 80,   // 80%以上 → S
  A: 60,   // 60%以上 → A
  B: 40,   // 40%以上 → B
  C: 30,   // 30%以上 → C
  D: 20,   // 20%以上 → D
  // 20%未満 → LOW（低レベル戦）
};

// 勝ち上がり数による + 付与
const WINNERS_THRESHOLDS = {
  PLUS: 2,       // 2頭以上で +
  PLUS_PLUS: 3,  // 3頭以上で ++
  PLUS_PLUS_PLUS: 4,  // 4頭以上で +++
};

// 母数の閾値
const MIN_SAMPLE_FOR_JUDGMENT = 2;  // レベル判定に必要な最小母数

// ========================================
// メイン判定関数
// ========================================

/**
 * レースレベルを判定
 * 
 * @param nextRaceResults - 出走馬の次走以降の成績リスト
 * @param raceInput - レース情報（オプション）
 */
export function analyzeRaceLevel(
  nextRaceResults: NextRaceResult[],
  raceInput?: RaceLevelInput
): RaceLevelResult {
  
  // 初期値
  const result: RaceLevelResult = {
    level: 'UNKNOWN',
    levelLabel: 'UNKNOWN',
    totalHorsesRun: 0,
    totalRuns: 0,
    goodRunCount: 0,
    firstRunGoodCount: 0,
    winCount: 0,
    goodRunRate: 0,
    firstRunGoodRate: 0,
    commentData: {
      totalHorses: 0,
      goodRuns: 0,
      winners: 0,
      details: [],
    },
    displayComment: '',
    aiComment: '',
    plusCount: 0,
    plusLabel: '',
    isUnknownWithPotential: false,
    isDataInsufficient: false,
  };
  
  // データなし
  if (nextRaceResults.length === 0) {
    result.isDataInsufficient = true;
    result.displayComment = 'データなし';
    result.aiComment = 'まだ次走データがないため判定不可';
    return result;
  }
  
  // --- 集計 ---
  
  // ユニークな馬名を取得（実頭数）
  const uniqueHorses = new Set(nextRaceResults.map(r => r.horseName));
  result.totalHorsesRun = uniqueHorses.size;
  result.totalRuns = nextRaceResults.length;
  
  // 次1走目のみをフィルタ（レベル判定に使用）
  const firstRuns = nextRaceResults.filter(r => r.isFirstRun);
  const firstRunCount = firstRuns.length;
  
  // 次1走目での好走（3着以内）
  result.firstRunGoodCount = firstRuns.filter(r => r.finishPosition <= GOOD_RUN_THRESHOLD).length;
  
  // 全体の好走数（参考値）
  result.goodRunCount = nextRaceResults.filter(r => r.finishPosition <= GOOD_RUN_THRESHOLD).length;
  
  // 勝ち上がり（1着）をカウント - 次1走目のみ
  const firstRunWinners = firstRuns.filter(r => r.finishPosition === 1);
  result.winCount = firstRunWinners.length;
  
  // --- 好走率計算 ---
  
  // 次1走目の好走率（これをメインで使用）
  if (firstRunCount > 0) {
    result.firstRunGoodRate = (result.firstRunGoodCount / firstRunCount) * 100;
  }
  
  // 全体の好走率（参考値）
  if (result.totalRuns > 0) {
    result.goodRunRate = (result.goodRunCount / result.totalRuns) * 100;
  }
  
  // --- コメントデータ設定 ---
  
  result.commentData = {
    totalHorses: firstRunCount,
    goodRuns: result.firstRunGoodCount,
    winners: result.winCount,
    details: [],
  };
  
  // --- +の判定（好走率とは独立、勝ち上がり頭数で決定）---
  
  if (result.winCount >= WINNERS_THRESHOLDS.PLUS_PLUS_PLUS) {
    result.plusCount = 3;
    result.plusLabel = '+++';
  } else if (result.winCount >= WINNERS_THRESHOLDS.PLUS_PLUS) {
    result.plusCount = 2;
    result.plusLabel = '++';
  } else if (result.winCount >= WINNERS_THRESHOLDS.PLUS) {
    result.plusCount = 1;
    result.plusLabel = '+';
  }
  
  // --- レベル判定 ---
  
  const rateForJudgment = result.firstRunGoodRate;
  
  // 母数1頭のみの特殊処理
  if (firstRunCount === 1) {
    result.isDataInsufficient = true;
    result.level = 'UNKNOWN';
    
    // 1頭が好走 or 勝ち上がり → UNKNOWN+（ハイレベルの可能性）
    if (result.firstRunGoodCount >= 1) {
      result.isUnknownWithPotential = true;
      result.levelLabel = 'UNKNOWN+';
      const winnerInfo = result.winCount >= 1 ? '勝ち上がり' : '好走（3着以内）';
      result.commentData.details.push(`まだ1頭のみ出走だが${winnerInfo}。ハイレベルだった可能性あり`);
    } else {
      result.levelLabel = 'UNKNOWN';
      result.commentData.details.push('出走1頭のみで判定不可');
    }
  }
  // 母数2頭以上で判定可能
  else if (firstRunCount >= MIN_SAMPLE_FOR_JUDGMENT) {
    // S判定: 80%以上
    if (rateForJudgment >= RATE_THRESHOLDS.S) {
      result.level = 'S';
      result.levelLabel = 'S' + result.plusLabel;
      result.commentData.details.push(`好走率${Math.round(rateForJudgment)}%の超ハイレベル戦`);
    }
    // A判定: 60%以上
    else if (rateForJudgment >= RATE_THRESHOLDS.A) {
      result.level = 'A';
      result.levelLabel = 'A' + result.plusLabel;
      result.commentData.details.push(`好走率${Math.round(rateForJudgment)}%のハイレベル戦`);
    }
    // B判定: 40%以上
    else if (rateForJudgment >= RATE_THRESHOLDS.B) {
      result.level = 'B';
      result.levelLabel = 'B' + result.plusLabel;
      result.commentData.details.push(`好走率${Math.round(rateForJudgment)}%でやや高いレベル`);
    }
    // C判定: 30%以上
    else if (rateForJudgment >= RATE_THRESHOLDS.C) {
      result.level = 'C';
      result.levelLabel = 'C' + result.plusLabel;
      result.commentData.details.push(`好走率${Math.round(rateForJudgment)}%で標準レベル`);
    }
    // D判定: 20%以上
    else if (rateForJudgment >= RATE_THRESHOLDS.D) {
      result.level = 'D';
      result.levelLabel = 'D' + result.plusLabel;
      result.commentData.details.push(`好走率${Math.round(rateForJudgment)}%でやや低いレベル`);
    }
    // LOW判定: 20%未満
    else {
      result.level = 'LOW';
      result.levelLabel = 'LOW';
      result.commentData.details.push(`好走率${Math.round(rateForJudgment)}%の低レベル戦`);
    }
  }
  // 母数0頭（ありえないが念のため）
  else {
    result.isDataInsufficient = true;
    result.level = 'UNKNOWN';
    result.levelLabel = 'UNKNOWN';
  }
  
  // --- コメント生成 ---
  
  result.displayComment = generateDisplayComment(result);
  result.aiComment = generateAIComment(result);
  
  return result;
}

// ========================================
// コメント生成
// ========================================

/**
 * 馬柱用の短縮コメント
 */
function generateDisplayComment(result: RaceLevelResult): string {
  const { level, levelLabel, winCount, isUnknownWithPotential, isDataInsufficient } = result;
  
  if (level === 'UNKNOWN') {
    if (isUnknownWithPotential) {
      return 'UNKNOWN+（ハイレベル可能性）';
    }
    return isDataInsufficient ? 'データ不足' : 'UNKNOWN';
  }
  
  if (level === 'LOW') {
    return '低レベル';
  }
  
  // 勝ち上がりがあれば追記
  if (winCount >= 1) {
    return `${levelLabel}（${winCount}頭勝ち上がり）`;
  }
  
  return levelLabel;
}

/**
 * おれAI用の詳細コメント
 * 「5頭走って3頭好走」形式
 */
function generateAIComment(result: RaceLevelResult): string {
  const { level, levelLabel, commentData, winCount, plusCount, isUnknownWithPotential, isDataInsufficient } = result;
  const { totalHorses, goodRuns, details } = commentData;
  
  // UNKNOWN判定
  if (level === 'UNKNOWN') {
    if (isUnknownWithPotential) {
      return `まだ次走出走は1頭のみだが、その馬が${winCount >= 1 ? '勝ち上がり' : '好走'}。ハイレベルだった可能性あり`;
    }
    return 'まだ次走データが不足しており判定不可';
  }
  
  const parts: string[] = [];
  
  // 基本情報: 「5頭走って3頭好走」形式
  if (totalHorses > 0) {
    const runText = `${totalHorses}頭が次走出走し`;
    const goodText = goodRuns > 0 ? `${goodRuns}頭が好走（3着以内）` : '好走馬なし';
    parts.push(`${runText}${goodText}`);
  }
  
  // 勝ち上がり情報
  if (winCount > 0) {
    parts.push(`${winCount}頭が勝ち上がり`);
  }
  
  // レベル判定結果
  switch (level) {
    case 'S':
      parts.push('超ハイレベル戦');
      break;
    case 'A':
      parts.push('ハイレベル戦');
      break;
    case 'B':
      parts.push('やや高いレベル');
      break;
    case 'C':
      parts.push('標準的なレベル');
      break;
    case 'D':
      parts.push('やや低いレベル');
      break;
    case 'LOW':
      parts.push('低レベル戦');
      break;
  }
  
  // +の評価コメント
  if (plusCount >= 3) {
    parts.push('勝ち上がり多数で非常に高評価');
  } else if (plusCount >= 2) {
    parts.push('勝ち上がり多く高評価');
  } else if (plusCount >= 1) {
    parts.push('勝ち上がり複数で評価プラス');
  }
  
  // 詳細を追加
  if (details.length > 0 && !parts.some(p => details.some(d => p.includes(d)))) {
    parts.push(...details);
  }
  
  return parts.join('。');
}

// ========================================
// ユーティリティ
// ========================================

/**
 * レースIDから次走成績を取得するためのクエリを生成
 * （実際のDB操作はAPI側で行う）
 */
export function buildNextRaceQuery(raceId: string, targetHorses: string[]): string {
  // 馬名リストをIN句用に整形
  const horseNames = targetHorses.map(h => `'${h.replace(/'/g, "''")}'`).join(',');
  
  return `
    SELECT 
      horse_name,
      finish_position,
      date,
      class_name,
      race_id as race_id
    FROM umadata
    WHERE horse_name IN (${horseNames})
      AND date > (SELECT date FROM umadata WHERE race_id = '${raceId}' LIMIT 1)
    ORDER BY horse_name, date ASC
  `;
}

/**
 * レベルの色を取得（UI用）
 */
export function getLevelColor(level: RaceLevelResult['level']): string {
  switch (level) {
    case 'S':
      return '#FFD700';  // ゴールド
    case 'A':
      return '#FFA500';  // オレンジ
    case 'B':
      return '#4CAF50';  // グリーン
    case 'C':
      return '#2196F3';  // ブルー
    case 'D':
      return '#9E9E9E';  // グレー
    case 'LOW':
      return '#F44336';  // レッド
    case 'UNKNOWN':
      return '#BDBDBD';  // ライトグレー
    default:
      return '#9E9E9E';
  }
}

/**
 * レベルのバッジスタイルを取得（UI用）
 */
export function getLevelBadgeStyle(level: RaceLevelResult['level']): {
  bg: string;
  text: string;
  border: string;
} {
  switch (level) {
    case 'S':
      return { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-400' };
    case 'A':
      return { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-400' };
    case 'B':
      return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-400' };
    case 'C':
      return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-400' };
    case 'D':
      return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' };
    case 'LOW':
      return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-400' };
    case 'UNKNOWN':
      return { bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' };
  }
}
