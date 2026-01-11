/**
 * 嵯峨さんの表現パターン抽出スクリプト
 * 
 * 予想テキストから特徴的な言い回しを抽出
 */

import * as fs from 'fs';
import * as path from 'path';

// 構造化された予想データ
interface ParsedPrediction {
  id: string;
  timestamp: string;
  author: string;
  raceCourse: string | null;
  reasonText: string;
  rawContent: string;
}

// 表現パターンの定義
interface ExpressionPattern {
  pattern: RegExp;
  category: string;
  description: string;
}

// ========================================
// 表現パターン定義
// ========================================

const EXPRESSION_PATTERNS: ExpressionPattern[] = [
  // 結論の表現
  { pattern: /〜じゃねえか[？?]?/g, category: '結論', description: '提案・確信' },
  { pattern: /〜じゃないか[？?]?/g, category: '結論', description: '提案・確信' },
  { pattern: /〜ないか[？?]$/gm, category: '結論', description: '疑問形の提案' },
  { pattern: /ここは.+で仕方ない/g, category: '結論', description: '確定的結論' },
  { pattern: /ここは.+から攻めたい/g, category: '結論', description: '攻めの姿勢' },
  { pattern: /〜で行く/g, category: '結論', description: '決断' },
  { pattern: /〜で攻める/g, category: '結論', description: '攻めの姿勢' },
  
  // 評価の表現
  { pattern: /軽視禁物/g, category: '評価', description: '要注意' },
  { pattern: /軽視できない/g, category: '評価', description: '要注意' },
  { pattern: /狙い目/g, category: '評価', description: '推奨' },
  { pattern: /期待十分/g, category: '評価', description: '高評価' },
  { pattern: /期待大/g, category: '評価', description: '高評価' },
  { pattern: /文句なし/g, category: '評価', description: '絶対的評価' },
  { pattern: /申し分ない/g, category: '評価', description: '高評価' },
  { pattern: /死角なし/g, category: '評価', description: '最高評価' },
  { pattern: /不動の.+/g, category: '評価', description: '確定的評価' },
  { pattern: /圧倒的/g, category: '評価', description: '強調' },
  
  // 否定の表現
  { pattern: /切ってみる/g, category: '否定', description: '消し' },
  { pattern: /買えない/g, category: '否定', description: '消し' },
  { pattern: /用なし/g, category: '否定', description: '消し' },
  { pattern: /どうか$/gm, category: '否定', description: '疑問・不安' },
  { pattern: /〜はどうか/g, category: '否定', description: '疑問・不安' },
  
  // 条件の表現
  { pattern: /〜なら/g, category: '条件', description: '条件付き' },
  { pattern: /〜ならここは/g, category: '条件', description: '条件付き推奨' },
  { pattern: /それなら/g, category: '条件', description: '条件分岐' },
  { pattern: /そうなってくると/g, category: '条件', description: '展開予想' },
  
  // 展開予想の表現
  { pattern: /ハナ(を|へ)/g, category: '展開', description: '逃げ' },
  { pattern: /番手/g, category: '展開', description: '先行' },
  { pattern: /前残り/g, category: '展開', description: '先行有利' },
  { pattern: /差し脚/g, category: '展開', description: '差し' },
  { pattern: /捲る/g, category: '展開', description: '捲り' },
  { pattern: /届.+(ない|にくい)/g, category: '展開', description: '届かない' },
  
  // コース・馬場の表現
  { pattern: /内枠.+(有利|不利)/g, category: 'コース', description: '枠有利不利' },
  { pattern: /外枠.+(有利|不利)/g, category: 'コース', description: '枠有利不利' },
  { pattern: /時計の出る/g, category: 'コース', description: '馬場状態' },
  { pattern: /直線.+(長い|短い)/g, category: 'コース', description: 'コース形態' },
  { pattern: /小回り/g, category: 'コース', description: 'コース形態' },
  { pattern: /左回り/g, category: 'コース', description: 'コース形態' },
  { pattern: /右回り/g, category: 'コース', description: 'コース形態' },
  
  // 馬の評価表現
  { pattern: /転入初戦/g, category: '馬評価', description: '移籍' },
  { pattern: /休み明け/g, category: '馬評価', description: '間隔' },
  { pattern: /ひと叩き/g, category: '馬評価', description: '使い込み' },
  { pattern: /短縮/g, category: '馬評価', description: '距離変更' },
  { pattern: /延長/g, category: '馬評価', description: '距離変更' },
  { pattern: /鞍上/g, category: '馬評価', description: '騎手' },
  { pattern: /調教師/g, category: '馬評価', description: '厩舎' },
  { pattern: /陣営/g, category: '馬評価', description: '厩舎' },
  { pattern: /気性/g, category: '馬評価', description: '性格' },
  { pattern: /ムラ/g, category: '馬評価', description: '安定性' },
  { pattern: /適性/g, category: '馬評価', description: '適性' },
  
  // 数値評価
  { pattern: /\d+秒台/g, category: '数値', description: 'タイム' },
  { pattern: /\d+馬身/g, category: '数値', description: '着差' },
  { pattern: /上がり.+秒/g, category: '数値', description: '上がり' },
  
  // 口語表現
  { pattern: /〜だろう/g, category: '口語', description: '推測' },
  { pattern: /〜だが/g, category: '口語', description: '逆接' },
  { pattern: /〜ってのも/g, category: '口語', description: '補足' },
  { pattern: /〜ってことは/g, category: '口語', description: '論理' },
  { pattern: /〜んだから/g, category: '口語', description: '理由' },
  { pattern: /〜ぜ/g, category: '口語', description: '男っぽい語尾' },
  { pattern: /〜な[。\n]$/gm, category: '口語', description: '男っぽい語尾' },
];

// ========================================
// 抽出関数
// ========================================

/**
 * テキストからパターンを抽出
 */
function extractPatterns(text: string): Map<string, string[]> {
  const results = new Map<string, string[]>();
  
  for (const { pattern, category } of EXPRESSION_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      const existing = results.get(category) || [];
      results.set(category, [...existing, ...matches]);
    }
  }
  
  return results;
}

/**
 * 特徴的なフレーズを抽出（正規表現以外）
 */
function extractPhrases(text: string): string[] {
  const phrases: string[] = [];
  
  // 「〜なら〜」パターン
  const conditionalMatch = text.match(/[^。\n]+なら[^。\n]+[。\n]/g);
  if (conditionalMatch) {
    phrases.push(...conditionalMatch.map(m => m.trim()));
  }
  
  // 「〜が〜」パターン（逆接）
  const contrastMatch = text.match(/[^。\n]+だが[^。\n]+[。\n]/g);
  if (contrastMatch) {
    phrases.push(...contrastMatch.map(m => m.trim()));
  }
  
  // 「〜も〜」パターン
  const additiveMatch = text.match(/[^。\n]+も[^。\n]+[。\n]/g);
  if (additiveMatch) {
    phrases.push(...additiveMatch.slice(0, 3).map(m => m.trim()));
  }
  
  return phrases;
}

/**
 * コース知識を抽出
 */
function extractCourseKnowledge(text: string, raceCourse: string | null): { course: string; knowledge: string }[] {
  const results: { course: string; knowledge: string }[] = [];
  
  if (!raceCourse) return results;
  
  // コース名を含む文を抽出
  const sentences = text.split(/[。\n]/).filter(s => s.trim().length > 0);
  
  for (const sentence of sentences) {
    // 有利不利に関する記述
    if (sentence.includes('有利') || sentence.includes('不利')) {
      results.push({ course: raceCourse, knowledge: sentence.trim() });
    }
    
    // コース特性に関する記述
    if (sentence.includes('コース') || sentence.includes('馬場') || 
        sentence.includes('直線') || sentence.includes('小回り') ||
        sentence.includes('枠') || sentence.includes('内') || sentence.includes('外')) {
      // コース名が含まれていれば
      if (sentence.includes(raceCourse) || sentence.includes('ここ')) {
        results.push({ course: raceCourse, knowledge: sentence.trim() });
      }
    }
  }
  
  return results;
}

/**
 * メイン処理
 */
async function main() {
  const inputPath = path.join(process.cwd(), 'data', 'parsed-predictions.json');
  
  console.log('📂 予想データ読み込み中...');
  
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const predictions: ParsedPrediction[] = JSON.parse(rawData);
  
  console.log(`✅ ${predictions.length} 件の予想を読み込みました`);
  
  // 表現パターンの集計
  const patternCounts = new Map<string, Map<string, number>>();
  const allPhrases: string[] = [];
  const courseKnowledge: { course: string; knowledge: string }[] = [];
  
  for (const prediction of predictions) {
    // パターン抽出
    const patterns = extractPatterns(prediction.reasonText);
    for (const [category, matches] of patterns) {
      if (!patternCounts.has(category)) {
        patternCounts.set(category, new Map());
      }
      const categoryMap = patternCounts.get(category)!;
      for (const match of matches) {
        categoryMap.set(match, (categoryMap.get(match) || 0) + 1);
      }
    }
    
    // フレーズ抽出
    const phrases = extractPhrases(prediction.reasonText);
    allPhrases.push(...phrases);
    
    // コース知識抽出
    const knowledge = extractCourseKnowledge(prediction.reasonText, prediction.raceCourse);
    courseKnowledge.push(...knowledge);
  }
  
  // 結果表示
  console.log('\n📊 表現パターン分析結果:\n');
  
  for (const [category, counts] of patternCounts) {
    console.log(`【${category}】`);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [pattern, count] of sorted) {
      console.log(`  "${pattern}": ${count}回`);
    }
    console.log('');
  }
  
  // コース別の知識
  console.log('\n📍 コース別知識:\n');
  const courseMap = new Map<string, string[]>();
  for (const { course, knowledge } of courseKnowledge) {
    if (!courseMap.has(course)) {
      courseMap.set(course, []);
    }
    courseMap.get(course)!.push(knowledge);
  }
  
  for (const [course, knowledgeList] of courseMap) {
    const unique = [...new Set(knowledgeList)].slice(0, 5);
    if (unique.length > 0) {
      console.log(`【${course}】`);
      for (const k of unique) {
        console.log(`  - ${k.substring(0, 100)}${k.length > 100 ? '...' : ''}`);
      }
      console.log('');
    }
  }
  
  // 結果をJSON保存
  const output = {
    patterns: Object.fromEntries(
      [...patternCounts].map(([cat, counts]) => [
        cat,
        Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]))
      ])
    ),
    courseKnowledge: Object.fromEntries(courseMap),
    samplePhrases: [...new Set(allPhrases)].slice(0, 100)
  };
  
  const outputPath = path.join(process.cwd(), 'data', 'expression-patterns.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n💾 結果を保存しました: ${outputPath}`);
}

main().catch(console.error);





