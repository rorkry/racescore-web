/**
 * 特殊ラップパターン発見 & 詳細レースレベル分析
 * 
 * 【ラップ分析】
 * - 芝/ダート別のペース基準
 * - コース・距離別の出現率が低いパターン
 * - 特殊パターンレースでの各馬の次走追跡
 * 
 * 【レースレベル分析】
 * - 着差別の次走成績
 * - レベル内での勝者/僅差負け/大敗の分類
 * 
 * 使い方:
 * node scripts/analyze-special-patterns.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../data/learning-data/learning-data-full.json');
const OUTPUT_PATH = path.join(__dirname, '../data/special-patterns-analysis.json');

// ペース基準（秒/F）
const PACE_THRESHOLDS = {
  turf: {   // 芝
    hard: 11.5,    // ほぼ全速力
    medium: 12.0,  // 8割以上の力
    easy: 12.5,    // 流し
  },
  dirt: {   // ダート
    hard: 12.0,    // ほぼ全速力
    medium: 12.5,  // 8割以上の力
    easy: 13.0,    // 流し
  }
};

async function main() {
  console.log('=== 特殊ラップパターン & 詳細レースレベル分析 ===\n');
  
  // データ読み込み
  if (!fs.existsSync(INPUT_PATH)) {
    console.error('❌ 学習データが見つかりません');
    console.log('先に node scripts/export-learning-data.js を実行してください');
    process.exit(1);
  }
  
  console.log('1. データ読み込み中...');
  const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
  console.log(`   ${data.length.toLocaleString()}件\n`);
  
  const valid = data.filter(d => 
    d.next_finish && d.next_finish < 99 &&
    d.lap_time && d.finish_time
  );
  console.log(`   有効データ: ${valid.length.toLocaleString()}件\n`);
  
  // ===== 1. 特殊ラップパターン分析 =====
  console.log('2. 特殊ラップパターン分析...\n');
  
  const specialLapResults = analyzeSpecialLapPatterns(valid);
  
  // ===== 2. 詳細レースレベル分析 =====
  console.log('\n3. 詳細レースレベル分析（着差別）...\n');
  
  const raceLevelResults = analyzeRaceLevelWithMargin(valid);
  
  // ===== 結果を保存 =====
  const output = {
    generatedAt: new Date().toISOString(),
    totalData: valid.length,
    specialLapPatterns: specialLapResults,
    raceLevelAnalysis: raceLevelResults,
  };
  
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✅ 結果を保存: ${OUTPUT_PATH}`);
}

/**
 * 特殊ラップパターン分析
 */
function analyzeSpecialLapPatterns(data) {
  const results = {
    byCondition: {},  // コース/距離/馬場別
    specialPatterns: [],  // 発見された特殊パターン
    nextRaceStats: {},  // 特殊パターン時の次走成績
  };
  
  // コース/距離/馬場でグループ化してラップパターンを収集
  const lapGroups = new Map();
  
  for (const d of data) {
    if (!d.lap_time || !d.surface || !d.distance) continue;
    
    const key = `${d.place}_${d.surface}_${d.distance}_${d.track_condition || '良'}`;
    if (!lapGroups.has(key)) {
      lapGroups.set(key, []);
    }
    lapGroups.get(key).push(d);
  }
  
  console.log(`   ${lapGroups.size}種類の条件を分析中...\n`);
  
  // 各条件でのラップパターン分析
  for (const [key, races] of lapGroups) {
    if (races.length < 100) continue;  // データ数が少ない条件はスキップ
    
    const [place, surface, distance, condition] = key.split('_');
    const thresh = surface === '芝' ? PACE_THRESHOLDS.turf : PACE_THRESHOLDS.dirt;
    
    // ラップパターンを分類
    const patterns = classifyLapPatterns(races, thresh, parseInt(distance));
    
    results.byCondition[key] = {
      place, surface, distance: parseInt(distance), condition,
      totalRaces: races.length,
      patterns,
    };
    
    // 特殊パターン（出現率10%以下）を抽出
    for (const [patternName, patternData] of Object.entries(patterns)) {
      const ratio = patternData.count / races.length;
      if (ratio > 0 && ratio <= 0.15 && patternData.count >= 50) {
        // 特殊パターン発見！各位置取りでの次走成績を分析
        const nextRaceAnalysis = analyzeNextRaceByPosition(patternData.horses);
        
        results.specialPatterns.push({
          condition: key,
          patternName,
          count: patternData.count,
          ratio: ratio * 100,
          description: patternData.description,
          nextRaceAnalysis,
        });
      }
    }
  }
  
  // 特殊パターンを回収率順にソート
  results.specialPatterns.sort((a, b) => {
    const roiA = a.nextRaceAnalysis?.total?.roi || 0;
    const roiB = b.nextRaceAnalysis?.total?.roi || 0;
    return roiB - roiA;
  });
  
  // 結果表示
  console.log('【発見された特殊ラップパターン】');
  console.log('パターン                                | 出現率 | 件数  | 次走回収率');
  console.log('-'.repeat(75));
  
  for (const p of results.specialPatterns.slice(0, 20)) {
    const roi = p.nextRaceAnalysis?.total?.roi || 0;
    const mark = roi >= 100 ? '★' : roi >= 80 ? '○' : '';
    console.log(
      `${p.condition.substring(0, 15).padEnd(15)} ${p.patternName.padEnd(20)} | ` +
      `${p.ratio.toFixed(1).padStart(5)}% | ${String(p.count).padStart(5)} | ` +
      `${roi.toFixed(1).padStart(6)}% ${mark}`
    );
  }
  
  // 位置取り別の結果も表示
  console.log('\n【特殊ラップレースでの位置取り別 次走成績】');
  console.log('位置取り   | データ数 | 3着内率 | 回収率');
  console.log('-'.repeat(50));
  
  // 全特殊パターンを集計
  const positionStats = { front: [], mid: [], back: [], winner: [], loser: [] };
  for (const p of results.specialPatterns) {
    if (p.nextRaceAnalysis) {
      for (const pos of Object.keys(positionStats)) {
        if (p.nextRaceAnalysis[pos]) {
          positionStats[pos].push(p.nextRaceAnalysis[pos]);
        }
      }
    }
  }
  
  for (const [pos, stats] of Object.entries(positionStats)) {
    if (stats.length === 0) continue;
    const totalCount = stats.reduce((s, x) => s + x.count, 0);
    const totalTop3 = stats.reduce((s, x) => s + x.top3Count, 0);
    const totalPayout = stats.reduce((s, x) => s + x.winPayout, 0);
    if (totalCount < 50) continue;
    
    const top3Rate = (totalTop3 / totalCount) * 100;
    const roi = (totalPayout / (totalCount * 100)) * 100;
    const posName = { front: '先行馬', mid: '中団', back: '後方馬', winner: '勝者', loser: '敗者' }[pos];
    const mark = roi >= 100 ? '★' : roi >= 80 ? '○' : '';
    
    console.log(
      `${posName.padEnd(10)} | ${String(totalCount).padStart(8)} | ` +
      `${top3Rate.toFixed(1).padStart(6)}% | ${roi.toFixed(1).padStart(6)}% ${mark}`
    );
  }
  
  return results;
}

/**
 * ラップパターンを分類
 */
function classifyLapPatterns(races, thresh, distance) {
  const patterns = {
    // 前傾ラップ（前半ハイ→後半落ちる）
    frontLoaded: { count: 0, horses: [], description: '前傾: 前半厳しく後半落ちる' },
    // 後傾ラップ（前半スロー→後半上がる）
    backLoaded: { count: 0, horses: [], description: '後傾: 前半緩く後半加速' },
    // 中弛み（中盤が緩む）
    midSlow: { count: 0, horses: [], description: '中弛み: 中盤でペースが緩む' },
    // 淀みなし（全体的に厳しい）
    noBreather: { count: 0, horses: [], description: '淀みなし: 終始厳しいペース' },
    // 超スロー（全体的に緩い）
    superSlow: { count: 0, horses: [], description: '超スロー: 全体的に緩いペース' },
  };
  
  for (const race of races) {
    const laps = parseLapTime(race.lap_time);
    if (laps.length < 4) continue;
    
    const pattern = detectLapPattern(laps, thresh, distance);
    if (pattern && patterns[pattern]) {
      patterns[pattern].count++;
      patterns[pattern].horses.push(race);
    }
  }
  
  return patterns;
}

/**
 * ラップパターンを検出
 */
function detectLapPattern(laps, thresh, distance) {
  if (laps.length < 4) return null;
  
  const avg = laps.reduce((a, b) => a + b, 0) / laps.length;
  const firstHalf = laps.slice(0, Math.floor(laps.length / 2));
  const secondHalf = laps.slice(Math.floor(laps.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  // 中盤のラップ（3F目〜ラスト3F前）
  const midStart = Math.min(2, laps.length - 3);
  const midEnd = Math.max(midStart + 1, laps.length - 3);
  const midLaps = laps.slice(midStart, midEnd);
  const midAvg = midLaps.length > 0 ? midLaps.reduce((a, b) => a + b, 0) / midLaps.length : avg;
  
  // パターン判定
  // 中弛み: 中盤がeasy以上遅い
  if (midAvg > thresh.easy && (firstAvg < thresh.medium || secondAvg < thresh.medium)) {
    return 'midSlow';
  }
  
  // 淀みなし: 全体的にmedium以下（厳しい）
  const hardLaps = laps.filter(l => l <= thresh.medium);
  if (hardLaps.length >= laps.length * 0.7) {
    return 'noBreather';
  }
  
  // 前傾: 前半が厳しく後半が緩む
  if (firstAvg < secondAvg - 0.4 && firstAvg <= thresh.medium) {
    return 'frontLoaded';
  }
  
  // 後傾: 前半が緩く後半が加速
  if (secondAvg < firstAvg - 0.4) {
    return 'backLoaded';
  }
  
  // 超スロー: 全体的にeasy以上
  const slowLaps = laps.filter(l => l >= thresh.easy);
  if (slowLaps.length >= laps.length * 0.6) {
    return 'superSlow';
  }
  
  return null;
}

/**
 * 位置取り別の次走成績を分析
 */
function analyzeNextRaceByPosition(horses) {
  if (!horses || horses.length === 0) return null;
  
  const result = {
    total: { count: 0, top3Count: 0, winPayout: 0 },
    front: { count: 0, top3Count: 0, winPayout: 0 },    // 先行（4角3番手以内）
    mid: { count: 0, top3Count: 0, winPayout: 0 },      // 中団（4〜6番手）
    back: { count: 0, top3Count: 0, winPayout: 0 },     // 後方（7番手以降）
    winner: { count: 0, top3Count: 0, winPayout: 0 },   // 勝者
    loser: { count: 0, top3Count: 0, winPayout: 0 },    // 敗者
  };
  
  for (const h of horses) {
    if (!h.next_finish || h.next_finish >= 99) continue;
    
    const isTop3 = h.next_finish <= 3;
    const payout = h.next_finish === 1 ? (h.next_payout || 0) : 0;
    
    // 全体
    result.total.count++;
    if (isTop3) result.total.top3Count++;
    result.total.winPayout += payout;
    
    // 位置取り別
    const corner4 = h.corner_4 || 0;
    const fieldSize = h.field_size || 16;
    
    if (corner4 <= 3) {
      result.front.count++;
      if (isTop3) result.front.top3Count++;
      result.front.winPayout += payout;
    } else if (corner4 <= 6) {
      result.mid.count++;
      if (isTop3) result.mid.top3Count++;
      result.mid.winPayout += payout;
    } else {
      result.back.count++;
      if (isTop3) result.back.top3Count++;
      result.back.winPayout += payout;
    }
    
    // 勝敗別
    if (h.finish_position === 1) {
      result.winner.count++;
      if (isTop3) result.winner.top3Count++;
      result.winner.winPayout += payout;
    } else {
      result.loser.count++;
      if (isTop3) result.loser.top3Count++;
      result.loser.winPayout += payout;
    }
  }
  
  // 回収率計算
  for (const key of Object.keys(result)) {
    const r = result[key];
    r.top3Rate = r.count > 0 ? (r.top3Count / r.count) * 100 : 0;
    r.roi = r.count > 0 ? (r.winPayout / (r.count * 100)) * 100 : 0;
  }
  
  return result;
}

/**
 * 詳細レースレベル分析（着差別）
 */
function analyzeRaceLevelWithMargin(data) {
  console.log('【レースレベル × 着差 分析】');
  console.log('条件                    | データ数 | 3着内率 | 回収率');
  console.log('-'.repeat(60));
  
  const results = {};
  const levels = ['A', 'B', 'C'];
  
  for (const level of levels) {
    results[level] = {};
    const levelData = data.filter(d => d.member_level === level);
    
    // 勝者
    const winners = levelData.filter(d => d.finish_position === 1);
    results[level].winner = calculateStats(winners, `レベル${level} 勝者`);
    
    // 僅差負け（0.5秒以内）
    const closeLoser = levelData.filter(d => {
      const margin = parseMarginToSeconds(d.margin);
      return d.finish_position > 1 && margin !== null && margin <= 0.5;
    });
    results[level].closeLoser = calculateStats(closeLoser, `レベル${level} 僅差負け(0.5秒以内)`);
    
    // 1秒以内の負け
    const within1sec = levelData.filter(d => {
      const margin = parseMarginToSeconds(d.margin);
      return d.finish_position > 1 && margin !== null && margin > 0.5 && margin <= 1.0;
    });
    results[level].within1sec = calculateStats(within1sec, `レベル${level} 1秒以内負け`);
    
    // 大敗（1秒超）
    const bigLoser = levelData.filter(d => {
      const margin = parseMarginToSeconds(d.margin);
      return d.finish_position > 1 && margin !== null && margin > 1.0;
    });
    results[level].bigLoser = calculateStats(bigLoser, `レベル${level} 大敗(1秒超)`);
  }
  
  // 特に期待値の高いパターンを抽出
  console.log('\n【期待値プラスの詳細パターン】');
  const allPatterns = [];
  for (const [level, patterns] of Object.entries(results)) {
    for (const [patternName, stats] of Object.entries(patterns)) {
      if (stats.roi >= 80 && stats.count >= 50) {
        allPatterns.push({ level, pattern: patternName, ...stats });
      }
    }
  }
  
  allPatterns.sort((a, b) => b.roi - a.roi);
  
  for (const p of allPatterns) {
    const mark = p.roi >= 100 ? '★' : '○';
    console.log(
      `レベル${p.level} ${p.pattern.padEnd(15)} | ` +
      `${String(p.count).padStart(8)} | ${p.top3Rate.toFixed(1).padStart(6)}% | ` +
      `${p.roi.toFixed(1).padStart(6)}% ${mark}`
    );
  }
  
  return results;
}

/**
 * 統計計算 & 表示
 */
function calculateStats(data, label) {
  let top3Count = 0;
  let winPayout = 0;
  
  for (const d of data) {
    if (d.next_finish <= 3) top3Count++;
    if (d.next_finish === 1) winPayout += d.next_payout || 0;
  }
  
  const count = data.length;
  const top3Rate = count > 0 ? (top3Count / count) * 100 : 0;
  const roi = count > 0 ? (winPayout / (count * 100)) * 100 : 0;
  
  if (count >= 50) {
    const mark = roi >= 100 ? '★' : roi >= 80 ? '○' : '';
    console.log(
      `${label.padEnd(25)} | ${String(count).padStart(8)} | ` +
      `${top3Rate.toFixed(1).padStart(6)}% | ${roi.toFixed(1).padStart(6)}% ${mark}`
    );
  }
  
  return { count, top3Rate, roi };
}

/**
 * ラップタイム文字列をパース
 */
function parseLapTime(lapStr) {
  if (!lapStr) return [];
  return lapStr.split(/[-−ー]/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
}

/**
 * 着差を秒に変換
 */
function parseMarginToSeconds(margin) {
  if (!margin) return null;
  const str = String(margin).trim();
  
  // "1.2" 形式
  const numMatch = str.match(/^(\d+\.?\d*)$/);
  if (numMatch) return parseFloat(numMatch[1]);
  
  // "1 1/2" 形式
  if (str.includes('1/2')) return 0.3;
  if (str.includes('3/4')) return 0.45;
  if (str === 'ハナ' || str === 'hana') return 0.1;
  if (str === 'アタマ' || str === 'atama') return 0.15;
  if (str === 'クビ' || str === 'kubi') return 0.2;
  
  // 数字+身/馬身
  const bodyMatch = str.match(/(\d+)/);
  if (bodyMatch) return parseInt(bodyMatch[1]) * 0.2;
  
  return null;
}

main().catch(console.error);
