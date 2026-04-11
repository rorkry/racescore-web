/**
 * 俺AI - SAGA Brain
 * 
 * 過去の予想データとコース知識を基に、レース分析コメントを生成
 */

import { getCourseInfo, getDistanceNotes, findSimilarCourses, COURSE_MASTER } from './course-master';
import { getCourseInfo as getDetailedCourseInfo, getCourseCharacteristicsForCondition } from '@/lib/course-characteristics';
import { analyzePastRaceLap, LapAnalysisResult, compareWithHistorical, HistoricalLapRecord, parseLapTimes, calculateLapData } from './lap-analyzer';

// ========================================
// 型定義
// ========================================

export interface HorseAnalysisInput {
  horseName: string;
  horseNumber: number;
  waku: number;

  // 今回のレース情報
  raceDate: string;      // YYYY.MM.DD or YYYY-MM-DD
  place: string;
  surface: '芝' | 'ダ';
  distance: number;
  trackCondition?: '良' | '稍' | '重' | '不'; // 馬場状態

  // 馬の基本情報
  gender?: '牡' | '牝' | 'セ';  // 性別

  // レース条件
  isFilliesOnlyRace?: boolean;  // 牝馬限定戦かどうか
  raceAgeCondition?: string;    // 年齢条件（'2歳', '3歳', '3歳以上', '4歳以上'）
  isAgeRestricted?: boolean;    // 世代限定戦かどうか（2歳限定、3歳限定）

  // 過去走情報
  pastRaces: PastRaceInfo[];

  // 競うスコア関連
  kisoScore?: number;
  scoreDeviation?: number;

  // 指数データ（メンバー内での順位も含む）
  indices?: {
    T2F?: number;          // 前半2F速度（今回）
    L4F?: number;          // 後半4F速度（今回）
    potential?: number;    // ポテンシャル
    makikaeshi?: number;   // 巻き返し指数
  };
  // メンバー内順位
  memberRanks?: {
    T2F?: number;          // T2Fのメンバー内順位
    L4F?: number;          // L4Fのメンバー内順位
    kisoScore?: number;    // 競うスコアのメンバー内順位
  };
  // メンバー内パーセンタイル（今回距離±200mの過去走で比較）
  memberPercentiles?: {
    T2F?: number;          // T2Fのパーセンタイル（低いほど上位）
    L4F?: number;          // L4Fのパーセンタイル（低いほど上位）
    T2FDataCount?: number; // T2F比較対象データ数
    L4FDataCount?: number; // L4F比較対象データ数
  };
  // 今回距離±200mの過去走数
  relevantRaceCount?: number;

  // 時計比較用データ（API側で取得）- 過去走ごとの比較データ
  timeComparisonData?: PastRaceTimeComparison[];
}

export interface PastRaceInfo {
  date: string;
  place: string;
  surface: '芝' | 'ダ';
  distance: number;
  finishPosition: number;
  popularity: number;
  margin?: string;
  runningStyle?: string;
  corner2?: number;
  corner3?: number;
  corner4?: number;
  // 指数データ
  T2F?: number;
  L4F?: number;
  potential?: number;
  makikaeshi?: number;
  // 時計比較用
  finishTime?: number;       // 走破時計（1345 = 1分34秒5）
  className?: string;        // クラス名（1勝、2勝、G1など）
  trackCondition?: string;   // 馬場状態（良、稍、重、不）
  horseAge?: number;         // 年齢
  // ラップ分析用
  lapString?: string;        // ラップタイム（"12.3-10.5-11.8..."）
  corner4Wide?: number;      // 4角位置（内外: 0=最内, 4=大外）
  totalHorses?: number;      // 出走頭数
  ownLast3F?: number;        // 自身の上がり3F
  // 歴代比較用データ（API側で取得）
  historicalLapData?: HistoricalLapRecord[];
  // レースレベル判定（API側で取得）
  raceLevel?: {
    level: 'S' | 'A' | 'B' | 'C' | 'D' | 'LOW' | 'UNKNOWN';  // 基本レベル
    levelLabel: string;   // "S+++", "A+", "C", "UNKNOWN+" など
    totalHorsesRun: number;
    goodRunCount: number;       // 全体の好走数（延べ）- 参考値
    firstRunGoodCount: number;  // 次1走目の好走数 - メイン表示用
    winCount: number;
    plusCount: number;    // +の数（0, 1, 2, 3）
    aiComment: string;
  };
  // レースID（レースレベル取得用）
  raceId?: string;
  // 牝馬限定戦判定用
  isMixedGenderRace?: boolean;  // 牡馬混合戦かどうか（牝馬限定戦ではない）
  // 年齢制限判定用
  isAgeRestrictedRace?: boolean;  // 世代限定戦かどうか（2歳限定、3歳限定）
  raceAgeCondition?: string;      // レースの年齢条件
}

// 時計比較用のレース情報
export interface TimeComparisonRace {
  date: string;
  place: string;
  distance: string;        // "芝1600"形式
  className: string;       // クラス名
  classLabel?: string;     // クラス表示ラベル
  finishTime: number;      // 勝ち時計
  winTime?: number;        // 勝ち時計（エイリアス）
  trackCondition: string;  // 馬場状態
  horseName: string;       // 勝ち馬名
  horseAge: number;        // 勝ち馬年齢
  isAgeRestricted: boolean; // 世代限定戦かどうか
  raceAgeCondition?: string; // 年齢条件（'2歳', '3歳', '3歳以上'など）
  raceNumber?: string;     // レース番号（○R表示用）
}

// 過去走ごとの時計比較データ
export interface PastRaceTimeComparison {
  pastRaceIndex: number;   // 何走前か（0=前走, 1=2走前, ...）
  pastRaceDate: string;
  pastRaceClass: string;
  pastRaceTime: number;
  ownTime?: number;        // 自身の時計（秒）- pastRaceTimeのエイリアス
  pastRaceCondition: string;
  comparisonRaces: TimeComparisonRace[];
  comparisons?: TimeComparisonRace[];  // comparisonRacesのエイリアス
}

// 時計比較結果
export interface TimeComparisonResult {
  hasComparison: boolean;
  pastRaceDate: string;
  pastRaceClass: string;
  pastRaceTime: number;
  comparisonRaceDate: string;
  comparisonRaceClass: string;
  comparisonRaceTime: number;
  timeDifference: number;    // 秒差（小さいほど好成績）
  trackConditionDiff: number; // 馬場差（0=同じ、1=1段階差）
  isAgeRestricted: boolean;  // 比較対象が世代限定戦か
  comment: string;           // 分析コメント
  scoreBonus: number;        // スコア加点
}

export interface SagaAnalysis {
  horseName: string;
  horseNumber: number;
  score: number;           // 0-100 の期待度スコア
  kisoScore?: number;      // 競うスコア（表示用）
  tags: string[];          // タグ（休み明け、平坦巧者など）
  comments: string[];      // SAGA風コメント
  warnings: string[];      // 警告
  // 整理されたサマリー（デバッグ用）
  abilitySummary?: string;   // 能力・指数サマリー（1行目）
  contextSummary?: string;   // コース・前走条件サマリー（2行目以降）
  timeEvaluation?: string;   // タイム評価（【タイム】セクション）
  lapEvaluation?: string;    // ラップ評価（【ラップ】セクション）
  courseMatch: {           // コース適性
    rating: 'S' | 'A' | 'B' | 'C' | 'D';
    reason: string;
  };
  rotationNote: string | null;  // ローテーション分析
  timeComparisonNote: string | null;  // 時計比較分析
  raceLevelNote: string | null;  // レースレベル分析（「5頭走って3頭好走」形式）
  // デバッグ情報（開発用）
  debugInfo?: {
    t2f?: {
      value: number;
      rank: number;
      total: number;
      percentile: number;
    };
    l4f?: {
      value: number;
      rank: number;
      total: number;
      percentile: number;
    };
    relevantRaceCount?: number;
    // 前走条件情報
    lastRaceCondition?: {
      place: string;
      surface: string;
      distance: number;
      gateAdvantage: string;
      wasUnfavorable: boolean;
      trackCondition: string;
    };
  };
}

// ========================================
// ロジックキーワード定義
// ========================================

const LOGIC_KEYWORDS = {
  rotation_long: ['休み明け', '久々', '間隔を空けて', 'リフレッシュ', '外厩', '放牧明け'],
  rotation_short: ['連闘', '中1週', '使い詰め', '間隔詰めて', '滞在', '叩き'],
  track_bias_in: ['イン前', '内枠', 'インベタ', '内有利', '内枠有利'],
  track_bias_out: ['外差し', '外枠', '外回し', 'トラックバイアス', '外枠有利'],
  pacing_high: ['ハイペース', '前傾', '消耗戦', 'オーバーペース'],
  pacing_slow: ['スロー', '後傾', '瞬発力', '上がり勝負', 'ヨーイドン'],
};

// ========================================
// ユーティリティ関数
// ========================================

/**
 * 日付文字列をDateオブジェクトに変換
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // YYYY.MM.DD, YYYY-MM-DD, YYYY/MM/DD 形式に対応
  const cleaned = dateStr.replace(/[\/\-]/g, '.').trim();
  const parts = cleaned.split('.');

  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    return new Date(year, month - 1, day);
  }

  return null;
}

/**
 * 2つの日付間の日数を計算
 */
function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((date1.getTime() - date2.getTime()) / oneDay));
}

/**
 * 週数を計算
 */
function weeksInterval(days: number): number {
  return Math.floor(days / 7);
}

// ========================================
// 時計比較用ユーティリティ
// ========================================

/**
 * クラス名を正規化（全角→半角、表記揺れ対応）
 */
function normalizeClassName(className: string): string {
  if (!className) return '';
  // 全角英数字→半角
  let normalized = className
    .replace(/Ｇ１/g, 'G1').replace(/Ｇ２/g, 'G2').replace(/Ｇ３/g, 'G3')
    .replace(/ＯＰ/g, 'OP').replace(/ｵｰﾌﾟﾝ/g, 'OP')
    .replace(/ＪＧ１/g, 'JG1').replace(/ＪＧ２/g, 'JG2').replace(/ＪＧ３/g, 'JG3')
    .replace(/OP\(L\)/g, 'OP');
  return normalized.trim();
}

/**
 * クラスの階層を数値化（高いほど上位クラス）
 */
function getClassLevel(className: string): number {
  const normalized = normalizeClassName(className);
  const classLevels: { [key: string]: number } = {
    '新馬': 1,
    '未勝利': 1,
    '500万': 2,  // 旧表記
    '1勝': 2,
    '1000万': 3, // 旧表記
    '2勝': 3,
    '1600万': 4, // 旧表記
    '3勝': 4,
    'OP': 5,
    '重賞': 5,
    'G3': 6,
    'G2': 7,
    'G1': 8,
    'JG3': 6,
    'JG2': 7,
    'JG1': 8,
  };
  return classLevels[normalized] || 0;
}

/**
 * 上位クラス名リストを取得（時計比較対象）
 */
function getHigherClasses(className: string): string[] {
  const level = getClassLevel(className);
  const higherClasses: string[] = [];

  // 1段階上と2段階上のクラスを取得
  const classNames: { [level: number]: string[] } = {
    1: ['新馬', '未勝利'],
    2: ['1勝', '500万'],
    3: ['2勝', '1000万'],
    4: ['3勝', '1600万'],
    5: ['OP', '重賞', 'ｵｰﾌﾟﾝ', 'OP(L)'],
    6: ['G3', 'Ｇ３', 'JG3', 'ＪＧ３'],
    7: ['G2', 'Ｇ２', 'JG2', 'ＪＧ２'],
    8: ['G1', 'Ｇ１', 'JG1', 'ＪＧ１'],
  };

  // 1段階上と2段階上を追加
  if (classNames[level + 1]) higherClasses.push(...classNames[level + 1]);
  if (classNames[level + 2]) higherClasses.push(...classNames[level + 2]);

  return higherClasses;
}

/**
 * 馬場状態を数値化（良=0, 稍=1, 重=2, 不=3）
 */
function getTrackConditionLevel(condition: string): number {
  if (!condition) return 0;
  const first = condition.charAt(0);
  const levels: { [key: string]: number } = {
    '良': 0,
    '稍': 1,
    '重': 2,
    '不': 3,
  };
  return levels[first] ?? 0;
}

/**
 * 馬場状態の差が許容範囲内か（1段階以内）
 */
function isTrackConditionComparable(cond1: string, cond2: string): boolean {
  const level1 = getTrackConditionLevel(cond1);
  const level2 = getTrackConditionLevel(cond2);
  return Math.abs(level1 - level2) <= 1;
}

/**
 * 時計を秒に変換（1345 → 94.5秒）
 */
function timeToSeconds(time: number): number {
  if (!time || time <= 0) return 0;
  const timeStr = String(time).padStart(4, '0');
  const minutes = parseInt(timeStr.slice(0, -3), 10) || 0;
  const seconds = parseInt(timeStr.slice(-3, -1), 10) || 0;
  const tenths = parseInt(timeStr.slice(-1), 10) || 0;
  return minutes * 60 + seconds + tenths / 10;
}

/**
 * 秒を時計表示に変換（94.5 → "1:34.5"）
 */
function secondsToTimeDisplay(secs: number): string {
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

// ========================================
// メイン分析ロジック
// ========================================

export class SagaBrain {
  private memoryData: any[] = [];

  constructor(memoryData?: any[]) {
    if (memoryData) {
      this.memoryData = memoryData;
    }
  }

  /**
   * 馬1頭を分析
   * 
   * ★ スコア配分：馬の能力 7 : 展開・コース 3
   * - 馬の能力（最大35点）: 近走着順、競うスコア、ポテンシャル、巻き返し指数
   * - 展開・コース（最大15点）: 枠順、コース適性、脚質展開
   * - 基準点: 30点
   */
  analyzeHorse(input: HorseAnalysisInput): SagaAnalysis {
    const analysis: SagaAnalysis = {
      horseName: input.horseName,
      horseNumber: input.horseNumber,
      score: 30, // 基準点（低めに設定）
      kisoScore: input.kisoScore || 0, // 競うスコアを保持
      tags: [],
      comments: [],
      warnings: [],
      courseMatch: { rating: 'C', reason: '' },
      rotationNote: null,
      timeComparisonNote: null,
      raceLevelNote: null,
    };

    // ========================================
    // 【重要】馬の能力評価（最大35点、全体の70%）
    // ========================================
    this.analyzeHorseAbility(input, analysis);

    // ========================================
    // 展開・コース評価（最大15点、全体の30%）
    // ========================================

    // 1. コース適性分析（最大5点）
    this.analyzeCourseMatch(input, analysis);

    // 2. ローテーション分析（最大3点）
    this.analyzeRotation(input, analysis);

    // 3. 脚質・展開分析（最大3点）
    this.analyzeRunningStyle(input, analysis);

    // 4. 枠順分析（最大2点）
    this.analyzeWaku(input, analysis);

    // 5. 距離適性分析（最大2点）
    this.analyzeDistance(input, analysis);

    // 6. 【重要】総合指数による最終調整
    // 距離実績がなくても指数が高ければ評価、逆に指数が低ければ評価を下げる
    this.applyIndexQualityAdjustment(input, analysis);

    // 7. 時計比較分析（上位クラスとの時計比較）
    this.analyzeTimeComparison(input, analysis);

    // 8. 休み明け得意・不得意判定
    this.analyzeLayoffPattern(input, analysis);

    // 9. 牝馬限定戦判定（ダート牡馬混合経験評価）
    this.analyzeFilliesOnlyRace(input, analysis);

    // 10. 2歳戦・3歳戦の古馬比較時計評価
    this.analyzeYoungHorseTimeComparison(input, analysis);

    // 11. スコア最終調整
    analysis.score = Math.max(0, Math.min(100, analysis.score));

    // 12. レースレベル分析（過去走のレースレベルを評価）
    this.analyzeRaceLevel(input, analysis);

    // 13. サマリー生成（デバッグ用の整理されたコメント）
    this.generateSummaries(input, analysis);

    return analysis;
  }

  /**
   * レースレベル分析（改訂版）
   * 
   * ## ロジック
   * - 前走: 必ずレースレベルに言及（A/B/C/D/LOW形式）
   * - 2-5走前: 包括的に評価（個別ではなく全体傾向）
   * 
   * ## スコア調整（馬自身の好走/凡走を考慮）
   * - B以上 × 好走 → +3〜5点（高評価）
   * - B以上 × 凡走 → ±0点（見直し余地）
   * - C以下 × 好走 → ±0点（評価フラット）
   * - C以下 × 凡走 → -2〜3点（マイナス）
   * - 凡走続き（3戦以上）→ 大幅マイナス（-5〜10点）
   * 
   * ## 好走/凡走の定義
   * - 好走 = 3着以内
   * - 凡走 = 4着以下
   */
  private analyzeRaceLevel(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    const pastRaces = input.pastRaces || [];
    if (pastRaces.length === 0) return;

    const levelComments: string[] = [];
    
    // ========================================
    // 【前走】必ず言及（A/B/C/D/LOW形式）
    // ========================================
    const lastRace = pastRaces[0];
    if (lastRace?.raceLevel) {
      const level = lastRace.raceLevel;
      const baseLevel = level.level;
      const levelLabel = level.levelLabel; // "S+++", "A+", "B" など
      const plusCount = level.plusCount || 0;
      const finishPos = lastRace.finishPosition;
      const isGoodRun = finishPos <= 3;
      const marginNum = parseFloat(lastRace.margin || '0');
      const marginWithin1sec = !isNaN(marginNum) && marginNum <= 1.0;
      const marginWithin05sec = !isNaN(marginNum) && marginNum <= 0.5;
      
      // 基本情報コメント（次1走目の好走数を使用、延べではない）
      const goodCount = level.firstRunGoodCount ?? 0;  // 次1走目の好走数
      const totalHorses = level.totalHorsesRun ?? 0;
      
      // B以上 = ハイレベル
      const isHighLevel = baseLevel === 'S' || baseLevel === 'A' || baseLevel === 'B';
      
      // レベルと好走数の整合性チェック
      // B以上なのに好走0頭は論理的にあり得ない（キャッシュ不整合の可能性）
      const hasLogicalConsistency = !(isHighLevel && goodCount === 0 && totalHorses > 2);
      
      // 整合性がある場合のみ詳細を表示
      const totalInfo = (totalHorses > 0 && hasLogicalConsistency)
        ? `（${totalHorses}頭中${goodCount}頭好走）` 
        : '';
      // C以下 = 低レベル側
      const isLowLevel = baseLevel === 'C' || baseLevel === 'D' || baseLevel === 'LOW';
      
      if (baseLevel !== 'UNKNOWN') {
        // 前走コメント生成（レベル形式で統一）
        if (isHighLevel) {
          if (isGoodRun) {
            // B以上 × 好走 → 高評価
            levelComments.push(`前走はレースレベル${levelLabel}${totalInfo}で${finishPos}着好走。ハイレベル戦での好走は高評価`);
            analysis.score += 4 + plusCount; // +3〜5点
            analysis.tags.push('ハイレベル戦好走');
          } else if (marginWithin05sec) {
            // B以上 × 凡走（僅差）→ 見直し
            levelComments.push(`前走はレースレベル${levelLabel}${totalInfo}で${finishPos}着も${marginNum}秒差。ハイレベル戦での凡走だが見直し余地あり`);
            analysis.score += 1; // フラットに近いがやや加点
          } else if (marginWithin1sec) {
            // B以上 × 凡走（1秒以内）→ フラット
            levelComments.push(`前走はレースレベル${levelLabel}${totalInfo}で${finishPos}着（${marginNum}秒差）。ハイレベル戦での凡走のため見直し`);
            // スコア±0（フラット）
          } else {
            // B以上 × 凡走（1秒超）→ ややマイナス
            levelComments.push(`前走はレースレベル${levelLabel}${totalInfo}で${finishPos}着（${marginNum}秒差）。ハイレベル戦での凡走`);
            analysis.score -= 1;
          }
        } else if (isLowLevel) {
          if (isGoodRun) {
            // C以下 × 好走 → 評価フラット
            levelComments.push(`前走はレースレベル${levelLabel}${totalInfo}で${finishPos}着好走も、メンバーレベルは特筆するものなく評価フラット`);
            // スコア±0
          } else {
            // C以下 × 凡走 → マイナス
            levelComments.push(`前走はレースレベル${levelLabel}${totalInfo}で${finishPos}着。メンバーレベル高くないところでの凡走はマイナス`);
            analysis.score -= 3; // -2〜3点
          }
        }
      } else if (levelLabel && levelLabel.includes('+')) {
        // UNKNOWN+の特殊処理
        levelComments.push('前走はまだ次走データ1頭のみだがその馬が好走。ハイレベルの可能性あり');
        analysis.score += 1;
      }
    }

    // ========================================
    // 【2-5走前】包括的評価
    // ========================================
    const olderRaces = pastRaces.slice(1, 5).filter(r => r.raceLevel && r.raceLevel.level !== 'UNKNOWN');
    
    if (olderRaces.length >= 2) {
      // 集計
      let highLevelGoodRuns = 0;   // B以上 × 好走
      let highLevelBadRuns = 0;    // B以上 × 凡走
      let lowLevelGoodRuns = 0;    // C以下 × 好走
      let lowLevelBadRuns = 0;     // C以下 × 凡走
      let marginWithin1secCount = 0; // 1秒以内の凡走
      
      for (const race of olderRaces) {
        const baseLevel = race.raceLevel!.level;
        const isHighLevel = baseLevel === 'S' || baseLevel === 'A' || baseLevel === 'B';
        const isGoodRun = race.finishPosition <= 3;
        const marginNum = parseFloat(race.margin || '0');
        const marginWithin1sec = !isNaN(marginNum) && marginNum <= 1.0;
        
        if (isHighLevel) {
          if (isGoodRun) highLevelGoodRuns++;
          else {
            highLevelBadRuns++;
            if (marginWithin1sec) marginWithin1secCount++;
          }
        } else {
          if (isGoodRun) lowLevelGoodRuns++;
          else lowLevelBadRuns++;
        }
      }
      
      const totalOlder = olderRaces.length;
      const totalGoodRuns = highLevelGoodRuns + lowLevelGoodRuns;
      const totalBadRuns = highLevelBadRuns + lowLevelBadRuns;
      
      // 包括コメント生成
      if (highLevelGoodRuns >= 2) {
        // 近走ハイレベル戦で好走続き
        levelComments.push(`近走（2-${Math.min(5, pastRaces.length)}走前）はハイレベル戦（B以上）で好走${highLevelGoodRuns}回。安定した実力の証`);
        analysis.score += highLevelGoodRuns * 2; // +4〜8点
        analysis.tags.push('近走ハイレベル好走');
      } else if (lowLevelGoodRuns >= 2 && highLevelGoodRuns === 0) {
        // 好走多いがレベルC以下で過信禁物
        levelComments.push(`近走（2-${Math.min(5, pastRaces.length)}走前）は好走${lowLevelGoodRuns}回もレースレベルC以下中心。過信禁物`);
        // スコア±0（フラット）
      } else if (highLevelBadRuns >= 2 && marginWithin1secCount >= 2) {
        // 近走負けが続くもハイレベル戦で1秒以内
        levelComments.push(`近走（2-${Math.min(5, pastRaces.length)}走前）は負けが続くもレースレベルB以上で着差1秒以内が${marginWithin1secCount}回。見直し候補`);
        analysis.score += 2; // ややプラス
        analysis.tags.push('ハイレベル戦僅差負け');
      } else if (lowLevelBadRuns >= 2) {
        // 低レベル戦での凡走続き
        levelComments.push(`近走（2-${Math.min(5, pastRaces.length)}走前）はレースレベルC以下で凡走${lowLevelBadRuns}回。厳しい状況`);
        analysis.score -= lowLevelBadRuns * 2; // -4〜8点
        analysis.warnings.push('低レベル戦での凡走続きで大幅マイナス');
      }
      
      // 凡走続き判定（レースレベル問わず3戦以上凡走）
      // 前走も含めて判定
      const allRecent = pastRaces.slice(0, 10);
      const consecutiveBadRuns = allRecent.filter(r => r.finishPosition > 3).length;
      if (consecutiveBadRuns >= 3) {
        levelComments.push(`近10走中${consecutiveBadRuns}回凡走（4着以下）。低調期の可能性`);
        analysis.score -= Math.min(10, consecutiveBadRuns * 2); // 最大-10点
        analysis.warnings.push('凡走続きで大幅評価ダウン');
      }
    }

    // ========================================
    // raceLevelNote を設定
    // ========================================
    if (levelComments.length > 0) {
      analysis.raceLevelNote = levelComments.join('。');
    }
  }

  /**
   * レースレベルのラベルを取得（レベル文字をそのまま返す）
   */
  private getRaceLevelLabel(level: string): string {
    // levelLabelをそのまま使用（"S+++", "A+", "C"など）
    return level || '';
  }

  /**
   * 整理されたサマリーを生成
   * - abilitySummary: 能力・指数関連を1段落にまとめる
   * - contextSummary: コース実績、前走脚質、前走条件を整理
   */
  private generateSummaries(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    // === 能力サマリー ===
    const abilityParts: string[] = [];

    // 平均着順
    const avgFinish = this.getRecentAvgFinish(input);
    if (avgFinish < 99) {
      if (avgFinish <= 3) {
        abilityParts.push(`平均着順${avgFinish.toFixed(1)}着と好調`);
      } else if (avgFinish <= 5) {
        abilityParts.push(`平均着順${avgFinish.toFixed(1)}着とまずまず`);
      } else {
        abilityParts.push(`平均着順${avgFinish.toFixed(1)}着とやや苦戦`);
      }
    }

    // ポテンシャル指数
    const potential = input.indices?.potential || 0;
    if (potential >= 3.0) {
      abilityParts.push(`ポテンシャル${potential.toFixed(1)}は高水準`);
    } else if (potential >= 2.0) {
      abilityParts.push(`ポテンシャル${potential.toFixed(1)}は中位`);
    } else if (potential > 0) {
      abilityParts.push(`ポテンシャル${potential.toFixed(1)}は控えめ`);
    }

    // 巻き返し指数
    const makikaeshi = input.indices?.makikaeshi || 0;
    if (makikaeshi >= 3.0) {
      abilityParts.push(`巻き返し${makikaeshi.toFixed(1)}と上位`);
    } else if (makikaeshi >= 2.0) {
      abilityParts.push(`巻き返し${makikaeshi.toFixed(1)}とまずまず`);
    } else if (makikaeshi > 0) {
      abilityParts.push(`巻き返し${makikaeshi.toFixed(1)}は低め`);
    }

    // 枠順
    if (analysis.tags.includes('好枠')) {
      abilityParts.push('有利な枠に入った');
    } else if (analysis.tags.includes('枠不利')) {
      abilityParts.push('不利な枠に入った');
    }

    // 総合評価
    if (analysis.score >= 60) {
      abilityParts.push('ここは高評価');
    } else if (analysis.score >= 45) {
      abilityParts.push('まずまずの評価');
    } else if (analysis.score >= 30) {
      abilityParts.push('やや割引');
    } else {
      abilityParts.push('厳しい評価');
    }

    analysis.abilitySummary = abilityParts.join('。') + '。';

    // === ラップ評価 ===
    this.analyzeLapEvaluation(input, analysis);

    // === コンテキストサマリー ===
    const contextParts: string[] = [];

    // コース実績
    if (analysis.courseMatch.reason) {
      contextParts.push(`【コース】${analysis.courseMatch.reason}`);
    }

    // ※ timeEvaluationはSagaAICardで【タイム】として別途表示するためここには含めない
    // ※ lapEvaluationはSagaAICardで【ラップ】として別途表示するためここには含めない

    analysis.contextSummary = contextParts.join('\n');
  }

  /**
   * ラップ分析を実行し、lapEvaluationを生成
   */
  private analyzeLapEvaluation(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    const pastRaces = input.pastRaces || [];
    if (pastRaces.length === 0) return;

    const lapResults: { race: number; result: LapAnalysisResult }[] = [];
    
    // 過去5走までを分析
    for (let i = 0; i < Math.min(5, pastRaces.length); i++) {
      const race = pastRaces[i];
      if (!race.lapString) continue;

      const result = analyzePastRaceLap({
        lapString: race.lapString,
        place: race.place,
        surface: race.surface,
        distance: race.distance,
        trackCondition: race.trackCondition || '良',
        className: race.className || '',
        finishPosition: race.finishPosition,
        margin: race.margin || '0',
        corner4: race.corner4,
        corner4Wide: race.corner4Wide,
        ownLast3F: race.ownLast3F,
        totalHorses: race.totalHorses,
        corner2: race.corner2,
      });

      if (result) {
        // 歴代比較を実行（勝ち馬のみ）
        if (race.finishPosition === 1 && race.historicalLapData && race.historicalLapData.length > 0) {
          const laps = parseLapTimes(race.lapString);
          const lapData = calculateLapData(laps);
          if (lapData) {
            const historicalComparison = compareWithHistorical(
              lapData,
              race.historicalLapData,
              {
                place: race.place,
                surface: race.surface,
                distance: race.distance,
                trackCondition: race.trackCondition || '良',
                className: race.className || '',
              }
            );
            if (historicalComparison) {
              result.historicalComparison = historicalComparison;
              // 歴代上位ならハイレベル判定を追加
              if (historicalComparison.isHistoricalHighLevel && !result.isHighLevel) {
                result.isHighLevel = true;
                result.highLevelType = 'historical';
                result.historicalRank = historicalComparison.last4FRank;
                result.highLevelComment = historicalComparison.comment;
              }
            }
          }
        }

        lapResults.push({ race: i, result });
        
        // スコア調整（直近ほど影響大）
        const decay = i <= 2 ? 1.0 : i === 3 ? 0.7 : 0.5;
        analysis.score += result.scoreAdjustment * decay;
      }
    }

    if (lapResults.length === 0) return;

    // ラップ評価コメントを生成
    const lapComments: string[] = [];

    // ハイレベル判定
    const highLevelResults = lapResults.filter(r => r.result.isHighLevel);
    for (const { race, result } of highLevelResults) {
      const raceLabel = race === 0 ? '前走' : `${race + 1}走前`;
      if (result.highLevelType === 'historical') {
        lapComments.push(`🏆'19以降上位: ${raceLabel}${result.highLevelComment}`);
        analysis.tags.push("'19以降上位");
        // '19以降上位にはスコアボーナス
        const decay = race <= 2 ? 1.0 : race === 3 ? 0.7 : 0.5;
        analysis.score += 5 * decay;
      } else if (result.highLevelType === 'acceleration') {
        lapComments.push(`🔥ハイレベル: ${raceLabel}${result.highLevelComment}`);
        analysis.tags.push('加速ラップ馬');
      } else if (result.highLevelType === 'non_deceleration') {
        lapComments.push(`🔥ハイレベル: ${raceLabel}${result.highLevelComment}`);
        analysis.tags.push('非減速ラップ馬');
      } else if (result.highLevelType === 'reverse') {
        lapComments.push(`🔥逆行ハイレベル: ${raceLabel}${result.highLevelComment}`);
        analysis.tags.push('逆行ハイレベル');
      }
    }

    // 巻き返し候補
    const recoveryResults = lapResults.filter(r => r.result.isRecoveryCandidate);
    for (const { race, result } of recoveryResults) {
      const raceLabel = race === 0 ? '前走' : `${race + 1}走前`;
      lapComments.push(`💡巻き返し候補: ${raceLabel}${result.recoveryReason}。${result.recoveryComment}`);
      if (!analysis.tags.includes('巻き返し◎')) {
        analysis.tags.push('巻き返し◎');
      }
    }

    // ペース情報（直近のみ）
    if (lapResults.length > 0 && lapResults[0].result.paceType !== 'average') {
      const pace = lapResults[0].result;
      if (pace.paceType === 'super_high' || pace.paceType === 'high') {
        // 前走がハイペースだった情報
        if (!highLevelResults.some(r => r.race === 0) && !recoveryResults.some(r => r.race === 0)) {
          // まだコメントがなければペース情報を追加
          lapComments.push(`前走は${pace.paceComment}`);
        }
      }
    }

    if (lapComments.length > 0) {
      analysis.lapEvaluation = lapComments.join(' / ');
    }
  }

  /**
   * 総合指数による最終調整
   * 
   * 指数が高いのにスコアが低い馬を救済し、
   * 指数が低いのにスコアが高い馬にペナルティを与える
   */
  private applyIndexQualityAdjustment(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    const potential = input.indices?.potential || 0;
    const makikaeshi = input.indices?.makikaeshi || 0;
    const kisoScore = input.kisoScore || 0;
    const kisoRank = input.memberRanks?.kisoScore || 99;

    // 指数品質スコアを計算（0-100）
    // ポテンシャル: 0-5 → 0-30
    // 巻き返し: 0-5 → 0-30
    // 競うスコア: 0-100 → 0-40
    const potentialQuality = Math.min(potential / 5, 1) * 30;
    const makikaeshiQuality = Math.min(makikaeshi / 5, 1) * 30;
    const kisoQuality = Math.min(kisoScore / 100, 1) * 40;
    const indexQuality = potentialQuality + makikaeshiQuality + kisoQuality;

    // 現在のスコアと指数品質の乖離を計算
    const scoreDiff = analysis.score - indexQuality;

    // 【パターン1】指数が高いのにスコアが低い（距離・コース実績がないだけ）
    // 条件：指数品質50以上 かつ 現スコア < 指数品質 - 10
    if (indexQuality >= 50 && scoreDiff < -10) {
      const adjustment = Math.min(8, Math.abs(scoreDiff) * 0.3);
      analysis.score += adjustment;
      if (adjustment >= 3) {
        analysis.comments.push(`【調整】距離・コース実績は少ないが、ポテンシャル${potential.toFixed(1)}・巻き返し${makikaeshi.toFixed(1)}は高水準。能力的には侮れない。`);
      }
    }

    // 【パターン2】指数が低いのにスコアが高い（実績だけで評価されすぎ）
    // 条件：指数品質30以下 かつ 現スコア > 指数品質 + 15 かつ 競うスコア順位が下位
    if (indexQuality <= 30 && scoreDiff > 15 && kisoRank >= 8) {
      const penalty = Math.min(6, scoreDiff * 0.2);
      analysis.score -= penalty;
      if (penalty >= 2) {
        analysis.warnings.push(`指数が全体的に低め。実績ほどの能力は疑問。`);
      }
    }

    // 【パターン3】競うスコア上位なのにスコアが低い（距離実績なしで不当に低評価）
    // 条件：競うスコア順位5位以内 かつ 現スコア40以下
    if (kisoRank <= 5 && analysis.score <= 40) {
      const boost = 5;
      analysis.score += boost;
      analysis.comments.push(`【調整】競うスコア${kisoRank}位。距離実績は少ないがメンバー内では上位。`);
    }

    // 【パターン4】高い個別指数を持つ馬への追加評価
    // ポテンシャル3.0以上 かつ 巻き返し2.0以上 → 変わり身の可能性大
    if (potential >= 3.0 && makikaeshi >= 2.0 && analysis.score <= 50) {
      analysis.score += 4;
      if (!analysis.tags.includes('変わり身期待')) {
        analysis.tags.push('変わり身期待');
      }
    }

    // 【パターン5】微妙な馬＋不利枠 → 大幅評価減
    // 条件：
    // - 着順悪い（直近平均6着以下）
    // - 指数が中途半端（抜けた上位ではない、または一部だけ上位）
    // - 不利な枠に入った
    const avgFinish = this.getRecentAvgFinish(input);
    const isUnfavorableGate = this.isUnfavorableGate(input, analysis);

    // 微妙な馬の判定
    const isBorderlineHorse = this.isBorderlineHorse(
      avgFinish, kisoScore, kisoRank, potential, makikaeshi, indexQuality
    );

    if (isBorderlineHorse && isUnfavorableGate) {
      const penalty = 8; // 大幅減点
      analysis.score -= penalty;
      analysis.warnings.push(`評価が難しい馬が不利枠に。マイナス材料が重なり厳しい。`);
      analysis.tags.push('不利枠△');
    }

    // 【パターン6】評価が難しい要素が2つ以上重なった馬 → 競うスコア上位5頭以下に
    // 評価が難しい要素をカウント
    const difficultFactors = this.countDifficultFactors(input, analysis, avgFinish, kisoRank, indexQuality);

    if (difficultFactors.count >= 2 && kisoRank > 5) {
      // 競うスコア上位5頭以下になるよう大幅ペナルティ
      const penalty = 10 + (difficultFactors.count - 2) * 3; // 2要素: -10, 3要素: -13, 4要素: -16
      analysis.score -= penalty;
      analysis.warnings.push(`【複合マイナス】${difficultFactors.factors.join('、')}が重なり厳しい評価(${-penalty}点)。`);
      analysis.tags.push('複合△');
    } else if (difficultFactors.count >= 2 && kisoRank <= 5) {
      // 競うスコア上位でも要素が重なれば減点（ただし控えめに）
      const penalty = 5;
      analysis.score -= penalty;
      analysis.warnings.push(`【注意】${difficultFactors.factors.join('、')}が重なる。競うスコア上位だが割引。`);
    }
  }

  /**
   * 評価が難しい要素をカウント
   */
  private countDifficultFactors(
    input: HorseAnalysisInput,
    analysis: SagaAnalysis,
    avgFinish: number,
    kisoRank: number,
    indexQuality: number
  ): { count: number; factors: string[] } {
    const factors: string[] = [];

    // 1. 枠不利
    if (analysis.tags.includes('枠不利') || analysis.tags.includes('不利枠△')) {
      factors.push('枠不利');
    }

    // 2. 近走不振（平均6着以下）
    if (avgFinish >= 6) {
      factors.push('近走不振');
    }

    // 3. 競うスコア下位（8位以下）
    if (kisoRank >= 8) {
      factors.push('スコア下位');
    }

    // 4. 指数全体が低い（品質40以下）
    if (indexQuality < 40) {
      factors.push('指数低');
    }

    // 5. 前走逃げで恵まれた（巻き返し低い逃げ馬）
    const lastRace = input.pastRaces[0];
    const makikaeshi = input.indices?.makikaeshi || 0;
    if (lastRace?.corner2 && lastRace.corner2 === 1 && makikaeshi <= 3.0 && lastRace.finishPosition <= 3) {
      factors.push('前走逃げ恵まれ');
    }

    // 6. 距離実績なし
    const relevantRaceCount = input.relevantRaceCount ?? 0;
    if (relevantRaceCount === 0 && input.pastRaces.length >= 3) {
      factors.push('距離実績なし');
    }

    // 7. 間隔詰め（tagsから判定）
    if (analysis.tags.includes('間隔詰め') && analysis.warnings.some(w => w.includes('間隔詰めで成績低下'))) {
      factors.push('間隔詰め不振');
    }

    // 8. 休み明け不振（tagsから判定）
    if (analysis.tags.includes('休み明け') && analysis.warnings.some(w => w.includes('休み明け成績不振'))) {
      factors.push('休み明け不振');
    }

    return { count: factors.length, factors };
  }

  /**
   * 直近3走の平均着順を取得
   */
  private getRecentAvgFinish(input: HorseAnalysisInput): number {
    if (input.pastRaces.length === 0) return 99;

    const INVALID_FINISH = 30;
    const recentRaces = input.pastRaces.slice(0, 3);
    const validRaces = recentRaces.filter(r =>
      r.finishPosition > 0 && r.finishPosition < INVALID_FINISH
    );

    if (validRaces.length === 0) return 99;
    return validRaces.reduce((sum, r) => sum + r.finishPosition, 0) / validRaces.length;
  }

  /**
   * 不利な枠かどうかを判定
   */
  private isUnfavorableGate(input: HorseAnalysisInput, analysis: SagaAnalysis): boolean {
    // warningsに枠不利の記述があるかチェック
    const hasGateWarning = analysis.warnings.some(w =>
      w.includes('不利') && (w.includes('枠') || w.includes('外枠') || w.includes('内枠'))
    );

    // tagsに好枠がないかチェック
    const hasGoodGateTag = analysis.tags.includes('好枠');

    return hasGateWarning && !hasGoodGateTag;
  }

  /**
   * 微妙な馬（評価が難しい馬）かどうかを判定
   */
  private isBorderlineHorse(
    avgFinish: number,
    kisoScore: number,
    kisoRank: number,
    potential: number,
    makikaeshi: number,
    indexQuality: number
  ): boolean {
    // 条件1: 着順が悪い（平均6着以下）
    const hasWeakFinish = avgFinish >= 6;

    // 条件2: 指数が中途半端
    // - 抜けた上位ではない（指数品質60未満）
    // - かつ、複数の指数が弱い
    const notTopTier = indexQuality < 60;

    // 条件3: 一部だけ上位で他が弱い
    // 例：ポテンシャルは高いが巻き返しが低い、またはその逆
    const potentialStrong = potential >= 2.5;
    const makikaeshiStrong = makikaeshi >= 2.0;
    const kisoStrong = kisoRank <= 5;

    const strongCount = [potentialStrong, makikaeshiStrong, kisoStrong].filter(Boolean).length;
    const hasPartialStrength = strongCount === 1; // 1つだけ強い

    // 条件4: 競うスコアが中位〜下位
    const midToLowKisoRank = kisoRank >= 6;

    // 微妙な馬の判定
    // パターンA: 着順悪い＋指数も中途半端
    const patternA = hasWeakFinish && notTopTier && midToLowKisoRank;

    // パターンB: 着順悪い＋一部だけ強い
    const patternB = hasWeakFinish && hasPartialStrength;

    // パターンC: 着順やや悪い＋指数下位＋一部だけ中位
    const patternC = avgFinish >= 5 && indexQuality < 40 && strongCount <= 1;

    return patternA || patternB || patternC;
  }

  /**
   * 時計比較分析（過去5走まで対象）
   * 過去走の時計を上位クラスの同コース・同距離レースと比較
   * 
   * 比較条件：
   * - 同じ競馬場・芝ダ・距離
   * - 前後1日以内のレース
   * - 馬場状態が1段階以内の差
   * - 上位クラスの勝ち時計と比較
   * 
   * 評価減衰：
   * - 1-3走前: 100%評価
   * - 4走前: 70%評価
   * - 5走前: 50%評価
   */
  private analyzeTimeComparison(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    // 時計比較データがない場合はスキップ
    if (!input.timeComparisonData || input.timeComparisonData.length === 0) {
      return;
    }

    // 各過去走の時計比較結果を収集
    interface TimeComparisonResult {
      pastRaceIndex: number;
      scoreBonus: number;       // プラス評価
      scorePenalty: number;     // マイナス評価
      adjustedBonus: number;    // 減衰後
      comment: string;
      tag: string;
      timeDiff: number;
      isPositive: boolean;      // プラス評価かどうか
    }

    const positiveResults: TimeComparisonResult[] = [];
    const negativeResults: TimeComparisonResult[] = [];

    for (const compData of input.timeComparisonData) {
      const { pastRaceIndex, pastRaceDate, pastRaceClass, pastRaceTime, pastRaceCondition, comparisonRaces } = compData;

      if (!pastRaceTime || pastRaceTime <= 0 || !comparisonRaces || comparisonRaces.length === 0) {
        continue;
      }

      const raceTime = timeToSeconds(pastRaceTime);
      if (raceTime <= 0) continue;

      const raceLevel = getClassLevel(pastRaceClass);
      const raceDate = parseDate(pastRaceDate);
      if (!raceDate) continue;

      // === プラス評価: 上位クラスとの比較 ===
      const higherClassComparisons = comparisonRaces.filter(race => {
        const compLevel = getClassLevel(race.className);
        const isHigherClass = compLevel > raceLevel;
        const isConditionOk = isTrackConditionComparable(pastRaceCondition, race.trackCondition);
        const compDate = parseDate(race.date);
        const isDateOk = compDate && daysBetween(raceDate, compDate) <= 1;
        return isHigherClass && isConditionOk && isDateOk;
      });

      if (higherClassComparisons.length > 0) {
        // 最も上位クラスの比較レースを選択
        higherClassComparisons.sort((a, b) => getClassLevel(b.className) - getClassLevel(a.className));
        const bestComp = higherClassComparisons[0];

        const compTime = timeToSeconds(bestComp.finishTime);
        if (compTime > 0) {
          // 時計は補正せず、そのまま比較（馬場フィルタは事前に適用済み）
          const timeDiff = raceTime - compTime;

          const compLevel = getClassLevel(bestComp.className);
          const classLevelDiff = compLevel - raceLevel;
          const isHigherClassComp = classLevelDiff >= 2;

          let scoreBonus = 0;
          let tag = '';

          if (timeDiff <= 0) {
            scoreBonus = isHigherClassComp ? 18 : 15;
            tag = '時計◎◎';
          } else if (timeDiff <= 0.5) {
            scoreBonus = isHigherClassComp ? 14 : 12;
            tag = '時計◎';
          } else if (timeDiff <= 1.0) {
            scoreBonus = isHigherClassComp ? 10 : 8;
            tag = '時計○';
          } else if (timeDiff <= 1.5) {
            scoreBonus = isHigherClassComp ? 5 : 4;
            tag = '時計△';
          }

          if (scoreBonus > 0) {
            // 減衰率
            let decayRate = 1.0;
            if (pastRaceIndex === 3) decayRate = 0.7;
            else if (pastRaceIndex >= 4) decayRate = 0.5;

            const raceLabel = pastRaceIndex === 0 ? '前走' : `${pastRaceIndex + 1}走前`;
            const timeDisplay = secondsToTimeDisplay(raceTime);
            const compTimeDisplay = secondsToTimeDisplay(compTime);
            const compClassName = normalizeClassName(bestComp.className);
            const pastClassName = normalizeClassName(pastRaceClass);
            const ageNote = bestComp.isAgeRestricted ? `（世代限定）` : '';

            // 日付関係を計算（同日/前日/翌日）
            const compDate = parseDate(bestComp.date);
            let dateRelation = '';
            if (compDate && raceDate) {
              const dayDiff = daysBetween(raceDate, compDate);
              if (dayDiff === 0) {
                dateRelation = '同日';
              } else if (compDate > raceDate) {
                dateRelation = '翌日';
              } else {
                dateRelation = '前日';
              }
            }

            // レース番号を取得
            const raceNumDisplay = bestComp.raceNumber ? `${bestComp.raceNumber}R` : '';

            // 比較レース情報を構築（例: 「同日9R2勝」）
            const compRaceInfo = `${dateRelation}${raceNumDisplay}${compClassName}${ageNote}`;

            let comment = '';
            if (timeDiff <= 0) {
              comment = `${raceLabel}${pastClassName}で${timeDisplay}、${compRaceInfo}の${compTimeDisplay}を上回る`;
            } else {
              comment = `${raceLabel}${pastClassName}で${timeDisplay}、${compRaceInfo}の${compTimeDisplay}と${timeDiff.toFixed(1)}秒差`;
            }

            positiveResults.push({
              pastRaceIndex,
              scoreBonus,
              scorePenalty: 0,
              adjustedBonus: Math.round(scoreBonus * decayRate),
              comment,
              tag,
              timeDiff,
              isPositive: true,
            });
          }
        }
      }

      // === マイナス評価: 同クラス以下との比較 ===
      // 前走のみ対象（直近の時計が遅いことを問題視）
      if (pastRaceIndex === 0) {
        const sameOrLowerClassComparisons = comparisonRaces.filter(race => {
          const compLevel = getClassLevel(race.className);
          const isSameOrLower = compLevel <= raceLevel && compLevel >= raceLevel - 1; // 同クラスまたは1段階下
          const isConditionOk = isTrackConditionComparable(pastRaceCondition, race.trackCondition);
          const compDate = parseDate(race.date);
          const isDateOk = compDate && daysBetween(raceDate, compDate) <= 1;
          return isSameOrLower && isConditionOk && isDateOk;
        });

        if (sameOrLowerClassComparisons.length > 0) {
          // 同クラス以下の中で最も時計が良いレースと比較
          const slowestComp = sameOrLowerClassComparisons.reduce((slowest, race) => {
            const compTime = timeToSeconds(race.finishTime);
            const slowestTime = timeToSeconds(slowest.finishTime);
            return compTime < slowestTime ? race : slowest;
          });

          const compTime = timeToSeconds(slowestComp.finishTime);
          if (compTime > 0) {
            // 時計は補正せず、そのまま比較（馬場フィルタは事前に適用済み）
            const timeDiff = raceTime - compTime;

            // 1.5秒以上遅い場合はマイナス評価
            if (timeDiff >= 1.5) {
              const compLevel = getClassLevel(slowestComp.className);
              const isSameClass = compLevel === raceLevel;

              let scorePenalty = 0;
              let tag = '';

              if (timeDiff >= 3.0) {
                scorePenalty = isSameClass ? -12 : -8;
                tag = '時計疑問';
              } else if (timeDiff >= 2.0) {
                scorePenalty = isSameClass ? -8 : -5;
                tag = '時計遅め';
              } else if (timeDiff >= 1.5) {
                scorePenalty = isSameClass ? -5 : -3;
                tag = '時計やや遅';
              }

              if (scorePenalty < 0) {
                const timeDisplay = secondsToTimeDisplay(raceTime);
                const compTimeDisplay = secondsToTimeDisplay(compTime);
                const compClassName = normalizeClassName(slowestComp.className);
                const pastClassName = normalizeClassName(pastRaceClass);

                // 日付関係を計算（同日/前日/翌日）
                const compDate = parseDate(slowestComp.date);
                let dateRelation = '';
                if (compDate && raceDate) {
                  const dayDiff = daysBetween(raceDate, compDate);
                  if (dayDiff === 0) {
                    dateRelation = '同日';
                  } else if (compDate > raceDate) {
                    dateRelation = '翌日';
                  } else {
                    dateRelation = '前日';
                  }
                }

                // レース番号を取得
                const raceNumDisplay = slowestComp.raceNumber ? `${slowestComp.raceNumber}R` : '';

                // 比較レース情報（例: 「同日5R1勝」）
                const compRaceInfo = `${dateRelation}${raceNumDisplay}${compClassName}`;

                const classNote = isSameClass ? '同クラス' : '下位クラス';
                const comment = `前走${pastClassName}で${timeDisplay}、${classNote}${compRaceInfo}の${compTimeDisplay}から${timeDiff.toFixed(1)}秒遅い`;

                negativeResults.push({
                  pastRaceIndex,
                  scoreBonus: 0,
                  scorePenalty,
                  adjustedBonus: scorePenalty,
                  comment,
                  tag,
                  timeDiff,
                  isPositive: false,
                });
              }
            }
          }
        }
      }
    }

    // === 結果の集約 ===
    let timeEvaluationLines: string[] = [];
    let totalScoreChange = 0;

    // プラス評価の処理
    if (positiveResults.length > 0) {
      positiveResults.sort((a, b) => b.scoreBonus - a.scoreBonus);
      const best = positiveResults[0];

      totalScoreChange += best.adjustedBonus;

      if (best.tag && !analysis.tags.includes(best.tag)) {
        analysis.tags.push(best.tag);
      }

      // コメント生成
      let evalComment = '';
      if (best.pastRaceIndex === 0) {
        if (best.timeDiff <= 0) {
          evalComment = `⏱️優秀: ${best.comment}。上位クラスでも勝ち負け可能。`;
        } else if (best.timeDiff <= 0.5) {
          evalComment = `⏱️優秀: ${best.comment}。上位クラスでも十分通用。`;
        } else if (best.timeDiff <= 1.0) {
          evalComment = `⏱️良好: ${best.comment}。昇級でも通用可能。`;
        } else {
          evalComment = `⏱️: ${best.comment}。`;
        }
      } else {
        const lastRaceNote = input.pastRaces[0]?.finishPosition <= 5 ? '' : '前走は敗退しているが、';
        if (best.timeDiff <= 0) {
          evalComment = `⏱️優秀: ${lastRaceNote}${best.comment}。能力は高い。`;
        } else if (best.timeDiff <= 0.5) {
          evalComment = `⏱️優秀: ${lastRaceNote}${best.comment}。`;
        } else {
          evalComment = `⏱️良好: ${lastRaceNote}${best.comment}。`;
        }
      }

      // 複数の好時計
      const goodResults = positiveResults.filter(r => r.scoreBonus >= 8 && r.pastRaceIndex !== best.pastRaceIndex);
      if (goodResults.length > 0) {
        const labels = goodResults.map(r => r.pastRaceIndex === 0 ? '前走' : `${r.pastRaceIndex + 1}走前`);
        evalComment += ` ${labels.join('、')}も好時計。`;
      }

      timeEvaluationLines.push(evalComment);
      analysis.timeComparisonNote = evalComment;
    }

    // マイナス評価の処理
    if (negativeResults.length > 0) {
      const worst = negativeResults[0];

      totalScoreChange += worst.adjustedBonus;

      if (worst.tag && !analysis.tags.includes(worst.tag)) {
        analysis.tags.push(worst.tag);
      }

      let evalComment = '';
      if (worst.timeDiff >= 3.0) {
        evalComment = `⚠️時計疑問: ${worst.comment}。着順は良いが時計面から能力に疑問。`;
        analysis.warnings.push('時計が遅く、着順ほどの能力はない可能性');
      } else if (worst.timeDiff >= 2.0) {
        evalComment = `⚠️時計遅め: ${worst.comment}。時計面では物足りない。`;
      } else {
        evalComment = `⏱️やや遅: ${worst.comment}。`;
      }

      timeEvaluationLines.push(evalComment);

      // プラス評価がない場合のみnoteに設定
      if (!analysis.timeComparisonNote) {
        analysis.timeComparisonNote = evalComment;
      }
    }

    // timeEvaluation を設定
    if (timeEvaluationLines.length > 0) {
      analysis.timeEvaluation = timeEvaluationLines.join(' ');
      analysis.comments.push(...timeEvaluationLines);
    }

    // スコア調整
    analysis.score += totalScoreChange;
  }

  /**
   * 【最重要】馬の能力評価（最大35点）
   * 
   * 評価項目：
   * - 近走着順（最大15点）：直近3走の成績
   * - 競うスコア（最大8点）：メンバー内での相対順位
   * - ポテンシャル指数（最大6点）：メンバー内での相対順位
   * - 巻き返し指数（最大6点）：メンバー内での相対順位
   */
  private analyzeHorseAbility(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    // 指数を先に取得（着順との相関評価に使用）
    const potential = input.indices?.potential || 0;
    const makikaeshi = input.indices?.makikaeshi || 0;
    const kisoScore = input.kisoScore || 0;

    // === 1. 近走着順評価（指数との相関で調整）===
    if (input.pastRaces.length > 0) {
      // 直近3走のうち、有効な着順（競走除外等を除く）のみを対象
      // finishPosition >= 30 は競走除外、失格、データなし等の異常値とみなす
      const INVALID_FINISH_THRESHOLD = 30;
      const recentRaces = input.pastRaces.slice(0, 3);
      const validRaces = recentRaces.filter(r =>
        r.finishPosition > 0 && r.finishPosition < INVALID_FINISH_THRESHOLD
      );

      if (validRaces.length === 0) {
        // 有効なレースがない場合（全て除外等）
        analysis.tags.push('近走データなし');
        analysis.warnings.push('直近3走に有効なレースデータがありません（競走除外等）。');
      } else {
        const avgFinish = validRaces.reduce((sum, r) => sum + r.finishPosition, 0) / validRaces.length;
        const excludedCount = recentRaces.length - validRaces.length;

        // 除外レースがある場合は注記
        if (excludedCount > 0) {
          analysis.tags.push(`除外${excludedCount}回`);
        }

        // 【重要】指数が低いのに着順が良い = 相手が弱かった可能性 → 評価減
        // 【重要】指数が高いのに着順が悪い = 力はある → 評価増
        const hasHighIndices = potential >= 2.5 || makikaeshi >= 2.0;
        const hasLowIndices = potential < 1.5 && makikaeshi < 1.0;

        // 近走成績評価（基本点）
        let finishScore = 0;
        if (avgFinish <= 2.0) {
          finishScore = 12; // 15→12に減（指数との相関で調整するため）
          analysis.tags.push('近走好調');
        } else if (avgFinish <= 3.0) {
          finishScore = 10; // 12→10に減
          analysis.tags.push('安定');
        } else if (avgFinish <= 4.0) {
          finishScore = 7; // 8→7
        } else if (avgFinish <= 5.0) {
          finishScore = 4; // 5→4
        } else if (avgFinish <= 6.0) {
          finishScore = 1; // 2→1
        } else if (avgFinish <= 8.0) {
          finishScore = 0;
        } else if (avgFinish <= 10.0) {
          finishScore = -4; // -5→-4
        } else {
          finishScore = -8; // -10→-8
          analysis.tags.push('近走不振');
        }

        // 【着順×指数の相関調整】
        if (avgFinish <= 3.0 && hasLowIndices) {
          // 着順良いが指数低い → 相手が弱かった可能性
          finishScore -= 4;
          analysis.warnings.push(`着順は良いがポテンシャル・巻き返し指数が低め。相手関係に恵まれた可能性。`);
        } else if (avgFinish >= 6.0 && hasHighIndices) {
          // 着順悪いが指数高い → 力はある
          finishScore += 5;
          analysis.tags.push('指数高');
          analysis.comments.push(`【能力】近走${avgFinish.toFixed(1)}着と凡走も、ポテンシャル${potential.toFixed(1)}/巻き返し${makikaeshi.toFixed(1)}は高水準。今回変わり身期待。`);
        } else if (avgFinish <= 3.0 && hasHighIndices) {
          // 着順良く指数も高い → 本物
          finishScore += 3;
          analysis.comments.push(`【能力】直近${validRaces.length}走の平均着順${avgFinish.toFixed(1)}着と好調。指数も高く本物。`);
        } else if (avgFinish <= 4.0) {
          analysis.comments.push(`【能力】直近${validRaces.length}走の平均着順${avgFinish.toFixed(1)}着。`);
        }

        analysis.score += finishScore;

        // 直近1走の着順も重視（有効なレースの場合のみ）
        const lastRace = recentRaces[0];
        if (lastRace.finishPosition > 0 && lastRace.finishPosition < INVALID_FINISH_THRESHOLD) {
          if (lastRace.finishPosition >= 10 && !hasHighIndices) {
            analysis.score -= 4;
            analysis.warnings.push(`前走${lastRace.finishPosition}着と大敗。立て直しが必要か。`);
          } else if (lastRace.finishPosition >= 10 && hasHighIndices) {
            // 大敗だが指数高い → 巻き返しに期待
            analysis.score -= 1; // ペナルティ軽減
          } else if (lastRace.finishPosition <= 2) {
            analysis.score += 2;
          }
        }

        // 【前走逃げ馬の評価調整】
        // 前走で逃げていた（2角1-2番手）の馬を巻き返し指数で評価
        const lastCorner2 = lastRace.corner2;
        const lastMargin = lastRace.margin ? parseFloat(lastRace.margin) : 0;

        if (lastCorner2 && lastCorner2 === 1) {
          // 巻き返し指数が高い（5.0超）= 負荷の高い逃げ
          if (makikaeshi > 5.0) {
            // 負荷の高い逃げで僅差負け → 高評価
            if (lastRace.finishPosition >= 2 && lastRace.finishPosition <= 4 && lastMargin <= 0.5) {
              analysis.score += 3;
              analysis.comments.push(`【逃げ評価】前走は逃げて${lastRace.finishPosition}着(${lastMargin}差)だが、巻き返し${makikaeshi.toFixed(1)}と負荷の高い逃げ。僅差なら高評価。`);
            } else if (lastRace.finishPosition === 1) {
              analysis.comments.push(`【逃げ評価】前走は逃げて勝利。巻き返し${makikaeshi.toFixed(1)}と負荷の高い逃げで勝ち切った。実力あり。`);
            }
          }
          // 巻き返し指数が低い（5.0以下）= 楽な逃げ、恵まれた可能性
          else {
            // 0に近いほど割引を大きくする（0-5のスケールで調整）
            // makikaeshi 0 → 割引係数1.5、makikaeshi 5 → 割引係数0.5
            const discountFactor = 1.5 - (makikaeshi / 5.0);

            // 前走逃げで好走（3着以内）の場合
            if (lastRace.finishPosition <= 3) {
              const escapeAdjust = Math.round(-4 * discountFactor);
              analysis.score += escapeAdjust;
              analysis.warnings.push(`【逃げ評価】前走は逃げて${lastRace.finishPosition}着。巻き返し${makikaeshi.toFixed(1)}と負荷の高くない逃げで恵まれていたため今回はやや割引(${escapeAdjust}点)。`);
            }
            // 前走逃げでまずまず（4-5着）の場合
            else if (lastRace.finishPosition <= 5) {
              const escapeAdjust = Math.round(-2 * discountFactor);
              analysis.score += escapeAdjust;
              if (escapeAdjust <= -2) {
                analysis.warnings.push(`【逃げ評価】前走は逃げて${lastRace.finishPosition}着。巻き返し${makikaeshi.toFixed(1)}で楽な展開だった可能性(${escapeAdjust}点)。`);
              }
            }
            // 前走逃げで凡走（6着以下）の場合 → 逃げても駄目だった
            else {
              analysis.warnings.push(`【逃げ評価】前走は逃げて${lastRace.finishPosition}着と凡走。逃げても力不足か。`);
            }
          }
        }
      }
    } else {
      // 過去走なし（新馬など）
      analysis.tags.push('初出走');
    }

    // === 2. 競うスコア評価（最大12点、最小-8点）===
    // 絶対値とメンバー内順位の両方を考慮
    const kisoRank = input.memberRanks?.kisoScore || 99;

    if (kisoScore > 0) {
      // 2-1. 競うスコアの絶対値評価（最大6点、最小-6点）
      if (kisoScore >= 75) {
        analysis.score += 6;
        analysis.tags.push('高スコア');
        analysis.comments.push(`【能力】競うスコア${kisoScore.toFixed(1)}は高水準。実力上位。`);
      } else if (kisoScore >= 65) {
        analysis.score += 4;
      } else if (kisoScore >= 55) {
        analysis.score += 2;
      } else if (kisoScore >= 45) {
        // 平均的（加減点なし）
      } else if (kisoScore >= 35) {
        analysis.score -= 2;
      } else {
        analysis.score -= 6;
        analysis.warnings.push(`競うスコア${kisoScore.toFixed(1)}は低水準。能力的に厳しい。`);
      }

      // 2-2. メンバー内順位での追加評価（最大6点、最小-2点）
      if (kisoRank === 1) {
        analysis.score += 6;
        analysis.tags.push('スコア1位');
        analysis.comments.push(`【能力】競うスコア${kisoScore.toFixed(1)}はメンバートップ。`);
      } else if (kisoRank <= 3) {
        analysis.score += 4;
        analysis.tags.push('スコア上位');
      } else if (kisoRank <= 5) {
        analysis.score += 2;
      } else if (kisoRank >= 12) {
        analysis.score -= 2;  // 下位にはペナルティ
      }
    } else {
      // 競うスコアが計算できない場合（データ不足など）
      analysis.score -= 8;
      analysis.warnings.push('競うスコアが計算できません。データ不足の可能性。');
    }

    // === 3. ポテンシャル指数評価（最大6点）===
    // ※potentialは上部で宣言済み
    if (potential > 0) {
      // 高ポテンシャル
      if (potential >= 3.5) {
        analysis.score += 6;
        analysis.tags.push('高ポテンシャル');
        analysis.comments.push(`【能力】ポテンシャル指数${potential.toFixed(1)}は上位。まだ伸びしろがある。`);
      } else if (potential >= 2.5) {
        analysis.score += 4;
      } else if (potential >= 1.5) {
        analysis.score += 2;
      }
    }

    // === 4. 巻き返し指数評価（最大6点）===
    // ※makikaeshiは上部で宣言済み
    if (makikaeshi > 0) {
      if (makikaeshi >= 3.0) {
        analysis.score += 6;
        analysis.tags.push('巻き返し◎');
        analysis.comments.push(`【能力】巻き返し指数${makikaeshi.toFixed(1)}。負けた後に巻き返す傾向あり。`);
      } else if (makikaeshi >= 2.0) {
        analysis.score += 4;
        analysis.tags.push('巻き返しあり');
      } else if (makikaeshi >= 1.0) {
        analysis.score += 2;
      }
    }

    // === 5. キャリアが浅い馬への指数ベース分析（1-2走の馬向け）===
    const raceCount = input.pastRaces.length;
    const relevantForIndex = (input.relevantRaceCount ?? 0) > 0;
    if (raceCount > 0 && raceCount <= 2) {
      // キャリアが浅くてもT2F/L4Fがある場合は展開予想を追加（今回距離帯の過去走があるときのみパーセンタイルを信用）
      const t2f = input.indices?.T2F;
      const l4f = input.indices?.L4F;
      const t2fPercentile = input.memberPercentiles?.T2F || 50;
      const l4fPercentile = input.memberPercentiles?.L4F || 50;

      const developmentComments: string[] = [];

      // T2F（前半速度）が上位なら先行予想
      if (relevantForIndex && t2f && t2fPercentile <= 25) {
        developmentComments.push(`T2F上位${Math.round(t2fPercentile)}%→先行予想`);
        analysis.tags.push('先行力◎');
      } else if (relevantForIndex && t2f && t2fPercentile <= 40) {
        developmentComments.push(`T2F中位→中団前目予想`);
      }

      // L4F（後半速度）が上位なら末脚期待
      if (relevantForIndex && l4f && l4fPercentile <= 25) {
        developmentComments.push(`L4F上位${Math.round(l4fPercentile)}%→末脚◎`);
        analysis.tags.push('末脚◎');
      } else if (relevantForIndex && l4f && l4fPercentile <= 40) {
        developmentComments.push(`L4F中位→堅実な脚`);
      }

      // ポテンシャルが高い＝まだ伸びしろあり
      if (potential >= 3.0) {
        developmentComments.push(`高ポテンシャル→成長期待`);
      }

      // 巻き返しが高い＝前走凡走からの反発期待
      if (makikaeshi >= 2.0 && raceCount >= 1) {
        const lastRace = input.pastRaces[0];
        if (lastRace && lastRace.finishPosition >= 5) {
          developmentComments.push(`巻き返し${makikaeshi.toFixed(1)}→前走${lastRace.finishPosition}着から反発期待`);
        }
      }

      // コメント追加
      if (developmentComments.length > 0) {
        analysis.comments.push(`【指数分析】キャリア${raceCount}走だが指数から予想: ${developmentComments.join('、')}`);
      } else if (relevantForIndex && (t2f || l4f)) {
        // 特筆すべき点がなくても指数があれば触れる
        const t2fStr = t2f ? `T2F${t2f.toFixed(1)}秒(${Math.round(t2fPercentile)}%)` : '';
        const l4fStr = l4f ? `L4F${l4f.toFixed(1)}秒(${Math.round(l4fPercentile)}%)` : '';
        const indexInfo = [t2fStr, l4fStr].filter(s => s).join('、');
        if (indexInfo) {
          analysis.comments.push(`【指数分析】キャリア${raceCount}走。${indexInfo}。まだサンプル不足だが傾向として参考に。`);
        }
      }
    }
  }

  /**
   * コース適性を分析（改善版：具体的な実績ベース + 新コースDB活用）
   * 
   * コースの定義：競馬場 + 芝/ダート + 距離（±100m）
   * 例：京都芝1200m、中山ダ1800m
   */
  private analyzeCourseMatch(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    const courseInfo = getCourseInfo(input.place);
    if (!courseInfo) {
      analysis.courseMatch = { rating: 'C', reason: 'コース情報なし' };
      return;
    }

    /** 競馬場名の比較用（開催回・東西を除いて一致判定） */
    const normalizeVenue = (p: string) =>
      !p
        ? ''
        : p
            .replace(/^[0-9０-９]+/, '')
            .replace(/[0-9０-９]+$/, '')
            .replace(/(東|西)$/, '')
            .trim();

    // 新コースデータベースから詳細情報を取得（内部判断用）
    const surface = input.surface === '芝' ? '芝' : 'ダート';
    const detailedCourse = getDetailedCourseInfo(input.place, surface as '芝' | 'ダート', input.distance);

    const similarCourses = findSimilarCourses(input.place);
    const courseName = `${input.place}${input.surface}${input.distance}m`;
    const inputVenueNorm = normalizeVenue(input.place);

    // 競走除外等（着順30以上）は除外
    const INVALID_FINISH_THRESHOLD = 30;
    // 距離の許容範囲（±100m）
    const DISTANCE_TOLERANCE = 100;

    // 同コース（競馬場+芝ダ+距離±100m）での成績
    let exactCoursePerformances: { finish: number; popularity: number; distance: number }[] = [];
    // 同競馬場・同馬場（距離問わず）での成績
    let samePlacePerformances: { finish: number; popularity: number; distance: number }[] = [];
    // 類似コース（平坦/坂が同じ競馬場）での成績
    let similarCoursePerfomances: { place: string; finish: number; popularity: number; distance: number }[] = [];

    for (const race of input.pastRaces) {
      if (race.surface !== input.surface) continue;
      // 競走除外、失格等のレースは成績評価に含めない
      if (race.finishPosition <= 0 || race.finishPosition >= INVALID_FINISH_THRESHOLD) continue;

      if (normalizeVenue(race.place) === inputVenueNorm) {
        // 同競馬場・同馬場の場合
        samePlacePerformances.push({ finish: race.finishPosition, popularity: race.popularity, distance: race.distance });

        // 距離も近い場合は完全一致コースとしてカウント
        if (Math.abs(race.distance - input.distance) <= DISTANCE_TOLERANCE) {
          exactCoursePerformances.push({ finish: race.finishPosition, popularity: race.popularity, distance: race.distance });
        }
      } else if (similarCourses.some((s) => normalizeVenue(s) === normalizeVenue(race.place))) {
        similarCoursePerfomances.push({ place: race.place, finish: race.finishPosition, popularity: race.popularity, distance: race.distance });
      }
    }

    // 着順を読みやすい形式に変換
    const formatFinishes = (perfs: { finish: number }[], maxShow: number = 5): string => {
      return perfs.slice(0, maxShow).map(p => `${p.finish}着`).join('→');
    };

    // 評価
    let rating: 'S' | 'A' | 'B' | 'C' | 'D' = 'C';
    let reason = '';

    // 1. 完全一致コース（競馬場+芝ダ+距離±100m）での実績を最優先
    if (exactCoursePerformances.length >= 1) {
      const goodCount = exactCoursePerformances.filter(p => p.finish <= 3).length;
      const rate = exactCoursePerformances.length > 0 ? goodCount / exactCoursePerformances.length : 0;
      const finishStr = formatFinishes(exactCoursePerformances);

      if (exactCoursePerformances.length >= 2 && rate >= 0.7) {
        rating = 'S';
        reason = `${courseName}を${exactCoursePerformances.length}回走り${finishStr}と得意`;
        analysis.score += 5;
        analysis.tags.push(`${input.place}巧者`);
        analysis.comments.push(`【コース】${courseName}を${exactCoursePerformances.length}回走り、${finishStr}と崩れていない。得意コース。`);
      } else if (exactCoursePerformances.length >= 2 && rate >= 0.5) {
        rating = 'A';
        reason = `${courseName}を${exactCoursePerformances.length}回走り${finishStr}`;
        analysis.score += 3;
        analysis.comments.push(`【コース】${courseName}を${exactCoursePerformances.length}回走り、${finishStr}。コース適性あり。`);
      } else if (exactCoursePerformances.length === 1) {
        // 1回のみの場合
        const finish = exactCoursePerformances[0].finish;
        if (finish <= 3) {
          rating = 'A';
          reason = `${courseName}で${finish}着の実績`;
          analysis.score += 2;
          analysis.comments.push(`【コース】${courseName}で${finish}着の好走実績あり。`);
        } else if (finish >= 8) {
          rating = 'C';
          reason = `${courseName}で${finish}着`;
        } else {
          rating = 'B';
          reason = `${courseName}で${finish}着`;
        }
      } else if (rate <= 0.2 && exactCoursePerformances.length >= 3) {
        rating = 'D';
        reason = `${courseName}を${exactCoursePerformances.length}回走り${finishStr}と苦戦`;
        analysis.score -= 2;
        analysis.warnings.push(`${courseName}を${exactCoursePerformances.length}回走り、${finishStr}と苦戦。コース適性に疑問。`);
      } else {
        // 中間的な成績
        rating = 'B';
        reason = `${courseName}を${exactCoursePerformances.length}回走り${finishStr}`;
      }
    }
    // 2. 完全一致がない場合、同競馬場・同馬場での実績を参照
    else if (samePlacePerformances.length >= 2) {
      const goodCount = samePlacePerformances.filter(p => p.finish <= 3).length;
      const rate = goodCount / samePlacePerformances.length;
      const finishStr = formatFinishes(samePlacePerformances);

      if (rate >= 0.6) {
        rating = 'A';
        reason = `${input.place}${input.surface}で${finishStr}（距離異なる）`;
        analysis.score += 2;
        analysis.comments.push(`【コース】${courseName}は初だが、${input.place}${input.surface}で${samePlacePerformances.length}回走り${finishStr}。競馬場適性あり。`);
      } else if (rate <= 0.2 && samePlacePerformances.length >= 3) {
        rating = 'D';
        reason = `${input.place}${input.surface}で${finishStr}と苦戦`;
        analysis.score -= 1;
        analysis.warnings.push(`${input.place}${input.surface}で${samePlacePerformances.length}回走り${finishStr}と苦戦。`);
      } else {
        rating = 'B';
        reason = `${input.place}${input.surface}で${finishStr}`;
      }
    }
    // 3. 類似コース（平坦/坂が同じ競馬場）での実績を参照
    else if (similarCoursePerfomances.length >= 2) {
      const goodCount = similarCoursePerfomances.filter(p => p.finish <= 3).length;
      const rate = goodCount / similarCoursePerfomances.length;
      const similarPlaces = [...new Set(similarCoursePerfomances.map(p => p.place))].slice(0, 2).join('・');
      const finishStr = formatFinishes(similarCoursePerfomances);

      if (rate >= 0.6) {
        rating = 'B';
        reason = `類似コース（${similarPlaces}）で${finishStr}`;
        analysis.score += 1;
        analysis.comments.push(`【コース】${courseName}は初。類似の${similarPlaces}${input.surface}で${finishStr}。`);
      } else if (rate <= 0.2 && similarCoursePerfomances.length >= 3) {
        rating = 'D';
        reason = `類似コースで苦戦傾向`;
        analysis.score -= 1;
      } else {
        rating = 'C';
        reason = `類似コースでまずまず`;
      }
    }
    // 4. データ不足 → 指数ベースで判断
    else {
      rating = 'C';
      reason = `${courseName}の実績なし`;
      analysis.tags.push('初コース');

      // メンバー内T2F/L4Fパーセンタイルは「今回距離±200mの過去走から算出した指数」の比較に意味がある
      const relevantRaceCount = input.relevantRaceCount ?? 0;
      const t2fPercentile = input.memberPercentiles?.T2F || 50;
      const l4fPercentile = input.memberPercentiles?.L4F || 50;
      const potential = input.indices?.potential || 0;

      // 今回距離帯の過去走が無いのに「2600m初走だが指数上位」と出ると誤解を招くため、relevantRaceCount>0 のときだけ指数補完を使う
      if (relevantRaceCount > 0 && (t2fPercentile <= 20 || l4fPercentile <= 20) && potential >= 2.0) {
        rating = 'B';
        reason = `${courseName}は初だが指数上位`;
        analysis.score += 1;
        analysis.comments.push(
          `【コース】${courseName}は当該距離の過去走は少ないが、今回距離帯の指数がメンバー内で上位（T2F:${Math.round(t2fPercentile)}%、L4F:${Math.round(l4fPercentile)}%）のため適応可能性あり。`
        );
      } else if (relevantRaceCount > 0 && t2fPercentile <= 30 && l4fPercentile <= 30) {
        reason = `${courseName}は初だが指数まずまず`;
        analysis.comments.push(`【コース】${courseName}の当該コース実績なし。今回距離帯の指数からは平均以上の適性がありそう。`);
      } else if (relevantRaceCount === 0) {
        analysis.warnings.push(
          `${courseName}は過去に同一条件の実績がなく、かつ今回距離±200mの過去走もないため、メンバー内のT2F/L4F順位は当てになりにくい。`
        );
      }
    }

    analysis.courseMatch = { rating, reason };

    // 新コースデータベースの詳細情報（枠順は別の関数で処理、ここでは重複しない）
    if (detailedCourse) {
      // 坂の有無のタグのみ
      if (detailedCourse.hasSlope && detailedCourse.slopeDescription?.includes('急坂')) {
        analysis.tags.push('急坂コース');
      }
    }
  }

  /**
   * ローテーション分析
   */
  private analyzeRotation(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    if (input.pastRaces.length === 0) {
      analysis.rotationNote = '過去走データなし';
      return;
    }

    const raceDate = parseDate(input.raceDate);
    const prevDate = parseDate(input.pastRaces[0].date);

    if (!raceDate || !prevDate) {
      return;
    }

    const days = daysBetween(raceDate, prevDate);
    const weeks = weeksInterval(days);

    // 休み明け分析
    if (days >= 90) {
      // 3ヶ月以上の休み明け
      analysis.tags.push('休み明け');
      analysis.rotationNote = `約${weeks}週の休み明け`;

      // 過去の休み明け成績を確認（競走除外等は除く）
      const INVALID_FINISH = 30;
      let restGoodCount = 0;
      let restTotalCount = 0;

      for (let i = 0; i < input.pastRaces.length - 1; i++) {
        const current = parseDate(input.pastRaces[i].date);
        const prev = parseDate(input.pastRaces[i + 1].date);
        const finish = input.pastRaces[i].finishPosition;

        // 競走除外等は評価対象外
        if (finish <= 0 || finish >= INVALID_FINISH) continue;

        if (current && prev) {
          const interval = daysBetween(current, prev);
          if (interval >= 90) {
            restTotalCount++;
            if (finish <= 3) {
              restGoodCount++;
            }
          }
        }
      }

      if (restTotalCount >= 2) {
        if (restGoodCount >= restTotalCount * 0.5) {
          analysis.comments.push(`【ローテ】${weeks}週の休み明け。過去${restTotalCount}走中${restGoodCount}回好走と休み明け得意。`);
          analysis.score += 3; // 8→3に縮小
          analysis.tags.push('休み明け◎');
        } else {
          analysis.comments.push(`【ローテ】${weeks}週の休み明け。休み明け成績は${restTotalCount}走中${restGoodCount}回と割引。`);
          analysis.score -= 2; // 5→2に縮小
          analysis.warnings.push('休み明け成績不振');
        }
      } else {
        analysis.comments.push(`【ローテ】${weeks}週の休み明け。`);
      }
    }
    // 間隔詰め（2週以内）
    else if (days <= 14) {
      analysis.tags.push('間隔詰め');
      analysis.rotationNote = `中${weeks}週での参戦`;

      // 過去の間隔詰め成績を確認（競走除外等は除く）
      const INVALID_FINISH_SHORT = 30;
      let shortGoodCount = 0;
      let shortTotalCount = 0;

      for (let i = 0; i < input.pastRaces.length - 1; i++) {
        const current = parseDate(input.pastRaces[i].date);
        const prev = parseDate(input.pastRaces[i + 1].date);
        const finish = input.pastRaces[i].finishPosition;

        // 競走除外等は評価対象外
        if (finish <= 0 || finish >= INVALID_FINISH_SHORT) continue;

        if (current && prev) {
          const interval = daysBetween(current, prev);
          if (interval <= 14) {
            shortTotalCount++;
            if (finish <= 3) {
              shortGoodCount++;
            }
          }
        }
      }

      if (shortTotalCount >= 2) {
        if (shortGoodCount >= shortTotalCount * 0.5) {
          analysis.comments.push(`【ローテ】中${weeks}週での参戦。間隔詰めで結果を出すタイプ。`);
          analysis.score += 2; // 5→2に縮小
          analysis.tags.push('間隔詰め◎');
        } else {
          analysis.comments.push(`【ローテ】中${weeks}週での参戦。間隔詰めは割引。`);
          analysis.score -= 2; // 5→2に縮小
          analysis.warnings.push('間隔詰めで成績低下');
        }
      }
    }
    // 叩き2戦目（3-5週）
    else if (days >= 21 && days <= 35) {
      // 前走が休み明けだったか確認
      if (input.pastRaces.length >= 2) {
        const prevDate1 = parseDate(input.pastRaces[0].date);
        const prevDate2 = parseDate(input.pastRaces[1].date);

        if (prevDate1 && prevDate2) {
          const prevInterval = daysBetween(prevDate1, prevDate2);

          if (prevInterval >= 90) {
            analysis.tags.push('叩き2戦目');
            analysis.comments.push(`【ローテ】休み明け叩いての2戦目。上積み期待。`);
            analysis.score += 2; // 5→2に縮小
          }
        }
      }
    }
  }

  /**
   * 脚質・展開分析（T2F/L4F指数活用版）
   * 
   * 改善版：
   * - 今回距離±200mの過去走のみで比較
   * - パーセンタイル25%以内を「上位」と定義
   * - 比較対象データ数を考慮
   */
  private analyzeRunningStyle(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    if (input.pastRaces.length === 0) return;

    // 過去の通過順位から脚質を判定（距離フィルタなし、全体傾向を見る）
    let totalCorner2 = 0;
    let cornerCount = 0;

    for (const race of input.pastRaces.slice(0, 10)) {
      if (race.corner2) {
        totalCorner2 += race.corner2;
        cornerCount++;
      }
    }

    // パーセンタイルと比較データ数
    const t2fPercentile = input.memberPercentiles?.T2F ?? 100;
    const l4fPercentile = input.memberPercentiles?.L4F ?? 100;
    const t2fDataCount = input.memberPercentiles?.T2FDataCount ?? 0;
    const l4fDataCount = input.memberPercentiles?.L4FDataCount ?? 0;
    const relevantRaceCount = input.relevantRaceCount ?? 0;

    // 指数値
    const avgT2F = input.indices?.T2F || 0;
    const avgL4F = input.indices?.L4F || 0;

    // 上位判定閾値（パーセンタイル25%以内 = 上位25%）
    const TOP_PERCENTILE = 25;
    // 比較に必要な最低データ数（通常は3頭以上だが、1-2走馬は緩和）
    const raceCount = input.pastRaces.length;
    const MIN_DATA_COUNT = raceCount <= 2 ? 2 : 3; // 若馬は2頭で比較OK

    if (cornerCount > 0) {
      const avgCorner2 = totalCorner2 / cornerCount;

      // T2F上位（前半速い）の判定
      // 条件：パーセンタイル25%以内 かつ 比較対象MIN頭以上 かつ 該当距離経験あり
      const isT2FTop = t2fPercentile <= TOP_PERCENTILE && t2fDataCount >= MIN_DATA_COUNT && relevantRaceCount > 0;

      // L4F上位（後半速い）の判定
      const isL4FTop = l4fPercentile <= TOP_PERCENTILE && l4fDataCount >= MIN_DATA_COUNT && relevantRaceCount > 0;

      // T2F上位で位置が取れている（最大3点）
      if (avgCorner2 <= 4 && isT2FTop) {
        analysis.tags.push('先行力◎');
        analysis.comments.push(`【展開】T2F指数${avgT2F.toFixed(1)}秒はメンバー上位${t2fPercentile}%。前半のスピードあり。`);
        analysis.score += 3; // 6→3に縮小
      }
      // L4F上位で後方から
      else if (avgCorner2 >= 7 && isL4FTop) {
        analysis.tags.push('末脚◎');
        analysis.comments.push(`【展開】L4F指数${avgL4F.toFixed(1)}はメンバー上位${l4fPercentile}%。差し・追込向き。`);
        analysis.score += 3; // 6→3に縮小
      }
      // T2F上位だが後方に位置している
      else if (avgCorner2 >= 6 && isT2FTop) {
        analysis.tags.push('先行力あり');
        analysis.score += 1; // 3→1に縮小
      }
      // L4F上位で先行している
      else if (avgCorner2 <= 4 && isL4FTop) {
        analysis.tags.push('末脚あり');
        analysis.score += 2; // 4→2に縮小
      }
      // 該当距離のデータがない場合
      else if (relevantRaceCount === 0) {
        // コメントなし
      }
      // 位置が取れないのにスピードも下位
      else if (avgCorner2 >= 8 && t2fPercentile >= 75 && t2fDataCount >= MIN_DATA_COUNT) {
        analysis.warnings.push(`2角平均${avgCorner2.toFixed(1)}番手と後方。T2F指数も下位。`);
        analysis.score -= 1; // 3→1に縮小
      }

      // 脚質タグ
      if (avgCorner2 <= 3) {
        analysis.tags.push('逃げ/先行');
      } else if (avgCorner2 <= 6) {
        analysis.tags.push('先行/差し');
      } else {
        analysis.tags.push('差し/追込');
      }
    } else if (relevantRaceCount >= 1 && (avgT2F > 0 || avgL4F > 0)) {
      // 通過順位データがないが指数はある（1-2走馬など）
      // 指数ベースで展開予想を提供
      const isT2FTop = t2fPercentile <= TOP_PERCENTILE && t2fDataCount >= 2;
      const isL4FTop = l4fPercentile <= TOP_PERCENTILE && l4fDataCount >= 2;

      if (isT2FTop && isL4FTop) {
        analysis.comments.push(`【展開】T2F上位${t2fPercentile}%・L4F上位${l4fPercentile}%で総合力あり。展開不問。`);
        analysis.score += 2;
      } else if (isT2FTop) {
        analysis.comments.push(`【展開】T2F指数${avgT2F.toFixed(1)}秒は上位${t2fPercentile}%。前半から位置を取れそう。`);
        analysis.score += 1;
      } else if (isL4FTop) {
        analysis.comments.push(`【展開】L4F指数${avgL4F.toFixed(1)}は上位${l4fPercentile}%。後半の脚に期待。`);
        analysis.score += 1;
      } else if (avgT2F > 0 && avgL4F > 0) {
        // 指数はあるが上位ではない
        analysis.comments.push(`【展開】T2F${avgT2F.toFixed(1)}秒(${Math.round(t2fPercentile)}%)、L4F${avgL4F.toFixed(1)}(${Math.round(l4fPercentile)}%)。指数は平均的。`);
      }
    }
  }

  /**
   * 枠順分析（馬場状態を考慮）
   */
  /**
   * 枠順分析
   * 
   * 【重要】有利不利判定は必ず「競馬場＋芝/ダート＋距離＋馬場状態」の
   * 組み合わせで定義されたコースDBのみを参照する。
   * コースDBにデータがない場合は「フラット」として加減点しない。
   */
  private analyzeWaku(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    const trackCondition = input.trackCondition || '良';
    const surface = input.surface === 'ダ' ? 'ダート' : '芝';
    const courseName = `${input.place}${input.surface}${input.distance}m`;

    // 詳細コース情報から馬場状態別の枠順有利を取得（ユーザー定義のコースDBのみ）
    let gateAdvantage: string | undefined;

    const conditionInfo = getCourseCharacteristicsForCondition(
      input.place,
      input.distance,
      surface as '芝' | 'ダート',
      trackCondition
    );
    gateAdvantage = conditionInfo?.gateAdvantage;

    // 【前走枠不利 → 今回好枠/フラット】のボーナス評価
    this.analyzeGateImprovement(input, analysis, gateAdvantage);

    // コースDBに有利不利の定義がない場合は「フラット」として加減点しない
    if (!gateAdvantage || gateAdvantage.includes('影響少ない') || gateAdvantage.includes('フラット')) {
      return;
    }

    // 馬場状態による枠順の有利不利を判定（最大3点、最小-4点）
    // 外枠有利のコース
    if (gateAdvantage.includes('外枠有利')) {
      if (input.waku >= 7) {
        // 7-8枠：最も有利
        if (trackCondition === '良') {
          analysis.comments.push(`【枠順】${input.waku}枠は好枠。このコースでは有利に運べる。`);
          analysis.score += 3;
          analysis.tags.push('好枠');
        } else if (trackCondition === '稍') {
          analysis.score += 2;
          analysis.tags.push('好枠');
        } else {
          analysis.score += 1; // 重・不良でもやや有利
        }
      } else if (input.waku >= 5) {
        // 5-6枠：やや有利
        if (trackCondition === '良' || trackCondition === '稍') {
          analysis.score += 1;
        }
      } else if (input.waku <= 2) {
        // 1-2枠：最も不利（一段階評価を落とす）
        if (trackCondition === '良') {
          analysis.warnings.push(`【枠順】${input.waku}枠はこのコースでやや厳しい。一段階評価ダウン。`);
          analysis.score -= 4;
          analysis.tags.push('枠不利');
        } else if (trackCondition === '稍') {
          analysis.warnings.push(`【枠順】${input.waku}枠はこのコースでやや不利。`);
          analysis.score -= 3;
          analysis.tags.push('枠不利');
        } else {
          analysis.score -= 1; // 重・不良では不利が薄れる
        }
      } else if (input.waku <= 4) {
        // 3-4枠：やや不利
        if (trackCondition === '良' || trackCondition === '稍') {
          analysis.warnings.push(`【枠順】${input.waku}枠はこのコースでやや不利。`);
          analysis.score -= 2;
        }
      }
    }
    // 内枠有利のコース
    else if (gateAdvantage.includes('内枠有利')) {
      if (input.waku <= 2) {
        // 1-2枠：最も有利
        analysis.comments.push(`【枠順】${input.waku}枠は好枠。このコースでは有利に運べる。`);
        analysis.score += 3;
        analysis.tags.push('好枠');
      } else if (input.waku <= 4) {
        // 3-4枠：やや有利
        analysis.score += 1;
      } else if (input.waku >= 7) {
        // 7-8枠：最も不利（一段階評価を落とす）
        if (trackCondition === '良') {
          analysis.warnings.push(`【枠順】${input.waku}枠はこのコースでやや厳しい。一段階評価ダウン。`);
          analysis.score -= 4;
          analysis.tags.push('枠不利');
        } else if (trackCondition === '稍') {
          analysis.warnings.push(`【枠順】${input.waku}枠はこのコースでやや不利。`);
          analysis.score -= 3;
          analysis.tags.push('枠不利');
        } else {
          analysis.score -= 1;
        }
      } else if (input.waku >= 5) {
        // 5-6枠：やや不利
        if (trackCondition === '良' || trackCondition === '稍') {
          analysis.warnings.push(`【枠順】${input.waku}枠はこのコースでやや不利。`);
          analysis.score -= 2;
        }
      }
    }
  }

  /**
   * 前走枠不利 → 今回好枠/フラットの場合のボーナス評価
   */
  private analyzeGateImprovement(
    input: HorseAnalysisInput,
    analysis: SagaAnalysis,
    currentGateAdvantage: string | undefined
  ): void {
    if (input.pastRaces.length === 0) return;

    const lastRace = input.pastRaces[0];
    if (!lastRace.place || !lastRace.distance) return;

    // 前走のコース情報を取得
    const lastSurface = lastRace.surface === 'ダ' ? 'ダート' : '芝';
    const lastConditionInfo = getCourseCharacteristicsForCondition(
      lastRace.place,
      lastRace.distance,
      lastSurface as '芝' | 'ダート',
      '良' // 前走の馬場状態は不明なので良で判定
    );
    const lastGateAdvantage = lastConditionInfo?.gateAdvantage;

    // 前走の枠番を推定（corner2から推測、なければスキップ）
    // ※ 前走の枠番データがないため、通過順位から推測
    const lastCorner2 = lastRace.corner2;
    if (!lastCorner2) return;

    // 前走で枠不利だったかを判定
    let wasUnfavorableGate = false;
    let lastGateInfo = '';

    if (lastGateAdvantage) {
      if (lastGateAdvantage.includes('外枠有利') && lastCorner2 <= 3) {
        // 外枠有利コースで前走が前目（内枠だった可能性）
        wasUnfavorableGate = true;
        lastGateInfo = `前走は枠が合わなかった`;
      } else if (lastGateAdvantage.includes('内枠有利') && lastCorner2 >= 10) {
        // 内枠有利コースで前走が後方（外枠だった可能性）
        wasUnfavorableGate = true;
        lastGateInfo = `前走は枠が合わなかった`;
      }
    }

    if (!wasUnfavorableGate) return;

    // 今回の枠が有利/フラットかを判定
    const isCurrentFavorable = analysis.tags.includes('好枠');
    const isCurrentFlat = !currentGateAdvantage ||
      currentGateAdvantage.includes('影響少ない') ||
      currentGateAdvantage.includes('フラット');
    const isCurrentNotUnfavorable = !analysis.tags.includes('枠不利');

    // 前走枠不利 → 今回好枠
    if (wasUnfavorableGate && isCurrentFavorable) {
      analysis.score += 4;
      analysis.comments.push(`【枠順改善】${lastGateInfo}が、今回は好枠で巻き返し期待。`);
      analysis.tags.push('枠改善◎');
    }
    // 前走枠不利 → 今回フラット
    else if (wasUnfavorableGate && isCurrentFlat && isCurrentNotUnfavorable) {
      analysis.score += 2;
      analysis.comments.push(`【枠順改善】${lastGateInfo}が、今回は条件好転。`);
      analysis.tags.push('枠改善');
    }
  }

  /**
   * 距離適性分析（T2F/L4F指数活用版）
   * 
   * 改善版：
   * - 今回距離±200mでの過去走の指数をパーセンタイルで比較
   * - 比較対象データ数を考慮
   */
  private analyzeDistance(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    if (input.pastRaces.length === 0) return;

    const targetDist = input.distance;
    const prevDist = input.pastRaces[0]?.distance || targetDist;
    const distDiff = targetDist - prevDist;

    // パーセンタイルと比較データ数
    const t2fPercentile = input.memberPercentiles?.T2F ?? 100;
    const l4fPercentile = input.memberPercentiles?.L4F ?? 100;
    const t2fDataCount = input.memberPercentiles?.T2FDataCount ?? 0;
    const l4fDataCount = input.memberPercentiles?.L4FDataCount ?? 0;
    const relevantRaceCount = input.relevantRaceCount ?? 0;

    // 指数値（今回距離帯での平均）
    const avgT2F = input.indices?.T2F || 0;
    const avgL4F = input.indices?.L4F || 0;

    // 上位判定閾値
    const TOP_PERCENTILE = 25;
    const MIN_DATA_COUNT = 3;

    const isT2FTop = t2fPercentile <= TOP_PERCENTILE && t2fDataCount >= MIN_DATA_COUNT;
    const isL4FTop = l4fPercentile <= TOP_PERCENTILE && l4fDataCount >= MIN_DATA_COUNT;

    // 距離短縮の場合（最大2点）
    if (distDiff <= -200) {
      const shortAmount = Math.abs(distDiff);

      // T2Fが上位（前半速い）+ 短縮 = スピード生かせる
      if (isT2FTop && relevantRaceCount > 0) {
        analysis.comments.push(`【距離】${prevDist}mから${shortAmount}m短縮。T2F指数上位で短縮プラス。`);
        analysis.score += 2; // 8→2に縮小
        analysis.tags.push('短縮◎');
      }
      // T2Fは普通だが、位置取りが後方だった馬
      else if (input.pastRaces[0]?.corner2 && input.pastRaces[0].corner2 >= 8) {
        if (t2fPercentile >= 50 && t2fDataCount >= MIN_DATA_COUNT) {
          analysis.warnings.push(`前走後方。短縮でも位置取り疑問。`);
          analysis.score -= 1; // 3→1に縮小
        }
      }
    }

    // 距離延長の場合（最大2点）
    else if (distDiff >= 200) {
      const extendAmount = distDiff;

      // L4Fが上位（後半速い）+ 延長 = しまい生かせる
      if (isL4FTop && relevantRaceCount > 0) {
        analysis.comments.push(`【距離】${prevDist}mから${extendAmount}m延長。L4F指数上位で延長プラス。`);
        analysis.score += 2; // 6→2に縮小
        analysis.tags.push('延長◎');
      }
      // 位置取りが前で、延長、かつL4F下位
      else if (
        relevantRaceCount > 0 &&
        input.pastRaces[0]?.corner2 &&
        input.pastRaces[0].corner2 <= 3
      ) {
        if (l4fPercentile >= 75 && l4fDataCount >= MIN_DATA_COUNT) {
          analysis.warnings.push(`前走先行。L4F下位で延長は疑問。`);
          analysis.score -= 1; // 4→1に縮小
        }
      }
    }

    // 同距離での成績分析（実績ベース、最大2点）
    // 競走除外等（着順30以上）は除外
    const INVALID_FINISH = 30;
    let sameDistGood = 0;
    let sameDistTotal = 0;

    for (const race of input.pastRaces) {
      if (race.surface !== input.surface) continue;
      // 競走除外、失格等は成績評価に含めない
      if (race.finishPosition <= 0 || race.finishPosition >= INVALID_FINISH) continue;
      if (Math.abs(race.distance - targetDist) <= 100) {
        sameDistTotal++;
        if (race.finishPosition <= 3) sameDistGood++;
      }
    }

    if (sameDistTotal >= 3) {
      const rate = sameDistGood / sameDistTotal;
      if (rate >= 0.6) {
        analysis.comments.push(`【距離】${targetDist}m前後で${sameDistTotal}走中${sameDistGood}回好走。距離適性あり。`);
        analysis.score += 2; // 8→2に縮小
        analysis.tags.push('距離実績◎');
      } else if (rate <= 0.2 && sameDistTotal >= 4) {
        analysis.warnings.push(`${targetDist}m前後で${sameDistTotal}走中${sameDistGood}回と苦戦。`);
        analysis.score -= 1; // 5→1に縮小
      }
    }
  }

  /**
   * 休み明け得意・不得意判定
   * - 今回が3ヶ月以上の休み明けかチェック
   * - 過去の休み明けレースでの成績から得意・不得意を判定
   */
  private analyzeLayoffPattern(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    if (input.pastRaces.length < 2) return;

    // 日付をパースしてミリ秒に変換
    const parseDate = (dateStr: string): number | null => {
      if (!dateStr) return null;
      // "2024.01.15" or "2024-01-15" or "2024/01/15" 形式を想定
      const cleaned = dateStr.replace(/[\s\-\/]/g, '.').trim();
      const parts = cleaned.split('.');
      if (parts.length < 3) return null;
      const [year, month, day] = parts.map(p => parseInt(p, 10));
      if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
      return new Date(year, month - 1, day).getTime();
    };

    // 今回のレース日
    const currentRaceDate = parseDate(input.raceDate);
    if (!currentRaceDate) return;

    // 前走の日付
    const lastRaceDate = parseDate(input.pastRaces[0]?.date);
    if (!lastRaceDate) return;

    // 今回が休み明けかどうか（3ヶ月 = 約90日）
    const LAYOFF_THRESHOLD_DAYS = 90;
    const daysSinceLastRace = (currentRaceDate - lastRaceDate) / (1000 * 60 * 60 * 24);
    const isCurrentLayoff = daysSinceLastRace >= LAYOFF_THRESHOLD_DAYS;

    if (!isCurrentLayoff) return; // 今回が休み明けでなければ終了

    // 過去の休み明けレースを特定して成績を集計
    let layoffRaces = 0;
    let layoffTop3 = 0;
    const INVALID_FINISH = 30; // 競走除外等

    for (let i = 0; i < input.pastRaces.length - 1; i++) {
      const race = input.pastRaces[i];
      const prevRace = input.pastRaces[i + 1];

      const raceDate = parseDate(race.date);
      const prevRaceDate = parseDate(prevRace.date);
      if (!raceDate || !prevRaceDate) continue;

      const daysBetween = (raceDate - prevRaceDate) / (1000 * 60 * 60 * 24);

      // 3ヶ月以上空いていた＝休み明けレース
      if (daysBetween >= LAYOFF_THRESHOLD_DAYS) {
        // 競走除外等は除外
        if (race.finishPosition > 0 && race.finishPosition < INVALID_FINISH) {
          layoffRaces++;
          if (race.finishPosition <= 3) {
            layoffTop3++;
          }
        }
      }
    }

    // 休み明けデータが2回以上ないと判定しない
    if (layoffRaces < 2) {
      // 休み明けデータが少ない場合は注意のみ
      const monthsOff = Math.floor(daysSinceLastRace / 30);
      analysis.comments.push(`【休み明け】約${monthsOff}ヶ月ぶり。休み明けデータ${layoffRaces}回と少なく傾向不明。`);
      return;
    }

    // 3着以内率を計算
    const top3Rate = layoffTop3 / layoffRaces;
    const monthsOff = Math.floor(daysSinceLastRace / 30);

    // 判定
    if (top3Rate >= 0.6) {
      // かなり得意（60%以上）
      analysis.comments.push(`【休み明け】約${monthsOff}ヶ月ぶり。過去休み明け${layoffRaces}走で3着内${layoffTop3}回（${Math.round(top3Rate * 100)}%）と非常に得意！`);
      analysis.tags.push('休み明け◎');
      analysis.score += 8;
    } else if (top3Rate >= 0.5) {
      // 得意（50%以上）
      analysis.comments.push(`【休み明け】約${monthsOff}ヶ月ぶり。過去休み明け${layoffRaces}走で3着内${layoffTop3}回（${Math.round(top3Rate * 100)}%）と得意。`);
      analysis.tags.push('休み明け○');
      analysis.score += 5;
    } else if (top3Rate >= 0.2) {
      // 普通（20%〜50%）
      analysis.comments.push(`【休み明け】約${monthsOff}ヶ月ぶり。過去休み明け${layoffRaces}走で3着内${layoffTop3}回（${Math.round(top3Rate * 100)}%）と普通。`);
      // スコア調整なし
    } else {
      // 苦手（20%未満）
      analysis.comments.push(`【休み明け】約${monthsOff}ヶ月ぶり。過去休み明け${layoffRaces}走で3着内${layoffTop3}回（${Math.round(top3Rate * 100)}%）と苦手…`);
      analysis.tags.push('休み明け▲');
      analysis.warnings.push(`休み明けが苦手なタイプ。過去${layoffRaces}走で好走わずか${layoffTop3}回。`);
      analysis.score -= 5;
    }
  }

  /**
   * 牝馬限定戦判定ロジック
   * 
   * 今回が牝馬限定戦の場合、過去走でダート牡馬混合戦に出走して
   * 好走した経験があれば評価アップ
   * 
   * ロジック:
   * - 今回のレースが牝馬限定戦で、この馬が牝馬である
   * - 過去走でダート牡馬混合戦（牝馬限定ではない）に出走経験あり
   * - その牡馬混合戦で好走（3着以内）していれば加点
   * - 特にダート牡馬混合で勝利経験があれば大きく加点
   */
  private analyzeFilliesOnlyRace(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    // 今回が牝馬限定戦でない場合はスキップ
    if (!input.isFilliesOnlyRace) return;
    
    // 馬が牝馬でない場合はスキップ（セン馬は牝馬限定戦に出走不可）
    if (input.gender !== '牝') return;
    
    const pastRaces = input.pastRaces || [];
    if (pastRaces.length === 0) return;
    
    // 過去走で牡馬混合戦の成績を集計
    let mixedGenderRaces = 0;
    let mixedGenderTop3 = 0;
    let mixedGenderWins = 0;
    let dirtMixedTop3 = 0;
    let dirtMixedWins = 0;
    
    for (const race of pastRaces) {
      // 牡馬混合戦（牝馬限定ではない）の場合
      if (race.isMixedGenderRace === true || race.isMixedGenderRace === undefined) {
        // クラス名から牝馬限定戦を推測（「牝」を含む場合は牝馬限定）
        const className = race.className || '';
        const isFilliesRace = className.includes('牝') || className.includes('フィリーズ');
        
        if (!isFilliesRace) {
          mixedGenderRaces++;
          
          if (race.finishPosition <= 3 && race.finishPosition > 0) {
            mixedGenderTop3++;
            
            // ダートの牡馬混合で好走
            if (race.surface === 'ダ') {
              dirtMixedTop3++;
            }
          }
          
          if (race.finishPosition === 1) {
            mixedGenderWins++;
            if (race.surface === 'ダ') {
              dirtMixedWins++;
            }
          }
        }
      }
    }
    
    // 牡馬混合戦の経験がない場合はスキップ
    if (mixedGenderRaces === 0) return;
    
    // 評価
    if (dirtMixedWins >= 1 && input.surface === 'ダ') {
      // ダート牡馬混合で勝利経験あり & 今回もダート
      analysis.comments.push(`【牝馬限定戦】ダート牡馬混合で${dirtMixedWins}勝の実績！牝馬限定なら楽なはず`);
      analysis.tags.push('牡馬混合◎');
      analysis.score += 8;
    } else if (mixedGenderWins >= 1) {
      // 牡馬混合で勝利経験あり
      analysis.comments.push(`【牝馬限定戦】牡馬混合で${mixedGenderWins}勝経験。牝馬限定で楽になる`);
      analysis.tags.push('牡馬混合○');
      analysis.score += 5;
    } else if (dirtMixedTop3 >= 2 && input.surface === 'ダ') {
      // ダート牡馬混合で複数回好走
      analysis.comments.push(`【牝馬限定戦】ダート牡馬混合で${dirtMixedTop3}回好走。牝馬限定なら期待`);
      analysis.tags.push('牡馬混合○');
      analysis.score += 4;
    } else if (mixedGenderTop3 >= 2) {
      // 牡馬混合で複数回好走
      analysis.comments.push(`【牝馬限定戦】牡馬混合${mixedGenderRaces}走で${mixedGenderTop3}回好走。牝馬限定で評価上げ`);
      analysis.score += 3;
    } else if (mixedGenderTop3 >= 1) {
      // 牡馬混合で1回好走
      analysis.comments.push(`【牝馬限定戦】牡馬混合でも好走経験あり`);
      analysis.score += 2;
    }
  }

  /**
   * 2歳戦・3歳戦の古馬比較時計評価
   * 
   * 世代限定戦（2歳限定、3歳限定）で好時計を出している場合、
   * 同条件の古馬混合戦の勝ち時計と比較してレベル判定を強化
   * 
   * ロジック:
   * - 過去走が2歳限定戦or3歳限定戦の場合
   * - その時計を同条件の古馬混合戦（3歳以上or4歳以上）の勝ち時計と比較
   * - 古馬レベルに遜色ない時計なら「古馬級」として大きく評価
   * - これは timeComparisonData に古馬データがあれば活用
   */
  private analyzeYoungHorseTimeComparison(input: HorseAnalysisInput, analysis: SagaAnalysis): void {
    const pastRaces = input.pastRaces || [];
    const timeComparisonData = input.timeComparisonData || [];
    
    if (pastRaces.length === 0) return;
    
    let youngHorseHighLevelCount = 0;
    const youngHorseComments: string[] = [];
    
    for (let i = 0; i < pastRaces.length; i++) {
      const race = pastRaces[i];
      const compData = timeComparisonData[i];
      
      // 世代限定戦かどうか判定
      const className = race.className || '';
      const isYoungHorseRace = this.isYoungHorseOnlyRace(className, race.raceAgeCondition);
      
      if (!isYoungHorseRace) continue;
      if (!race.finishTime || race.finishTime <= 0) continue;
      
      // 時計比較データがある場合、古馬レースとの比較を確認
      if (compData && compData.comparisons) {
        // 古馬混合戦との比較を探す
        const olderHorseComparisons = compData.comparisons.filter(c => 
          !this.isYoungHorseOnlyRace(c.className, c.raceAgeCondition)
        );
        
        for (const comp of olderHorseComparisons) {
          const timeDiff = compData.ownTime - comp.winTime;
          
          // 1.0秒以内なら古馬級
          if (timeDiff <= 1.0) {
            youngHorseHighLevelCount++;
            const raceLabel = this.getYoungHorseLabel(className, race.raceAgeCondition);
            
            if (timeDiff <= 0) {
              youngHorseComments.push(`${raceLabel}で古馬${comp.classLabel}勝ち時計を上回る！`);
            } else if (timeDiff <= 0.5) {
              youngHorseComments.push(`${raceLabel}で古馬${comp.classLabel}級の好時計`);
            } else {
              youngHorseComments.push(`${raceLabel}で古馬${comp.classLabel}に近い時計`);
            }
            break; // 1つ見つかれば十分
          }
        }
      }
      
      // 時計比較データがない場合でも、クラス名から推測
      // 2歳重賞、3歳クラシック等で好走していれば評価
      if (this.isHighClassYoungRace(className) && race.finishPosition <= 3) {
        const raceLabel = this.getYoungHorseLabel(className, race.raceAgeCondition);
        if (!youngHorseComments.some(c => c.includes(raceLabel))) {
          youngHorseComments.push(`${raceLabel}で好走、世代上位の能力`);
          youngHorseHighLevelCount++;
        }
      }
    }
    
    // 評価
    if (youngHorseHighLevelCount >= 2) {
      analysis.comments.push(`【古馬級】${youngHorseComments.slice(0, 2).join('。')}`);
      analysis.tags.push('古馬級');
      analysis.score += 6;
    } else if (youngHorseHighLevelCount === 1 && youngHorseComments.length > 0) {
      analysis.comments.push(`【世代上位】${youngHorseComments[0]}`);
      analysis.score += 3;
    }
  }

  /**
   * 世代限定戦かどうか判定
   */
  private isYoungHorseOnlyRace(className: string, raceAgeCondition?: string): boolean {
    if (raceAgeCondition) {
      return raceAgeCondition === '2歳' || raceAgeCondition === '3歳';
    }
    
    // クラス名から推測
    const name = className || '';
    return (
      name.includes('2歳') || 
      name.includes('3歳') ||
      name.includes('新馬') ||
      name.includes('未勝利') ||  // 多くが若馬
      /ジュニア|ベイビー|フューチャリティ/.test(name)
    );
  }

  /**
   * 若馬重賞・クラシックかどうか判定
   */
  private isHighClassYoungRace(className: string): boolean {
    const name = className || '';
    return (
      // 2歳重賞
      name.includes('朝日杯') ||
      name.includes('阪神ジュベナイル') ||
      name.includes('ホープフルS') ||
      name.includes('デイリー杯') ||
      name.includes('東京スポーツ杯') ||
      name.includes('京王杯') ||
      // 3歳クラシック
      name.includes('皐月賞') ||
      name.includes('ダービー') ||
      name.includes('オークス') ||
      name.includes('桜花賞') ||
      name.includes('NHKマイル') ||
      name.includes('菊花賞') ||
      name.includes('秋華賞') ||
      // その他重賞
      /G[1-3]|重賞/.test(name)
    );
  }

  /**
   * 若馬レースのラベル取得
   */
  private getYoungHorseLabel(className: string, raceAgeCondition?: string): string {
    if (raceAgeCondition === '2歳') return '2歳戦';
    if (raceAgeCondition === '3歳') return '3歳戦';
    
    const name = className || '';
    if (name.includes('2歳')) return '2歳戦';
    if (name.includes('3歳')) return '3歳戦';
    if (name.includes('新馬')) return '新馬戦';
    return '世代限定戦';
  }

  /**
   * 全馬を分析
   */
  analyzeRace(horses: HorseAnalysisInput[]): SagaAnalysis[] {
    return horses.map(h => this.analyzeHorse(h));
  }
}

/**
 * シングルトンインスタンス
 */
let sagaBrainInstance: SagaBrain | null = null;

export function getSagaBrain(memoryData?: any[]): SagaBrain {
  if (!sagaBrainInstance || memoryData) {
    sagaBrainInstance = new SagaBrain(memoryData);
  }
  return sagaBrainInstance;
}

