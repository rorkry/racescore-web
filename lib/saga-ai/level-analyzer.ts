/**
 * レースレベル分析モジュール
 * 
 * 出走馬の次走成績からレースのレベルを判定
 * - S+, S, A, B, C, 低レベル, 判定保留
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
  level: 'S+' | 'S' | 'A' | 'B' | 'C' | 'LOW' | 'PENDING';
  levelLabel: string;      // 表示用ラベル（例: "S+", "ハイレベル", "低レベル"）
  
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
  hasPlus: boolean;        // + 表記があるか（勝ち上がり2頭以上）
  isDataInsufficient: boolean;  // データ不足フラグ
  lapLevelBoost: boolean;  // ラップ/時計が優秀でレベルを推論したか
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
  LOW: 20, // 20%未満 & 母数5以上 → 低レベル
};

// 勝ち上がり数による + 付与
const WINNERS_FOR_PLUS = 2;  // 2頭以上で +

// 母数の閾値
const MIN_SAMPLE_FOR_LOW_LEVEL = 5;  // 低レベル判定に必要な最小母数
const MIN_SAMPLE_FOR_CONFIDENT = 3;  // 信頼できる判定に必要な最小母数

// ========================================
// メイン判定関数
// ========================================

/**
 * レースレベルを判定
 * 
 * @param nextRaceResults - 出走馬の次走以降の成績リスト
 * @param raceInput - レース情報（時計/ラップ判定用）
 */
export function analyzeRaceLevel(
  nextRaceResults: NextRaceResult[],
  raceInput?: RaceLevelInput
): RaceLevelResult {
  
  // 初期値
  const result: RaceLevelResult = {
    level: 'PENDING',
    levelLabel: '判定保留',
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
    hasPlus: false,
    isDataInsufficient: false,
    lapLevelBoost: false,
  };
  
  if (nextRaceResults.length === 0) {
    result.isDataInsufficient = true;
    result.displayComment = 'データなし';
    result.aiComment = 'まだ次走データがないため判定保留';
    return result;
  }
  
  // --- 集計 ---
  
  // ユニークな馬名を取得（実頭数）
  const uniqueHorses = new Set(nextRaceResults.map(r => r.horseName));
  result.totalHorsesRun = uniqueHorses.size;
  result.totalRuns = nextRaceResults.length;
  
  // 好走（3着以内）をカウント
  result.goodRunCount = nextRaceResults.filter(r => r.finishPosition <= GOOD_RUN_THRESHOLD).length;
  
  // 次1走目での好走
  const firstRuns = nextRaceResults.filter(r => r.isFirstRun);
  result.firstRunGoodCount = firstRuns.filter(r => r.finishPosition <= GOOD_RUN_THRESHOLD).length;
  
  // 勝ち上がり（1着）をカウント
  const winners = nextRaceResults.filter(r => r.finishPosition === 1);
  const uniqueWinners = new Set(winners.map(r => r.horseName));
  result.winCount = uniqueWinners.size;
  
  // --- 好走率計算 ---
  
  // 次1走目の好走率を最優先で使用
  const firstRunCount = firstRuns.length;
  if (firstRunCount > 0) {
    result.firstRunGoodRate = (result.firstRunGoodCount / firstRunCount) * 100;
  }
  
  // 全体の好走率（参考値）
  if (result.totalRuns > 0) {
    result.goodRunRate = (result.goodRunCount / result.totalRuns) * 100;
  }
  
  // --- コメントデータ設定 ---
  
  result.commentData = {
    totalHorses: firstRunCount > 0 ? firstRunCount : result.totalHorsesRun,
    goodRuns: firstRunCount > 0 ? result.firstRunGoodCount : result.goodRunCount,
    winners: result.winCount,
    details: [],
  };
  
  // --- レベル判定 ---
  
  // 判定に使う好走率（次1走目を優先）
  const rateForJudgment = firstRunCount >= MIN_SAMPLE_FOR_CONFIDENT 
    ? result.firstRunGoodRate 
    : result.goodRunRate;
  
  const sampleSize = firstRunCount >= MIN_SAMPLE_FOR_CONFIDENT
    ? firstRunCount
    : result.totalHorsesRun;
  
  // 母数不足チェック
  if (sampleSize < MIN_SAMPLE_FOR_CONFIDENT) {
    result.isDataInsufficient = true;
    
    // 母数1でも1好走なら推論
    if (result.goodRunCount >= 1 || result.winCount >= 1) {
      // ラップ/時計が優秀ならハイレベル推論
      if (raceInput?.lapString) {
        result.lapLevelBoost = true;
        result.level = 'B';
        result.levelLabel = 'B';
        result.commentData.details.push('1頭がすぐに勝ち上がっておりハイレベルの可能性');
      } else {
        result.level = 'PENDING';
        result.levelLabel = '判定保留';
        result.commentData.details.push('データ不足だが好走馬あり');
      }
    } else {
      result.level = 'PENDING';
      result.levelLabel = '判定保留';
    }
  }
  // 低レベル判定
  else if (sampleSize >= MIN_SAMPLE_FOR_LOW_LEVEL && rateForJudgment < RATE_THRESHOLDS.LOW) {
    // 上位馬（勝ち馬）が多く勝ち上がっている場合はCにする
    if (result.winCount >= 2) {
      result.level = 'C';
      result.levelLabel = 'C';
      result.commentData.details.push('好走率は低いが勝ち上がり馬は複数');
    } else {
      result.level = 'LOW';
      result.levelLabel = '低レベル';
      result.commentData.details.push('好走馬が少なく低レベル戦');
    }
  }
  // S判定
  else if (rateForJudgment >= RATE_THRESHOLDS.S) {
    result.level = result.winCount >= WINNERS_FOR_PLUS ? 'S+' : 'S';
    result.levelLabel = result.level;
    result.hasPlus = result.winCount >= WINNERS_FOR_PLUS;
    result.commentData.details.push(`好走率${Math.round(rateForJudgment)}%の超ハイレベル戦`);
  }
  // A判定
  else if (rateForJudgment >= RATE_THRESHOLDS.A) {
    result.level = result.winCount >= WINNERS_FOR_PLUS ? 'A' : 'A';  // Aに+は付けない仕様
    result.levelLabel = result.winCount >= WINNERS_FOR_PLUS ? 'A+' : 'A';
    result.hasPlus = result.winCount >= WINNERS_FOR_PLUS;
    result.commentData.details.push(`好走率${Math.round(rateForJudgment)}%のハイレベル戦`);
  }
  // B判定
  else if (rateForJudgment >= RATE_THRESHOLDS.B) {
    result.level = 'B';
    result.levelLabel = result.winCount >= WINNERS_FOR_PLUS ? 'B+' : 'B';
    result.hasPlus = result.winCount >= WINNERS_FOR_PLUS;
    result.commentData.details.push(`好走率${Math.round(rateForJudgment)}%でやや高いレベル`);
  }
  // C判定（どれにも当てはまらない）
  else {
    result.level = 'C';
    result.levelLabel = 'C';
    result.commentData.details.push('標準的なレベル');
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
  const { level, levelLabel, winCount, commentData } = result;
  
  if (level === 'PENDING') {
    return result.isDataInsufficient ? 'データ不足' : '判定保留';
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
  const { level, commentData, winCount, isDataInsufficient } = result;
  const { totalHorses, goodRuns, details } = commentData;
  
  if (isDataInsufficient && level === 'PENDING') {
    return 'まだ次走データが不足しており判定保留';
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
    case 'S+':
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
    case 'LOW':
      parts.push('低レベル戦');
      break;
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
      race_id_new_no_horse_num as race_id
    FROM umadata
    WHERE horse_name IN (${horseNames})
      AND date > (SELECT date FROM umadata WHERE race_id_new_no_horse_num = '${raceId}' LIMIT 1)
    ORDER BY horse_name, date ASC
  `;
}

/**
 * レベルの色を取得（UI用）
 */
export function getLevelColor(level: RaceLevelResult['level']): string {
  switch (level) {
    case 'S+':
      return '#FFD700';  // ゴールド
    case 'S':
      return '#FFA500';  // オレンジ
    case 'A':
      return '#4CAF50';  // グリーン
    case 'B':
      return '#2196F3';  // ブルー
    case 'C':
      return '#9E9E9E';  // グレー
    case 'LOW':
      return '#F44336';  // レッド
    case 'PENDING':
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
    case 'S+':
      return { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-400' };
    case 'S':
      return { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-400' };
    case 'A':
      return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-400' };
    case 'B':
      return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-400' };
    case 'C':
      return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' };
    case 'LOW':
      return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-400' };
    case 'PENDING':
      return { bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' };
  }
}
