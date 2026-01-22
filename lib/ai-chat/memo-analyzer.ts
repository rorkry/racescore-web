/**
 * メモ解析モジュール
 * 
 * ユーザーが入力したレースメモ・馬場メモを解析し、
 * AI予想のルールに反映する
 */

import { getDb } from '@/lib/db';

// 解析結果の型
export interface MemoAnalysisResult {
  // レースレベル調整
  raceLevelOverride?: 'A' | 'B' | 'C' | 'D' | null;
  raceLevelNote?: string;
  
  // 馬場バイアス
  trackBias?: 'inner' | 'outer' | 'front' | 'closer' | 'flat';
  trackBiasNote?: string;
  
  // 特定馬の恵まれ/不利判定
  horseAdjustments: Array<{
    horseName?: string;
    horseNumber?: number;
    type: 'blessed' | 'unlucky';
    reason: string;
  }>;
  
  // 自由記述から抽出した追加情報
  additionalNotes: string[];
}

/**
 * レースメモを取得
 */
export async function getRaceMemos(
  userId: string,
  raceKey: string
): Promise<Array<{ horseNumber: string | null; memo: string }>> {
  const db = getDb();
  
  try {
    const memos = await db.prepare(`
      SELECT horse_number, memo FROM race_memos
      WHERE user_id = $1 AND race_key = $2
      ORDER BY created_at DESC
    `).all<{ horse_number: string | null; memo: string }>(userId, raceKey);
    
    return memos.map(m => ({
      horseNumber: m.horse_number,
      memo: m.memo,
    }));
  } catch (e) {
    console.error('[MemoAnalyzer] Error fetching race memos:', e);
    return [];
  }
}

/**
 * 馬場メモを取得
 */
export async function getBabaMemo(
  userId: string,
  date: string,
  place: string
): Promise<{
  advantagePosition: string | null;
  advantageStyle: string | null;
  freeMemo: string | null;
} | null> {
  const db = getDb();
  
  try {
    const memo = await db.prepare(`
      SELECT advantage_position, advantage_style, free_memo
      FROM baba_memos
      WHERE user_id = $1 AND date = $2 AND place = $3
    `).get<{
      advantage_position: string | null;
      advantage_style: string | null;
      free_memo: string | null;
    }>(userId, date, place);
    
    if (!memo) return null;
    
    return {
      advantagePosition: memo.advantage_position,
      advantageStyle: memo.advantage_style,
      freeMemo: memo.free_memo,
    };
  } catch (e) {
    console.error('[MemoAnalyzer] Error fetching baba memo:', e);
    return null;
  }
}

/**
 * メモからキーワードを検出してルールに変換
 */
export function analyzeMemosLocally(
  raceMemos: Array<{ horseNumber: string | null; memo: string }>,
  babaMemo: { advantagePosition: string | null; advantageStyle: string | null; freeMemo: string | null } | null
): MemoAnalysisResult {
  const result: MemoAnalysisResult = {
    horseAdjustments: [],
    additionalNotes: [],
  };
  
  // 馬場メモからバイアスを取得
  if (babaMemo) {
    // 有利ポジション
    if (babaMemo.advantagePosition) {
      const pos = babaMemo.advantagePosition.toLowerCase();
      if (pos.includes('内') || pos.includes('inner')) {
        result.trackBias = 'inner';
        result.trackBiasNote = '内有利馬場（ユーザー設定）';
      } else if (pos.includes('外') || pos.includes('outer')) {
        result.trackBias = 'outer';
        result.trackBiasNote = '外有利馬場（ユーザー設定）';
      }
    }
    
    // 有利脚質
    if (babaMemo.advantageStyle) {
      const style = babaMemo.advantageStyle.toLowerCase();
      if (style.includes('前') || style.includes('先行') || style.includes('逃げ')) {
        result.trackBias = result.trackBias || 'front';
        result.trackBiasNote = (result.trackBiasNote ? result.trackBiasNote + '、' : '') + '前有利（ユーザー設定）';
      } else if (style.includes('差し') || style.includes('追込')) {
        result.trackBias = result.trackBias || 'closer';
        result.trackBiasNote = (result.trackBiasNote ? result.trackBiasNote + '、' : '') + '差し有利（ユーザー設定）';
      }
    }
    
    // 自由記述からキーワード検出
    if (babaMemo.freeMemo) {
      const memo = babaMemo.freeMemo;
      
      // 内/外有利
      if (memo.includes('内が良') || memo.includes('内有利') || memo.includes('インコース')) {
        result.trackBias = result.trackBias || 'inner';
        result.trackBiasNote = memo;
      }
      if (memo.includes('外が良') || memo.includes('外有利') || memo.includes('外差し')) {
        result.trackBias = result.trackBias || 'outer';
        result.trackBiasNote = memo;
      }
      
      // 前/差し有利
      if (memo.includes('前残り') || memo.includes('逃げ有利') || memo.includes('先行有利')) {
        result.trackBias = result.trackBias || 'front';
      }
      if (memo.includes('差し有利') || memo.includes('追込有利') || memo.includes('前潰れ')) {
        result.trackBias = result.trackBias || 'closer';
      }
      
      result.additionalNotes.push(memo);
    }
  }
  
  // レースメモからキーワード検出
  for (const raceMemo of raceMemos) {
    const memo = raceMemo.memo;
    const horseNum = raceMemo.horseNumber ? parseInt(raceMemo.horseNumber, 10) : undefined;
    
    // レースレベル関連
    if (memo.includes('ハイレベル') || memo.includes('高レベル') || memo.includes('レベル高')) {
      if (memo.includes('超') || memo.includes('かなり')) {
        result.raceLevelOverride = 'A';
      } else {
        result.raceLevelOverride = result.raceLevelOverride || 'B';
      }
      result.raceLevelNote = memo;
    }
    if (memo.includes('低レベル') || memo.includes('メンバー弱') || memo.includes('相手弱')) {
      result.raceLevelOverride = 'D';
      result.raceLevelNote = memo;
    }
    
    // 勝ち上がり頭数の検出
    const winnerMatch = memo.match(/勝ち上がり(\d+)頭/);
    if (winnerMatch) {
      const winners = parseInt(winnerMatch[1], 10);
      if (winners >= 4) {
        result.raceLevelOverride = 'A';
        result.raceLevelNote = `勝ち上がり${winners}頭の超ハイレベル戦`;
      } else if (winners >= 3) {
        result.raceLevelOverride = 'B';
        result.raceLevelNote = `勝ち上がり${winners}頭のハイレベル戦`;
      }
    }
    
    // 特定馬への恵まれ/不利判定
    if (horseNum) {
      if (memo.includes('恵まれ') || memo.includes('展開利') || memo.includes('楽だった')) {
        result.horseAdjustments.push({
          horseNumber: horseNum,
          type: 'blessed',
          reason: memo,
        });
      }
      if (memo.includes('不利') || memo.includes('厳しかった') || memo.includes('かみ合わ')) {
        result.horseAdjustments.push({
          horseNumber: horseNum,
          type: 'unlucky',
          reason: memo,
        });
      }
    }
    
    // 一般的な注記
    if (!raceMemo.horseNumber) {
      result.additionalNotes.push(memo);
    }
  }
  
  return result;
}

/**
 * GPTを使ってメモをより高度に解析（オプション）
 */
export async function analyzeMemoWithGPT(
  raceMemos: Array<{ horseNumber: string | null; memo: string }>,
  babaMemo: { advantagePosition: string | null; advantageStyle: string | null; freeMemo: string | null } | null,
  apiKey: string
): Promise<MemoAnalysisResult> {
  // まずローカル解析を実行
  const localResult = analyzeMemosLocally(raceMemos, babaMemo);
  
  // メモがない場合はローカル結果のみ
  const allMemos = [
    ...raceMemos.map(m => m.memo),
    babaMemo?.freeMemo,
  ].filter(Boolean);
  
  if (allMemos.length === 0) {
    return localResult;
  }
  
  // GPTで追加解析（コスト節約のため、複雑なメモがある場合のみ）
  const hasComplexMemo = allMemos.some(m => m && m.length > 50);
  
  if (!hasComplexMemo) {
    return localResult;
  }
  
  try {
    const prompt = `
以下のレースメモ・馬場メモを解析して、競馬予想に活用できる情報を抽出してください。

## メモ
${allMemos.join('\n')}

## 抽出してほしい情報
1. レースレベルの評価（A/B/C/D、または変更なし）
2. 馬場バイアス（内有利/外有利/前有利/差し有利/フラット、または不明）
3. 特定の馬への評価調整（恵まれた/不利があった）

JSONで回答してください：
{
  "raceLevel": "A" | "B" | "C" | "D" | null,
  "raceLevelReason": "理由",
  "trackBias": "inner" | "outer" | "front" | "closer" | "flat" | null,
  "trackBiasReason": "理由",
  "horseAdjustments": [
    { "horseNumber": 1, "type": "blessed" | "unlucky", "reason": "理由" }
  ]
}
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '競馬のメモを解析するアシスタントです。JSONで回答します。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });
    
    if (!response.ok) {
      console.error('[MemoAnalyzer] GPT request failed');
      return localResult;
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    // JSONを抽出
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return localResult;
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // GPT結果をマージ
    if (parsed.raceLevel && !localResult.raceLevelOverride) {
      localResult.raceLevelOverride = parsed.raceLevel;
      localResult.raceLevelNote = parsed.raceLevelReason || localResult.raceLevelNote;
    }
    
    if (parsed.trackBias && !localResult.trackBias) {
      localResult.trackBias = parsed.trackBias;
      localResult.trackBiasNote = parsed.trackBiasReason || localResult.trackBiasNote;
    }
    
    if (parsed.horseAdjustments && Array.isArray(parsed.horseAdjustments)) {
      for (const adj of parsed.horseAdjustments) {
        // 重複チェック
        const exists = localResult.horseAdjustments.some(
          a => a.horseNumber === adj.horseNumber
        );
        if (!exists && adj.horseNumber && adj.type) {
          localResult.horseAdjustments.push({
            horseNumber: adj.horseNumber,
            type: adj.type,
            reason: adj.reason || '',
          });
        }
      }
    }
    
    return localResult;
    
  } catch (e) {
    console.error('[MemoAnalyzer] GPT analysis error:', e);
    return localResult;
  }
}

/**
 * 4角位置から恵まれ/不利を判定
 * 
 * @param corner4 4角通過順位
 * @param totalHorses 出走頭数
 * @param trackBias 馬場バイアス
 * @param finishPosition 着順
 * @param margin 着差
 */
export function analyzeCornerPosition(
  corner4: number | null,
  totalHorses: number,
  trackBias: 'inner' | 'outer' | 'front' | 'closer' | 'flat' | undefined,
  finishPosition: number,
  margin: string
): { type: 'blessed' | 'unlucky' | 'neutral'; reason: string } {
  if (!corner4 || !trackBias) {
    return { type: 'neutral', reason: '' };
  }
  
  const marginNum = parseFloat(margin) || 99;
  const wasInner = corner4 <= Math.ceil(totalHorses * 0.3);  // 上位30%が内
  const wasOuter = corner4 > Math.ceil(totalHorses * 0.7);   // 下位30%が外
  const wasFront = corner4 <= Math.ceil(totalHorses * 0.3);  // 上位30%が前
  const wasBack = corner4 > Math.ceil(totalHorses * 0.6);    // 下位40%が後方
  
  // 内有利馬場での判定
  if (trackBias === 'inner') {
    if (wasInner && finishPosition <= 3) {
      return { type: 'blessed', reason: '内有利馬場で内を回って好走' };
    }
    if (wasOuter && finishPosition > 5 && marginNum <= 1.0) {
      return { type: 'unlucky', reason: '内有利馬場で外を回りながら着差1秒以内' };
    }
    if (wasOuter && finishPosition <= 5) {
      return { type: 'unlucky', reason: '内有利馬場で外を回りながら好走、評価できる' };
    }
  }
  
  // 外有利馬場での判定
  if (trackBias === 'outer') {
    if (wasOuter && finishPosition <= 3) {
      return { type: 'blessed', reason: '外有利馬場で外を回って好走' };
    }
    if (wasInner && finishPosition > 5 && marginNum <= 1.0) {
      return { type: 'unlucky', reason: '外有利馬場で内を回りながら着差1秒以内' };
    }
  }
  
  // 前有利馬場での判定
  if (trackBias === 'front') {
    if (wasFront && finishPosition <= 3) {
      return { type: 'blessed', reason: '前有利馬場で先行して好走' };
    }
    if (wasBack && finishPosition > 5 && marginNum <= 1.0) {
      return { type: 'unlucky', reason: '前有利馬場で後方から着差1秒以内' };
    }
    if (wasBack && finishPosition <= 5) {
      return { type: 'unlucky', reason: '前有利馬場で後方から好走、力がある' };
    }
  }
  
  // 差し有利馬場での判定
  if (trackBias === 'closer') {
    if (wasBack && finishPosition <= 3) {
      return { type: 'blessed', reason: '差し有利馬場で差して好走' };
    }
    if (wasFront && finishPosition <= 3) {
      return { type: 'unlucky', reason: '差し有利馬場で先行して好走、地力がある' };
    }
  }
  
  return { type: 'neutral', reason: '' };
}
