/**
 * ファインチューニング用データ収集スクリプト
 * 
 * 目的:
 * - ラップ判定、時計判定、メンバーレベル判定、指数と次走成績の関係を収集
 * - 機械学習/ファインチューニングに使えるデータセットを作成
 * 
 * 使い方:
 * DATABASE_URL=your_db_url node scripts/prepare-finetuning-data.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL環境変数を設定してください');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'finetuning-analysis');

// ===== ユーティリティ =====

function toHalfWidth(str) {
  if (!str) return '';
  return String(str).replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(toHalfWidth(String(val)));
  return isNaN(num) ? null : num;
}

function parseFinishPosition(val) {
  if (!val) return 99;
  const str = toHalfWidth(String(val)).trim();
  if (/除|中止|失格|取消/.test(str)) return 99;
  const num = parseInt(str, 10);
  return isNaN(num) ? 99 : num;
}

// ===== ラップ判定ロジック =====

/**
 * ラップタイムを解析して特殊パターンを検出
 */
function analyzeLapPattern(lapTimeStr, surface, distance) {
  if (!lapTimeStr) return { pattern: 'UNKNOWN', laps: [] };
  
  // ラップタイムを配列に変換
  const laps = lapTimeStr.split(/[-－ー]/).map(s => parseFloat(toHalfWidth(s))).filter(n => !isNaN(n));
  if (laps.length < 3) return { pattern: 'UNKNOWN', laps: [] };
  
  // 前半3Fと後半3F（または4F）を計算
  const first3F = laps.slice(0, 3).reduce((a, b) => a + b, 0);
  const last3F = laps.slice(-3).reduce((a, b) => a + b, 0);
  const last4F = laps.length >= 4 ? laps.slice(-4).reduce((a, b) => a + b, 0) : null;
  
  // ペース判定
  let pattern = 'NORMAL';
  const paceDiff = first3F - last3F;
  
  if (paceDiff > 2.0) {
    pattern = 'SLOW_START';  // 前半スロー
  } else if (paceDiff < -2.0) {
    pattern = 'FAST_START';  // 前半ハイペース
  }
  
  // 特殊ラップ検出（中盤が極端に遅い/速い）
  if (laps.length >= 5) {
    const middleLaps = laps.slice(2, -2);
    const avgMiddle = middleLaps.reduce((a, b) => a + b, 0) / middleLaps.length;
    const avgAll = laps.reduce((a, b) => a + b, 0) / laps.length;
    
    if (avgMiddle > avgAll + 1.0) {
      pattern = 'SLOW_MIDDLE';  // 中盤が極端にスロー
    } else if (avgMiddle < avgAll - 1.0) {
      pattern = 'FAST_MIDDLE';  // 中盤が速い
    }
  }
  
  return {
    pattern,
    laps,
    first3F: Math.round(first3F * 10) / 10,
    last3F: Math.round(last3F * 10) / 10,
    last4F: last4F ? Math.round(last4F * 10) / 10 : null,
    paceDiff: Math.round(paceDiff * 10) / 10,
  };
}

/**
 * ラップ判定（S/A/B/C/D/LOW）
 */
function calculateLapRating(lapAnalysis, surface, distance, trackCondition) {
  if (!lapAnalysis.last4F) return 'UNKNOWN';
  
  const l4f = lapAnalysis.last4F;
  
  // 芝/ダート、距離、馬場による基準値（簡易版）
  let threshold;
  if (surface === '芝') {
    threshold = distance <= 1400 ? 46.0 : distance <= 1800 ? 47.0 : 48.0;
  } else {
    threshold = distance <= 1400 ? 48.0 : distance <= 1800 ? 49.0 : 50.0;
  }
  
  // 重馬場補正
  if (trackCondition === '重' || trackCondition === '不') {
    threshold += 1.0;
  } else if (trackCondition === '稍') {
    threshold += 0.5;
  }
  
  const diff = l4f - threshold;
  
  if (diff <= -2.0) return 'S';
  if (diff <= -1.0) return 'A';
  if (diff <= 0) return 'B';
  if (diff <= 1.0) return 'C';
  if (diff <= 2.0) return 'D';
  return 'LOW';
}

// ===== 時計判定ロジック =====

/**
 * 時計判定（走破タイムの評価）
 */
function calculateTimeRating(finishTime, surface, distance, trackCondition) {
  if (!finishTime) return 'UNKNOWN';
  
  // 距離ごとの基準タイム（簡易版）
  const baseTime = {
    '芝': {
      1200: 69.0, 1400: 81.0, 1600: 94.0, 1800: 106.0, 2000: 118.0, 2200: 130.0, 2400: 142.0,
    },
    'ダ': {
      1200: 71.0, 1400: 83.0, 1600: 96.0, 1800: 109.0, 2000: 122.0, 2100: 128.0,
    }
  };
  
  const surfaceKey = surface === '芝' ? '芝' : 'ダ';
  const nearestDist = Object.keys(baseTime[surfaceKey])
    .map(Number)
    .reduce((prev, curr) => Math.abs(curr - distance) < Math.abs(prev - distance) ? curr : prev);
  
  let threshold = baseTime[surfaceKey][nearestDist];
  
  // 距離補正
  const distDiff = distance - nearestDist;
  threshold += distDiff * 0.06;  // 100mあたり約6秒
  
  // 馬場補正
  if (trackCondition === '重' || trackCondition === '不') {
    threshold += 2.0;
  } else if (trackCondition === '稍') {
    threshold += 1.0;
  }
  
  const diff = finishTime - threshold;
  
  if (diff <= -2.0) return 'S';
  if (diff <= -1.0) return 'A';
  if (diff <= 0) return 'B';
  if (diff <= 1.0) return 'C';
  if (diff <= 2.0) return 'D';
  return 'LOW';
}

// ===== メンバーレベル判定ロジック =====

/**
 * メンバーレベル判定
 */
async function calculateMemberLevel(client, raceId, horses) {
  // 各馬の前走成績を取得
  let totalScore = 0;
  let validCount = 0;
  
  for (const horse of horses) {
    const horseName = (horse.horse_name || '').trim().replace(/^[\$\*]+/, '');
    if (!horseName) continue;
    
    // 前走を取得
    const prevResult = await client.query(`
      SELECT finish_position, class_name, field_size
      FROM umadata
      WHERE (TRIM(horse_name) = $1 OR REPLACE(REPLACE(horse_name, '*', ''), '$', '') = $1)
        AND SUBSTRING(race_id, 1, 8)::INTEGER < $2
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
      LIMIT 1
    `, [horseName, parseInt(raceId.substring(0, 8))]);
    
    if (prevResult.rows.length === 0) continue;
    
    const prev = prevResult.rows[0];
    const prevFinish = parseFinishPosition(prev.finish_position);
    const prevField = parseNumber(prev.field_size) || 16;
    
    // 前走の成績をスコア化
    let score = 0;
    if (prevFinish === 1) score = 10;
    else if (prevFinish === 2) score = 7;
    else if (prevFinish === 3) score = 5;
    else if (prevFinish <= 5) score = 3;
    else if (prevFinish <= prevField * 0.5) score = 1;
    
    totalScore += score;
    validCount++;
  }
  
  if (validCount === 0) return { level: 'UNKNOWN', avgScore: 0 };
  
  const avgScore = totalScore / validCount;
  
  let level;
  if (avgScore >= 6) level = 'S';
  else if (avgScore >= 4.5) level = 'A';
  else if (avgScore >= 3) level = 'B';
  else if (avgScore >= 1.5) level = 'C';
  else level = 'D';
  
  return { level, avgScore: Math.round(avgScore * 100) / 100 };
}

// ===== メイン処理 =====

async function main() {
  console.log('=== ファインチューニング用データ収集 ===\n');
  
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  // 出力ディレクトリ作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  try {
    // 1. 対象レースを取得
    console.log('1. 対象レースを取得中...');
    
    const racesResult = await client.query(`
      SELECT DISTINCT 
        race_id, date, place, race_number, distance, track_type, track_condition,
        lap_time, winning_time
      FROM umadata
      WHERE race_id IS NOT NULL
        AND LENGTH(race_id) >= 8
        AND SUBSTRING(race_id, 1, 8)::INTEGER >= 20240101
        AND SUBSTRING(race_id, 1, 8)::INTEGER <= 20260115
        AND lap_time IS NOT NULL
        AND lap_time != ''
      ORDER BY race_id
    `);
    
    console.log(`   対象レース数: ${racesResult.rows.length}`);
    
    // 2. 各レースを分析
    console.log('\n2. 各レースを分析中...');
    
    const lapData = [];
    const timeData = [];
    const memberLevelData = [];
    const indexData = [];
    
    let processed = 0;
    
    for (const race of racesResult.rows) {
      const raceId = race.race_id;
      const surface = (race.track_type || '').includes('芝') ? '芝' : 'ダ';
      const distance = parseNumber(race.distance) || 0;
      const trackCondition = race.track_condition || '良';
      
      // このレースの全馬を取得
      const horsesResult = await client.query(`
        SELECT horse_name, umaban, finish_position, finish_time, margin,
               corner_4, passing_order, popularity, field_size
        FROM umadata
        WHERE race_id = $1
        ORDER BY umaban::INTEGER
      `, [raceId]);
      
      const horses = horsesResult.rows;
      if (horses.length < 5) continue;
      
      // ラップ分析
      const lapAnalysis = analyzeLapPattern(race.lap_time, surface, distance);
      const lapRating = calculateLapRating(lapAnalysis, surface, distance, trackCondition);
      
      // 時計分析
      const winningTime = parseNumber(race.winning_time);
      const timeRating = calculateTimeRating(winningTime, surface, distance, trackCondition);
      
      // メンバーレベル分析
      const memberLevel = await calculateMemberLevel(client, raceId, horses);
      
      // 各馬の次走成績を取得
      const horseResults = [];
      
      for (const horse of horses) {
        const horseName = (horse.horse_name || '').trim().replace(/^[\$\*]+/, '');
        if (!horseName) continue;
        
        const finishPos = parseFinishPosition(horse.finish_position);
        const popularity = parseNumber(horse.popularity);
        const corner4 = parseNumber(horse.corner_4);
        
        // 次走を取得（単勝配当も含む）
        const nextRaceResult = await client.query(`
          SELECT race_id, finish_position, popularity, class_name, win_odds, tansho_payout
          FROM umadata
          WHERE (TRIM(horse_name) = $1 OR REPLACE(REPLACE(horse_name, '*', ''), '$', '') = $1)
            AND SUBSTRING(race_id, 1, 8)::INTEGER > $2
          ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER ASC
          LIMIT 1
        `, [horseName, parseInt(raceId.substring(0, 8))]);
        
        let nextRace = null;
        if (nextRaceResult.rows.length > 0) {
          const next = nextRaceResult.rows[0];
          const nextFinish = parseFinishPosition(next.finish_position);
          const nextPop = parseNumber(next.popularity);
          
          // 単勝配当を取得（1着の場合のみ有効）
          let winPayout = 0;
          if (nextFinish === 1) {
            // tansho_payout または win_odds から配当を取得
            winPayout = parseNumber(next.tansho_payout) || 0;
            if (winPayout === 0 && next.win_odds) {
              // オッズから配当を概算（オッズ × 100）
              const odds = parseNumber(next.win_odds);
              if (odds) winPayout = Math.round(odds * 100);
            }
          }
          
          nextRace = {
            race_id: next.race_id,
            finish_position: nextFinish,
            popularity: nextPop,
            win_payout: winPayout,
            is_good_result: nextFinish <= 3,
            is_value_hit: nextFinish <= 3 && nextPop > 3,  // 4番人気以下で3着以内
          };
        }
        
        // 指数を取得
        const umabanPadded = String(horse.umaban || '').padStart(2, '0');
        const fullRaceId = `${raceId}${umabanPadded}`;
        
        const indicesResult = await client.query(`
          SELECT * FROM indices WHERE race_id = $1
        `, [fullRaceId]);
        
        const indices = indicesResult.rows[0] || null;
        
        // 不利判定
        const wasDisadvantaged = corner4 && corner4 > (horses.length * 0.6);  // 後方6割以上
        
        horseResults.push({
          horse_name: horseName,
          finish_position: finishPos,
          popularity,
          corner_4: corner4,
          was_disadvantaged: wasDisadvantaged,
          indices: indices ? {
            makikaeshi: indices.makikaeshi,
            potential: indices.potential,
            L4F: indices.L4F,
            T2F: indices.T2F,
          } : null,
          next_race: nextRace,
        });
        
        // 指数データを収集
        if (indices && nextRace) {
          indexData.push({
            horse_name: horseName,
            race_id: raceId,
            makikaeshi: indices.makikaeshi,
            potential: indices.potential,
            L4F: indices.L4F,
            T2F: indices.T2F,
            this_finish: finishPos,
            this_popularity: popularity,
            next_finish: nextRace.finish_position,
            next_popularity: nextRace.popularity,
            next_win_payout: nextRace.win_payout,
            next_is_good: nextRace.is_good_result,
            next_is_value: nextRace.is_value_hit,
          });
        }
      }
      
      // データを保存
      lapData.push({
        race_id: raceId,
        place: race.place,
        surface,
        distance,
        track_condition: trackCondition,
        lap_analysis: lapAnalysis,
        lap_rating: lapRating,
        horses: horseResults,
      });
      
      timeData.push({
        race_id: raceId,
        place: race.place,
        surface,
        distance,
        track_condition: trackCondition,
        winning_time: winningTime,
        time_rating: timeRating,
        horses: horseResults,
      });
      
      memberLevelData.push({
        race_id: raceId,
        member_level: memberLevel.level,
        avg_score: memberLevel.avgScore,
        horses: horseResults,
      });
      
      processed++;
      if (processed % 100 === 0) {
        console.log(`   処理済み: ${processed}/${racesResult.rows.length}レース`);
      }
    }
    
    // 3. 統計分析
    console.log('\n3. 統計分析を実行中...');
    
    // ラップパターンと次走成績の相関
    const lapPatternStats = analyzeLapPatternCorrelation(lapData);
    
    // メンバーレベルと次走成績の相関
    const memberLevelStats = analyzeMemberLevelCorrelation(memberLevelData);
    
    // 指数と次走成績の相関
    const indexStats = analyzeIndexCorrelation(indexData);
    
    // 4. 結果を保存
    console.log('\n4. 結果を保存中...');
    
    // 詳細データ
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'lap-data.json'),
      JSON.stringify(lapData.slice(0, 500), null, 2)  // サンプル500件
    );
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'member-level-data.json'),
      JSON.stringify(memberLevelData.slice(0, 500), null, 2)
    );
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'index-data.json'),
      JSON.stringify(indexData, null, 2)
    );
    
    // 統計結果
    const summary = {
      analyzedAt: new Date().toISOString(),
      totalRaces: processed,
      totalIndexRecords: indexData.length,
      lapPatternStats,
      memberLevelStats,
      indexStats,
    };
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'analysis-summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    // 5. 結果出力
    console.log('\n=== 分析結果 ===\n');
    
    console.log('【ラップパターンと次走成績（不利を受けた馬）】');
    console.log('パターン       | サンプル数 | 次走3着内率 | 次走Value率 | 単勝回収率');
    console.log('-'.repeat(75));
    for (const [pattern, stats] of Object.entries(lapPatternStats)) {
      if (stats.count < 10) continue;
      const roiStr = stats.roi.toFixed(1) + '%';
      const roiMark = stats.roi >= 100 ? ' ★' : stats.roi >= 80 ? ' ○' : '';
      console.log(
        `${pattern.padEnd(14)} | ${String(stats.count).padStart(10)} | ` +
        `${(stats.nextTop3Rate * 100).toFixed(1).padStart(10)}% | ` +
        `${(stats.nextValueRate * 100).toFixed(1).padStart(10)}% | ` +
        `${roiStr.padStart(10)}${roiMark}`
      );
    }
    
    console.log('\n【メンバーレベルと次走成績】');
    console.log('レベル | サンプル数 | 次走3着内率 | 次走Value率 | 単勝回収率');
    console.log('-'.repeat(65));
    for (const [level, stats] of Object.entries(memberLevelStats)) {
      if (stats.count < 10) continue;
      const roiStr = stats.roi.toFixed(1) + '%';
      const roiMark = stats.roi >= 100 ? ' ★' : stats.roi >= 80 ? ' ○' : '';
      console.log(
        `${level.padEnd(6)} | ${String(stats.count).padStart(10)} | ` +
        `${(stats.nextTop3Rate * 100).toFixed(1).padStart(10)}% | ` +
        `${(stats.nextValueRate * 100).toFixed(1).padStart(10)}% | ` +
        `${roiStr.padStart(10)}${roiMark}`
      );
    }
    
    console.log('\n【指数と次走成績の相関】');
    console.log('指数名         | サンプル数 | 相関係数 | 上位20% 3着内率 | 上位20% 回収率');
    console.log('-'.repeat(75));
    for (const [index, stats] of Object.entries(indexStats)) {
      if (stats.count < 50) continue;
      const roiStr = stats.topGroupROI.toFixed(1) + '%';
      const roiMark = stats.topGroupROI >= 100 ? ' ★' : stats.topGroupROI >= 80 ? ' ○' : '';
      console.log(
        `${index.padEnd(14)} | ${String(stats.count).padStart(10)} | ` +
        `${stats.correlation.toFixed(4).padStart(8)} | ` +
        `${(stats.topGroupRate * 100).toFixed(1).padStart(14)}% | ` +
        `${roiStr.padStart(13)}${roiMark}`
      );
    }
    
    // 閾値ごとの詳細
    console.log('\n【指数の閾値ごとの成績（期待値分析）】');
    for (const [index, stats] of Object.entries(indexStats)) {
      if (!stats.thresholds || stats.thresholds.length === 0) continue;
      console.log(`\n${index}:`);
      console.log('  範囲              | サンプル数 | 3着内率 | 回収率');
      console.log('  ' + '-'.repeat(55));
      for (const t of stats.thresholds) {
        const roiMark = parseFloat(t.roi) >= 100 ? ' ★期待値プラス' : parseFloat(t.roi) >= 80 ? ' ○' : '';
        console.log(
          `  ${t.range.padEnd(17)} | ${String(t.count).padStart(10)} | ` +
          `${t.top3Rate.padStart(7)} | ${t.roi.padStart(6)}${roiMark}`
        );
      }
    }
    
    // サマリー
    console.log('\n=== サマリー ===\n');
    console.log('【固軸候補パターン（好走率が高い）】');
    const highTop3Patterns = [];
    for (const [level, stats] of Object.entries(memberLevelStats)) {
      if (stats.nextTop3Rate >= 0.20) {
        highTop3Patterns.push({ name: `メンバーLv=${level}`, rate: stats.nextTop3Rate });
      }
    }
    for (const [index, stats] of Object.entries(indexStats)) {
      if (stats.topGroupRate >= 0.20) {
        highTop3Patterns.push({ name: `${index}上位20%`, rate: stats.topGroupRate });
      }
    }
    highTop3Patterns.sort((a, b) => b.rate - a.rate);
    for (const p of highTop3Patterns.slice(0, 5)) {
      console.log(`  - ${p.name}: 3着内率 ${(p.rate * 100).toFixed(1)}%`);
    }
    
    console.log('\n【期待値馬パターン（回収率が高い）】');
    const highROIPatterns = [];
    for (const [level, stats] of Object.entries(memberLevelStats)) {
      if (stats.roi >= 80) {
        highROIPatterns.push({ name: `メンバーLv=${level}`, roi: stats.roi });
      }
    }
    for (const [index, stats] of Object.entries(indexStats)) {
      if (stats.topGroupROI >= 80) {
        highROIPatterns.push({ name: `${index}上位20%`, roi: stats.topGroupROI });
      }
      // 閾値ごとのパターンも追加
      if (stats.thresholds) {
        for (const t of stats.thresholds) {
          const roi = parseFloat(t.roi);
          if (roi >= 100) {
            highROIPatterns.push({ name: `${index}=${t.range}`, roi });
          }
        }
      }
    }
    highROIPatterns.sort((a, b) => b.roi - a.roi);
    for (const p of highROIPatterns.slice(0, 5)) {
      const mark = p.roi >= 100 ? '★' : '○';
      console.log(`  ${mark} ${p.name}: 回収率 ${p.roi.toFixed(1)}%`);
    }
    
    console.log(`\n✅ 結果を保存: ${OUTPUT_DIR}`);
    
  } finally {
    await client.end();
  }
}

// ===== 分析関数 =====

/**
 * 回収率を計算
 * @param {Array} data - 各馬のデータ配列
 * @param {Function} filterFn - フィルタ関数
 * @returns {Object} { count, top3Count, top3Rate, winCount, winPayout, roi }
 */
function calculateROI(data, filterFn = () => true) {
  const filtered = data.filter(filterFn);
  
  let count = 0;
  let top3Count = 0;
  let winCount = 0;
  let winPayout = 0;
  
  for (const d of filtered) {
    if (!d.next_race) continue;
    
    count++;
    
    if (d.next_race.finish_position <= 3) {
      top3Count++;
    }
    
    if (d.next_race.finish_position === 1) {
      winCount++;
      // 単勝配当を加算（100円単位で格納されている前提）
      winPayout += d.next_race.win_payout || 0;
    }
  }
  
  return {
    count,
    top3Count,
    top3Rate: count > 0 ? (top3Count / count * 100).toFixed(1) + '%' : 'N/A',
    winCount,
    winPayout,
    roi: count > 0 ? ((winPayout / (count * 100)) * 100).toFixed(1) + '%' : 'N/A',
    roiValue: count > 0 ? (winPayout / (count * 100)) * 100 : 0,
  };
}

function analyzeLapPatternCorrelation(lapData) {
  const stats = {};
  
  for (const race of lapData) {
    const pattern = race.lap_analysis.pattern;
    if (!stats[pattern]) {
      stats[pattern] = { count: 0, nextTop3: 0, nextValue: 0, winPayout: 0 };
    }
    
    for (const horse of race.horses) {
      if (!horse.next_race) continue;
      
      // 不利を受けた馬の次走
      if (horse.was_disadvantaged) {
        stats[pattern].count++;
        if (horse.next_race.is_good_result) stats[pattern].nextTop3++;
        if (horse.next_race.is_value_hit) stats[pattern].nextValue++;
        if (horse.next_race.finish_position === 1) {
          stats[pattern].winPayout += horse.next_race.win_payout || 0;
        }
      }
    }
  }
  
  // 率を計算
  for (const pattern of Object.keys(stats)) {
    const s = stats[pattern];
    s.nextTop3Rate = s.count > 0 ? s.nextTop3 / s.count : 0;
    s.nextValueRate = s.count > 0 ? s.nextValue / s.count : 0;
    s.roi = s.count > 0 ? (s.winPayout / (s.count * 100)) * 100 : 0;
  }
  
  return stats;
}

function analyzeMemberLevelCorrelation(memberLevelData) {
  const stats = {};
  
  for (const race of memberLevelData) {
    const level = race.member_level;
    if (!stats[level]) {
      stats[level] = { count: 0, nextTop3: 0, nextValue: 0, winPayout: 0 };
    }
    
    for (const horse of race.horses) {
      if (!horse.next_race) continue;
      
      stats[level].count++;
      if (horse.next_race.is_good_result) stats[level].nextTop3++;
      if (horse.next_race.is_value_hit) stats[level].nextValue++;
      if (horse.next_race.finish_position === 1) {
        stats[level].winPayout += horse.next_race.win_payout || 0;
      }
    }
  }
  
  // 率を計算
  for (const level of Object.keys(stats)) {
    const s = stats[level];
    s.nextTop3Rate = s.count > 0 ? s.nextTop3 / s.count : 0;
    s.nextValueRate = s.count > 0 ? s.nextValue / s.count : 0;
    s.roi = s.count > 0 ? (s.winPayout / (s.count * 100)) * 100 : 0;
  }
  
  return stats;
}

function analyzeIndexCorrelation(indexData) {
  const indices = ['makikaeshi', 'potential', 'L4F', 'T2F'];
  const stats = {};
  
  for (const indexName of indices) {
    const validData = indexData.filter(d => d[indexName] !== null && d.next_finish < 99);
    if (validData.length < 50) {
      stats[indexName] = { correlation: 0, topGroupRate: 0, topGroupROI: 0, count: 0 };
      continue;
    }
    
    // 相関係数
    const x = validData.map(d => d[indexName]);
    const y = validData.map(d => d.next_finish);
    const correlation = calculateCorrelation(x, y);
    
    // 上位20%の次走成績
    const sorted = [...validData].sort((a, b) => {
      // L4F, T2Fは低いほうが良い
      if (indexName === 'L4F' || indexName === 'T2F') {
        return a[indexName] - b[indexName];
      }
      return b[indexName] - a[indexName];
    });
    
    const top20pct = sorted.slice(0, Math.floor(sorted.length * 0.2));
    const topGroupRate = top20pct.filter(d => d.next_is_good).length / top20pct.length;
    
    // 上位20%の回収率
    let topWinPayout = 0;
    for (const d of top20pct) {
      if (d.next_finish === 1) {
        topWinPayout += d.next_win_payout || 0;
      }
    }
    const topGroupROI = top20pct.length > 0 ? (topWinPayout / (top20pct.length * 100)) * 100 : 0;
    
    // 閾値ごとの分析
    const thresholds = analyzeIndexThresholds(validData, indexName);
    
    stats[indexName] = { 
      correlation, 
      topGroupRate, 
      topGroupROI,
      count: validData.length,
      thresholds,
    };
  }
  
  return stats;
}

/**
 * 指数の閾値ごとの成績を分析
 */
function analyzeIndexThresholds(data, indexName) {
  const isLowerBetter = indexName === 'L4F' || indexName === 'T2F';
  const thresholds = [];
  
  // 指数の範囲を取得
  const values = data.map(d => d[indexName]).sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  const step = (max - min) / 5;
  
  for (let i = 0; i < 5; i++) {
    const lower = min + step * i;
    const upper = min + step * (i + 1);
    
    const inRange = data.filter(d => d[indexName] >= lower && d[indexName] < upper);
    if (inRange.length < 10) continue;
    
    let winPayout = 0;
    let top3Count = 0;
    
    for (const d of inRange) {
      if (d.next_finish <= 3) top3Count++;
      if (d.next_finish === 1) {
        winPayout += d.next_win_payout || 0;
      }
    }
    
    thresholds.push({
      range: `${lower.toFixed(1)}〜${upper.toFixed(1)}`,
      count: inRange.length,
      top3Rate: (top3Count / inRange.length * 100).toFixed(1) + '%',
      roi: ((winPayout / (inRange.length * 100)) * 100).toFixed(1) + '%',
    });
  }
  
  return thresholds;
}

function calculateCorrelation(x, y) {
  const n = x.length;
  if (n === 0) return 0;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return 0;
  return numerator / denominator;
}

main().catch(console.error);
