/**
 * 巻き返しパターン詳細分析
 * 
 * 「僅差負け」「不利馬」が巻き返すパターンを
 * 複合条件で詳細に分析
 * 
 * 使い方:
 * node scripts/analyze-comeback-patterns.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../data/learning-data/learning-data-full.json');

async function main() {
  console.log('=== 巻き返しパターン詳細分析 ===\n');
  
  // データ読み込み
  const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
  const valid = data.filter(d => 
    d.next_finish && d.next_finish < 99 &&
    d.finish_position && d.finish_position < 99
  );
  console.log(`有効データ: ${valid.length.toLocaleString()}件\n`);
  
  // ===== 1. 僅差負け × 条件別 =====
  console.log('=== 1. 僅差負け × 条件別 ===\n');
  
  const closeLoser = valid.filter(d => {
    const margin = parseMarginToSeconds(d.margin);
    return d.finish_position > 1 && margin !== null && margin <= 0.5;
  });
  console.log(`僅差負け（0.5秒以内）: ${closeLoser.length}件\n`);
  
  // 僅差負け × レースレベル × 指数
  console.log('【僅差負け × レースレベル × 指数】');
  console.log('条件                              | 件数   | 3着内率 | 回収率');
  console.log('-'.repeat(70));
  
  // レベルA/B僅差 + 高ポテンシャル
  analyzeAndPrint(closeLoser.filter(d => 
    (d.member_level === 'A' || d.member_level === 'B') && 
    d.potential >= 5
  ), 'レベルA/B僅差 + ポテンシャル>=5');
  
  // レベルA/B僅差 + 巻き返し最適ゾーン
  analyzeAndPrint(closeLoser.filter(d => 
    (d.member_level === 'A' || d.member_level === 'B') && 
    d.makikaeshi >= 2 && d.makikaeshi <= 4
  ), 'レベルA/B僅差 + 巻き返し2-4');
  
  // 僅差 + 高指数ダブル
  analyzeAndPrint(closeLoser.filter(d => 
    d.potential >= 5 && 
    d.makikaeshi >= 2 && d.makikaeshi <= 4
  ), '僅差 + 高ポテ + 巻き返し2-4');
  
  // ===== 2. 差し損ね × 条件別 =====
  console.log('\n=== 2. 差し損ね（後方から上がり上位）× 条件別 ===\n');
  
  const sashinosone = valid.filter(d => {
    const corner4 = d.corner_4 || 0;
    const fieldSize = d.field_size || 16;
    const last3fRank = d.last_3f_rank || 99;
    return corner4 > fieldSize * 0.6 && last3fRank <= 3 && d.finish_position > 3;
  });
  console.log(`差し損ね: ${sashinosone.length}件\n`);
  
  console.log('【差し損ね × 条件】');
  console.log('条件                              | 件数   | 3着内率 | 回収率');
  console.log('-'.repeat(70));
  
  // 差し損ね + レベルA/B
  analyzeAndPrint(sashinosone.filter(d => 
    d.member_level === 'A' || d.member_level === 'B'
  ), '差し損ね + レベルA/B');
  
  // 差し損ね + 高ポテンシャル
  analyzeAndPrint(sashinosone.filter(d => d.potential >= 5), '差し損ね + ポテンシャル>=5');
  
  // 差し損ね + 巻き返しゾーン
  analyzeAndPrint(sashinosone.filter(d => 
    d.makikaeshi >= 2 && d.makikaeshi <= 4
  ), '差し損ね + 巻き返し2-4');
  
  // 差し損ね + 人気薄
  analyzeAndPrint(sashinosone.filter(d => d.popularity >= 6), '差し損ね + 6番人気以下');
  
  // ===== 3. 特殊ラップでの敗者 × 条件別 =====
  console.log('\n=== 3. 特殊ラップでの敗者 × 条件別 ===\n');
  
  // 中弛みで負けた先行馬
  const midSlowFrontLoser = valid.filter(d => {
    const corner4 = d.corner_4 || 0;
    return d.lap_pattern === '中弛み' && corner4 <= 3 && d.finish_position > 1;
  });
  analyzeAndPrint(midSlowFrontLoser, '中弛み + 先行馬 + 負け');
  
  // 淀みなしで負けた後方馬
  const noBreatherBackLoser = valid.filter(d => {
    const corner4 = d.corner_4 || 0;
    const fieldSize = d.field_size || 16;
    return d.lap_pattern === '淀みなし' && corner4 > fieldSize * 0.5 && d.finish_position > 3;
  });
  analyzeAndPrint(noBreatherBackLoser, '淀みなし + 後方 + 負け');
  
  // 前傾で負けた先行馬（前潰れ）
  const frontLoadedFrontLoser = valid.filter(d => {
    const corner4 = d.corner_4 || 0;
    return d.lap_pattern === '前傾' && corner4 <= 3 && d.finish_position > 3;
  });
  analyzeAndPrint(frontLoadedFrontLoser, '前傾(前潰れ) + 先行 + 負け');
  
  // ===== 4. 複合パターン探索 =====
  console.log('\n=== 4. 期待値の高い複合パターン探索 ===\n');
  
  console.log('【複合パターン】');
  console.log('条件                                          | 件数   | 3着内率 | 回収率');
  console.log('-'.repeat(80));
  
  // レベルA/B + 僅差 + 高ポテ + 巻き返しゾーン
  analyzeAndPrint(valid.filter(d => {
    const margin = parseMarginToSeconds(d.margin);
    return (d.member_level === 'A' || d.member_level === 'B') &&
      margin !== null && margin <= 0.5 &&
      d.potential >= 5 &&
      d.makikaeshi >= 2 && d.makikaeshi <= 4;
  }), 'レベルA/B + 僅差 + 高ポテ + 巻き返し');
  
  // 差し損ね + 高ポテ + 巻き返し
  analyzeAndPrint(sashinosone.filter(d => 
    d.potential >= 5 && d.makikaeshi >= 2 && d.makikaeshi <= 4
  ), '差し損ね + 高ポテ + 巻き返し');
  
  // 特殊ラップ敗者 + 高指数
  analyzeAndPrint(valid.filter(d => 
    (d.lap_pattern === '中弛み' || d.lap_pattern === '淀みなし' || d.lap_pattern === '前傾') &&
    d.finish_position > 1 &&
    d.potential >= 5 &&
    d.makikaeshi >= 2
  ), '特殊ラップ敗者 + 高指数');
  
  // 人気裏切り + 高指数
  analyzeAndPrint(valid.filter(d => 
    d.popularity <= 3 && d.finish_position > d.popularity * 3 &&
    d.potential >= 5 &&
    d.makikaeshi >= 2
  ), '人気裏切り + 高指数');
  
  // 前潰れ + 高ポテンシャル
  analyzeAndPrint(valid.filter(d => {
    const corner4 = d.corner_4 || 0;
    return d.pace_type === 'ハイ' && corner4 <= 3 && d.finish_position > 3 &&
      d.potential >= 5;
  }), '前潰れ(ハイペース先行負け) + 高ポテ');
  
  // ===== 5. 着差別詳細分析 =====
  console.log('\n=== 5. 着差別 × 指数別 詳細分析 ===\n');
  
  const margins = [
    { label: '0.2秒以内', filter: d => parseMarginToSeconds(d.margin) <= 0.2 && d.finish_position > 1 },
    { label: '0.3-0.5秒', filter: d => { const m = parseMarginToSeconds(d.margin); return m > 0.2 && m <= 0.5; } },
    { label: '0.6-1.0秒', filter: d => { const m = parseMarginToSeconds(d.margin); return m > 0.5 && m <= 1.0; } },
    { label: '1.0秒超', filter: d => parseMarginToSeconds(d.margin) > 1.0 },
  ];
  
  console.log('着差 × 指数条件                    | 件数   | 3着内率 | 回収率');
  console.log('-'.repeat(70));
  
  for (const { label, filter } of margins) {
    const subset = valid.filter(d => filter(d) && d.finish_position > 1);
    
    // 着差のみ
    analyzeAndPrint(subset, `${label}`);
    
    // 着差 + 高ポテ + 巻き返し
    analyzeAndPrint(subset.filter(d => 
      d.potential >= 5 && d.makikaeshi >= 2 && d.makikaeshi <= 4
    ), `${label} + 高ポテ + 巻き返し`);
  }
  
  // ===== 6. 最終結論 =====
  console.log('\n=== 6. 結論: 期待値プラスの巻き返しパターン ===\n');
  
  const conclusions = [
    { 
      label: '僅差(0.2秒以内) + 高ポテ + 巻き返し',
      filter: d => {
        const m = parseMarginToSeconds(d.margin);
        return d.finish_position > 1 && m !== null && m <= 0.2 &&
          d.potential >= 5 && d.makikaeshi >= 2 && d.makikaeshi <= 4;
      }
    },
    {
      label: '差し損ね + 高ポテ + 巻き返し',
      filter: d => {
        const corner4 = d.corner_4 || 0;
        const fieldSize = d.field_size || 16;
        const last3fRank = d.last_3f_rank || 99;
        return corner4 > fieldSize * 0.6 && last3fRank <= 3 && d.finish_position > 3 &&
          d.potential >= 5 && d.makikaeshi >= 2 && d.makikaeshi <= 4;
      }
    },
    {
      label: '前潰れ + 高ポテ + 巻き返し',
      filter: d => {
        const corner4 = d.corner_4 || 0;
        return d.pace_type === 'ハイ' && corner4 <= 3 && d.finish_position > 3 &&
          d.potential >= 5 && d.makikaeshi >= 2;
      }
    },
    {
      label: 'レベルA/B僅差 + 高ポテ + 巻き返し',
      filter: d => {
        const m = parseMarginToSeconds(d.margin);
        return (d.member_level === 'A' || d.member_level === 'B') &&
          d.finish_position > 1 && m !== null && m <= 0.5 &&
          d.potential >= 5 && d.makikaeshi >= 2 && d.makikaeshi <= 4;
      }
    },
  ];
  
  console.log('パターン                                      | 件数   | 3着内率 | 回収率');
  console.log('-'.repeat(80));
  
  for (const { label, filter } of conclusions) {
    analyzeAndPrint(valid.filter(filter), label);
  }
}

function analyzeAndPrint(data, label) {
  if (data.length < 30) {
    console.log(`${label.padEnd(45)} | ${String(data.length).padStart(6)} | データ不足`);
    return;
  }
  
  let top3Count = 0;
  let winPayout = 0;
  
  for (const d of data) {
    if (d.next_finish <= 3) top3Count++;
    if (d.next_finish === 1) winPayout += d.next_payout || 0;
  }
  
  const top3Rate = (top3Count / data.length) * 100;
  const roi = (winPayout / (data.length * 100)) * 100;
  const mark = roi >= 100 ? '★' : roi >= 80 ? '○' : '';
  
  console.log(
    `${label.padEnd(45)} | ${String(data.length).padStart(6)} | ` +
    `${top3Rate.toFixed(1).padStart(6)}% | ${roi.toFixed(1).padStart(6)}% ${mark}`
  );
}

function parseMarginToSeconds(margin) {
  if (!margin) return null;
  const str = String(margin).trim();
  
  const numMatch = str.match(/^(\d+\.?\d*)$/);
  if (numMatch) return parseFloat(numMatch[1]);
  
  if (str.includes('1/2')) return 0.3;
  if (str.includes('3/4')) return 0.45;
  if (str === 'ハナ' || str === 'hana') return 0.1;
  if (str === 'アタマ' || str === 'atama') return 0.15;
  if (str === 'クビ' || str === 'kubi') return 0.2;
  
  const bodyMatch = str.match(/(\d+)/);
  if (bodyMatch) return parseInt(bodyMatch[1]) * 0.2;
  
  return null;
}

main().catch(console.error);
