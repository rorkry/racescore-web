/**
 * パターン発見スクリプト
 * 
 * ラップ分析、タイム分析、レースレベル分析から
 * 「次走で好走しやすいパターン」を自動発見する
 * 
 * 使い方:
 * node scripts/discover-patterns.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../data/learning-data/learning-data-full.json');
const OUTPUT_PATH = path.join(__dirname, '../data/discovered-patterns.json');

async function main() {
  console.log('=== パターン自動発見 ===\n');
  
  // データ読み込み
  if (!fs.existsSync(INPUT_PATH)) {
    console.error('❌ 学習データが見つかりません');
    console.log('先に node scripts/export-learning-data.js を実行してください');
    process.exit(1);
  }
  
  console.log('1. データ読み込み中...');
  const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
  console.log(`   ${data.length.toLocaleString()}件\n`);
  
  // 有効データのみ
  const valid = data.filter(d => 
    d.next_finish && d.next_finish < 99 &&
    d.lap_time && d.finish_time
  );
  console.log(`   有効データ: ${valid.length.toLocaleString()}件\n`);
  
  // ===== パターン発見 =====
  const patterns = [];
  
  // ----- 1. ラップパターン別成績 -----
  console.log('2. ラップパターン分析...');
  const lapPatterns = analyzeByCategory(valid, 'lap_pattern', ['加速', '非減速', '減速']);
  patterns.push(...lapPatterns.map(p => ({ category: 'lap', ...p })));
  
  // 逆行ラップ（ハイペース + 非減速/加速）
  const reverseData = valid.filter(d => d.is_reverse === true);
  if (reverseData.length >= 100) {
    const stats = calculateStats(reverseData);
    patterns.push({
      category: 'lap',
      name: '逆行ラップ',
      condition: 'is_reverse === true',
      ...stats,
    });
    console.log(`   逆行ラップ: ${reverseData.length}件, 回収率${stats.roi.toFixed(1)}%`);
  }
  
  // ----- 2. 時計レベル別成績 -----
  console.log('\n3. 時計レベル分析...');
  
  const topTimeData = valid.filter(d => d.is_top_time === true);
  if (topTimeData.length >= 100) {
    const stats = calculateStats(topTimeData);
    patterns.push({
      category: 'time',
      name: 'トップ時計（上位10%）',
      condition: 'is_top_time === true',
      ...stats,
    });
    console.log(`   トップ時計: ${topTimeData.length}件, 回収率${stats.roi.toFixed(1)}%`);
  }
  
  const highLevelTimeData = valid.filter(d => d.is_high_level_time === true && d.is_top_time !== true);
  if (highLevelTimeData.length >= 100) {
    const stats = calculateStats(highLevelTimeData);
    patterns.push({
      category: 'time',
      name: 'ハイレベル時計（上位20%）',
      condition: 'is_high_level_time === true',
      ...stats,
    });
    console.log(`   ハイレベル時計: ${highLevelTimeData.length}件, 回収率${stats.roi.toFixed(1)}%`);
  }
  
  // ----- 3. レースレベル別成績 -----
  console.log('\n4. レースレベル分析...');
  const levelPatterns = analyzeByCategory(valid, 'member_level', ['S', 'A', 'B', 'C', 'D']);
  patterns.push(...levelPatterns.map(p => ({ category: 'race_level', ...p })));
  
  // ----- 4. 不利馬パターン別成績 -----
  console.log('\n5. 不利馬パターン分析...');
  const disTypes = ['差し損ね', '前潰れ', 'スロー不利', '人気裏切り'];
  for (const type of disTypes) {
    const typeData = valid.filter(d => d.disadvantage_type === type);
    if (typeData.length >= 50) {
      const stats = calculateStats(typeData);
      patterns.push({
        category: 'disadvantage',
        name: type,
        condition: `disadvantage_type === "${type}"`,
        ...stats,
      });
      console.log(`   ${type}: ${typeData.length}件, 回収率${stats.roi.toFixed(1)}%`);
    }
  }
  
  // ----- 5. 複合パターン発見 -----
  console.log('\n6. 複合パターン発見...');
  
  // 逆行 + ハイレベル時計
  const combo1 = valid.filter(d => d.is_reverse && d.is_high_level_time);
  if (combo1.length >= 50) {
    const stats = calculateStats(combo1);
    patterns.push({
      category: 'combo',
      name: '逆行ラップ + ハイレベル時計',
      condition: 'is_reverse && is_high_level_time',
      ...stats,
    });
    console.log(`   逆行+ハイレベル時計: ${combo1.length}件, 回収率${stats.roi.toFixed(1)}%`);
  }
  
  // レベルA/B + 差し損ね
  const combo2 = valid.filter(d => 
    (d.member_level === 'A' || d.member_level === 'B') && 
    d.disadvantage_type === '差し損ね'
  );
  if (combo2.length >= 50) {
    const stats = calculateStats(combo2);
    patterns.push({
      category: 'combo',
      name: 'ハイレベル戦で差し損ね',
      condition: "(member_level === 'A' || member_level === 'B') && disadvantage_type === '差し損ね'",
      ...stats,
    });
    console.log(`   ハイレベル戦差し損ね: ${combo2.length}件, 回収率${stats.roi.toFixed(1)}%`);
  }
  
  // 加速ラップ + 後方
  const combo3 = valid.filter(d => 
    d.lap_pattern === '加速' && 
    d.corner_4 && d.field_size &&
    d.corner_4 > d.field_size * 0.6
  );
  if (combo3.length >= 50) {
    const stats = calculateStats(combo3);
    patterns.push({
      category: 'combo',
      name: '加速ラップで後方待機',
      condition: "lap_pattern === '加速' && corner_4 > field_size * 0.6",
      ...stats,
    });
    console.log(`   加速ラップ後方: ${combo3.length}件, 回収率${stats.roi.toFixed(1)}%`);
  }
  
  // 指数複合
  const combo4 = valid.filter(d => 
    d.potential >= 5 && 
    d.makikaeshi >= 2 && d.makikaeshi <= 4
  );
  if (combo4.length >= 50) {
    const stats = calculateStats(combo4);
    patterns.push({
      category: 'combo',
      name: '高ポテンシャル + 巻き返しゾーン',
      condition: 'potential >= 5 && makikaeshi >= 2 && makikaeshi <= 4',
      ...stats,
    });
    console.log(`   高ポテ+巻き返し: ${combo4.length}件, 回収率${stats.roi.toFixed(1)}%`);
  }
  
  // ===== 結果をソート（回収率順） =====
  patterns.sort((a, b) => b.roi - a.roi);
  
  // ===== 期待値プラスのパターンを抽出 =====
  console.log('\n=== 期待値プラスのパターン（回収率80%以上） ===\n');
  
  const profitablePatterns = patterns.filter(p => p.roi >= 80);
  
  console.log('パターン名                           | 件数   | 3着内率 | 回収率');
  console.log('-'.repeat(70));
  
  for (const p of profitablePatterns) {
    const mark = p.roi >= 100 ? '★' : '○';
    console.log(
      `${p.name.padEnd(35)} | ${String(p.count).padStart(6)} | ` +
      `${p.top3Rate.toFixed(1).padStart(6)}% | ${p.roi.toFixed(1).padStart(6)}% ${mark}`
    );
  }
  
  // ===== 結果を保存 =====
  const output = {
    generatedAt: new Date().toISOString(),
    totalData: valid.length,
    patterns: patterns,
    profitablePatterns: profitablePatterns,
    // ルール生成用
    rules: profitablePatterns.map(p => ({
      id: `auto_${p.category}_${p.name.replace(/\s+/g, '_').toLowerCase()}`,
      name: p.name,
      category: p.category,
      condition: p.condition,
      scoreAdjust: Math.round((p.roi - 70) / 10),  // 回収率に応じたスコア
      confidence: p.roi >= 100 ? 'high' : 'medium',
      stats: {
        count: p.count,
        top3Rate: p.top3Rate,
        winRate: p.winRate,
        roi: p.roi,
      }
    })),
  };
  
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✅ 結果を保存: ${OUTPUT_PATH}`);
  
  console.log('\n=== 次のステップ ===');
  console.log('発見したパターンをAIロジックに組み込むには:');
  console.log('node scripts/apply-discovered-patterns.js');
}

// カテゴリ別分析
function analyzeByCategory(data, field, categories) {
  const results = [];
  
  for (const cat of categories) {
    const catData = data.filter(d => d[field] === cat);
    if (catData.length < 100) continue;
    
    const stats = calculateStats(catData);
    results.push({
      name: `${field}=${cat}`,
      condition: `${field} === "${cat}"`,
      ...stats,
    });
    console.log(`   ${cat}: ${catData.length}件, 回収率${stats.roi.toFixed(1)}%`);
  }
  
  return results;
}

// 統計計算
function calculateStats(data) {
  let top3Count = 0;
  let winCount = 0;
  let winPayout = 0;
  
  for (const d of data) {
    if (d.next_finish <= 3) top3Count++;
    if (d.next_finish === 1) {
      winCount++;
      winPayout += d.next_payout || 0;
    }
  }
  
  return {
    count: data.length,
    top3Rate: (top3Count / data.length) * 100,
    winRate: (winCount / data.length) * 100,
    roi: (winPayout / (data.length * 100)) * 100,
  };
}

main().catch(console.error);
