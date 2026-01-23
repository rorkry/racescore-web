/**
 * 発見したパターンをAIルールに自動適用
 * 
 * discover-patterns.js で発見したパターンを
 * lib/ai-chat/prediction-rules.ts に追加する
 * 
 * 使い方:
 * node scripts/apply-discovered-patterns.js
 */

const fs = require('fs');
const path = require('path');

const PATTERNS_PATH = path.join(__dirname, '../data/discovered-patterns.json');
const OUTPUT_PATH = path.join(__dirname, '../data/generated-rules.ts');

async function main() {
  console.log('=== 発見パターンをルール化 ===\n');
  
  // パターン読み込み
  if (!fs.existsSync(PATTERNS_PATH)) {
    console.error('❌ パターンデータが見つかりません');
    console.log('先に node scripts/discover-patterns.js を実行してください');
    process.exit(1);
  }
  
  const { rules, profitablePatterns } = JSON.parse(fs.readFileSync(PATTERNS_PATH, 'utf-8'));
  
  console.log(`読み込んだパターン: ${profitablePatterns.length}件\n`);
  
  // TypeScriptルールを生成
  let tsCode = `/**
 * 自動生成されたルール
 * 
 * 生成日時: ${new Date().toISOString()}
 * 学習データから発見されたパターンに基づく
 * 
 * 使用方法:
 * 1. このファイルの内容を lib/ai-chat/prediction-rules.ts にコピー
 * 2. PREDICTION_RULES オブジェクトに追加
 */

// ===== 自動発見されたルール =====

`;

  for (const rule of rules) {
    const funcName = rule.id.toUpperCase();
    
    tsCode += `
  // ${rule.name}
  // 回収率: ${rule.stats.roi.toFixed(1)}%, 3着内率: ${rule.stats.top3Rate.toFixed(1)}%, データ数: ${rule.stats.count}
  ${funcName}: {
    id: '${rule.id}',
    name: '${rule.name}',
    type: ${rule.stats.roi >= 100 ? "'POSITIVE'" : "'POSITIVE'"},
    category: '${rule.category}',
    priority: ${rule.stats.roi >= 100 ? 100 : 80},
    check: (horse: HorseAnalysisData, _settings: RaceConditionSettings) => {
      const last = horse.pastRaces[0];
      if (!last) return null;
      
      // 条件: ${rule.condition}
      ${generateConditionCode(rule)}
    },
  },
`;
  }
  
  // システムプロンプト用のルール説明も生成
  tsCode += `

// ===== システムプロンプト用説明 =====
export const DISCOVERED_PATTERN_DESCRIPTIONS = \`
【データ分析から発見されたパターン】
${profitablePatterns.map(p => `- ${p.name}: 回収率${p.roi.toFixed(0)}%、3着内率${p.top3Rate.toFixed(0)}%`).join('\n')}
\`;
`;

  // 保存
  fs.writeFileSync(OUTPUT_PATH, tsCode);
  console.log(`✅ ルール生成完了: ${OUTPUT_PATH}`);
  
  // サマリー表示
  console.log('\n=== 生成されたルール ===\n');
  console.log('ルール名                             | 回収率  | スコア調整');
  console.log('-'.repeat(60));
  
  for (const rule of rules) {
    const mark = rule.stats.roi >= 100 ? '★' : '○';
    console.log(
      `${rule.name.padEnd(35)} | ${rule.stats.roi.toFixed(1).padStart(6)}% | +${rule.scoreAdjust} ${mark}`
    );
  }
  
  console.log('\n=== 適用方法 ===');
  console.log('1. data/generated-rules.ts の内容を確認');
  console.log('2. lib/ai-chat/prediction-rules.ts の PREDICTION_RULES に追加');
  console.log('3. git commit & push');
}

// 条件コードを生成
function generateConditionCode(rule) {
  const { category, condition, stats, name } = rule;
  
  // 基本的なリターン文
  const returnStatement = `
      return {
        reason: \`${name}（回収率${stats.roi.toFixed(0)}%）\`,
        confidence: '${stats.roi >= 100 ? 'high' : 'medium'}' as const,
        scoreAdjust: ${Math.round((stats.roi - 70) / 10)},
      };`;
  
  // カテゴリ別の条件コード
  switch (category) {
    case 'lap':
      if (condition.includes('is_reverse')) {
        return `
      // 逆行ラップ: ハイペース + 非減速/加速
      // pastRacesにlapRatingが含まれている場合
      if (last.lapRating === 'S' || last.lapRating === 'A') {
        ${returnStatement}
      }
      return null;`;
      }
      if (condition.includes('lap_pattern')) {
        const pattern = condition.match(/"(.+?)"/)?.[1] || '';
        return `
      // ラップパターン: ${pattern}
      if (last.lapRating === '${pattern === '加速' ? 'S' : pattern === '非減速' ? 'A' : 'B'}') {
        ${returnStatement}
      }
      return null;`;
      }
      break;
      
    case 'time':
      return `
      // 時計評価
      if (last.timeRating === 'S' || last.timeRating === 'A') {
        ${returnStatement}
      }
      return null;`;
      
    case 'race_level':
      const level = condition.match(/"(.+?)"/)?.[1] || '';
      return `
      // レースレベル: ${level}
      if (last.raceLevel === '${level}') {
        ${returnStatement}
      }
      return null;`;
      
    case 'disadvantage':
      const disType = condition.match(/"(.+?)"/)?.[1] || '';
      return `
      // 不利パターン: ${disType}
      // 巻き返し指数と着順から推定
      const isDisadvantaged = horse.makikaeshi !== null && horse.makikaeshi >= 2;
      if (isDisadvantaged && last.finishPosition > 3) {
        ${returnStatement}
      }
      return null;`;
      
    case 'combo':
      return `
      // 複合条件: ${name}
      // ${condition}
      const matchesCondition = true; // TODO: 実際の条件に置き換え
      if (matchesCondition) {
        ${returnStatement}
      }
      return null;`;
      
    default:
      return `
      // ${condition}
      ${returnStatement}`;
  }
  
  return `return null;`;
}

main().catch(console.error);
