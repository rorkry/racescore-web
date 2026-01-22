/**
 * Discord予想データをDBにインポートするAPI
 * 
 * POST /api/admin/import-predictions
 * - FormDataでJSONファイルを受け取る
 * - 管理者のみ実行可能
 * - パターン抽出・集計も実行
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import { 
  parsePredictionText, 
  aggregatePatterns, 
  generateRuleSuggestions,
  type ParsedPrediction 
} from '@/lib/ai-chat/prediction-parser';

// パーサー関数群（parse-predictions.tsと同じロジック）

function extractRaceCourse(text: string): string | null {
  const courses = [
    '中山', '東京', '阪神', '京都', '中京', '小倉', '新潟', '福島', '札幌', '函館',
    '大井', '船橋', '川崎', '浦和', '園田', '姫路', '名古屋', '笠松', '金沢',
    '高知', '佐賀', '盛岡', '水沢', '門別', '帯広'
  ];
  
  for (const course of courses) {
    if (text.includes(course)) {
      return course;
    }
  }
  return null;
}

function extractRaceNumber(text: string): number | null {
  const match = text.match(/(\d{1,2})\s*[Rr]/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

function extractDistanceAndSurface(text: string): { distance: number | null; surface: string | null } {
  const match = text.match(/(芝|ダ|ダート)\s*(\d{3,4})\s*m?/);
  if (match) {
    return {
      surface: match[1] === '芝' ? '芝' : 'ダート',
      distance: parseInt(match[2], 10)
    };
  }
  return { distance: null, surface: null };
}

function extractHorseNumbers(text: string): number[] {
  const numbers: number[] = [];
  const circledNumbers: Record<string, number> = {
    '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
    '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
    '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15,
    '⑯': 16, '⑰': 17, '⑱': 18
  };
  
  for (const [char, num] of Object.entries(circledNumbers)) {
    if (text.includes(char)) {
      numbers.push(num);
    }
  }
  
  return [...new Set(numbers)].sort((a, b) => a - b);
}

function extractPredictionMarks(text: string): {
  honmei: number[];
  taikou: number[];
  ana: number[];
} {
  const result = {
    honmei: [] as number[],
    taikou: [] as number[],
    ana: [] as number[]
  };
  
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.includes('◎') || line.includes('本命')) {
      result.honmei = extractHorseNumbers(line);
    }
    if (line.includes('○') || line.includes('対抗') || line.includes('相手')) {
      result.taikou.push(...extractHorseNumbers(line));
    }
    if (line.includes('穴') || line.includes('▲')) {
      result.ana.push(...extractHorseNumbers(line));
    }
  }
  
  result.honmei = [...new Set(result.honmei)];
  result.taikou = [...new Set(result.taikou)];
  result.ana = [...new Set(result.ana)];
  
  return result;
}

function extractBets(text: string): any[] {
  const bets: any[] = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const numbers = extractHorseNumbers(line);
    
    if (line.includes('単勝') && numbers.length > 0) {
      bets.push({ type: '単勝', axis: numbers, rawText: line.trim() });
    }
    if ((line.includes('馬連') || line.includes('馬複')) && numbers.length >= 2) {
      bets.push({ type: line.includes('馬連') ? '馬連' : '馬複', axis: numbers, rawText: line.trim() });
    }
    if (line.includes('馬単') && numbers.length >= 2) {
      bets.push({ type: '馬単', axis: numbers, rawText: line.trim() });
    }
    if (line.includes('ワイド') && numbers.length >= 2) {
      bets.push({ type: 'ワイド', axis: numbers, rawText: line.trim() });
    }
    if ((line.includes('三連単') || line.includes('3連単')) && numbers.length >= 3) {
      bets.push({ type: '三連単', axis: numbers, rawText: line.trim() });
    }
    if ((line.includes('三連複') || line.includes('3連複')) && numbers.length >= 3) {
      bets.push({ type: '三連複', axis: numbers, rawText: line.trim() });
    }
  }
  
  return bets;
}

export async function POST(request: NextRequest) {
  try {
    // 認証確認
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // 管理者確認
    const db = getDb();
    const user = await db.prepare(
      'SELECT role FROM users WHERE id = $1'
    ).get<{ role: string }>(session.user.id);
    
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    
    // FormDataからファイルを取得
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // ファイルを読み込み
    const text = await file.text();
    let data: any;
    
    try {
      data = JSON.parse(text);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON file' }, { status: 400 });
    }
    
    if (!data.messages || !Array.isArray(data.messages)) {
      return NextResponse.json({ error: 'Invalid format: messages array not found' }, { status: 400 });
    }
    
    console.log(`[Import] Processing ${data.messages.length} messages`);
    
    // メッセージを処理してDBに保存
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    // パターン抽出用に予想を収集
    const parsedPredictions: ParsedPrediction[] = [];
    
    for (const msg of data.messages) {
      const content = msg.content || '';
      
      // 予想メッセージかどうかを判定
      const isPrediction = 
        content.includes('R') ||
        content.includes('馬連') ||
        content.includes('馬単') ||
        content.includes('三連') ||
        content.includes('単勝') ||
        content.includes('本命') ||
        content.includes('◎');
      
      if (!isPrediction) {
        skipped++;
        continue;
      }
      
      const raceCourse = extractRaceCourse(content);
      const raceNumber = extractRaceNumber(content);
      
      // 競馬場かレース番号がないとスキップ
      if (!raceCourse && !raceNumber) {
        skipped++;
        continue;
      }
      
      const { distance, surface } = extractDistanceAndSurface(content);
      const marks = extractPredictionMarks(content);
      const bets = extractBets(content);
      const reactionCount = msg.reactions?.reduce((sum: number, r: any) => sum + r.count, 0) || 0;
      
      // 🎯リアクションがあれば的中とみなす
      const hit = msg.reactions?.some((r: any) => r.emoji?.name === '🎯') ? 1 : 0;
      
      // パターン抽出（構造化分析）
      const parsed = parsePredictionText(content, {
        id: msg.id,
        timestamp: msg.timestamp,
      });
      parsedPredictions.push(parsed);
      
      try {
        await db.prepare(`
          INSERT INTO ai_predictions (
            id, discord_message_id, timestamp, author,
            race_course, race_number, race_name, distance, surface,
            honmei, taikou, ana, bets_json, full_text,
            reaction_count, hit,
            parsed_reasons, conditions_json
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
          )
          ON CONFLICT (discord_message_id) DO UPDATE SET
            reaction_count = $15,
            hit = $16,
            parsed_reasons = $17,
            conditions_json = $18
        `).run(
          randomUUID(),
          msg.id,
          msg.timestamp,
          msg.author?.nickname || msg.author?.name || 'Unknown',
          raceCourse,
          raceNumber,
          null, // race_name
          distance,
          surface,
          JSON.stringify(marks.honmei),
          JSON.stringify(marks.taikou),
          JSON.stringify(marks.ana),
          JSON.stringify(bets),
          content,
          reactionCount,
          hit,
          JSON.stringify(parsed.honmeiReasons),  // 抽出された理由
          JSON.stringify(parsed.conditions)       // 馬場・展開条件
        );
        imported++;
      } catch (e) {
        console.error('[Import] Error inserting prediction:', e);
        errors++;
      }
    }
    
    // パターン集計を保存
    let patternsSaved = 0;
    if (parsedPredictions.length > 0) {
      const aggregated = aggregatePatterns(parsedPredictions);
      const suggestions = generateRuleSuggestions(aggregated);
      
      for (const suggestion of suggestions) {
        try {
          const patternData = aggregated.get(`${suggestion.category}:${suggestion.subcategory}`);
          await db.prepare(`
            INSERT INTO prediction_patterns (
              id, category, subcategory, count, sentiment, examples, suggested_rule, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, NOW()
            )
            ON CONFLICT (category, subcategory) DO UPDATE SET
              count = prediction_patterns.count + $4,
              examples = $6,
              suggested_rule = $7,
              updated_at = NOW()
          `).run(
            randomUUID(),
            suggestion.category,
            suggestion.subcategory,
            suggestion.frequency,
            suggestion.sentiment,
            JSON.stringify(patternData?.examples || []),
            suggestion.suggestedRule
          );
          patternsSaved++;
        } catch (e) {
          console.error('[Import] Error saving pattern:', e);
        }
      }
    }
    
    console.log(`[Import] Complete: imported=${imported}, skipped=${skipped}, errors=${errors}, patterns=${patternsSaved}`);
    
    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors,
      patternsSaved,
      total: data.messages.length
    });
    
  } catch (error) {
    console.error('[Import] Error:', error);
    return NextResponse.json({ 
      error: 'Import failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
