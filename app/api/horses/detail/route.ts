import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { toHalfWidth } from '@/utils/parse-helpers';
import { auth } from '@/lib/auth';
import { SagaBrain, HorseAnalysisInput, PastRaceInfo, TimeComparisonRace, PastRaceTimeComparison } from '@/lib/saga-ai/saga-brain';

// 馬名正規化関数
function normalizeHorseName(name: string): string {
  if (!name) return '';
  return name
    .replace(/^[\$\*＄＊\s　]+/, '')
    .replace(/[\s　]+$/, '')
    .trim();
}

// 時計比較用のレースを取得
async function getTimeComparisonRaces(
  db: ReturnType<typeof getDb>,
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

    const rows = await db.prepare(`
      SELECT 
        date, place, distance, class_name, finish_time, track_condition, 
        horse_name, age, race_id
      FROM umadata
      WHERE date IN ($1, $2, $3, $4, $5, $6)
        AND place LIKE $7
        AND distance = $8
        AND finish_position = '１'
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
    `).all<any>(
      dateRange[0], dateRange[1], dateRange[2],
      dateRange[3], dateRange[4], dateRange[5],
      `%${normalizedPlace}%`,
      pastRaceDistance
    );

    if (!rows || rows.length === 0) return [];

    return rows.map(row => {
      const age = parseInt(toHalfWidth(row.age || '0'), 10);
      const className = row.class_name || '';
      const isGradedRace = /G[123]|Ｇ[１２３]|重賞|JG[123]|ＪＧ[１２３]/i.test(className);
      const isYoungHorse = age === 2 || age === 3;

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
      };
    });
  } catch (e) {
    console.error('[horses/detail] Error getting time comparison races:', e);
    return [];
  }
}

// 距離を数値に変換（"芝1600" → 1600）
function parseDistance(distance: string): number {
  const match = distance.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// 走破タイムを秒数に変換（"1:34.5" → 945, "134.5" → 945）
function parseFinishTime(time: string): number {
  if (!time) return 0;
  const cleaned = toHalfWidth(time);
  // "1:34.5" 形式
  const colonMatch = cleaned.match(/(\d+):(\d+)\.(\d)/);
  if (colonMatch) {
    return parseInt(colonMatch[1], 10) * 600 + parseInt(colonMatch[2], 10) * 10 + parseInt(colonMatch[3], 10);
  }
  // "134.5" 形式（分なし）
  const dotMatch = cleaned.match(/(\d+)\.(\d)/);
  if (dotMatch) {
    const totalTenths = parseInt(dotMatch[1], 10) * 10 + parseInt(dotMatch[2], 10);
    return totalTenths;
  }
  return 0;
}

interface PastRace {
  date: string;
  distance: string;
  class_name: string;
  finish_position: string;
  finish_time: string;
  margin: string;
  track_condition: string;
  place: string;
  popularity?: string;
  race_id?: string;
  surface?: string;
  indices?: {
    makikaeshi?: number;
    potential?: number;
  } | null;
  raceLevel?: {
    level: string;
    levelLabel: string;
    totalHorsesRun: number;
    goodRunCount: number;
    winCount: number;
    aiComment?: string;
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const horseName = searchParams.get('name');
  const enableSagaAI = searchParams.get('enableSagaAI') === 'true';
  
  console.log('[horses/detail] Request params:', { horseName, enableSagaAI });

  if (!horseName) {
    return NextResponse.json({ error: 'Horse name is required' }, { status: 400 });
  }

  try {
    const db = getDb();
    const normalizedName = normalizeHorseName(horseName);

    // umadataから過去走データを取得（umaban追加：indices取得に必要、lap_time追加：ラップ分析に必要）
    const pastRacesRaw = await db.prepare(`
      SELECT 
        race_id,
        umaban,
        date,
        place,
        course_type,
        distance,
        class_name,
        finish_position,
        finish_time,
        margin,
        track_condition,
        last_3f,
        horse_weight,
        jockey,
        popularity,
        lap_time
      FROM umadata
      WHERE TRIM(horse_name) = $1
         OR REPLACE(REPLACE(horse_name, '*', ''), '$', '') = $1
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
      LIMIT 10
    `).all<any>(normalizedName);

    if (!pastRacesRaw || pastRacesRaw.length === 0) {
      return NextResponse.json({ 
        horseName: normalizedName,
        pastRaces: [],
        message: 'No race data found for this horse'
      });
    }

    // indicesとrace_levelsを取得
    const raceIds = pastRacesRaw.map(r => r.race_id).filter(Boolean);
    
    // indices取得（race_idは馬番付きの18桁形式: 16桁race_id + 2桁umaban）
    let indicesMap: Record<string, any> = {};
    for (const race of pastRacesRaw) {
      if (!race.race_id || !race.umaban) continue;
      
      // 18桁のフルIDを作成（saga-aiと同じ方式）
      const umaban = String(race.umaban).replace(/[^\d]/g, '').padStart(2, '0');
      const fullRaceId = `${race.race_id}${umaban}`;
      
      try {
        const indexData = await db.prepare(`
          SELECT "L4F", "T2F", potential, makikaeshi
          FROM indices WHERE race_id = $1
        `).get<any>(fullRaceId);
        
        if (indexData) {
          indicesMap[race.race_id] = {
            potential: indexData.potential,
            makikaeshi: indexData.makikaeshi,
            t2f: indexData.T2F,
            l4f: indexData.L4F
          };
        }
      } catch (err) {
        console.error(`[horses/detail] Index lookup error for ${fullRaceId}:`, err);
      }
    }

    // race_levels取得
    let raceLevelsMap: Record<string, any> = {};
    if (raceIds.length > 0) {
      const placeholders = raceIds.map((_, i) => `$${i + 1}`).join(',');
      const raceLevelsRaw = await db.prepare(`
        SELECT race_id, level, level_label, total_horses_run, good_run_count, win_count
        FROM race_levels
        WHERE race_id IN (${placeholders})
      `).all<any>(...raceIds);
      
      raceLevelsRaw.forEach((rl: any) => {
        if (rl.race_id) {
          raceLevelsMap[rl.race_id] = {
            level: rl.level,
            levelLabel: rl.level_label || rl.level,
            totalHorsesRun: rl.total_horses_run || 0,
            goodRunCount: rl.good_run_count || 0,
            winCount: rl.win_count || 0
          };
        }
      });
    }

    // 過去走データを整形
    const pastRaces: PastRace[] = pastRacesRaw.map((race: any) => {
      const raceId = race.race_id || '';
      return {
        date: race.date || '',
        distance: race.distance || '',
        class_name: race.class_name || '',
        finish_position: toHalfWidth(race.finish_position || ''),
        finish_time: race.finish_time || '',
        margin: race.margin || '',
        track_condition: race.track_condition || '',
        place: race.place || '',
        popularity: race.popularity || '',
        race_id: raceId,
        surface: race.course_type?.includes('芝') ? '芝' : 'ダ',
        indices: indicesMap[raceId] || null,
        raceLevel: raceLevelsMap[raceId] || undefined
      };
    });

    // wakujunから最新の馬情報を取得（斤量、騎手など）
    const latestInfo = await db.prepare(`
      SELECT umaban, kinryo, kishu
      FROM wakujun
      WHERE TRIM(umamei) = $1
         OR REPLACE(REPLACE(umamei, '*', ''), '$', '') = $1
      ORDER BY year DESC, date DESC
      LIMIT 1
    `).get<any>(normalizedName);

    // ログインユーザーの情報を取得
    let memo: string | null = null;
    let isFavorite = false;
    let isPremium = false;
    let userId: string | null = null;
    
    try {
      const session = await auth();
      if (session?.user?.id) {
        userId = session.user.id;
        
        // お気に入り馬のメモを取得
        const favorite = await db.prepare(`
          SELECT note FROM favorite_horses
          WHERE user_id = $1 AND horse_name = $2
        `).get<{ note: string | null }>(userId, normalizedName);
        
        if (favorite) {
          memo = favorite.note;
          isFavorite = true;
        }
        
        // プレミアム判定
        const subscription = await db.prepare(`
          SELECT plan, status FROM subscriptions WHERE user_id = $1
        `).get<{ plan: string; status: string }>(userId);
        
        isPremium = subscription?.plan === 'premium' && subscription?.status === 'active';
      }
    } catch (authError) {
      // 認証エラーは無視（ログインしていない場合など）
      console.log('Auth check skipped:', authError);
    }

    // おれAI分析を実行（プレミアム会員 または enableSagaAIフラグがオンのログインユーザー）
    let timeEvaluation: string | undefined;
    let lapEvaluation: string | undefined;
    
    // プレミアム会員、またはおれAI機能が有効化されている場合にSagaBrain分析を実行
    const shouldRunSagaAI = (isPremium || (enableSagaAI && userId)) && pastRacesRaw.length > 0;
    console.log('[horses/detail] SagaAI check:', { isPremium, enableSagaAI, userId: !!userId, pastRacesCount: pastRacesRaw.length, shouldRunSagaAI });
    if (shouldRunSagaAI) {
      try {
        // 過去走を SagaBrain用の形式に変換
        const sagaPastRaces: PastRaceInfo[] = [];
        const timeComparisonData: PastRaceTimeComparison[] = [];
        
        for (let i = 0; i < Math.min(5, pastRacesRaw.length); i++) {
          const race = pastRacesRaw[i];
          const raceId = race.race_id || '';
          const indices = indicesMap[raceId] || {};
          if (i === 0) {
            console.log('[horses/detail] Indices check:', { raceId, hasIndices: Object.keys(indices).length > 0, t2f: indices.t2f, l4f: indices.l4f, lapTime: race.lap_time });
          }
          
          // 距離を数値に変換
          const distanceNum = parseDistance(race.distance || '');
          const surface = race.course_type?.includes('芝') ? '芝' : 'ダ';
          
          sagaPastRaces.push({
            date: race.date || '',
            place: race.place || '',
            surface: surface as '芝' | 'ダ',
            distance: distanceNum,
            finishPosition: parseInt(toHalfWidth(race.finish_position || '99'), 10),
            popularity: parseInt(toHalfWidth(race.popularity || '0'), 10),
            margin: race.margin || '',
            trackCondition: race.track_condition || '良',
            finishTime: parseFinishTime(race.finish_time || ''),
            className: race.class_name || '',
            T2F: indices.t2f,
            L4F: indices.l4f,
            potential: indices.potential,
            makikaeshi: indices.makikaeshi,
            lapString: race.lap_time || '',  // ラップ分析に必要
          });
          
          // 時計比較データを取得（直近3走のみ）
          if (i < 3) {
            const comparisonRaces = await getTimeComparisonRaces(
              db,
              race.date || '',
              race.place || '',
              race.distance || ''
            );
            
            if (comparisonRaces.length > 0) {
              timeComparisonData.push({
                pastRaceIndex: i,
                pastRaceDate: race.date || '',
                pastRaceClass: race.class_name || '',
                pastRaceTime: parseFinishTime(race.finish_time || ''),
                pastRaceCondition: race.track_condition || '良',
                comparisons: comparisonRaces,
              });
            }
          }
        }
        
        // SagaBrain分析を実行（最新の過去走を「今回のレース」として使用）
        const latestRace = pastRacesRaw[0];
        const latestDistance = parseDistance(latestRace.distance || '');
        const latestSurface = latestRace.course_type?.includes('芝') ? '芝' : 'ダ';
        
        const input: HorseAnalysisInput = {
          horseName: normalizedName,
          horseNumber: 1, // ダミー
          waku: 1, // ダミー
          raceDate: latestRace.date || '',
          place: latestRace.place || '',
          surface: latestSurface as '芝' | 'ダ',
          distance: latestDistance,
          trackCondition: (latestRace.track_condition || '良') as '良' | '稍' | '重' | '不',
          pastRaces: sagaPastRaces,
          timeComparisonData: timeComparisonData,
        };
        
        const sagaBrain = new SagaBrain();
        const analysis = sagaBrain.analyzeHorse(input);
        
        console.log('[horses/detail] SagaBrain result:', { 
          hasTimeEval: !!analysis.timeEvaluation,
          hasLapEval: !!analysis.lapEvaluation,
          timeEval: analysis.timeEvaluation?.substring(0, 50),
          lapEval: analysis.lapEvaluation?.substring(0, 50),
          pastRacesCount: sagaPastRaces.length,
          timeCompCount: timeComparisonData.length,
          hasIndices: sagaPastRaces.some(r => r.T2F || r.L4F || r.potential)
        });
        
        timeEvaluation = analysis.timeEvaluation;
        lapEvaluation = analysis.lapEvaluation;
      } catch (sagaError) {
        console.error('[horses/detail] SagaBrain analysis error:', sagaError);
        // 分析エラーは無視して続行
      }
    }

    return NextResponse.json({
      horseName: normalizedName,
      umaban: latestInfo?.umaban || '',
      kinryo: latestInfo?.kinryo || '',
      kishu: latestInfo?.kishu || '',
      pastRaces,
      score: null, // スコアは動的計算が必要なのでnull
      hasData: pastRaces.length > 0,
      memo,           // お気に入り馬のメモ
      isFavorite,     // お気に入り登録されているか
      isPremium: shouldRunSagaAI,  // おれAI分析が実行されたかどうか
      timeEvaluation, // おれAI タイム評価
      lapEvaluation,  // おれAI ラップ評価
    });
  } catch (error) {
    console.error('Horse detail error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch horse detail',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
