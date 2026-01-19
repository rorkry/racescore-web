/**
 * 予想データ構造化スクリプト
 * 
 * Discord エクスポートJSONから予想テキストを抽出し、構造化データに変換
 */

import * as fs from 'fs';
import * as path from 'path';

// ========================================
// 型定義
// ========================================

interface DiscordMessage {
  id: string;
  type: string;
  timestamp: string;
  content: string;
  author: {
    id: string;
    name: string;
    nickname: string;
  };
  reactions?: Array<{
    emoji: { name: string };
    count: number;
  }>;
}

interface DiscordExport {
  guild: { name: string };
  channel: { name: string };
  dateRange?: { after: string | null; before: string | null };
  exportedAt?: string;
  messages: DiscordMessage[];
}

interface ParsedBet {
  type: '単勝' | '馬連' | '馬単' | '馬複' | 'ワイド' | '三連複' | '三連単' | 'BOX' | 'フォーメーション' | '不明';
  axis?: number[];      // 軸馬
  partners?: number[];  // 相手馬
  points?: number;      // 点数
  rawText: string;      // 元テキスト
}

interface ParsedPrediction {
  id: string;
  timestamp: string;
  author: string;
  
  // レース情報
  raceCourse: string | null;      // 競馬場（中山、船橋など）
  raceNumber: number | null;      // レース番号
  raceName: string | null;        // レース名
  distance: number | null;        // 距離
  surface: '芝' | 'ダート' | null; // 馬場
  
  // 予想内容
  honmei: number[];               // 本命馬番
  taikou: number[];               // 対抗馬番
  ana: number[];                  // 穴馬番
  keshi: number[];                // 消し馬番
  
  // 買い目
  bets: ParsedBet[];
  
  // 理由・分析
  reasonText: string;             // 理由テキスト全体
  
  // メタ情報
  reactionCount: number;          // リアクション数（的中指標）
  rawContent: string;             // 元テキスト
}

// ========================================
// パーサー関数
// ========================================

/**
 * 競馬場を抽出
 */
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

/**
 * レース番号を抽出
 */
function extractRaceNumber(text: string): number | null {
  // "11R" や "10R" などのパターン
  const match = text.match(/(\d{1,2})\s*[Rr]/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * レース名を抽出
 */
function extractRaceName(text: string): string | null {
  // 重賞名やレース名のパターン
  const patterns = [
    /([ァ-ヶー一-龠々]+賞)/,
    /([ァ-ヶー一-龠々]+記念)/,
    /([ァ-ヶー一-龠々]+杯)/,
    /([ァ-ヶー一-龠々]+ステークス)/,
    /([ァ-ヶー一-龠々]+カップ)/,
    /(JPN[123])/i,
    /(G[123I]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * 距離と馬場を抽出
 */
function extractDistanceAndSurface(text: string): { distance: number | null; surface: '芝' | 'ダート' | null } {
  // "ダ1500m" や "芝1200m" などのパターン
  const match = text.match(/(芝|ダ|ダート)\s*(\d{3,4})\s*m?/);
  if (match) {
    return {
      surface: match[1] === '芝' ? '芝' : 'ダート',
      distance: parseInt(match[2], 10)
    };
  }
  return { distance: null, surface: null };
}

/**
 * 馬番を抽出（丸数字と通常数字の両方に対応）
 */
function extractHorseNumbers(text: string): number[] {
  const numbers: number[] = [];
  
  // 丸数字の変換マップ
  const circledNumbers: Record<string, number> = {
    '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
    '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
    '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15,
    '⑯': 16, '⑰': 17, '⑱': 18
  };
  
  // 丸数字を抽出
  for (const [char, num] of Object.entries(circledNumbers)) {
    if (text.includes(char)) {
      numbers.push(num);
    }
  }
  
  return [...new Set(numbers)].sort((a, b) => a - b);
}

/**
 * 買い目を抽出
 */
function extractBets(text: string): ParsedBet[] {
  const bets: ParsedBet[] = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // 単勝
    if (line.includes('単勝')) {
      const numbers = extractHorseNumbers(line);
      if (numbers.length > 0) {
        bets.push({
          type: '単勝',
          axis: numbers,
          rawText: line.trim()
        });
      }
    }
    
    // 馬連・馬複
    if (line.includes('馬連') || line.includes('馬複')) {
      const type = line.includes('馬連') ? '馬連' : '馬複';
      const numbers = extractHorseNumbers(line);
      
      // "⑨-②⑥⑦⑩" のような流しパターン
      const flowMatch = line.match(/[①-⑱]\s*[-ー→]\s*[①-⑱]/);
      if (flowMatch && numbers.length >= 2) {
        bets.push({
          type,
          axis: [numbers[0]],
          partners: numbers.slice(1),
          points: numbers.length - 1,
          rawText: line.trim()
        });
      } else if (numbers.length >= 2) {
        bets.push({
          type,
          axis: numbers,
          rawText: line.trim()
        });
      }
    }
    
    // 馬単
    if (line.includes('馬単')) {
      const numbers = extractHorseNumbers(line);
      if (numbers.length >= 2) {
        bets.push({
          type: '馬単',
          axis: [numbers[0]],
          partners: numbers.slice(1),
          rawText: line.trim()
        });
      }
    }
    
    // ワイド
    if (line.includes('ワイド')) {
      const numbers = extractHorseNumbers(line);
      if (numbers.length >= 2) {
        bets.push({
          type: 'ワイド',
          axis: numbers,
          rawText: line.trim()
        });
      }
    }
    
    // 三連単
    if (line.includes('三連単') || line.includes('3連単')) {
      const numbers = extractHorseNumbers(line);
      if (numbers.length >= 3) {
        bets.push({
          type: '三連単',
          axis: numbers.slice(0, 2),
          partners: numbers.slice(2),
          rawText: line.trim()
        });
      }
    }
    
    // 三連複
    if (line.includes('三連複') || line.includes('3連複')) {
      const numbers = extractHorseNumbers(line);
      if (numbers.length >= 3) {
        bets.push({
          type: '三連複',
          axis: numbers,
          rawText: line.trim()
        });
      }
    }
    
    // BOX
    if (lowerLine.includes('box') || line.includes('ＢＯＸ')) {
      const numbers = extractHorseNumbers(line);
      if (numbers.length >= 2) {
        bets.push({
          type: 'BOX',
          axis: numbers,
          rawText: line.trim()
        });
      }
    }
    
    // フォーメーション
    if (line.includes('フォーメーション')) {
      const numbers = extractHorseNumbers(line);
      if (numbers.length >= 3) {
        bets.push({
          type: 'フォーメーション',
          axis: numbers,
          rawText: line.trim()
        });
      }
    }
  }
  
  return bets;
}

/**
 * 本命・対抗・穴・消しを抽出
 */
function extractPredictionMarks(text: string): {
  honmei: number[];
  taikou: number[];
  ana: number[];
  keshi: number[];
} {
  const result = {
    honmei: [] as number[],
    taikou: [] as number[],
    ana: [] as number[],
    keshi: [] as number[]
  };
  
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 本命パターン
    if (line.includes('◎') || line.includes('本命')) {
      result.honmei = extractHorseNumbers(line);
      // 次の行も含める場合
      if (result.honmei.length === 0 && i + 1 < lines.length) {
        result.honmei = extractHorseNumbers(lines[i + 1]);
      }
    }
    
    // 対抗パターン
    if (line.includes('○') || line.includes('対抗') || line.includes('相手')) {
      const numbers = extractHorseNumbers(line);
      result.taikou.push(...numbers);
    }
    
    // 穴パターン
    if (line.includes('穴') || line.includes('▲')) {
      const numbers = extractHorseNumbers(line);
      result.ana.push(...numbers);
    }
    
    // 消しパターン
    if (line.includes('消し') || line.includes('切') || line.includes('×')) {
      const numbers = extractHorseNumbers(line);
      result.keshi.push(...numbers);
    }
  }
  
  // 重複排除
  result.honmei = [...new Set(result.honmei)];
  result.taikou = [...new Set(result.taikou)];
  result.ana = [...new Set(result.ana)];
  result.keshi = [...new Set(result.keshi)];
  
  return result;
}

/**
 * メッセージを予想データに変換
 */
function parseMessage(msg: DiscordMessage): ParsedPrediction | null {
  const content = msg.content;
  
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
    return null;
  }
  
  // レース情報を抽出
  const raceCourse = extractRaceCourse(content);
  const raceNumber = extractRaceNumber(content);
  const raceName = extractRaceName(content);
  const { distance, surface } = extractDistanceAndSurface(content);
  
  // 少なくとも競馬場かレース番号がないと予想として認識しない
  if (!raceCourse && !raceNumber) {
    return null;
  }
  
  // 予想内容を抽出
  const marks = extractPredictionMarks(content);
  const bets = extractBets(content);
  
  // リアクション数を計算
  const reactionCount = msg.reactions?.reduce((sum, r) => sum + r.count, 0) || 0;
  
  return {
    id: msg.id,
    timestamp: msg.timestamp,
    author: msg.author.nickname || msg.author.name,
    
    raceCourse,
    raceNumber,
    raceName,
    distance,
    surface,
    
    honmei: marks.honmei,
    taikou: marks.taikou,
    ana: marks.ana,
    keshi: marks.keshi,
    
    bets,
    
    reasonText: content,
    reactionCount,
    rawContent: content
  };
}

/**
 * ストリーミングでメッセージを抽出
 * 不完全なJSONでも読み込める
 */
function extractMessagesFromFile(filePath: string): DiscordMessage[] {
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const messages: DiscordMessage[] = [];
  
  console.log(`📊 ファイルサイズ: ${(rawData.length / 1024 / 1024).toFixed(1)} MB`);
  
  // "messages": [ の位置を見つける
  const messagesStart = rawData.indexOf('"messages": [');
  if (messagesStart === -1) {
    throw new Error('messagesフィールドが見つかりません');
  }
  
  // メッセージ開始位置
  let searchStart = messagesStart + '"messages": ['.length;
  
  // 各メッセージオブジェクトを抽出
  // パターン: { "id": "...", ... "stickers": [] } または { "id": "...", ... "reactions": [...] }
  let braceCount = 0;
  let messageStart = -1;
  let inString = false;
  let escaped = false;
  
  for (let i = searchStart; i < rawData.length; i++) {
    const char = rawData[i];
    
    // 文字列内のエスケープ処理
    if (escaped) {
      escaped = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    
    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (char === '{') {
      if (braceCount === 0) {
        messageStart = i;
      }
      braceCount++;
    }
    
    if (char === '}') {
      braceCount--;
      if (braceCount === 0 && messageStart !== -1) {
        // メッセージオブジェクトの終端
        const messageJson = rawData.substring(messageStart, i + 1);
        
        try {
          const msg = JSON.parse(messageJson) as DiscordMessage;
          if (msg.id && msg.content !== undefined) {
            messages.push(msg);
          }
        } catch (e) {
          // パース失敗は無視（不完全なメッセージ）
        }
        
        messageStart = -1;
        
        // 進捗表示
        if (messages.length % 500 === 0) {
          process.stdout.write(`\r   ${messages.length} 件のメッセージを抽出中...`);
        }
      }
    }
    
    // 配列の終端に達したら終了
    if (char === ']' && braceCount === 0) {
      break;
    }
  }
  
  console.log(`\r   ${messages.length} 件のメッセージを抽出完了`);
  
  return messages;
}

/**
 * 不完全なJSONを修復して読み込む
 */
function loadAndRepairJSON(filePath: string): DiscordExport {
  let rawData = fs.readFileSync(filePath, 'utf-8');
  
  // まず普通にパースを試みる
  try {
    return JSON.parse(rawData);
  } catch (e) {
    console.log('⚠️  JSONが不完全です。ストリーミング抽出を行います...');
    
    // ヘッダー部分を抽出
    const guildMatch = rawData.match(/"guild":\s*(\{[^}]+\})/);
    const channelMatch = rawData.match(/"channel":\s*(\{[^}]+\})/);
    
    const guild = guildMatch ? JSON.parse(guildMatch[1]) : { name: 'Unknown' };
    const channel = channelMatch ? JSON.parse(channelMatch[1]) : { name: 'Unknown' };
    
    // メッセージを抽出
    const messages = extractMessagesFromFile(filePath);
    
    return {
      guild,
      channel,
      dateRange: { after: null, before: null },
      exportedAt: new Date().toISOString(),
      messages
    };
  }
}

/**
 * メイン処理
 */
async function main() {
  const inputPath = process.argv[2] || 'C:\\競馬データ\\新宿租界 - 🏇競馬🏇 - 🐎嵯峨の『買いどころ』 [542272557026639872].json';
  
  console.log('📂 ファイル読み込み中...');
  console.log(`   ${inputPath}`);
  
  // ファイル読み込み（修復付き）
  const data: DiscordExport = loadAndRepairJSON(inputPath);
  
  console.log(`✅ ${data.messages.length} 件のメッセージを読み込みました`);
  console.log(`   チャンネル: ${data.channel.name}`);
  
  // 予想メッセージを抽出
  console.log('\n🔍 予想メッセージを解析中...');
  
  const predictions: ParsedPrediction[] = [];
  let skipped = 0;
  
  for (const msg of data.messages) {
    const parsed = parseMessage(msg);
    if (parsed) {
      predictions.push(parsed);
    } else {
      skipped++;
    }
  }
  
  console.log(`✅ ${predictions.length} 件の予想を抽出しました`);
  console.log(`   スキップ: ${skipped} 件`);
  
  // 統計情報を表示
  console.log('\n📊 統計情報:');
  
  // 競馬場別
  const byCourse: Record<string, number> = {};
  for (const p of predictions) {
    if (p.raceCourse) {
      byCourse[p.raceCourse] = (byCourse[p.raceCourse] || 0) + 1;
    }
  }
  console.log('\n   競馬場別:');
  Object.entries(byCourse)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([course, count]) => {
      console.log(`     ${course}: ${count} 件`);
    });
  
  // 年別
  const byYear: Record<string, number> = {};
  for (const p of predictions) {
    const year = p.timestamp.slice(0, 4);
    byYear[year] = (byYear[year] || 0) + 1;
  }
  console.log('\n   年別:');
  Object.entries(byYear)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([year, count]) => {
      console.log(`     ${year}: ${count} 件`);
    });
  
  // 買い目タイプ別
  const byBetType: Record<string, number> = {};
  for (const p of predictions) {
    for (const bet of p.bets) {
      byBetType[bet.type] = (byBetType[bet.type] || 0) + 1;
    }
  }
  console.log('\n   買い目タイプ別:');
  Object.entries(byBetType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`     ${type}: ${count} 件`);
    });
  
  // サンプル出力
  console.log('\n📝 サンプル予想（最新5件）:');
  predictions.slice(-5).forEach((p, i) => {
    console.log(`\n--- ${i + 1} ---`);
    console.log(`日時: ${p.timestamp}`);
    console.log(`場所: ${p.raceCourse} ${p.raceNumber}R ${p.raceName || ''}`);
    console.log(`本命: ${p.honmei.join(', ') || 'なし'}`);
    console.log(`買い目: ${p.bets.map(b => b.rawText).join(' / ') || 'なし'}`);
    console.log(`リアクション: ${p.reactionCount}`);
  });
  
  // 結果を保存
  const outputPath = path.join(process.cwd(), 'data', 'parsed-predictions.json');
  
  // dataディレクトリがなければ作成
  const dataDir = path.dirname(outputPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(predictions, null, 2), 'utf-8');
  console.log(`\n💾 結果を保存しました: ${outputPath}`);
  
  return predictions;
}

main().catch(console.error);

