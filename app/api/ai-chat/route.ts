/**
 * AIチャット APIエンドポイント
 * 
 * POST /api/ai-chat
 * - 「予想」コマンド: レース予想を生成
 * - 一般質問: 競馬に関する質問に回答
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { isPremiumUser } from '@/lib/premium';
import { generatePrediction, answerQuestion } from '@/lib/ai-chat/openai-client';
import { evaluateGap } from '@/lib/ai-chat/gap-evaluation';
import type { RaceDataForAI, HorseDataForAI, PastRaceForAI } from '@/lib/ai-chat/types';
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
    
    if (isPredictionRequest && raceContext) {
      // レース予想を生成
      const response = await handlePredictionRequest(raceContext, apiKey);
      return NextResponse.json(response);
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
 * 予想リクエストを処理
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
  apiKey: string
) {
  const db = getDb();
  const { year, date, place, raceNumber, baba, pace } = raceContext;
  
  console.log('[AI Chat] Prediction request:', raceContext);
  
  // 1. wakujunから出走馬を取得
  const horses = await db.prepare(`
    SELECT * FROM wakujun
    WHERE year = $1 AND date = $2 AND place LIKE $3 AND race_no = $4
    ORDER BY umaban::INTEGER
  `).all<any>(year, date, `%${place}%`, raceNumber);
  
  if (!horses || horses.length === 0) {
    return { 
      error: 'No race data',
      message: 'レースデータが見つかりません'
    };
  }
  
  // 2. 各馬の過去走とStrideデータを取得
  const raceData: RaceDataForAI = {
    place,
    raceNumber,
    distance: parseInt(horses[0]?.kyori || '0', 10),
    surface: horses[0]?.track_type?.includes('芝') ? '芝' : 'ダ',
    trackCondition: '良', // TODO: 馬場状態を取得
    horses: [],
  };
  
  for (const horse of horses) {
    const horseName = (horse.umamei || '').trim().replace(/^[\$\*]+/, '');
    const horseNumber = parseInt(toHalfWidth(horse.umaban || '0'), 10);
    
    // 過去走を取得
    const pastRaces = await db.prepare(`
      SELECT * FROM umadata
      WHERE TRIM(horse_name) = $1
         OR REPLACE(REPLACE(horse_name, '*', ''), '$', '') = $1
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
      LIMIT 3
    `).all<any>(horseName);
    
    // 過去走データを整形
    const formatPastRace = (race: any): PastRaceForAI | null => {
      if (!race) return null;
      return {
        date: race.date || '',
        place: race.place || '',
        distance: parseInt(race.distance?.match(/\d+/)?.[0] || '0', 10),
        surface: race.distance?.includes('芝') ? '芝' : 'ダ',
        finishPosition: parseInt(toHalfWidth(race.finish_position || '99'), 10),
        margin: race.margin || '',
        trackCondition: race.track_condition || '良',
        popularity: parseInt(toHalfWidth(race.popularity || '0'), 10),
      };
    };
    
    const last1 = formatPastRace(pastRaces[0]);
    const last2 = formatPastRace(pastRaces[1]);
    const last3 = formatPastRace(pastRaces[2]);
    
    // indices から T2F, L4F, potential, makikaeshi を取得
    let strideData: any = {};
    if (pastRaces[0]?.race_id) {
      const umaban = String(horseNumber).padStart(2, '0');
      const fullRaceId = `${pastRaces[0].race_id}${umaban}`;
      
      const indexData = await db.prepare(`
        SELECT "T2F", "L4F", potential, makikaeshi
        FROM indices WHERE race_id = $1
      `).get<any>(fullRaceId);
      
      if (indexData) {
        strideData = indexData;
      }
    }
    
    // race_levels からレースレベルを取得
    let raceLevel: string | undefined;
    if (pastRaces[0]?.race_id) {
      const levelData = await db.prepare(`
        SELECT level_label FROM race_levels WHERE race_id = $1
      `).get<{ level_label: string }>(pastRaces[0].race_id);
      raceLevel = levelData?.level_label;
    }
    
    // ギャップ判定
    const gap = last1 ? evaluateGap({
      horseName,
      horseNumber,
      lastFinish: last1.finishPosition,
      margin: parseFloat(last1.margin) || 0,
      popularity: last1.popularity,
      comebackIndex: strideData.makikaeshi,
      potentialIndex: strideData.potential,
      raceLevel,
    }) : undefined;
    
    const horseData: HorseDataForAI = {
      number: horseNumber,
      name: horseName,
      jockey: horse.kishu || '',
      trainer: '', // wakujunにtrainerがない場合
      last1,
      last2,
      last3,
      potential: strideData.potential,
      makikaeshi: strideData.makikaeshi,
      raceLevel,
      gap: gap?.type !== '妥当' ? gap : undefined, // 妥当は表示しない
    };
    
    raceData.horses.push(horseData);
  }
  
  // 3. 過去予想からサンプルを取得（同じコースの予想を優先）
  const samplePredictions = await getSamplePredictions(db, place, raceData.surface, raceData.distance);
  
  // 4. AI予想を生成
  const result = await generatePrediction(raceData, samplePredictions, {
    baba,
    pace,
    apiKey,
  });
  
  return {
    prediction: result.prediction,
    analysis: result.analysis,
    raceInfo: {
      place,
      raceNumber,
      distance: raceData.distance,
      surface: raceData.surface,
    },
  };
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
