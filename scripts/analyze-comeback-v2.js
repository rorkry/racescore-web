/**
 * 巻き返し分析 v2
 * 
 * 【分析の順序】
 * 1. 僅差負けを抜き出す
 * 2. ラップパターン別に分類
 * 3. 脚質・位置取り別に分類
 * 4. 各パターンの次走成績を確認
 * 
 * 使い方:
 * node scripts/analyze-comeback-v2.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../data/learning-data/learning-data-full.json');

async function main() {
  console.log('=== 巻き返し分析 v2 ===\n');
  console.log('【分析の順序】');
  console.log('1. 僅差負けを抜き出す');
  console.log('2. ラップパターン別に分類');
  console.log('3. 脚質・位置取り別に分類');
  console.log('4. 各パターンの次走成績を確認\n');
  
  // データ読み込み
  const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
  const valid = data.filter(d => 
    d.next_finish && d.next_finish < 99 &&
    d.finish_position && d.finish_position < 99
  );
  console.log(`全データ: ${valid.length.toLocaleString()}件\n`);
  
  // ===== Step 1: 僅差負けを抜き出す =====
  console.log('=' .repeat(60));
  console.log('Step 1: 僅差負けを抜き出す');
  console.log('=' .repeat(60));
  
  const closeLoser = valid.filter(d => {
    const margin = parseMarginToSeconds(d.margin);
    return d.finish_position > 1 && margin !== null && margin <= 0.5;
  });
  
  console.log(`\n僅差負け（0.5秒以内）: ${closeLoser.length.toLocaleString()}件`);
  console.log(`全体に占める割合: ${(closeLoser.length / valid.length * 100).toFixed(1)}%\n`);
  
  // 僅差負け全体の成績（ベースライン）
  const baseline = analyzeStats(closeLoser);
  console.log('【僅差負け全体の次走成績（ベースライン）】');
  console.log(`  3着内率: ${baseline.top3Rate.toFixed(1)}%`);
  console.log(`  回収率: ${baseline.roi.toFixed(1)}%\n`);
  
  // ===== Step 2: ラップパターン別に分類 =====
  console.log('=' .repeat(60));
  console.log('Step 2: ラップパターン別に分類');
  console.log('=' .repeat(60));
  
  const lapPatterns = ['加速', '非減速', '減速', '中弛み', '淀みなし', '前傾', '後傾', '超スロー'];
  
  console.log('\nラップパターン    | 僅差負け数 | 3着内率 | 回収率  | vs基準');
  console.log('-'.repeat(65));
  
  const lapResults = {};
  for (const pattern of lapPatterns) {
    const subset = closeLoser.filter(d => d.lap_pattern === pattern);
    if (subset.length < 50) continue;
    
    const stats = analyzeStats(subset);
    lapResults[pattern] = { subset, stats };
    
    const diff = stats.roi - baseline.roi;
    const mark = stats.roi >= 100 ? '★' : stats.roi >= 80 ? '○' : '';
    const diffMark = diff >= 10 ? '↑' : diff <= -10 ? '↓' : '→';
    
    console.log(
      `${pattern.padEnd(14)} | ${String(subset.length).padStart(10)} | ` +
      `${stats.top3Rate.toFixed(1).padStart(6)}% | ${stats.roi.toFixed(1).padStart(6)}% ${mark} | ${diffMark}${Math.abs(diff).toFixed(0)}%`
    );
  }
  
  // ===== Step 3: 各ラップパターン内で脚質・位置取り別に分類 =====
  console.log('\n' + '=' .repeat(60));
  console.log('Step 3: ラップパターン × 脚質・位置取り');
  console.log('=' .repeat(60));
  
  // 位置取り分類
  const positions = [
    { name: '逃げ', filter: d => (d.corner_4 || 99) === 1 },
    { name: '先行(2-3番手)', filter: d => { const c = d.corner_4 || 99; return c >= 2 && c <= 3; } },
    { name: '中団(4-6番手)', filter: d => { const c = d.corner_4 || 99; return c >= 4 && c <= 6; } },
    { name: '後方(7番手以降)', filter: d => (d.corner_4 || 0) >= 7 },
  ];
  
  // 主要なラップパターンごとに詳細分析
  const interestingPatterns = ['加速', '非減速', '中弛み', '淀みなし', '前傾'];
  
  for (const lapPattern of interestingPatterns) {
    if (!lapResults[lapPattern]) continue;
    
    const { subset } = lapResults[lapPattern];
    
    console.log(`\n【${lapPattern}ラップ × 位置取り】（僅差負け ${subset.length}件）`);
    console.log('位置取り        | 件数   | 3着内率 | 回収率  | 判定');
    console.log('-'.repeat(60));
    
    for (const { name, filter } of positions) {
      const posSubset = subset.filter(filter);
      if (posSubset.length < 30) continue;
      
      const stats = analyzeStats(posSubset);
      const mark = stats.roi >= 100 ? '★ 期待値+' : stats.roi >= 80 ? '○ 様子見' : '× 期待値-';
      
      console.log(
        `${name.padEnd(14)} | ${String(posSubset.length).padStart(6)} | ` +
        `${stats.top3Rate.toFixed(1).padStart(6)}% | ${stats.roi.toFixed(1).padStart(6)}% | ${mark}`
      );
    }
  }
  
  // ===== Step 4: さらに着差で細分化 =====
  console.log('\n' + '=' .repeat(60));
  console.log('Step 4: ラップパターン × 位置取り × 着差');
  console.log('=' .repeat(60));
  
  const marginRanges = [
    { name: 'ハナ差〜クビ差', filter: d => parseMarginToSeconds(d.margin) <= 0.2 },
    { name: '1/2〜3/4馬身', filter: d => { const m = parseMarginToSeconds(d.margin); return m > 0.2 && m <= 0.5; } },
  ];
  
  console.log('\n【期待値プラスのパターンを探索】');
  console.log('条件                                          | 件数   | 3着内率 | 回収率');
  console.log('-'.repeat(80));
  
  const profitablePatterns = [];
  
  for (const lapPattern of interestingPatterns) {
    if (!lapResults[lapPattern]) continue;
    const { subset } = lapResults[lapPattern];
    
    for (const { name: posName, filter: posFilter } of positions) {
      for (const { name: marginName, filter: marginFilter } of marginRanges) {
        const filtered = subset.filter(d => posFilter(d) && marginFilter(d));
        if (filtered.length < 30) continue;
        
        const stats = analyzeStats(filtered);
        const label = `${lapPattern} + ${posName} + ${marginName}`;
        
        if (stats.roi >= 80) {
          profitablePatterns.push({ label, count: filtered.length, ...stats });
        }
        
        const mark = stats.roi >= 100 ? '★' : stats.roi >= 80 ? '○' : '';
        if (mark) {
          console.log(
            `${label.padEnd(45)} | ${String(filtered.length).padStart(6)} | ` +
            `${stats.top3Rate.toFixed(1).padStart(6)}% | ${stats.roi.toFixed(1).padStart(6)}% ${mark}`
          );
        }
      }
    }
  }
  
  // ===== Step 5: レースレベル追加 =====
  console.log('\n' + '=' .repeat(60));
  console.log('Step 5: レースレベル × ラップパターン × 位置取り');
  console.log('=' .repeat(60));
  
  const levels = ['A', 'B', 'C'];
  
  console.log('\n【ハイレベル戦（A/B）での僅差負け】');
  console.log('条件                                          | 件数   | 3着内率 | 回収率');
  console.log('-'.repeat(80));
  
  const highLevelClose = closeLoser.filter(d => d.member_level === 'A' || d.member_level === 'B');
  
  for (const lapPattern of interestingPatterns) {
    const lapSubset = highLevelClose.filter(d => d.lap_pattern === lapPattern);
    if (lapSubset.length < 30) continue;
    
    for (const { name: posName, filter: posFilter } of positions) {
      const filtered = lapSubset.filter(posFilter);
      if (filtered.length < 30) continue;
      
      const stats = analyzeStats(filtered);
      const label = `レベルA/B + ${lapPattern} + ${posName}`;
      
      const mark = stats.roi >= 100 ? '★' : stats.roi >= 80 ? '○' : '';
      console.log(
        `${label.padEnd(45)} | ${String(filtered.length).padStart(6)} | ` +
        `${stats.top3Rate.toFixed(1).padStart(6)}% | ${stats.roi.toFixed(1).padStart(6)}% ${mark}`
      );
    }
  }
  
  // ===== 最終結論 =====
  console.log('\n' + '=' .repeat(60));
  console.log('最終結論: 期待値プラスの巻き返しパターン');
  console.log('=' .repeat(60));
  
  // 回収率順にソート
  profitablePatterns.sort((a, b) => b.roi - a.roi);
  
  console.log('\n【回収率80%以上のパターン（上位20件）】');
  console.log('パターン                                      | 件数   | 3着内率 | 回収率');
  console.log('-'.repeat(80));
  
  for (const p of profitablePatterns.slice(0, 20)) {
    const mark = p.roi >= 100 ? '★' : '○';
    console.log(
      `${p.label.padEnd(45)} | ${String(p.count).padStart(6)} | ` +
      `${p.top3Rate.toFixed(1).padStart(6)}% | ${p.roi.toFixed(1).padStart(6)}% ${mark}`
    );
  }
  
  // ===== 指数との組み合わせ =====
  console.log('\n' + '=' .repeat(60));
  console.log('追加分析: 指数との組み合わせ');
  console.log('=' .repeat(60));
  
  console.log('\n【僅差負け + 指数条件】');
  console.log('条件                                          | 件数   | 3着内率 | 回収率');
  console.log('-'.repeat(80));
  
  // 僅差負け + 高ポテ
  analyzeAndPrint(closeLoser.filter(d => d.potential >= 5), '僅差負け + ポテンシャル>=5');
  
  // 僅差負け + 巻き返しゾーン
  analyzeAndPrint(closeLoser.filter(d => d.makikaeshi >= 2 && d.makikaeshi <= 4), '僅差負け + 巻き返し2-4');
  
  // 僅差負け + 両方
  analyzeAndPrint(closeLoser.filter(d => d.potential >= 5 && d.makikaeshi >= 2 && d.makikaeshi <= 4), '僅差負け + 高ポテ + 巻き返し');
  
  // 各ラップパターン + 指数
  console.log('\n【ラップパターン × 僅差負け × 高指数】');
  for (const lapPattern of interestingPatterns) {
    if (!lapResults[lapPattern]) continue;
    const { subset } = lapResults[lapPattern];
    
    const highIndex = subset.filter(d => d.potential >= 5 && d.makikaeshi >= 2);
    if (highIndex.length >= 30) {
      analyzeAndPrint(highIndex, `${lapPattern} + 僅差負け + 高指数`);
    }
  }
}

function analyzeStats(data) {
  if (data.length === 0) return { count: 0, top3Rate: 0, winRate: 0, roi: 0 };
  
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

function analyzeAndPrint(data, label) {
  const stats = analyzeStats(data);
  const mark = stats.roi >= 100 ? '★' : stats.roi >= 80 ? '○' : '';
  
  console.log(
    `${label.padEnd(45)} | ${String(data.length).padStart(6)} | ` +
    `${stats.top3Rate.toFixed(1).padStart(6)}% | ${stats.roi.toFixed(1).padStart(6)}% ${mark}`
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
