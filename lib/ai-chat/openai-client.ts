/**
 * OpenAI API クライアント
 * GPT-4o-mini を使用した予想生成
 */

import type { RaceDataForAI, PredictionResponse } from './types';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// システムプロンプト（文体ルール）
const SYSTEM_PROMPT = `あなたは競馬予想を書くAIです。
以下の「文体ルール」と「参考予想」に従って予想文を生成してください。

## 文体ルール

### 文章構造
1. 人気馬への疑問、または本命馬の実績から入る
2. 前走の敗因分析（度外視できる理由）
3. 今回の好転要素（枠、鞍上、距離、馬場など）
4. 結論（確信度に応じた表現）
5. 相手馬（簡潔に）
6. 買い目

### 表現ルール
- 「通用していい」「通用する証明」を使う
- 「かみ合う/かみ合っていない」で条件適性を表現
- 「度外視」「参考外」で前走を切る
- 「上積み」「変わり身」で好転を表現
- 「嫌う」「紐にとどめる」で消極評価
- 時計比較は「同日〜クラスと遜色ない」「〜と0.X差」
- 断定しすぎない（「〜はず」「〜そう」「〜していい」）

### 禁止表現
- 「です・ます」調
- 「〜と思われる」
- 過度な断定（「絶対」「間違いなく」）

### 判定別の表現

【過大評価の馬を嫌う場合】
- 「〜が売れているけど前走は〜だった」
- 「中身が伴っていない」
- 「再現性には疑問」
- 「嫌ってみたい」

【過小評価の馬を狙う場合】
- 「着順は悪いが着差〜秒で中身は評価できる」
- 「巻き返し指数が高く前走は不利があった」
- 「立て直した今回は巻き返しに期待」
- 「一発あっていい」`;

/**
 * 過去予想からサンプルを取得してプロンプトに含める
 */
function buildSamplePredictions(samples: string[]): string {
  if (samples.length === 0) return '';
  
  return `

## 参考予想（過去の予想文の例）
以下は過去の予想文です。この文体・ニュアンスを参考にしてください。

${samples.map((s, i) => `### 例${i + 1}\n${s}`).join('\n\n')}`;
}

/**
 * レースデータをプロンプト用にフォーマット
 */
function formatRaceData(race: RaceDataForAI, baba?: string, pace?: string): string {
  let text = `
## 今回のレースデータ

**${race.place} ${race.raceNumber}R ${race.surface}${race.distance}m ${race.trackCondition}**
`;

  if (baba || pace) {
    text += `\n**ユーザー設定**: 馬場=${baba || '未設定'}, 展開=${pace || '未設定'}\n`;
  }

  text += '\n### 出走馬一覧\n';
  
  for (const horse of race.horses) {
    text += `\n**${horse.number}. ${horse.name}** (${horse.jockey}/${horse.trainer})\n`;
    
    // 過去走
    if (horse.last1) {
      text += `  前走: ${horse.last1.place}${horse.last1.surface}${horse.last1.distance}m ${horse.last1.finishPosition}着 ${horse.last1.margin} (${horse.last1.trackCondition})\n`;
    }
    if (horse.last2) {
      text += `  2走前: ${horse.last2.place}${horse.last2.surface}${horse.last2.distance}m ${horse.last2.finishPosition}着\n`;
    }
    
    // Strideデータ
    const strideInfo: string[] = [];
    if (horse.timeRating) strideInfo.push(`タイム=${horse.timeRating}`);
    if (horse.lapRating) strideInfo.push(`ラップ=${horse.lapRating}`);
    if (horse.potential !== undefined) strideInfo.push(`ポテンシャル=${horse.potential}`);
    if (horse.makikaeshi !== undefined) strideInfo.push(`巻き返し=${horse.makikaeshi}`);
    if (horse.raceLevel) strideInfo.push(`前走レベル=${horse.raceLevel}`);
    
    if (strideInfo.length > 0) {
      text += `  【Stride】${strideInfo.join(', ')}\n`;
    }
    
    // ギャップ判定
    if (horse.gap) {
      text += `  【判定】${horse.gap.type}: ${horse.gap.reasons.join('、')}\n`;
    }
  }
  
  return text;
}

/**
 * OpenAI APIを呼び出して予想を生成
 */
export async function generatePrediction(
  raceData: RaceDataForAI,
  samplePredictions: string[],
  options: {
    baba?: string;
    pace?: string;
    apiKey: string;
  }
): Promise<PredictionResponse> {
  const { baba, pace, apiKey } = options;
  
  // プロンプト構築
  const systemPrompt = SYSTEM_PROMPT + buildSamplePredictions(samplePredictions);
  const userPrompt = formatRaceData(raceData, baba, pace) + `

上記のレースデータとStride分析結果を踏まえて、予想文を生成してください。
過大評価・過小評価の馬がいれば、それを考慮した予想を書いてください。
買い目も含めてください。`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API Error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const prediction = data.choices[0]?.message?.content || '';

    // 過大評価・過小評価の馬を抽出
    const overvalued = raceData.horses
      .filter(h => h.gap?.type === '過大評価')
      .map(h => h.name);
    const undervalued = raceData.horses
      .filter(h => h.gap?.type === '過小評価')
      .map(h => h.name);

    return {
      prediction,
      analysis: {
        overvalued,
        undervalued,
      },
    };
  } catch (error) {
    console.error('[AI] Prediction generation error:', error);
    throw error;
  }
}

/**
 * 一般的な質問に回答（コース特性など）
 */
export async function answerQuestion(
  question: string,
  context: string,
  apiKey: string
): Promise<string> {
  const systemPrompt = `あなたは競馬の専門家です。
ユーザーの質問に対して、専門的かつ分かりやすく回答してください。
回答は簡潔にしつつ、重要なポイントは漏らさないようにしてください。

## 参考情報
${context}`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        temperature: 0.5,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API Error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '回答を生成できませんでした。';
  } catch (error) {
    console.error('[AI] Question answering error:', error);
    throw error;
  }
}
