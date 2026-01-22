/**
 * 予想文パーサー
 * 
 * 過去の予想文から「なぜこの馬を選んだか」のパターンを抽出
 */

// 抽出された理由パターン
export interface ReasonPattern {
  category: ReasonCategory;
  subcategory: string;
  keywords: string[];
  context: string;        // 抽出元の文脈
  sentiment: 'positive' | 'negative' | 'neutral';
}

// 理由カテゴリ
export type ReasonCategory =
  | 'WAKU'           // 枠関連
  | 'JOCKEY'         // 騎手関連
  | 'DISMISS'        // 度外視
  | 'DISTANCE'       // 距離関連
  | 'REST'           // 休み明け関連
  | 'TIME'           // 時計関連
  | 'LAP'            // ラップ関連
  | 'RACE_LEVEL'     // レースレベル関連
  | 'TRACK_BIAS'     // 馬場関連
  | 'PACE'           // 展開関連
  | 'GROWTH'         // 成長関連
  | 'STYLE'          // 脚質関連
  | 'BLESSED'        // 恵まれ/不利関連
  | 'OTHER';         // その他

// 構造化された予想データ
export interface ParsedPrediction {
  id: string;
  timestamp: string;
  raceCourse: string | null;
  raceNumber: number | null;
  
  // 印
  honmei: number[];           // 本命（馬番）
  taikou: number[];           // 対抗
  ana: number[];              // 穴
  keshi: number[];            // 消し
  
  // 抽出された理由
  honmeiReasons: ReasonPattern[];
  taikouReasons: ReasonPattern[];
  keshiReasons: ReasonPattern[];
  
  // 買い目
  bets: Array<{
    type: string;
    horses: number[];
    rawText: string;
  }>;
  
  // 馬場・展開の設定
  conditions: {
    trackBias?: 'inner' | 'outer' | 'front' | 'closer' | 'flat';
    paceExpectation?: 'slow' | 'middle' | 'fast';
    trackNote?: string;
  };
  
  // 元の予想文
  rawText: string;
}

// キーワードパターン定義
const REASON_PATTERNS: Array<{
  category: ReasonCategory;
  subcategory: string;
  keywords: RegExp[];
  sentiment: 'positive' | 'negative' | 'neutral';
}> = [
  // 枠関連
  {
    category: 'WAKU',
    subcategory: '外枠替わり',
    keywords: [/外枠替わり/, /外枠に替わ/, /外枠で/],
    sentiment: 'positive',
  },
  {
    category: 'WAKU',
    subcategory: '内枠替わり',
    keywords: [/内枠替わり/, /内枠に替わ/, /内枠で/, /内枠を生かし/],
    sentiment: 'positive',
  },
  {
    category: 'WAKU',
    subcategory: '枠不利',
    keywords: [/外枠が厳し/, /内枠で揉まれ/, /枠が悪/],
    sentiment: 'negative',
  },
  
  // 騎手関連
  {
    category: 'JOCKEY',
    subcategory: '鞍上変更',
    keywords: [/鞍上変更/, /乗り替わり/, /鞍上に替わ/],
    sentiment: 'positive',
  },
  {
    category: 'JOCKEY',
    subcategory: '手戻り',
    keywords: [/手戻り/, /手が戻/, /鞍上が戻/],
    sentiment: 'positive',
  },
  {
    category: 'JOCKEY',
    subcategory: '騎手の技量',
    keywords: [/騎手で/, /騎乗で/, /うまく乗/],
    sentiment: 'positive',
  },
  
  // 度外視
  {
    category: 'DISMISS',
    subcategory: 'かみ合わず',
    keywords: [/かみ合っていない/, /かみ合わ/, /噛み合/, /合わなかった/],
    sentiment: 'neutral',
  },
  {
    category: 'DISMISS',
    subcategory: '度外視',
    keywords: [/度外視/, /参考外/, /無視でき/],
    sentiment: 'neutral',
  },
  {
    category: 'DISMISS',
    subcategory: '履歴にない',
    keywords: [/履歴にない/, /経験のない/, /初めての/],
    sentiment: 'neutral',
  },
  
  // 距離関連
  {
    category: 'DISTANCE',
    subcategory: '距離短縮',
    keywords: [/短縮/, /距離が短く/, /短い距離/],
    sentiment: 'positive',
  },
  {
    category: 'DISTANCE',
    subcategory: '距離延長',
    keywords: [/延長/, /距離が延び/, /長い距離/],
    sentiment: 'positive',
  },
  {
    category: 'DISTANCE',
    subcategory: '距離適性',
    keywords: [/距離適性/, /この距離/, /距離は合/],
    sentiment: 'positive',
  },
  
  // 休み明け関連
  {
    category: 'REST',
    subcategory: '休み明け',
    keywords: [/休み明け/, /休養明け/, /リフレッシュ/],
    sentiment: 'neutral',
  },
  {
    category: 'REST',
    subcategory: '立て直し',
    keywords: [/立て直し/, /立て直した/, /仕切り直/],
    sentiment: 'positive',
  },
  {
    category: 'REST',
    subcategory: '叩き2戦目',
    keywords: [/叩き.*戦目/, /使われて/, /上積み/],
    sentiment: 'positive',
  },
  
  // 時計関連
  {
    category: 'TIME',
    subcategory: '時計優秀',
    keywords: [/時計.*優秀/, /遜色ない時計/, /時計は優/, /格上.*差/],
    sentiment: 'positive',
  },
  {
    category: 'TIME',
    subcategory: '時計平凡',
    keywords: [/時計.*平凡/, /時計は物足り/, /時計.*遅/],
    sentiment: 'negative',
  },
  
  // ラップ関連
  {
    category: 'LAP',
    subcategory: 'ラップ優秀',
    keywords: [/加速ラップ/, /ラップ.*優秀/, /ラップ.*まとめ/, /ラップが良/],
    sentiment: 'positive',
  },
  {
    category: 'LAP',
    subcategory: 'ラップ平凡',
    keywords: [/ラップ.*平凡/, /ラップ.*物足り/],
    sentiment: 'negative',
  },
  
  // レースレベル関連
  {
    category: 'RACE_LEVEL',
    subcategory: 'ハイレベル',
    keywords: [/ハイレベル/, /高レベル/, /レベル高/, /勝ち上がり.*頭/],
    sentiment: 'positive',
  },
  {
    category: 'RACE_LEVEL',
    subcategory: '低レベル',
    keywords: [/低レベル/, /メンバー弱/, /相手.*弱/, /レベル低/],
    sentiment: 'negative',
  },
  
  // 馬場関連
  {
    category: 'TRACK_BIAS',
    subcategory: '内有利',
    keywords: [/内.*有利/, /内が良/, /インコース/],
    sentiment: 'neutral',
  },
  {
    category: 'TRACK_BIAS',
    subcategory: '外有利',
    keywords: [/外.*有利/, /外が良/, /外差し/],
    sentiment: 'neutral',
  },
  {
    category: 'TRACK_BIAS',
    subcategory: '前有利',
    keywords: [/前.*有利/, /前残り/, /行った行った/],
    sentiment: 'neutral',
  },
  
  // 展開関連
  {
    category: 'PACE',
    subcategory: 'スロー',
    keywords: [/スロー/, /ペース.*遅/, /先行.*少な/],
    sentiment: 'neutral',
  },
  {
    category: 'PACE',
    subcategory: 'ハイペース',
    keywords: [/ハイペース/, /ペース.*速/, /先行.*多/],
    sentiment: 'neutral',
  },
  
  // 成長関連
  {
    category: 'GROWTH',
    subcategory: '成長',
    keywords: [/成長/, /馬体.*増/, /体が増/, /良化/],
    sentiment: 'positive',
  },
  {
    category: 'GROWTH',
    subcategory: '追切り良化',
    keywords: [/追切り.*良/, /追切り.*自己ベスト/, /デキ.*上積み/],
    sentiment: 'positive',
  },
  {
    category: 'GROWTH',
    subcategory: '変わり身',
    keywords: [/変わり身/, /変わりそう/, /変わる/],
    sentiment: 'positive',
  },
  
  // 脚質関連
  {
    category: 'STYLE',
    subcategory: '先行',
    keywords: [/先行/, /位置.*取れ/, /前で/, /逃げ/],
    sentiment: 'neutral',
  },
  {
    category: 'STYLE',
    subcategory: '差し',
    keywords: [/差し/, /後方から/, /追い込/],
    sentiment: 'neutral',
  },
  
  // 恵まれ/不利関連
  {
    category: 'BLESSED',
    subcategory: '恵まれた',
    keywords: [/恵まれ/, /展開利/, /楽.*競馬/],
    sentiment: 'negative',
  },
  {
    category: 'BLESSED',
    subcategory: '不利',
    keywords: [/不利/, /厳しい競馬/, /苦しい/, /詰まっ/],
    sentiment: 'positive',
  },
];

/**
 * 予想文から理由パターンを抽出
 */
export function extractReasons(text: string): ReasonPattern[] {
  const reasons: ReasonPattern[] = [];
  
  // 文を分割
  const sentences = text.split(/[。\n]/);
  
  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    
    for (const pattern of REASON_PATTERNS) {
      for (const keyword of pattern.keywords) {
        if (keyword.test(sentence)) {
          reasons.push({
            category: pattern.category,
            subcategory: pattern.subcategory,
            keywords: [keyword.source],
            context: sentence.trim(),
            sentiment: pattern.sentiment,
          });
          break; // 同じパターンで複数マッチしないように
        }
      }
    }
  }
  
  return reasons;
}

/**
 * 予想文を構造化
 */
export function parsePredictionText(
  text: string,
  metadata?: { id?: string; timestamp?: string }
): ParsedPrediction {
  const result: ParsedPrediction = {
    id: metadata?.id || crypto.randomUUID(),
    timestamp: metadata?.timestamp || new Date().toISOString(),
    raceCourse: null,
    raceNumber: null,
    honmei: [],
    taikou: [],
    ana: [],
    keshi: [],
    honmeiReasons: [],
    taikouReasons: [],
    keshiReasons: [],
    bets: [],
    conditions: {},
    rawText: text,
  };
  
  // 競馬場を抽出
  const courses = ['中山', '東京', '阪神', '京都', '中京', '小倉', '新潟', '福島', '札幌', '函館'];
  for (const course of courses) {
    if (text.includes(course)) {
      result.raceCourse = course;
      break;
    }
  }
  
  // レース番号を抽出
  const raceMatch = text.match(/(\d{1,2})\s*[Rr]/);
  if (raceMatch) {
    result.raceNumber = parseInt(raceMatch[1], 10);
  }
  
  // 馬番を抽出（丸数字と通常数字）
  const circledNumbers: Record<string, number> = {
    '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
    '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
    '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15,
    '⑯': 16, '⑰': 17, '⑱': 18,
  };
  
  // 本命を抽出
  const honmeiMatch = text.match(/◎\s*([^\n◯○▲△×]+)/);
  if (honmeiMatch) {
    const honmeiSection = honmeiMatch[1];
    // 丸数字を探す
    for (const [char, num] of Object.entries(circledNumbers)) {
      if (honmeiSection.includes(char)) {
        result.honmei.push(num);
      }
    }
    // 馬名の後にある馬番も探す
    const numMatch = honmeiSection.match(/(\d{1,2})/);
    if (numMatch && result.honmei.length === 0) {
      result.honmei.push(parseInt(numMatch[1], 10));
    }
  }
  
  // 買い目を抽出
  const betPatterns = [
    { type: '単勝', regex: /単勝\s*(\d+)/g },
    { type: '複勝', regex: /複勝\s*(\d+)/g },
    { type: '馬連', regex: /馬連.*?(\d+[-ー]\d+(?:[,.\s]+\d+)*)/g },
    { type: 'ワイド', regex: /ワイド.*?(\d+[-ー]\d+(?:[,.\s]+\d+)*)/g },
    { type: '馬単', regex: /馬単.*?(\d+[-ー]\d+)/g },
    { type: '三連複', regex: /三連複.*?(\d+[-ー]\d+[-ー]\d+)/g },
    { type: '三連単', regex: /三連単.*?(\d+[-ー]\d+[-ー]\d+)/g },
  ];
  
  for (const { type, regex } of betPatterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const horsesStr = match[1];
      const horses = horsesStr.match(/\d+/g)?.map(n => parseInt(n, 10)) || [];
      if (horses.length > 0) {
        result.bets.push({
          type,
          horses,
          rawText: match[0],
        });
      }
    }
  }
  
  // 理由パターンを抽出
  const allReasons = extractReasons(text);
  
  // 本命部分の理由を特定（◎の後から次の印まで）
  const honmeiSection = text.match(/◎[^◯○▲△×]*/s)?.[0] || '';
  result.honmeiReasons = extractReasons(honmeiSection);
  
  // 馬場・展開の設定を抽出
  if (allReasons.some(r => r.subcategory === '内有利')) {
    result.conditions.trackBias = 'inner';
  } else if (allReasons.some(r => r.subcategory === '外有利')) {
    result.conditions.trackBias = 'outer';
  } else if (allReasons.some(r => r.subcategory === '前有利')) {
    result.conditions.trackBias = 'front';
  }
  
  if (allReasons.some(r => r.subcategory === 'スロー')) {
    result.conditions.paceExpectation = 'slow';
  } else if (allReasons.some(r => r.subcategory === 'ハイペース')) {
    result.conditions.paceExpectation = 'fast';
  }
  
  return result;
}

/**
 * 複数の予想からパターンを集計
 */
export function aggregatePatterns(predictions: ParsedPrediction[]): Map<string, {
  count: number;
  category: ReasonCategory;
  subcategory: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  examples: string[];
}> {
  const patterns = new Map<string, {
    count: number;
    category: ReasonCategory;
    subcategory: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    examples: string[];
  }>();
  
  for (const prediction of predictions) {
    for (const reason of prediction.honmeiReasons) {
      const key = `${reason.category}:${reason.subcategory}`;
      const existing = patterns.get(key) || {
        count: 0,
        category: reason.category,
        subcategory: reason.subcategory,
        sentiment: reason.sentiment,
        examples: [],
      };
      
      existing.count++;
      if (existing.examples.length < 5) {
        existing.examples.push(reason.context);
      }
      
      patterns.set(key, existing);
    }
  }
  
  return patterns;
}

/**
 * パターンからルール提案を生成
 */
export function generateRuleSuggestions(
  patterns: Map<string, {
    count: number;
    category: ReasonCategory;
    subcategory: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    examples: string[];
  }>
): Array<{
  category: string;
  subcategory: string;
  frequency: number;
  sentiment: string;
  suggestedRule: string;
}> {
  const suggestions: Array<{
    category: string;
    subcategory: string;
    frequency: number;
    sentiment: string;
    suggestedRule: string;
  }> = [];
  
  // 頻度順にソート
  const sortedPatterns = [...patterns.entries()].sort((a, b) => b[1].count - a[1].count);
  
  for (const [_key, pattern] of sortedPatterns) {
    if (pattern.count >= 3) { // 3回以上出現したパターンのみ
      suggestions.push({
        category: pattern.category,
        subcategory: pattern.subcategory,
        frequency: pattern.count,
        sentiment: pattern.sentiment,
        suggestedRule: generateRuleText(pattern),
      });
    }
  }
  
  return suggestions;
}

function generateRuleText(pattern: {
  category: ReasonCategory;
  subcategory: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  examples: string[];
}): string {
  switch (pattern.category) {
    case 'WAKU':
      if (pattern.subcategory === '外枠替わり') {
        return '内枠で後手を踏んでいた馬が外枠に替わった場合、評価UP';
      }
      if (pattern.subcategory === '内枠替わり') {
        return '外枠で不利だった馬が内枠に替わった場合、評価UP';
      }
      break;
    case 'DISMISS':
      if (pattern.subcategory === 'かみ合わず') {
        return '前走がスローでかみ合わなかった場合、度外視して評価';
      }
      break;
    case 'RACE_LEVEL':
      if (pattern.subcategory === 'ハイレベル') {
        return 'ハイレベル戦（勝ち上がり多数）に出走していた馬を高評価';
      }
      if (pattern.subcategory === '低レベル') {
        return '低レベル戦での好走は過信禁物として評価DOWN';
      }
      break;
    case 'BLESSED':
      if (pattern.subcategory === '恵まれた') {
        return '前走が恵まれた（展開利、馬場利）馬は評価DOWN';
      }
      if (pattern.subcategory === '不利') {
        return '前走で不利があった馬は巻き返し期待で評価UP';
      }
      break;
    // その他のカテゴリも追加可能
  }
  
  return `${pattern.subcategory}のパターンで${pattern.sentiment === 'positive' ? '評価UP' : pattern.sentiment === 'negative' ? '評価DOWN' : '考慮'}`;
}
