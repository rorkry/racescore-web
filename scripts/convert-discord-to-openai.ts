/**
 * Discord JSON → OpenAI Fine-tuning JSONL 変換スクリプト
 * 
 * 使い方:
 * npx ts-node scripts/convert-discord-to-openai.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ===== 設定 =====
const INPUT_FILE = 'C:\\Users\\rorkr\\OneDrive\\デスクトップ\\自分の予想.json';
const OUTPUT_DIR = 'C:\\競馬データ\\racescore-web\\data\\fine-tuning';

// ===== 型定義 =====
interface DiscordMessage {
  id: string;
  timestamp: string;
  content: string;
  author: {
    id: string;
    name: string;
    nickname: string;
  };
  reactions?: Array<{
    emoji: {
      name: string;
      code: string;
    };
    count: number;
  }>;
}

interface DiscordExport {
  guild: { name: string };
  channel: { name: string };
  messages: DiscordMessage[];
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAITrainingExample {
  messages: OpenAIMessage[];
}

// ===== ユーティリティ関数 =====

/**
 * 予想文からレース情報を抽出
 */
function extractRaceInfo(content: string): { place: string; raceNumber: string; surface?: string; distance?: string } | null {
  // パターン1: 「京都2R」「中山11R」など
  const pattern1 = /^[@\s]*(?:everyone\s+)?([東京中山阪神京都小倉新潟福島函館札幌船橋大井川崎浦和園田姫路笠松名古屋金沢高知佐賀門別盛岡水沢]{2,4})(\d{1,2})R/m;
  
  // パターン2: 「京都 2R ダート1400m」など（スペース区切り）
  const pattern2 = /([東京中山阪神京都小倉新潟福島函館札幌船橋大井川崎浦和園田姫路笠松名古屋金沢高知佐賀門別盛岡水沢]{2,4})\s*(\d{1,2})\s*R\s*(芝|ダート|ダ)?\s*(\d{4})?/i;
  
  let match = content.match(pattern1);
  if (match) {
    return {
      place: match[1],
      raceNumber: match[2],
    };
  }
  
  match = content.match(pattern2);
  if (match) {
    return {
      place: match[1],
      raceNumber: match[2],
      surface: match[3] || undefined,
      distance: match[4] || undefined,
    };
  }
  
  return null;
}

/**
 * 予想文から本命馬を抽出
 */
function extractHonmei(content: string): string | null {
  // ◎の後の馬名を抽出
  const patterns = [
    /◎\s*[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱]?\s*(\d+)?([ァ-ヶー\u4E00-\u9FFF]+)/,
    /◎\s*(\d+)\s*([ァ-ヶー\u4E00-\u9FFF]+)/,
    /本命[：:]\s*([ァ-ヶー\u4E00-\u9FFF]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[2] || match[1];
    }
  }
  
  return null;
}

/**
 * リアクションから的中フラグを判定
 */
function isHitPrediction(reactions?: DiscordMessage['reactions']): boolean {
  if (!reactions) return false;
  
  const hitEmojis = ['🎯', '⭕', '💰', '🏆', '✅', '的中', 'target'];
  return reactions.some(r => 
    hitEmojis.includes(r.emoji.name) || 
    hitEmojis.includes(r.emoji.code)
  );
}

/**
 * 予想文として有効かどうか判定
 */
function isValidPrediction(content: string): boolean {
  // 最低文字数
  if (content.length < 50) return false;
  
  // 予想っぽい要素があるか
  const hasMarks = /[◎○▲△☆★]/.test(content);
  const hasRaceInfo = extractRaceInfo(content) !== null;
  const hasBettingTerms = /(馬連|馬単|三連|ワイド|単勝|複勝|点|買い目|流し|ボックス)/i.test(content);
  const hasAnalysis = /(前走|時計|展開|馬場|ペース|差し|先行|逃げ|追い込み)/.test(content);
  
  // レース情報 + (印 or 買い目 or 分析) があれば有効
  return hasRaceInfo && (hasMarks || hasBettingTerms || hasAnalysis);
}

/**
 * 予想文をクリーンアップ
 */
function cleanContent(content: string): string {
  return content
    .replace(/@everyone\s*/g, '')
    .replace(/@here\s*/g, '')
    .replace(/<@!?\d+>/g, '')  // メンション除去
    .replace(/<#\d+>/g, '')    // チャンネルリンク除去
    .replace(/https?:\/\/[^\s]+/g, '')  // URL除去
    .trim();
}

// ===== メイン処理 =====

async function main() {
  console.log('=== Discord → OpenAI 変換スクリプト ===\n');
  
  // 入力ファイル読み込み
  console.log(`入力ファイル: ${INPUT_FILE}`);
  const rawData = fs.readFileSync(INPUT_FILE, 'utf-8');
  const discordData: DiscordExport = JSON.parse(rawData);
  
  console.log(`チャンネル: ${discordData.channel.name}`);
  console.log(`総メッセージ数: ${discordData.messages.length}`);
  
  // 出力ディレクトリ作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // 予想文をフィルタリング
  const predictions: Array<{
    content: string;
    timestamp: string;
    raceInfo: NonNullable<ReturnType<typeof extractRaceInfo>>;
    honmei: string | null;
    isHit: boolean;
  }> = [];
  
  for (const msg of discordData.messages) {
    // 自分の投稿のみ（author.idで判定するか、全部含めるか）
    // ここでは全部含める（文体学習のため）
    
    const cleanedContent = cleanContent(msg.content);
    
    if (!isValidPrediction(cleanedContent)) {
      continue;
    }
    
    const raceInfo = extractRaceInfo(cleanedContent);
    if (!raceInfo) continue;
    
    predictions.push({
      content: cleanedContent,
      timestamp: msg.timestamp,
      raceInfo,
      honmei: extractHonmei(cleanedContent),
      isHit: isHitPrediction(msg.reactions),
    });
  }
  
  console.log(`\n有効な予想文: ${predictions.length}件`);
  
  // ===== 出力1: シンプル版（文体学習用） =====
  const simpleExamples: OpenAITrainingExample[] = predictions.map(pred => ({
    messages: [
      {
        role: 'system',
        content: `あなたは競馬予想家「嵯峨」です。以下の特徴で予想を書いてください：
- 人気馬の過大評価を嫌い、穴馬の好走条件を見抜く
- 着順だけでなく、レースの中身（時計、展開、馬場）を重視
- 確信度に応じて表現を使い分ける（「狙う」「面白い」「押さえ」など）
- 買い目は根拠とともに提示する`,
      },
      {
        role: 'user',
        content: `${pred.raceInfo.place}${pred.raceInfo.raceNumber}Rの予想をしてください。`,
      },
      {
        role: 'assistant',
        content: pred.content,
      },
    ],
  }));
  
  const simpleOutputPath = path.join(OUTPUT_DIR, 'training-simple.jsonl');
  const simpleJsonl = simpleExamples.map(ex => JSON.stringify(ex)).join('\n');
  fs.writeFileSync(simpleOutputPath, simpleJsonl, 'utf-8');
  console.log(`\n✅ シンプル版出力: ${simpleOutputPath}`);
  console.log(`   サンプル数: ${simpleExamples.length}`);
  
  // ===== 出力2: 条件付き版（ロジック学習用） =====
  const conditionalExamples: OpenAITrainingExample[] = predictions.map(pred => {
    // ユーザープロンプトに条件を含める
    let userPrompt = `${pred.raceInfo.place}${pred.raceInfo.raceNumber}R`;
    if (pred.raceInfo.surface) userPrompt += ` ${pred.raceInfo.surface}`;
    if (pred.raceInfo.distance) userPrompt += `${pred.raceInfo.distance}m`;
    userPrompt += `の予想をしてください。`;
    
    if (pred.honmei) {
      userPrompt += `\n本命候補: ${pred.honmei}`;
    }
    
    return {
      messages: [
        {
          role: 'system',
          content: `あなたは競馬予想家「嵯峨」です。以下のルールで予想を書いてください：

【判断基準】
- 着順が良くても中身（タイム、ラップ、展開）が伴わなければ嫌う
- 着順が悪くても着差が小さく、不利があれば狙う
- 人気馬の過大評価を見抜き、穴馬の好走条件を探す

【文章スタイル】
- 疑問→分析→結論→相手→買い目の流れ
- 確信度に応じた表現（「狙う」「面白い」「押さえ」）
- 具体的な根拠を必ず示す`,
        },
        {
          role: 'user',
          content: userPrompt,
        },
        {
          role: 'assistant',
          content: pred.content,
        },
      ],
    };
  });
  
  const conditionalOutputPath = path.join(OUTPUT_DIR, 'training-conditional.jsonl');
  const conditionalJsonl = conditionalExamples.map(ex => JSON.stringify(ex)).join('\n');
  fs.writeFileSync(conditionalOutputPath, conditionalJsonl, 'utf-8');
  console.log(`\n✅ 条件付き版出力: ${conditionalOutputPath}`);
  console.log(`   サンプル数: ${conditionalExamples.length}`);
  
  // ===== 出力3: 的中予想のみ（高品質版） =====
  const hitPredictions = predictions.filter(p => p.isHit);
  const hitExamples: OpenAITrainingExample[] = hitPredictions.map(pred => ({
    messages: [
      {
        role: 'system',
        content: `あなたは競馬予想家「嵯峨」です。的中率の高い予想を書いてください。

【重要な判断基準】
- 人気馬の過大評価を嫌う
- 着順より中身（時計、展開、馬場）を重視
- 穴馬の好走条件を見抜く`,
      },
      {
        role: 'user',
        content: `${pred.raceInfo.place}${pred.raceInfo.raceNumber}Rの予想をしてください。`,
      },
      {
        role: 'assistant',
        content: pred.content,
      },
    ],
  }));
  
  if (hitExamples.length >= 10) {
    const hitOutputPath = path.join(OUTPUT_DIR, 'training-hit-only.jsonl');
    const hitJsonl = hitExamples.map(ex => JSON.stringify(ex)).join('\n');
    fs.writeFileSync(hitOutputPath, hitJsonl, 'utf-8');
    console.log(`\n✅ 的中のみ版出力: ${hitOutputPath}`);
    console.log(`   サンプル数: ${hitExamples.length}`);
  } else {
    console.log(`\n⚠️ 的中予想が${hitExamples.length}件のみ（10件未満）のため、的中のみ版はスキップ`);
  }
  
  // ===== 統計情報 =====
  console.log('\n=== 統計情報 ===');
  
  // 競馬場別
  const placeCount: Record<string, number> = {};
  for (const pred of predictions) {
    const place = pred.raceInfo.place;
    placeCount[place] = (placeCount[place] || 0) + 1;
  }
  console.log('\n競馬場別:');
  Object.entries(placeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([place, count]) => {
      console.log(`  ${place}: ${count}件`);
    });
  
  // 年別
  const yearCount: Record<string, number> = {};
  for (const pred of predictions) {
    const year = pred.timestamp.slice(0, 4);
    yearCount[year] = (yearCount[year] || 0) + 1;
  }
  console.log('\n年別:');
  Object.entries(yearCount)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([year, count]) => {
      console.log(`  ${year}: ${count}件`);
    });
  
  // トークン数概算
  const avgTokens = predictions.reduce((sum, p) => sum + p.content.length / 2, 0) / predictions.length;
  console.log(`\n平均トークン数（概算）: ${Math.round(avgTokens)}`);
  
  const maxTokens = Math.max(...predictions.map(p => p.content.length / 2));
  console.log(`最大トークン数（概算）: ${Math.round(maxTokens)}`);
  
  if (maxTokens > 8000) {
    console.log('⚠️ 一部の予想文が長すぎる可能性があります（16,384トークン上限）');
  }
  
  console.log('\n=== 完了 ===');
  console.log(`\n次のステップ:`);
  console.log(`1. ${simpleOutputPath} をOpenAIにアップロード`);
  console.log(`2. ファインチューニングを開始`);
  console.log(`3. 動作確認後、条件付き版や的中のみ版も試す`);
}

main().catch(console.error);
