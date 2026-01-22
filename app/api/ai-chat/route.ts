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
} from '@/lib/saga-ai/saga-brain';
import { getFineTunedModel } from '@/lib/ai-chat/fine-tuning';
import { toHalfWidth } from '@/utils/parse-helpers';

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
    
    // 「予想」コマンドの検出
    const isPredictionRequest = message.includes('予想') || message.includes('よそう');
    
    console.log('[AI Chat] Request:', { message, isPredictionRequest, raceContext });
    
    if (isPredictionRequest && raceContext) {
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
      // 一般質問に回答
      const response = await handleGeneralQuestion(message, raceContext, apiKey);
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
    WHERE year = $1 AND date = $2 AND place LIKE $3 AND race_no = $4
    ORDER BY umaban::INTEGER
  `).all<any>(year, date, `%${place}%`, raceNumber);
  
  console.log('[AI Chat] Wakujun query:', { year, date, place: `%${place}%`, raceNumber });
  console.log('[AI Chat] Found horses:', horses?.length || 0);
  
  if (!horses || horses.length === 0) {
    const sampleData = await db.prepare(`
      SELECT DISTINCT year, date, place, race_no FROM wakujun LIMIT 5
    `).all<any>();
    console.log('[AI Chat] Sample wakujun data:', sampleData);
    
    return { 
      error: 'No race data',
      message: `レースデータが見つかりません（${year}/${date} ${place} ${raceNumber}R）`
    };
  }
  
  // レース情報
  const raceInfo = {
    place,
    raceNumber,
    distance: parseInt(horses[0]?.kyori || '0', 10),
    surface: (horses[0]?.track_type?.includes('芝') ? '芝' : 'ダ') as '芝' | 'ダ',
    trackCondition: '良',
    className: horses[0]?.class_name || '',
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
  
  for (const horse of horses) {
    const horseName = (horse.umamei || '').trim().replace(/^[\$\*]+/, '');
    const horseNumber = parseInt(toHalfWidth(horse.umaban || '0'), 10);
    const waku = parseInt(toHalfWidth(horse.waku || '0'), 10);
    
    // 過去走を取得（5走分）
    const pastRacesRaw = await db.prepare(`
      SELECT * FROM umadata
      WHERE TRIM(horse_name) = $1
         OR REPLACE(REPLACE(horse_name, '*', ''), '$', '') = $1
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
      LIMIT 5
    `).all<any>(horseName);
    
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
      
      // race_level取得
      let raceLevel: string | null = null;
      try {
        const levelData = await db.prepare(`
          SELECT level_label FROM race_levels WHERE race_id = $1
        `).get<{ level_label: string }>(raceId.substring(0, 16));
        raceLevel = levelData?.level_label || null;
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
        lapRating: i === 0 ? latestLapRating : null,
        timeRating: i === 0 ? latestTimeRating : null,
        corner4: parseInt(toHalfWidth(race.corner_4 || race.corner_4_position || '0'), 10) || null,
        totalHorses: parseInt(race.field_size || race.number_of_horses || '16', 10),
        className: race.class_name || '',
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
    try {
      // PastRaceInfoの形式に変換
      const sagaPastRaces: PastRaceInfo[] = pastRaces.map(pr => ({
        date: pr.date,
        place: pr.place,
        surface: pr.surface as '芝' | 'ダ',
        distance: pr.distance,
        finishPosition: pr.finishPosition,
        popularity: pr.popularity,
        margin: pr.margin,
        trackCondition: pr.trackCondition,
        T2F: pr.lapRating ? undefined : undefined, // 実際の値はindicesから
        L4F: pr.lapRating ? undefined : undefined,
        potential: latestPotential || undefined,
        makikaeshi: latestMakikaeshi || undefined,
        corner4: pr.corner4 || undefined,
        totalHorses: pr.totalHorses,
        className: pr.className,
        raceLevel: pr.raceLevel ? {
          level: pr.raceLevel as 'A' | 'B' | 'C' | 'D' | 'LOW' | 'UNKNOWN',
          labelSimple: pr.raceLevel,
        } : undefined,
      }));
      
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
    
    console.log(`[AI Chat] Horse ${horseNumber} ${horseName}: score=${totalScore}, rec=${recommendation}, rules=${matchedRules.length}, sagaScore=${sagaAnalysisResult?.score || 'N/A'}`);
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
  
  // 過大評価・過小評価の馬を抽出
  const overvalued = analyzedHorses
    .filter(h => h.matchedRules.some(r => r.type === 'NEGATIVE'))
    .map(h => h.name);
  const undervalued = analyzedHorses
    .filter(h => h.matchedRules.some(r => r.type === 'POSITIVE' && h.estimatedPopularity >= 5))
    .map(h => h.name);
  
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
  apiKey: string
): Promise<string> {
  // コンテキスト情報を構築
  let context = '';
  
  if (raceContext) {
    context = `現在表示中のレース: ${raceContext.place} ${raceContext.raceNumber}R\n`;
  }
  
  // TODO: コース特性データをコンテキストに追加
  // TODO: 種牡馬データをコンテキストに追加
  
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
