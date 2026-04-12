/**
 * AIチャット APIエンドポイント
 * 
 * POST /api/ai-chat
 * - 「予想」コマンド: レース予想を生成（ルールエンジン統合）
 * - 一般質問: 競馬に関する質問に回答
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { isPremiumUser } from '@/lib/premium';
import { answerQuestion } from '@/lib/ai-chat/openai-client';
import { 
  applyAllRules, 
  calculateTotalScore, 
  determineRecommendation,
  estimatePopularity,
  calculateBlessed,
  type HorseAnalysisData,
  type RaceConditionSettings,
} from '@/lib/ai-chat/prediction-rules';
import { PREDICTION_SYSTEM_PROMPT, formatRaceDataForPrompt, addSamplePredictions } from '@/lib/ai-chat/system-prompt';
import { 
  getRaceMemos, 
  getBabaMemo, 
  analyzeMemosLocally,
  analyzeCornerPosition,
  type MemoAnalysisResult,
} from '@/lib/ai-chat/memo-analyzer';
import { 
  SagaBrain, 
  type HorseAnalysisInput, 
  type PastRaceInfo,
  type SagaAnalysis,
  type PastRaceTimeComparison,
  type TimeComparisonRace,
} from '@/lib/saga-ai/saga-brain';
import { getFineTunedModel } from '@/lib/ai-chat/fine-tuning';
import { toHalfWidth } from '@/utils/parse-helpers';

// 性別を抽出（seibetsu または gender_age から）
function extractGender(horse: any): '牡' | '牝' | 'セ' | undefined {
  const seibetsu = horse.seibetsu || '';
  const genderAge = horse.gender_age || horse.nenrei_display || '';
  
  if (seibetsu.includes('牝') || genderAge.includes('牝')) return '牝';
  if (seibetsu.includes('牡') || genderAge.includes('牡')) return '牡';
  if (seibetsu.includes('セ') || genderAge.includes('セ')) return 'セ';
  return undefined;
}

// 時計比較用レース取得（同日・前後1日の同条件1着馬）
async function getTimeComparisonRaces(
  db: any,
  pastRaceDate: string,
  pastRacePlace: string,
  pastRaceDistance: string,
): Promise<TimeComparisonRace[]> {
  if (!pastRaceDate || !pastRacePlace || !pastRaceDistance) {
    return [];
  }

  try {
    const cleanedDate = pastRaceDate.replace(/\s+/g, '').replace(/[\/\-]/g, '.');
    const dateParts = cleanedDate.split('.');
    if (dateParts.length !== 3) return [];

    const [year, month, day] = dateParts.map(Number);
    const raceDate = new Date(year, month - 1, day);

    const prevDate = new Date(raceDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const nextDate = new Date(raceDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const formatDateSpaced = (d: Date) =>
      `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, ' ')}.${String(d.getDate()).padStart(2, ' ')}`;
    const formatDatePadded = (d: Date) =>
      `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

    const dateRange = [
      formatDateSpaced(prevDate),
      formatDateSpaced(raceDate),
      formatDateSpaced(nextDate),
      formatDatePadded(prevDate),
      formatDatePadded(raceDate),
      formatDatePadded(nextDate),
    ];

    const normalizedPlace = pastRacePlace.replace(/^[0-9０-９]+/, '').replace(/[0-9０-９]+$/, '').trim();

    const query = `
      SELECT 
        date, place, distance, class_name, finish_time, track_condition, 
        horse_name, age, race_id
      FROM umadata
      WHERE date IN ($1, $2, $3, $4, $5, $6)
        AND place LIKE $7
        AND distance = $8
        AND finish_position IN ('1', '１')
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
    `;

    const rows = await db.prepare(query).all<any>(
      dateRange[0], dateRange[1], dateRange[2],
      dateRange[3], dateRange[4], dateRange[5],
      `%${normalizedPlace}%`,
      pastRaceDistance
    );

    if (!rows || rows.length === 0) return [];

    return rows.map((row: any) => {
      const age = parseInt(toHalfWidth(row.age || '0'), 10);
      const className = row.class_name || '';
      const isGradedRace = /G[123]|Ｇ[１２３]|重賞|JG[123]|ＪＧ[１２３]/i.test(className);
      const isYoungHorse = age === 2 || age === 3;
      const raceId = row.race_id || '';
      const raceNumber = raceId ? raceId.slice(-2).replace(/^0/, '') : '';

      return {
        date: row.date || '',
        place: row.place || '',
        distance: row.distance || '',
        className: row.class_name || '',
        finishTime: parseInt(toHalfWidth(row.finish_time || '0'), 10),
        trackCondition: row.track_condition || '良',
        horseName: row.horse_name || '',
        horseAge: age,
        isAgeRestricted: isGradedRace && isYoungHorse,
        raceNumber,
      };
    });
  } catch (e) {
    console.error('[AI Chat] Error getting time comparison races:', e);
    return [];
  }
}

// レート制限（1分間に10回まで）
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  
  if (!entry || entry.resetTime < now) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  if (entry.count >= 10) {
    return false;
  }
  
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // 認証確認
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userId = session.user.id;
    
    // プレミアム確認
    const isPremium = await isPremiumUser(userId);
    if (!isPremium) {
      return NextResponse.json({ 
        error: 'Premium required',
        message: 'この機能はプレミアム会員限定です'
      }, { status: 403 });
    }
    
    // レート制限
    if (!checkRateLimit(userId)) {
      return NextResponse.json({ 
        error: 'Rate limit exceeded',
        message: '1分間に10回までです。少々お待ちください。'
      }, { status: 429 });
    }
    
    // リクエストボディ
    const body = await request.json();
    const { message, raceContext } = body;
    
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    
    // OpenAI APIキー
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[AI Chat] OPENAI_API_KEY is not set');
      return NextResponse.json({ 
        error: 'Configuration error',
        message: 'AI機能が設定されていません'
      }, { status: 500 });
    }
    
    // コマンドの検出
    const isExpansionRequest = message.includes('展開予想') || message.includes('展開');
    const isPredictionRequest = !isExpansionRequest && (message.includes('予想') || message.includes('よそう'));
    
    console.log('[AI Chat] Request:', { message, isPredictionRequest, isExpansionRequest, raceContext });
    
    if (isExpansionRequest && raceContext) {
      // 展開予想を生成
      console.log('[AI Chat] Starting expansion prediction for:', raceContext);
      const response = await handleExpansionRequest(raceContext, apiKey);
      return NextResponse.json({ answer: response });
    } else if (isExpansionRequest && !raceContext) {
      return NextResponse.json({ 
        answer: 'レースカードを開いた状態で「展開予想」と入力してください。' 
      });
    } else if (isPredictionRequest && raceContext) {
      // レース予想を生成
      console.log('[AI Chat] Starting prediction generation for:', raceContext);
      const response = await handlePredictionRequest(raceContext, apiKey, userId);
      return NextResponse.json(response);
    } else if (isPredictionRequest && !raceContext) {
      console.log('[AI Chat] Prediction requested but no raceContext');
      return NextResponse.json({ 
        answer: 'レースカードを開いた状態で「予想」と入力してください。\n現在表示中のレースの予想を生成します。' 
      });
    } else {
      // 一般質問に回答（お気に入り馬・メモ機能含む）
      const response = await handleGeneralQuestion(message, raceContext, apiKey, userId);
      return NextResponse.json({ answer: response });
    }
    
  } catch (error) {
    console.error('[AI Chat] Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * 予想リクエストを処理（ルールエンジン + メモ解析 統合版）
 */
async function handlePredictionRequest(
  raceContext: {
    year: number;
    date: string;
    place: string;
    raceNumber: number;
    baba?: string;
    pace?: string;
  },
  apiKey: string,
  userId?: string
) {
  const db = getDb();
  const { year, date, place, raceNumber, baba, pace } = raceContext;
  
  console.log('[AI Chat] Prediction request:', raceContext);
  
  // ユーザー設定を変換
  let settings: RaceConditionSettings = {
    trackBias: baba as any,
    paceExpectation: pace as any,
  };
  
  // メモ解析結果
  let memoAnalysis: MemoAnalysisResult = {
    horseAdjustments: [],
    additionalNotes: [],
  };
  
  // ユーザーのメモを取得・解析
  if (userId) {
    try {
      // レースキーを構築（例: 2026/0118/京都/2）
      const raceKey = `${year}/${date}/${place}/${raceNumber}`;
      
      // レースメモと馬場メモを取得
      const [raceMemos, babaMemo] = await Promise.all([
        getRaceMemos(userId, raceKey),
        getBabaMemo(userId, date, place),
      ]);
      
      console.log('[AI Chat] Found memos:', { raceMemos: raceMemos.length, hasBabaMemo: !!babaMemo });
      
      // メモを解析
      if (raceMemos.length > 0 || babaMemo) {
        memoAnalysis = analyzeMemosLocally(raceMemos, babaMemo);
        
        // メモからの馬場バイアスを設定に反映（ユーザー設定がない場合）
        if (!settings.trackBias && memoAnalysis.trackBias) {
          settings.trackBias = memoAnalysis.trackBias;
          console.log('[AI Chat] Applied track bias from memo:', memoAnalysis.trackBias);
        }
      }
    } catch (e) {
      console.error('[AI Chat] Memo fetch error:', e);
    }
  }
  
  // 1. wakujunから出走馬を取得
  const horses = await db.prepare(`
    SELECT * FROM wakujun
    WHERE year = $1 AND date = $2 AND place LIKE $3 AND race_number = $4
    ORDER BY umaban::INTEGER
  `).all<any>(year, date, `%${place}%`, raceNumber);
  
  console.log('[AI Chat] Wakujun query:', { year, date, place: `%${place}%`, raceNumber });
  console.log('[AI Chat] Found horses:', horses?.length || 0);
  
  if (!horses || horses.length === 0) {
    const sampleData = await db.prepare(`
      SELECT DISTINCT year, date, place, race_number FROM wakujun LIMIT 5
    `).all<any>();
    console.log('[AI Chat] Sample wakujun data:', sampleData);
    
    return { 
      error: 'No race data',
      message: `レースデータが見つかりません（${year}/${date} ${place} ${raceNumber}R）`
    };
  }
  
  // レース情報
  // wakujunテーブル: distance="2200", track_type="芝" or "ダ" or "ダート"
  const distanceStr = horses[0]?.distance || '';
  const trackType = horses[0]?.track_type || '';
  const distanceMatch = distanceStr.match(/(\d+)/);
  const distance = distanceMatch ? parseInt(distanceMatch[1], 10) : 0;
  // track_typeから芝/ダを判定、なければdistanceStrをチェック
  const surface = trackType.includes('芝') ? '芝' : 
                  trackType.includes('ダ') ? 'ダ' :
                  distanceStr.includes('芝') ? '芝' : 'ダ';
  
  const className = horses[0]?.class_name_1 || horses[0]?.class_name || '';
  // 牝馬限定戦判定（クラス名に「牝」「フィリーズ」を含む場合）
  const isFilliesOnlyRace = className.includes('牝') || className.includes('フィリーズ');
  
  const raceInfo = {
    place,
    raceNumber,
    distance,
    surface: surface as '芝' | 'ダ',
    trackCondition: '良',
    className,
    isFilliesOnlyRace,
  };
  
  // SagaBrainインスタンスを作成
  const sagaBrain = new SagaBrain();
  
  // 2. 各馬の過去走とStrideデータを取得、SagaBrain分析 + ルールエンジンを適用
  const analyzedHorses: Array<{
    number: number;
    name: string;
    jockey: string;
    waku: number;
    estimatedPopularity: number;
    lapRating: string;
    timeRating: string;
    potential: number | null;
    makikaeshi: number | null;
    pastRaces: any[];
    matchedRules: Array<{ type: string; reason: string }>;
    totalScore: number;
    recommendation: string;
    // SagaBrain分析結果
    sagaAnalysis?: {
      score: number;
      timeEvaluation?: string;
      lapEvaluation?: string;
      raceLevelNote?: string;
      courseMatch: { rating: string; reason: string };
      comments: string[];
      warnings: string[];
    };
  }> = [];
  
  // 予想対象日付（YYYYMMDD形式）- 当日以降のレースは除外する
  const targetDateInt = parseInt(`${year}${date}`, 10);
  console.log('[AI Chat] Filtering races before:', targetDateInt);
  
  for (const horse of horses) {
    const horseName = (horse.umamei || '').trim().replace(/^[\$\*]+/, '');
    const horseNumber = parseInt(toHalfWidth(horse.umaban || '0'), 10);
    const waku = parseInt(toHalfWidth(horse.waku || '0'), 10);
    const gender = extractGender(horse);  // 性別を取得
    
    // 過去走を取得（5走分）- 当日以降のレースは除外
    const pastRacesRaw = await db.prepare(`
      SELECT * FROM umadata
      WHERE (TRIM(horse_name) = $1
         OR REPLACE(REPLACE(horse_name, '*', ''), '$', '') = $1)
        AND SUBSTRING(race_id, 1, 8)::INTEGER < $2
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
      LIMIT 15
    `).all<any>(horseName, targetDateInt);
    
    // 各過去走のindicesとrace_levelを取得
    const pastRaces: HorseAnalysisData['pastRaces'] = [];
    let latestLapRating = 'UNKNOWN';
    let latestTimeRating = 'UNKNOWN';
    let latestPotential: number | null = null;
    let latestMakikaeshi: number | null = null;
    
    for (let i = 0; i < pastRacesRaw.length; i++) {
      const race = pastRacesRaw[i];
      const raceId = race.race_id || '';
      const umaban = String(race.umaban || horseNumber).padStart(2, '0');
      const fullRaceId = `${raceId}${umaban}`;
      
      // indices取得
      let indices: any = {};
      try {
        indices = await db.prepare(`
          SELECT "T2F", "L4F", potential, makikaeshi
          FROM indices WHERE race_id = $1
        `).get<any>(fullRaceId) || {};
      } catch (e) {
        // エラーは無視
      }
      
      // race_level取得（詳細情報含む）
      let raceLevel: string | null = null;
      let raceLevelDetail: {
        level: string;
        levelLabel: string;
        plusCount: number;
        totalHorsesRun: number;
        goodRunCount: number;
      } | null = null;
      try {
        const raceIdFor16 = raceId.substring(0, 16);
        const levelData = await db.prepare(`
          SELECT level, level_label, has_plus, total_horses_run, good_run_count, first_run_good_count 
          FROM race_levels WHERE race_id = $1
        `).get<{
          level: string;
          level_label: string;
          has_plus: number;
          total_horses_run: number;
          good_run_count: number;
          first_run_good_count: number;
        }>(raceIdFor16);
        if (levelData) {
          raceLevel = levelData.level_label || levelData.level;
          // first_run_good_count（次1走目での好走数）を優先、なければgood_run_count（延べ）
          const actualGoodCount = levelData.first_run_good_count ?? levelData.good_run_count ?? 0;
          raceLevelDetail = {
            level: levelData.level || 'UNKNOWN',
            levelLabel: levelData.level_label || levelData.level || 'UNKNOWN',
            plusCount: levelData.has_plus || 0,
            totalHorsesRun: levelData.total_horses_run || 0,
            goodRunCount: actualGoodCount,
          };
        }
      } catch (e) {
        // エラーは無視
      }
      
      // 最新走のデータを保存
      if (i === 0) {
        latestPotential = indices.potential ?? null;
        latestMakikaeshi = indices.makikaeshi ?? null;
        // TODO: ラップ評価、時計評価をSagaBrainから取得
        // 暫定でindicesの値から推定
        latestLapRating = indices.L4F ? (indices.L4F < 46 ? 'A' : indices.L4F < 48 ? 'B' : 'C') : 'UNKNOWN';
        latestTimeRating = indices.T2F ? (indices.T2F < 24 ? 'A' : indices.T2F < 25 ? 'B' : 'C') : 'UNKNOWN';
      }
      
      const distanceStr = race.distance || '';
      const distanceNum = parseInt(distanceStr.match(/\d+/)?.[0] || '0', 10);
      
      pastRaces.push({
        date: race.date || '',
        place: race.place || '',
        distance: distanceNum,
        surface: distanceStr.includes('芝') ? '芝' : 'ダ',
        finishPosition: parseInt(toHalfWidth(race.finish_position || '99'), 10),
        popularity: parseInt(toHalfWidth(race.popularity || '0'), 10),
        margin: race.margin || '',
        trackCondition: race.track_condition || '良',
        raceLevel,
        raceLevelDetail,
        lapRating: i === 0 ? latestLapRating : null,
        timeRating: i === 0 ? latestTimeRating : null,
        corner4: parseInt(toHalfWidth(race.corner_4 || race.corner_4_position || '0'), 10) || null,
        totalHorses: parseInt(race.field_size || '16', 10),
        className: race.class_name || '',
        // T2F/L4F（ラップ評価用）
        T2F: indices.T2F ?? null,
        L4F: indices.L4F ?? null,
        // 走破タイム（時計評価用）
        finishTime: race.finish_time || null,
        lapTime: race.lap_time || null,
      });
    }
    
    // 想定人気を計算
    const estimatedPop = estimatePopularity(pastRaces);
    
    // メモからの恵まれ/不利判定をチェック
    let blessedManual: 'blessed' | 'unlucky' | 'neutral' | undefined;
    const memoAdjustment = memoAnalysis.horseAdjustments.find(
      a => a.horseNumber === horseNumber || a.horseName === horseName
    );
    if (memoAdjustment) {
      blessedManual = memoAdjustment.type;
      console.log(`[AI Chat] Memo adjustment for ${horseName}: ${memoAdjustment.type} - ${memoAdjustment.reason}`);
    }
    
    // 4角位置からの恵まれ/不利判定（過去走）
    const additionalRules: Array<{ type: string; reason: string }> = [];
    if (pastRaces.length > 0 && settings.trackBias) {
      const lastRace = pastRaces[0];
      const cornerAnalysis = analyzeCornerPosition(
        lastRace.corner4,
        lastRace.totalHorses,
        settings.trackBias,
        lastRace.finishPosition,
        lastRace.margin
      );
      
      if (cornerAnalysis.type !== 'neutral') {
        // 恵まれ/不利判定をルールとして追加
        additionalRules.push({
          type: cornerAnalysis.type === 'blessed' ? 'NEGATIVE' : 'POSITIVE',
          reason: cornerAnalysis.reason,
        });
        
        // 手動設定がなければ自動判定を適用
        if (!blessedManual) {
          blessedManual = cornerAnalysis.type;
        }
      }
    }
    
    // メモからのレースレベルオーバーライドを適用
    // 過去走のレースレベルを上書き（該当レースの場合）
    if (memoAnalysis.raceLevelOverride && pastRaces.length > 0) {
      // メモは通常「直近参加したレース」についてなので、前走のレベルを上書き
      pastRaces[0].raceLevel = memoAnalysis.raceLevelOverride;
      additionalRules.push({
        type: 'POSITIVE',
        reason: memoAnalysis.raceLevelNote || `メモによりレースレベル${memoAnalysis.raceLevelOverride}に調整`,
      });
    }
    
    // HorseAnalysisDataを構築
    const horseAnalysis: HorseAnalysisData = {
      number: horseNumber,
      name: horseName,
      lapRating: latestLapRating as any,
      timeRating: latestTimeRating as any,
      potential: latestPotential,
      makikaeshi: latestMakikaeshi,
      pastRaces,
      waku,
      jockey: horse.kishu || '',
      trainer: horse.chokyoshi || '',
      weight: null,
      weightChange: null,
      blessedAuto: calculateBlessed(latestMakikaeshi),
      blessedManual,
      estimatedPopularity: estimatedPop,
    };
    
    // ルールエンジンを適用
    let matchedRules = applyAllRules(horseAnalysis, settings);
    
    // メモ・4角位置からの追加ルールをマージ
    matchedRules = [...matchedRules, ...additionalRules.map(r => ({
      ruleId: 'memo_' + Math.random().toString(36).substr(2, 9),
      ruleName: 'メモ/位置取り分析',
      type: r.type as any,
      reason: r.reason,
      confidence: 'high' as const,
      scoreAdjust: r.type === 'POSITIVE' ? 5 : -5,
    }))];
    
    const totalScore = calculateTotalScore(matchedRules);
    const recommendation = determineRecommendation(totalScore, estimatedPop);
    
    // === SagaBrain分析を実行 ===
    let sagaAnalysisResult: SagaAnalysis | undefined;
    let timeComparisonData: PastRaceTimeComparison[] = [];
    try {
      // PastRaceInfoの形式に変換
      const sagaPastRaces: PastRaceInfo[] = pastRaces.map(pr => {
        // finish_time を数値に変換（"1:34.5" → 1345）
        let finishTimeNum: number | undefined;
        if (pr.finishTime) {
          const match = pr.finishTime.match(/^(\d+):(\d+)\.(\d+)$/);
          if (match) {
            const min = parseInt(match[1], 10);
            const sec = parseInt(match[2], 10);
            const dec = parseInt(match[3], 10);
            finishTimeNum = min * 1000 + sec * 10 + dec;
          }
        }
        
        return {
          date: pr.date,
          place: pr.place,
          surface: pr.surface as '芝' | 'ダ',
          distance: pr.distance,
          finishPosition: pr.finishPosition,
          popularity: pr.popularity,
          margin: pr.margin,
          trackCondition: pr.trackCondition,
          T2F: pr.T2F || undefined,
          L4F: pr.L4F || undefined,
          finishTime: finishTimeNum,
          lapString: pr.lapTime || undefined,
          potential: latestPotential || undefined,
          makikaeshi: latestMakikaeshi || undefined,
          corner4: pr.corner4 || undefined,
          totalHorses: pr.totalHorses,
          className: pr.className,
          raceLevel: pr.raceLevelDetail ? {
            level: pr.raceLevelDetail.level as 'S' | 'A' | 'B' | 'C' | 'D' | 'LOW' | 'UNKNOWN',
            levelLabel: pr.raceLevelDetail.levelLabel,
            plusCount: pr.raceLevelDetail.plusCount,
            totalHorsesRun: pr.raceLevelDetail.totalHorsesRun,
            goodRunCount: pr.raceLevelDetail.goodRunCount,
            firstRunGoodCount: pr.raceLevelDetail.goodRunCount,
          } : pr.raceLevel ? {
            level: pr.raceLevel as 'S' | 'A' | 'B' | 'C' | 'D' | 'LOW' | 'UNKNOWN',
            levelLabel: pr.raceLevel,
          } : undefined,
        };
      });
      
      // 時計比較データを取得（過去10走分）
      timeComparisonData = [];
      const maxComparisonRaces = Math.min(10, pastRaces.length);
      
      for (let i = 0; i < maxComparisonRaces; i++) {
        const pr = pastRaces[i];
        if (pr.date && pr.place && pr.distance && pr.finishTime) {
          const distanceStr = `${pr.surface}${pr.distance}`;
          const comparisonRaces = await getTimeComparisonRaces(
            db,
            pr.date,
            pr.place,
            distanceStr
          );
          
          if (comparisonRaces.length > 0) {
            // finishTimeを数値に変換
            let finishTimeNum = 0;
            if (pr.finishTime) {
              const match = pr.finishTime.match(/^(\d+):(\d+)\.(\d+)$/);
              if (match) {
                finishTimeNum = parseInt(match[1], 10) * 1000 + parseInt(match[2], 10) * 10 + parseInt(match[3], 10);
              }
            }
            
            timeComparisonData.push({
              pastRaceIndex: i,
              pastRaceDate: pr.date,
              pastRaceClass: pr.className || '',
              pastRaceTime: finishTimeNum,
              pastRaceCondition: pr.trackCondition || '良',
              comparisonRaces,
            });
          }
        }
      }
      
      const sagaInput: HorseAnalysisInput = {
        horseName,
        horseNumber,
        waku,
        raceDate: `${year}.${date.slice(0, 2)}.${date.slice(2, 4)}`,
        place: raceInfo.place,
        surface: raceInfo.surface,
        distance: raceInfo.distance,
        trackCondition: (raceInfo.trackCondition || '良') as '良' | '稍' | '重' | '不',
        pastRaces: sagaPastRaces,
        indices: {
          potential: latestPotential || undefined,
          makikaeshi: latestMakikaeshi || undefined,
        },
        timeComparisonData,
        // 牝馬限定戦判定用
        isFilliesOnlyRace: raceInfo.isFilliesOnlyRace,
        gender,
      };
      
      sagaAnalysisResult = sagaBrain.analyzeHorse(sagaInput);
      
      // SagaBrain分析結果からラップ/タイム評価を取得
      if (sagaAnalysisResult.lapEvaluation) {
        // ラップ評価をパースしてレーティングを抽出（例: 「【ラップ】A評価...」からAを抽出）
        const lapMatch = sagaAnalysisResult.lapEvaluation.match(/([SABCD]|LOW)/);
        if (lapMatch) {
          pastRaces[0].lapRating = lapMatch[1];
        }
      }
      if (sagaAnalysisResult.timeEvaluation) {
        const timeMatch = sagaAnalysisResult.timeEvaluation.match(/([SABCD]|LOW)/);
        if (timeMatch) {
          pastRaces[0].timeRating = timeMatch[1];
        }
      }
      
      // 歴代比較で上位の場合は高評価ルールを追加
      if (sagaAnalysisResult.tags) {
        // 「'19以降上位」タグがあれば最優先で高評価
        if (sagaAnalysisResult.tags.some(t => t.includes("'19以降上位") || t.includes('歴代上位'))) {
          additionalRules.push({
            type: 'POSITIVE',
            reason: '歴代ラップ比較で上位 → 同条件での優秀なラップを記録',
          });
        }
        // 「加速ラップ馬」「非減速ラップ馬」も高評価
        if (sagaAnalysisResult.tags.some(t => t.includes('加速ラップ') || t.includes('非減速ラップ'))) {
          additionalRules.push({
            type: 'POSITIVE',
            reason: 'ラップ内容優秀 → 後半の持続力/加速力あり',
          });
        }
      }
      
      // ラップ評価のコメントに「○位/△レース中」があれば高評価
      if (sagaAnalysisResult.lapEvaluation) {
        const rankMatch = sagaAnalysisResult.lapEvaluation.match(/(\d+)位\/(\d+)レース中/);
        if (rankMatch) {
          const rank = parseInt(rankMatch[1], 10);
          const total = parseInt(rankMatch[2], 10);
          // 上位10%または3位以内なら高評価
          if (rank <= 3 || (total >= 10 && rank <= total * 0.1)) {
            additionalRules.push({
              type: 'POSITIVE',
              reason: `歴代${rank}位/${total}レース中の優秀ラップ`,
            });
          }
        }
      }
      
      // L4F絶対値による評価（芝/ダート・距離・年齢別）
      // L4F評価対象: 芝1600-2400m、ダート1400-1800m
      // 過去走と今回のレースの馬場（芝/ダート）が一致する場合のみ評価
      const currentSurface = raceInfo.surface;
      const currentDistance = raceInfo.distance;
      
      // 今回のレースがL4F評価対象距離かをチェック
      const isCurrentRaceL4FTarget = 
        (currentSurface === '芝' && currentDistance >= 1600 && currentDistance <= 2400) ||
        (currentSurface === 'ダ' && currentDistance >= 1400 && currentDistance <= 1800);
      
      if (isCurrentRaceL4FTarget && pastRaces.length > 0) {
        // 過去走から今回と同じ馬場のL4Fを探す
        const relevantPastRace = pastRaces.find(pr => 
          pr.L4F && pr.surface === currentSurface
        );
        
        if (relevantPastRace) {
          const l4f = relevantPastRace.L4F;
          const pastSurface = relevantPastRace.surface;
          const pastDistance = relevantPastRace.distance;
          const className = relevantPastRace.className || '';
          const is2yo = className.includes('2歳') || className.includes('新馬');
          
          // 過去走の距離もL4F評価対象範囲かチェック
          const isPastRaceL4FTarget = 
            (pastSurface === '芝' && pastDistance >= 1600 && pastDistance <= 2400) ||
            (pastSurface === 'ダ' && pastDistance >= 1400 && pastDistance <= 1800);
          
          if (isPastRaceL4FTarget) {
            // 2歳戦の評価基準
            if (is2yo) {
              if (pastSurface === '芝' && pastDistance >= 1600 && pastDistance <= 2000) {
                if (l4f <= 45.0) {
                  additionalRules.push({
                    type: 'POSITIVE',
                    reason: `2歳芝中距離でL4F ${l4f.toFixed(1)}秒は超高評価`,
                  });
                } else if (l4f <= 46.0) {
                  additionalRules.push({
                    type: 'POSITIVE',
                    reason: `2歳芝中距離でL4F ${l4f.toFixed(1)}秒は高評価`,
                  });
                }
              } else if (pastSurface === 'ダ' && pastDistance >= 1600 && pastDistance <= 1800) {
                if (l4f <= 49.0) {
                  additionalRules.push({
                    type: 'POSITIVE',
                    reason: `2歳ダ中距離でL4F ${l4f.toFixed(1)}秒は超高評価`,
                  });
                } else if (l4f <= 50.0) {
                  additionalRules.push({
                    type: 'POSITIVE',
                    reason: `2歳ダ中距離でL4F ${l4f.toFixed(1)}秒は高評価`,
                  });
                } else if (l4f < 51.0) {
                  additionalRules.push({
                    type: 'POSITIVE',
                    reason: `2歳ダ中距離でL4F ${l4f.toFixed(1)}秒はやや評価`,
                  });
                }
              }
            } else {
              // 古馬戦の評価基準
              if (pastSurface === '芝' && pastDistance >= 1600 && pastDistance <= 2400) {
                if (l4f <= 46.0) {
                  additionalRules.push({
                    type: 'POSITIVE',
                    reason: `芝中距離でL4F ${l4f.toFixed(1)}秒は高評価`,
                  });
                }
              } else if (pastSurface === 'ダ' && pastDistance >= 1400 && pastDistance <= 1800) {
                if (l4f <= 50.0) {
                  additionalRules.push({
                    type: 'POSITIVE',
                    reason: `ダ中距離でL4F ${l4f.toFixed(1)}秒は高評価`,
                  });
                }
              }
            }
          }
        }
      }
      
      // 牝馬限定戦の評価（ダート牡馬混合で善戦→牝馬限定戦替わり）
      if (raceInfo.isFilliesOnlyRace && gender === '牝' && pastRaces.length > 0) {
        let dirtMixedWins = 0;
        let dirtMixedTop3 = 0;
        let mixedGenderWins = 0;
        let mixedGenderTop3 = 0;
        let mixedGenderRaces = 0;
        
        for (const race of pastRaces) {
          const className = race.className || '';
          // 牝馬限定戦ではない（牡馬混合）場合
          const isFilliesRace = className.includes('牝') || className.includes('フィリーズ');
          if (!isFilliesRace) {
            mixedGenderRaces++;
            const finish = race.finishPosition;
            if (finish > 0 && finish <= 3) {
              mixedGenderTop3++;
              if (race.surface === 'ダ') {
                dirtMixedTop3++;
              }
            }
            if (finish === 1) {
              mixedGenderWins++;
              if (race.surface === 'ダ') {
                dirtMixedWins++;
              }
            }
          }
        }
        
        // 評価ルールを追加
        if (dirtMixedWins >= 1 && raceInfo.surface === 'ダ') {
          additionalRules.push({
            type: 'POSITIVE',
            reason: `【牝馬限定戦】ダート牡馬混合で${dirtMixedWins}勝の実績！牝馬限定なら楽なはず`,
          });
        } else if (mixedGenderWins >= 1) {
          additionalRules.push({
            type: 'POSITIVE',
            reason: `【牝馬限定戦】牡馬混合で${mixedGenderWins}勝経験。牝馬限定で楽になる`,
          });
        } else if (dirtMixedTop3 >= 2 && raceInfo.surface === 'ダ') {
          additionalRules.push({
            type: 'POSITIVE',
            reason: `【牝馬限定戦】ダート牡馬混合で${dirtMixedTop3}回好走。牝馬限定なら期待`,
          });
        } else if (mixedGenderTop3 >= 2) {
          additionalRules.push({
            type: 'POSITIVE',
            reason: `【牝馬限定戦】牡馬混合で${mixedGenderTop3}回好走。牝馬限定で評価上げ`,
          });
        } else if (mixedGenderTop3 >= 1) {
          additionalRules.push({
            type: 'POSITIVE',
            reason: `【牝馬限定戦】牡馬混合でも好走経験あり`,
          });
        }
      }
      
    } catch (e) {
      console.error(`[AI Chat] SagaBrain analysis error for ${horseName}:`, e);
    }
    
    analyzedHorses.push({
      number: horseNumber,
      name: horseName,
      jockey: horse.kishu || '',
      waku,
      estimatedPopularity: estimatedPop,
      lapRating: pastRaces[0]?.lapRating || latestLapRating,
      timeRating: pastRaces[0]?.timeRating || latestTimeRating,
      potential: latestPotential,
      makikaeshi: latestMakikaeshi,
      pastRaces: pastRaces.map(pr => ({
        place: pr.place,
        distance: pr.distance,
        surface: pr.surface,
        finishPosition: pr.finishPosition,
        margin: pr.margin,
        raceLevel: pr.raceLevel,
        trackCondition: pr.trackCondition,
        L4F: pr.L4F,
        T2F: pr.T2F,
      })),
      matchedRules: matchedRules.map(r => ({ type: r.type, reason: r.reason })),
      totalScore,
      recommendation,
      // SagaBrain分析結果を追加
      sagaAnalysis: sagaAnalysisResult ? {
        score: sagaAnalysisResult.score,
        timeEvaluation: sagaAnalysisResult.timeEvaluation,
        lapEvaluation: sagaAnalysisResult.lapEvaluation,
        raceLevelNote: sagaAnalysisResult.raceLevelNote,
        courseMatch: sagaAnalysisResult.courseMatch,
        comments: sagaAnalysisResult.comments,
        warnings: sagaAnalysisResult.warnings,
      } : undefined,
    });
    
    console.log(`[AI Chat] Horse ${horseNumber} ${horseName}: score=${totalScore}, rec=${recommendation}, rules=${matchedRules.length}, sagaScore=${sagaAnalysisResult?.score || 'N/A'}, timeComp=${timeComparisonData?.length || 0}, hasTimeEval=${!!sagaAnalysisResult?.timeEvaluation}`);
  }
  
  // 3. 過去予想からサンプルを取得
  const samplePredictions = await getSamplePredictions(db, place, raceInfo.surface, raceInfo.distance);
  
  // 4. 学習したパターンを取得
  const learnedPatterns = await getLearnedPatterns(db);
  
  // 5. プロンプトを構築してAI予想を生成
  const systemPrompt = PREDICTION_SYSTEM_PROMPT + addSamplePredictions(samplePredictions) + formatLearnedPatterns(learnedPatterns);
  const userPrompt = formatRaceDataForPrompt(raceInfo, analyzedHorses, settings);
  
  console.log('[AI Chat] Calling OpenAI with enhanced prompt...');
  
  const result = await generatePredictionWithRules(systemPrompt, userPrompt, apiKey);
  
  // 過大評価・過小評価の馬を抽出（最も顕著な1頭ずつ）
  // 過大評価: 人気上位(1-4人気)でNEGATIVEルールが多い馬
  const overvaluedCandidates = analyzedHorses
    .filter(h => h.estimatedPopularity <= 4 && h.matchedRules.some(r => r.type === 'NEGATIVE'))
    .map(h => ({
      name: h.name,
      popularity: h.estimatedPopularity,
      negativeCount: h.matchedRules.filter(r => r.type === 'NEGATIVE').length,
      score: h.totalScore,
    }))
    .sort((a, b) => b.negativeCount - a.negativeCount || a.popularity - b.popularity);
  
  // 過小評価: 人気下位(5番人気以下)でPOSITIVEルールが多い馬
  const undervaluedCandidates = analyzedHorses
    .filter(h => h.estimatedPopularity >= 5 && h.matchedRules.some(r => r.type === 'POSITIVE'))
    .map(h => ({
      name: h.name,
      popularity: h.estimatedPopularity,
      positiveCount: h.matchedRules.filter(r => r.type === 'POSITIVE').length,
      score: h.totalScore,
    }))
    .sort((a, b) => b.positiveCount - a.positiveCount || b.score - a.score);
  
  // 最も顕著な1頭のみ
  const overvalued = overvaluedCandidates.length > 0 ? [overvaluedCandidates[0].name] : [];
  const undervalued = undervaluedCandidates.length > 0 ? [undervaluedCandidates[0].name] : [];
  
  return {
    prediction: result,
    analysis: {
      overvalued,
      undervalued,
      horseScores: analyzedHorses.map(h => ({
        number: h.number,
        name: h.name,
        score: h.totalScore,
        recommendation: h.recommendation,
      })),
    },
    raceInfo: {
      place,
      raceNumber,
      distance: raceInfo.distance,
      surface: raceInfo.surface,
    },
  };
}

/**
 * ルールエンジン統合版の予想生成
 */
async function generatePredictionWithRules(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<string> {
  // ファインチューニング済みモデルがあれば使用
  let model = 'gpt-4o-mini';
  try {
    const fineTunedModel = await getFineTunedModel();
    if (fineTunedModel) {
      model = fineTunedModel;
      console.log(`[AI Chat] Using fine-tuned model: ${model}`);
    }
  } catch (e) {
    console.log('[AI Chat] Fine-tuned model check failed, using default model');
  }
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2500,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API Error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '予想を生成できませんでした。';
}

/**
 * 過去予想からサンプルを取得
 */
async function getSamplePredictions(
  db: ReturnType<typeof getDb>,
  place: string,
  surface: string,
  distance: number
): Promise<string[]> {
  try {
    // まず同じ競馬場の予想を検索
    const samePlacePredictions = await db.prepare(`
      SELECT full_text FROM ai_predictions
      WHERE race_course = $1
      ORDER BY reaction_count DESC
      LIMIT 2
    `).all<{ full_text: string }>(place);
    
    if (samePlacePredictions.length >= 2) {
      return samePlacePredictions.map(p => p.full_text);
    }
    
    // なければ人気の高い予想を取得
    const topPredictions = await db.prepare(`
      SELECT full_text FROM ai_predictions
      ORDER BY reaction_count DESC
      LIMIT 3
    `).all<{ full_text: string }>();
    
    return topPredictions.map(p => p.full_text);
  } catch (e) {
    // テーブルがない場合は空配列を返す
    console.log('[AI Chat] No ai_predictions table or error:', e);
    return [];
  }
}

/**
 * 一般質問に回答
 */
async function handleGeneralQuestion(
  message: string,
  raceContext: any | undefined,
  apiKey: string,
  userId?: string
): Promise<string> {
  const db = getDb();
  const lowerMessage = message.toLowerCase();

  let maximsBlock = '';
  if (userId) {
    try {
      const row = await db
        .prepare(`SELECT content FROM user_maxims WHERE user_id = ?`)
        .get<{ content: string }>(userId);
      const c = row?.content?.trim();
      if (c) {
        maximsBlock = `【ユーザー格言・メモ】
（形式は不問。一文ごとのルール・コメント・メモが混在してよい）
${c}

`;
      }
    } catch (e) {
      console.error('[AI Chat] user_maxims fetch:', e);
    }
  }
  
  // メモ更新要求の検出
  if (lowerMessage.includes('メモ') && (lowerMessage.includes('更新') || lowerMessage.includes('登録') || lowerMessage.includes('追加'))) {
    return `メモの更新はレースカードから直接行えます：

📝 **レースメモ**: 各レースの上部にある「📝」ボタンをクリック
🏇 **馬場メモ**: ヘッダーの「馬場メモ」ボタンをクリック
⭐ **馬メモ**: 馬名をクリックして表示されるポップアップから「メモ」を選択

チャットからの直接更新は今後対応予定です。`;
  }
  
  // レースコンテキストがある場合は、そのレースの全データを取得してAIに渡す
  let raceDataContext = '';
  let racePremiseBlock = '';
  let favoriteContext = '';
  let horseList: Array<{ name: string; number: number; waku: number; jockey: string }> = [];
  
  if (raceContext) {
    const { year, date, place, raceNumber } = raceContext;
    console.log('[AI Chat] General question with raceContext:', raceContext);
    
    // wakujunから出走馬を取得
    const horses = await db.prepare(`
      SELECT * FROM wakujun
      WHERE year = $1 AND date = $2 AND place LIKE $3 AND race_number = $4
      ORDER BY umaban::INTEGER
    `).all<any>(year, date, `%${place}%`, raceNumber);
    
    if (horses && horses.length > 0) {
      // 距離・コース情報
      // wakujunテーブル: distance="2200", track_type="芝" or "ダ" or "ダート"
      const distanceStr = horses[0]?.distance || '';
      const trackType = horses[0]?.track_type || '';
      const distanceMatch = distanceStr.match(/(\d+)/);
      const distance = distanceMatch ? parseInt(distanceMatch[1], 10) : 0;
      // track_typeから芝/ダを判定
      const surface = trackType.includes('芝') ? '芝' : 
                      trackType.includes('ダ') ? 'ダ' :
                      distanceStr.includes('芝') ? '芝' : 'ダ';
      const className = horses[0]?.class_name_1 || horses[0]?.class_name || '';
      const trackTypeForMemo = surface === '芝' ? '芝' : 'ダート';
      const babaDateStr = String(date || '');
      if (userId && babaDateStr) {
        try {
          const bm = await db
            .prepare(
              `SELECT advantage_position, advantage_style, weather_note, free_memo, course_condition
               FROM baba_memos
               WHERE user_id = ? AND date = ? AND place = ? AND track_type = ?`
            )
            .get<{
              advantage_position: string | null;
              advantage_style: string | null;
              weather_note: string | null;
              free_memo: string | null;
              course_condition: string | null;
            }>(userId, babaDateStr, place, trackTypeForMemo);
          if (bm) {
            const bits: string[] = [];
            if (bm.course_condition) bits.push(`馬場状態=${bm.course_condition}`);
            if (bm.advantage_position && bm.advantage_position !== 'フラット') {
              bits.push(`位置=${bm.advantage_position}`);
            }
            if (bm.advantage_style && bm.advantage_style !== 'フラット') {
              bits.push(`脚質=${bm.advantage_style}`);
            }
            if (bm.weather_note) bits.push(`特記=${bm.weather_note}`);
            if (bm.free_memo) bits.push(`自由=${bm.free_memo}`);
            if (bits.length > 0) {
              racePremiseBlock += `【当日・当場・今回${surface}のユーザー馬場メモ】${bits.join(' / ')}\n`;
            }
          }
        } catch (e) {
          console.error('[AI Chat] baba premise:', e);
        }
      }
      const looks2yo = /2歳|新馬/.test(className);
      racePremiseBlock += `【レースの目安】${surface}${distance}m / ${className}${looks2yo ? '（2歳・新馬系の条件の可能性）' : ''}\n`;

      raceDataContext = `
【今回のレース】
${place} ${raceNumber}R ${surface}${distance}m ${className}

【出走馬データ】
`;
      
      // 予想対象日付（YYYYMMDD形式）- 当日以降のレースは除外する
      const targetDateInt = parseInt(`${year}${date}`, 10);
      
      for (const horse of horses) {
        const horseName = (horse.umamei || '').trim().replace(/^[\$\*]+/, '');
        const horseNumber = parseInt(toHalfWidth(horse.umaban || '0'), 10);
        const waku = parseInt(toHalfWidth(horse.waku || '0'), 10);
        const jockey = horse.kishu || '';
        
        horseList.push({ name: horseName, number: horseNumber, waku, jockey });
        
        // 過去走を取得（5走分）- 当日以降のレースは除外
        const pastRaces = await db.prepare(`
          SELECT race_id, umaban, date, place, distance, class_name, 
                 finish_position, finish_time, margin, track_condition,
                 last_3f, popularity, lap_time, corner_4, field_size, sire
          FROM umadata
          WHERE (TRIM(horse_name) = $1
             OR REPLACE(REPLACE(horse_name, '*', ''), '$', '') = $1)
            AND SUBSTRING(race_id, 1, 8)::INTEGER < $2
          ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
          LIMIT 15
        `).all<any>(horseName, targetDateInt);

        const sireFirst = (pastRaces[0] as { sire?: string } | undefined)?.sire?.trim();
        raceDataContext += `\n**${horseNumber}番 ${horseName}** (${waku}枠, ${jockey})${sireFirst ? ` 父:${sireFirst}` : ''}\n`;
        
        // 各過去走の詳細とindicesを取得
        for (let i = 0; i < pastRaces.length; i++) {
          const pr = pastRaces[i];
          const prPlace = pr.place || '';
          const prDist = pr.distance || '';
          const prFinish = pr.finish_position || '';
          const prMargin = pr.margin || '';
          const prTrack = pr.track_condition || '';
          const prLast3F = pr.last_3f || '';
          const prPop = pr.popularity || '';
          const prCorner4 = pr.corner_4 || '';
          const prTotalHorses = pr.field_size || '';
          const prClassName = pr.class_name || '';
          
          // 指数を取得
          const umabanPadded = (pr.umaban || '').toString().padStart(2, '0');
          const fullRaceId = pr.race_id + umabanPadded;
          
          const indices = await db.prepare(`
            SELECT "L4F", "T2F", potential, makikaeshi
            FROM indices
            WHERE race_id = $1
          `).get<any>(fullRaceId);
          
          // レースレベルを取得
          const raceLevel = await db.prepare(`
            SELECT level FROM race_levels WHERE race_id = $1
          `).get<any>(pr.race_id);
          
          const runLabel = i === 0 ? '前走' : `${i + 1}走前`;
          raceDataContext += `  ${runLabel}: ${prPlace}${prDist} ${prClassName} ${prFinish}着 ${prMargin} (${prTrack})\n`;
          raceDataContext += `    上がり3F=${prLast3F}, 人気=${prPop}, 4角=${prCorner4}/${prTotalHorses}頭\n`;
          
          if (indices) {
            raceDataContext += `    【指数】L4F=${indices.L4F?.toFixed(1) || 'N/A'}, T2F=${indices.T2F?.toFixed(1) || 'N/A'}, `;
            raceDataContext += `ポテンシャル=${indices.potential?.toFixed(1) || 'N/A'}, 巻き返し=${indices.makikaeshi?.toFixed(1) || 'N/A'}\n`;
          }
          if (raceLevel) {
            raceDataContext += `    【レースレベル】${raceLevel.level}\n`;
          }
        }
        
        if (pastRaces.length === 0) {
          raceDataContext += `  （過去走データなし）\n`;
        }
      }
      
      raceDataContext += `
【指数の説明】
- L4F: 後半4Fの速度指数。**数字が低いほど速い**（45以下なら高評価）
- T2F: 前半2Fの速度指数。**数字が低いほど速い**（22.5以下なら速力あり＝先行力）
- ポテンシャル: 過去走から算出した能力値（高いほど能力が高い）
- 巻き返し: 前走で不利があった度合い（3.0以上なら巻き返し期待）
- レースレベル: A=ハイレベル, B=やや高い, C=標準, D=低い
`;
    }
    
    // ユーザーのお気に入り馬を取得してマッチング
    if (userId && horseList.length > 0) {
      try {
        const favorites = await db.prepare(`
          SELECT horse_name, memo FROM favorite_horses WHERE user_id = $1
        `).all<{ horse_name: string; memo: string | null }>(userId);
        
        if (favorites && favorites.length > 0) {
          // 今回出走するお気に入り馬をチェック
          const matchedFavorites: Array<{
            horseName: string;
            memo: string | null;
            number: number;
            waku: number;
            memoMatch: string[];
          }> = [];
          
          for (const fav of favorites) {
            const normalizedFavName = fav.horse_name.trim().replace(/^[\$\*]+/, '');
            const matchedHorse = horseList.find(h => 
              h.name === normalizedFavName || 
              h.name.includes(normalizedFavName) ||
              normalizedFavName.includes(h.name)
            );
            
            if (matchedHorse) {
              const memoMatch: string[] = [];
              const memo = fav.memo || '';
              const memoLower = memo.toLowerCase();
              
              // メモと条件のマッチング
              if ((memoLower.includes('外枠') || memoLower.includes('外有利')) && matchedHorse.waku >= 6) {
                memoMatch.push(`✅ 「${memo}」→ 今回${matchedHorse.waku}枠（外枠）`);
              }
              if ((memoLower.includes('内枠') || memoLower.includes('内有利')) && matchedHorse.waku <= 3) {
                memoMatch.push(`✅ 「${memo}」→ 今回${matchedHorse.waku}枠（内枠）`);
              }
              if (memoLower.includes('短縮') && distanceStr) {
                memoMatch.push(`📝 「${memo}」→ 距離変更を確認してください`);
              }
              if (memoLower.includes('延長') && distanceStr) {
                memoMatch.push(`📝 「${memo}」→ 距離変更を確認してください`);
              }
              if (memoLower.includes('良馬場') || memoLower.includes('重馬場') || memoLower.includes('道悪')) {
                memoMatch.push(`📝 「${memo}」→ 馬場状態を確認してください`);
              }
              if (memoLower.includes('中山') && place.includes('中山')) {
                memoMatch.push(`✅ 「${memo}」→ 今回中山`);
              }
              if (memoLower.includes('東京') && place.includes('東京')) {
                memoMatch.push(`✅ 「${memo}」→ 今回東京`);
              }
              if (memoLower.includes('京都') && place.includes('京都')) {
                memoMatch.push(`✅ 「${memo}」→ 今回京都`);
              }
              if (memoLower.includes('阪神') && place.includes('阪神')) {
                memoMatch.push(`✅ 「${memo}」→ 今回阪神`);
              }
              if (memoLower.includes('芝') && surface === '芝') {
                memoMatch.push(`✅ 「${memo}」→ 今回芝`);
              }
              if (memoLower.includes('ダート') && surface === 'ダ') {
                memoMatch.push(`✅ 「${memo}」→ 今回ダート`);
              }
              
              matchedFavorites.push({
                horseName: matchedHorse.name,
                memo: fav.memo,
                number: matchedHorse.number,
                waku: matchedHorse.waku,
                memoMatch,
              });
            }
          }
          
          if (matchedFavorites.length > 0) {
            favoriteContext = `
【⭐ お気に入り馬の出走情報】
`;
            for (const mf of matchedFavorites) {
              favoriteContext += `\n**${mf.number}番 ${mf.horseName}** (${mf.waku}枠)\n`;
              favoriteContext += `  メモ: ${mf.memo || '(メモなし)'}\n`;
              if (mf.memoMatch.length > 0) {
                favoriteContext += `  【条件マッチ】\n`;
                for (const match of mf.memoMatch) {
                  favoriteContext += `    ${match}\n`;
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('[AI Chat] Error fetching favorites:', e);
      }
    }
  }
  
  // コンテキスト情報を構築
  let context = '';
  if (maximsBlock) {
    context += maximsBlock;
  }
  if (racePremiseBlock) {
    context += racePremiseBlock + '\n';
  }
  if (raceContext) {
    context += `現在表示中のレース: ${raceContext.place} ${raceContext.raceNumber}R\n`;
    if (raceContext.baba || raceContext.pace) {
      context += `【レースカードの前提トグル】馬場=${raceContext.baba || '未設定'}, 展開=${raceContext.pace || '未設定'}\n`;
    }
  }
  if (favoriteContext) {
    context += favoriteContext;
  }
  context += raceDataContext;
  
  console.log('[AI Chat] General question context length:', context.length);
  
  const answer = await answerQuestion(message, context, apiKey);
  return answer;
}

/**
 * 学習したパターンを取得
 */
async function getLearnedPatterns(db: ReturnType<typeof getDb>): Promise<Array<{
  category: string;
  subcategory: string;
  count: number;
  sentiment: string;
  suggestedRule: string;
}>> {
  try {
    const patterns = await db.prepare(`
      SELECT category, subcategory, count, sentiment, suggested_rule
      FROM prediction_patterns
      WHERE count >= 3
      ORDER BY count DESC
      LIMIT 10
    `).all<{
      category: string;
      subcategory: string;
      count: number;
      sentiment: string;
      suggested_rule: string;
    }>();
    
    return patterns.map(p => ({
      category: p.category,
      subcategory: p.subcategory,
      count: p.count,
      sentiment: p.sentiment,
      suggestedRule: p.suggested_rule,
    }));
  } catch (e) {
    console.log('[AI Chat] No prediction_patterns table or error:', e);
    return [];
  }
}

/**
 * 学習したパターンをプロンプト用にフォーマット
 */
function formatLearnedPatterns(patterns: Array<{
  category: string;
  subcategory: string;
  count: number;
  sentiment: string;
  suggestedRule: string;
}>): string {
  if (patterns.length === 0) {
    return '';
  }
  
  let text = `

## 学習済み予想パターン（過去の予想から抽出）

以下は過去の予想で頻繁に使われているパターンです。これらを参考に予想文を生成してください。

`;

  for (const pattern of patterns) {
    const icon = pattern.sentiment === 'positive' ? '✅' : 
                 pattern.sentiment === 'negative' ? '⚠️' : '📝';
    text += `- ${icon} **${pattern.subcategory}** (${pattern.count}回使用): ${pattern.suggestedRule}\n`;
  }

  return text;
}

/**
 * 展開予想を生成
 */
async function handleExpansionRequest(
  raceContext: {
    year: number;
    date: string;
    place: string;
    raceNumber: number;
  },
  apiKey: string
): Promise<string> {
  const db = getDb();
  const { year, date, place, raceNumber } = raceContext;
  
  // wakujunから出走馬を取得
  const horses = await db.prepare(`
    SELECT * FROM wakujun
    WHERE year = $1 AND date = $2 AND place LIKE $3 AND race_number = $4
    ORDER BY umaban::INTEGER
  `).all<any>(year, date, `%${place}%`, raceNumber);
  
  if (!horses || horses.length === 0) {
    return `レースデータが見つかりません（${place} ${raceNumber}R）`;
  }
  
  // 距離・コース情報
  const distanceStr = horses[0]?.distance || '';
  const trackType = horses[0]?.track_type || '';
  const distanceMatch = distanceStr.match(/(\d+)/);
  const distance = distanceMatch ? parseInt(distanceMatch[1], 10) : 0;
  const surface = trackType.includes('芝') ? '芝' : 
                  trackType.includes('ダ') ? 'ダ' :
                  distanceStr.includes('芝') ? '芝' : 'ダ';
  
  // 各馬のT2F指数と前走通過順位を取得
  const horseExpansionData: Array<{
    number: number;
    name: string;
    t2f: number | null;
    firstCorner: string | null;
    runningStyle: string;
  }> = [];
  
  let frontRunnersCount = 0;  // T2F 22.5以下の馬数
  let earlyPositionCount = 0; // 前走3番手以内の馬数
  
  // 予想対象日付（YYYYMMDD形式）- 当日以降のレースは除外する
  const targetDateInt = parseInt(`${year}${date}`, 10);
  
  for (const horse of horses) {
    const horseName = (horse.umamei || '').trim().replace(/^[\$\*]+/, '');
    const horseNumber = parseInt(toHalfWidth(horse.umaban || '0'), 10);
    
    // 過去走を取得（最新1走のみ）- 当日以降のレースは除外
    const pastRace = await db.prepare(`
      SELECT race_id, umaban, corner_4
      FROM umadata
      WHERE (TRIM(horse_name) = $1
         OR REPLACE(REPLACE(horse_name, '*', ''), '$', '') = $1)
        AND SUBSTRING(race_id, 1, 8)::INTEGER < $2
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
      LIMIT 1
    `).get<any>(horseName, targetDateInt);
    
    let t2f: number | null = null;
    let firstCorner: string | null = null;
    let runningStyle = '不明';
    
    if (pastRace) {
      // 指数を取得
      const umabanPadded = (pastRace.umaban || '').toString().padStart(2, '0');
      const fullRaceId = pastRace.race_id + umabanPadded;
      
      const indices = await db.prepare(`
        SELECT "T2F" FROM indices WHERE race_id = $1
      `).get<any>(fullRaceId);
      
      if (indices) {
        t2f = indices.T2F;
        // T2Fが22.5以下なら先行力あり
        if (t2f !== null && t2f <= 22.5) {
          frontRunnersCount++;
          runningStyle = '先行';
        } else if (t2f !== null && t2f <= 24) {
          runningStyle = '中団';
        } else {
          runningStyle = '後方';
        }
      }
      
      // 前走通過順（corner_4を使用、最初のコーナー情報がないため4角を参考）
      firstCorner = pastRace.corner_4 || null;
      if (firstCorner) {
        const pos = parseInt(firstCorner, 10);
        if (!isNaN(pos) && pos <= 3) {
          earlyPositionCount++;
        }
      }
    }
    
    horseExpansionData.push({
      number: horseNumber,
      name: horseName,
      t2f,
      firstCorner,
      runningStyle,
    });
  }
  
  // 展開予想を生成
  const totalHorses = horses.length;
  const frontRunnerRatio = frontRunnersCount / totalHorses;
  const earlyPositionRatio = earlyPositionCount / totalHorses;
  
  let paceExpectation = '';
  let expansionAnalysis = '';
  
  if (frontRunnerRatio >= 0.4 || earlyPositionRatio >= 0.4) {
    paceExpectation = 'ハイペース';
    expansionAnalysis = `先行力のある馬（T2F 22.5以下）が${frontRunnersCount}頭、前走3番手以内が${earlyPositionCount}頭と多く、ペースが流れそう。差し馬に展開が向きやすい。`;
  } else if (frontRunnerRatio <= 0.15 && earlyPositionRatio <= 0.2) {
    paceExpectation = 'スローペース';
    expansionAnalysis = `先行力のある馬が少なく（${frontRunnersCount}頭）、スローペースの前残りに注意。逃げ・先行馬に展開利。`;
  } else {
    paceExpectation = 'ミドルペース';
    expansionAnalysis = `先行馬は${frontRunnersCount}頭で平均的。平均ペースで流れそう。`;
  }
  
  // 出力を構築
  let result = `【${place} ${raceNumber}R ${surface}${distance}m 展開予想】\n\n`;
  result += `**ペース予想: ${paceExpectation}**\n`;
  result += `${expansionAnalysis}\n\n`;
  
  result += `【先行力データ】\n`;
  result += `- T2F 22.5以下（速力あり）: ${frontRunnersCount}頭 / ${totalHorses}頭\n`;
  result += `- 前走4角3番手以内: ${earlyPositionCount}頭 / ${totalHorses}頭\n\n`;
  
  // 先行馬リスト
  const frontRunners = horseExpansionData.filter(h => h.t2f !== null && h.t2f <= 22.5);
  if (frontRunners.length > 0) {
    result += `【先行力のある馬】\n`;
    for (const h of frontRunners) {
      result += `${h.number}番 ${h.name} (T2F=${h.t2f?.toFixed(1)})\n`;
    }
    result += '\n';
  }
  
  // 展開利が見込める馬
  if (paceExpectation === 'ハイペース') {
    const closers = horseExpansionData.filter(h => h.runningStyle === '後方' || h.runningStyle === '中団');
    if (closers.length > 0) {
      result += `【展開利が見込める馬（差し・追込）】\n`;
      for (const h of closers.slice(0, 5)) {
        result += `${h.number}番 ${h.name}\n`;
      }
    }
  } else if (paceExpectation === 'スローペース') {
    result += `【展開利が見込める馬（逃げ・先行）】\n`;
    for (const h of frontRunners.slice(0, 5)) {
      result += `${h.number}番 ${h.name}\n`;
    }
  }
  
  return result;
}
