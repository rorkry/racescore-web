/**
 * スコア要素と着順の相関分析スクリプト
 * 
 * 目的:
 * - 過去レースで各馬のスコア内訳を計算
 * - 実際の着順との相関を分析
 * - どの要素が着順予測に有効かを学習
 * 
 * 使い方:
 * node scripts/analyze-score-correlation.js
 */

const { Client } = require('pg');

// データベース接続
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/keiba';

// ===== スコア計算ロジック（getClusterData.tsの簡易版） =====

function toHalfWidth(str) {
  if (!str) return '';
  return String(str).replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(toHalfWidth(String(val)));
  return isNaN(num) ? null : num;
}

function GET(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return String(row[key]);
    }
  }
  return '';
}

function parseFinishPosition(val) {
  if (!val) return 99;
  const str = toHalfWidth(String(val)).trim();
  if (/除|中止|失格|取消/.test(str)) return 99;
  const num = parseInt(str, 10);
  return isNaN(num) ? 99 : num;
}

function getPassingPosition(race) {
  // corner4, corner_4, corner_4_position を優先
  const corner4Str = GET(race, 'corner4', 'corner_4', 'corner_4_position');
  if (corner4Str) {
    const pos = parseInt(toHalfWidth(corner4Str), 10);
    if (!isNaN(pos) && pos > 0 && pos < 30) return pos;
  }
  
  // 通過順位から4角を抽出
  const passingOrder = GET(race, 'passing_order', '通過順位');
  if (passingOrder) {
    const parts = passingOrder.split(/[-－ー]/);
    if (parts.length >= 4) {
      const pos = parseInt(toHalfWidth(parts[3]), 10);
      if (!isNaN(pos) && pos > 0 && pos < 30) return pos;
    }
    if (parts.length >= 1) {
      const pos = parseInt(toHalfWidth(parts[parts.length - 1]), 10);
      if (!isNaN(pos) && pos > 0 && pos < 30) return pos;
    }
  }
  
  return 99;
}

/**
 * 1頭分のスコア内訳を計算
 */
function calculateScoreBreakdown(pastRaces, indices) {
  const breakdown = {
    comebackScore: 0,
    potentialScore: 0,
    finishScore: 0,
    marginScore: 0,
    positionImprovementScore: 0,
    paceSyncScore: 0,
    courseFitScore: 0,
    penaltyScore: 0,
    totalScore: 0,
    // 元データ
    makikaeshi: null,
    potential: null,
    lastFinish: null,
    lastMargin: null,
    lastPosition: null,
    avgPastPosition: null,
  };
  
  if (!pastRaces || pastRaces.length === 0) {
    return breakdown;
  }
  
  // 巻き返し指数
  if (indices && indices.makikaeshi !== null && indices.makikaeshi !== undefined) {
    const maki = parseNumber(indices.makikaeshi) || 0;
    breakdown.makikaeshi = maki;
    // 最大10 → 35点
    breakdown.comebackScore = Math.min(35, (maki / 10) * 35);
  }
  
  // ポテンシャル指数
  if (indices && indices.potential !== null && indices.potential !== undefined) {
    const pot = parseNumber(indices.potential) || 0;
    breakdown.potential = pot;
    // 最大10 → 15点
    breakdown.potentialScore = Math.min(15, (pot / 10) * 15);
  }
  
  // 前走着順
  const lastRace = pastRaces[0];
  if (lastRace) {
    const finish = parseFinishPosition(GET(lastRace, 'finish_position', 'finish', '着順'));
    breakdown.lastFinish = finish;
    
    if (finish <= 3) {
      breakdown.finishScore = 8;
    } else if (finish <= 5) {
      breakdown.finishScore = 5;
    } else if (finish <= 8) {
      breakdown.finishScore = 2;
    }
    
    // 着差
    const marginStr = GET(lastRace, 'margin', '着差', 'finish_margin');
    const marginMatch = marginStr.match(/([\d.]+)/);
    if (marginMatch) {
      const margin = parseFloat(marginMatch[1]);
      breakdown.lastMargin = margin;
      if (margin <= 0.2) {
        breakdown.marginScore = 8;
      } else if (margin <= 0.5) {
        breakdown.marginScore = 5;
      } else if (margin <= 1.0) {
        breakdown.marginScore = 3;
      }
    }
    
    // 通過順位
    breakdown.lastPosition = getPassingPosition(lastRace);
  }
  
  // 過去走の平均通過順位
  if (pastRaces.length >= 2) {
    let sum = 0;
    let count = 0;
    for (let i = 1; i < pastRaces.length; i++) {
      const pos = getPassingPosition(pastRaces[i]);
      if (pos < 99) {
        sum += pos;
        count++;
      }
    }
    if (count > 0) {
      breakdown.avgPastPosition = sum / count;
    }
  }
  
  // 位置取り改善
  if (breakdown.avgPastPosition && breakdown.lastPosition < 99) {
    const fieldSize = parseNumber(GET(lastRace, 'field_size', 'tosu', '頭数')) || 16;
    const wasBackRunner = breakdown.avgPastPosition > fieldSize * 0.5;
    const movedForward = breakdown.lastPosition <= 5;
    const improvement = breakdown.avgPastPosition - breakdown.lastPosition;
    
    if (wasBackRunner && movedForward && improvement >= 3) {
      breakdown.positionImprovementScore = Math.min(8, improvement * 1.2);
    } else if (wasBackRunner && improvement >= 2) {
      breakdown.positionImprovementScore = 3;
    } else if (wasBackRunner && improvement >= 1) {
      breakdown.positionImprovementScore = 1;
    }
  }
  
  // 下級条件連続2着
  if (pastRaces.length >= 2) {
    const fin1 = parseFinishPosition(GET(pastRaces[0], 'finish_position', 'finish', '着順'));
    const fin2 = parseFinishPosition(GET(pastRaces[1], 'finish_position', 'finish', '着順'));
    const class1 = GET(pastRaces[0], 'class_name', 'クラス名').toLowerCase();
    const class2 = GET(pastRaces[1], 'class_name', 'クラス名').toLowerCase();
    
    const isLower = (cls) => /未勝利|1勝|新馬|c3|c2|d3|d2/.test(cls);
    
    if (fin1 === 2 && fin2 === 2 && isLower(class1) && isLower(class2)) {
      breakdown.penaltyScore = -4;
    }
  }
  
  // 合計
  breakdown.totalScore = 
    breakdown.comebackScore +
    breakdown.potentialScore +
    breakdown.finishScore +
    breakdown.marginScore +
    breakdown.positionImprovementScore +
    breakdown.paceSyncScore +
    breakdown.courseFitScore +
    breakdown.penaltyScore;
  
  return breakdown;
}

// ===== メイン処理 =====

async function main() {
  console.log('=== スコア要素と着順の相関分析 ===\n');
  
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  try {
    // 1. 分析対象のレースを取得（過去6ヶ月のレース）
    console.log('1. 分析対象レースを取得中...');
    
    const racesResult = await client.query(`
      SELECT DISTINCT race_id, date, place, race_number, distance, track_type
      FROM umadata
      WHERE race_id IS NOT NULL
        AND LENGTH(race_id) >= 8
        AND SUBSTRING(race_id, 1, 8)::INTEGER >= 20240701
        AND SUBSTRING(race_id, 1, 8)::INTEGER <= 20260123
      ORDER BY race_id DESC
      LIMIT 1000
    `);
    
    console.log(`   対象レース数: ${racesResult.rows.length}`);
    
    // 2. 各レースの馬を取得し、スコアと着順を計算
    console.log('\n2. 各馬のスコアと着順を計算中...');
    
    const analysisData = [];
    let processedRaces = 0;
    
    for (const race of racesResult.rows) {
      const raceId = race.race_id;
      
      // このレースの全馬を取得
      const horsesResult = await client.query(`
        SELECT horse_name, umaban, finish_position, margin, 
               corner_4, field_size, class_name, popularity
        FROM umadata
        WHERE race_id = $1
        ORDER BY umaban::INTEGER
      `, [raceId]);
      
      for (const horse of horsesResult.rows) {
        const horseName = (horse.horse_name || '').trim().replace(/^[\$\*]+/, '');
        if (!horseName) continue;
        
        // この馬の過去走を取得（このレースより前）
        const pastResult = await client.query(`
          SELECT * FROM umadata
          WHERE (TRIM(horse_name) = $1 OR REPLACE(REPLACE(horse_name, '*', ''), '$', '') = $1)
            AND SUBSTRING(race_id, 1, 8)::INTEGER < $2
          ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
          LIMIT 5
        `, [horseName, parseInt(raceId.substring(0, 8))]);
        
        if (pastResult.rows.length === 0) continue;
        
        // 指数を取得
        const lastPastRace = pastResult.rows[0];
        const lastRaceId = lastPastRace.race_id;
        const lastUmaban = String(lastPastRace.umaban || '').padStart(2, '0');
        const fullRaceId = `${lastRaceId}${lastUmaban}`;
        
        const indicesResult = await client.query(`
          SELECT * FROM indices WHERE race_id = $1
        `, [fullRaceId]);
        
        const indices = indicesResult.rows[0] || null;
        
        // スコア内訳を計算
        const breakdown = calculateScoreBreakdown(pastResult.rows, indices);
        
        // 実際の着順
        const actualFinish = parseFinishPosition(horse.finish_position);
        const popularity = parseNumber(horse.popularity);
        
        if (actualFinish >= 99) continue;
        
        analysisData.push({
          raceId,
          horseName,
          actualFinish,
          popularity,
          ...breakdown,
        });
      }
      
      processedRaces++;
      if (processedRaces % 100 === 0) {
        console.log(`   処理済み: ${processedRaces}/${racesResult.rows.length}レース`);
      }
    }
    
    console.log(`\n   分析データ数: ${analysisData.length}頭`);
    
    // 3. 相関分析
    console.log('\n3. 相関分析を実行中...');
    
    // 各要素と着順の相関を計算
    const elements = [
      { key: 'comebackScore', name: '巻き返し指数' },
      { key: 'potentialScore', name: 'ポテンシャル指数' },
      { key: 'finishScore', name: '前走着順' },
      { key: 'marginScore', name: '前走着差' },
      { key: 'positionImprovementScore', name: '位置取り改善' },
      { key: 'totalScore', name: '合計スコア' },
    ];
    
    const correlations = [];
    
    for (const elem of elements) {
      // スコアが0より大きいデータのみ対象
      const validData = analysisData.filter(d => d[elem.key] > 0);
      
      if (validData.length < 50) {
        correlations.push({ ...elem, correlation: null, sampleSize: validData.length });
        continue;
      }
      
      // 相関係数を計算（スコアが高い → 着順が良い（小さい）= 負の相関）
      const scores = validData.map(d => d[elem.key]);
      const finishes = validData.map(d => d.actualFinish);
      
      const correlation = calculateCorrelation(scores, finishes);
      
      // 上位/下位グループの成績比較
      const sortedByScore = [...validData].sort((a, b) => b[elem.key] - a[elem.key]);
      const top20pct = sortedByScore.slice(0, Math.floor(sortedByScore.length * 0.2));
      const bottom20pct = sortedByScore.slice(-Math.floor(sortedByScore.length * 0.2));
      
      const avgFinishTop = top20pct.reduce((s, d) => s + d.actualFinish, 0) / top20pct.length;
      const avgFinishBottom = bottom20pct.reduce((s, d) => s + d.actualFinish, 0) / bottom20pct.length;
      
      // 3着内率
      const top3RateTop = top20pct.filter(d => d.actualFinish <= 3).length / top20pct.length;
      const top3RateBottom = bottom20pct.filter(d => d.actualFinish <= 3).length / bottom20pct.length;
      
      correlations.push({
        ...elem,
        correlation: correlation.toFixed(4),
        sampleSize: validData.length,
        avgFinishTop: avgFinishTop.toFixed(2),
        avgFinishBottom: avgFinishBottom.toFixed(2),
        top3RateTop: (top3RateTop * 100).toFixed(1) + '%',
        top3RateBottom: (top3RateBottom * 100).toFixed(1) + '%',
      });
    }
    
    // 4. 結果出力
    console.log('\n=== 分析結果 ===\n');
    console.log('要素名                 | 相関係数 | サンプル数 | 上位20%平均着 | 下位20%平均着 | 上位3着内率 | 下位3着内率');
    console.log('-'.repeat(110));
    
    for (const c of correlations) {
      if (c.correlation === null) {
        console.log(`${c.name.padEnd(20)} | N/A      | ${String(c.sampleSize).padStart(8)} | -             | -             | -           | -`);
      } else {
        console.log(
          `${c.name.padEnd(20)} | ${c.correlation.padStart(8)} | ${String(c.sampleSize).padStart(8)} | ` +
          `${c.avgFinishTop.padStart(13)} | ${c.avgFinishBottom.padStart(13)} | ` +
          `${c.top3RateTop.padStart(11)} | ${c.top3RateBottom.padStart(11)}`
        );
      }
    }
    
    // 5. 推奨重み付け
    console.log('\n=== 推奨重み付け ===\n');
    
    const validCorrelations = correlations.filter(c => c.correlation !== null && c.key !== 'totalScore');
    const sortedByCorrelation = validCorrelations.sort((a, b) => parseFloat(a.correlation) - parseFloat(b.correlation));
    
    console.log('相関が強い順（負の相関が大きいほど着順予測に有効）:\n');
    for (let i = 0; i < sortedByCorrelation.length; i++) {
      const c = sortedByCorrelation[i];
      const effectiveness = parseFloat(c.correlation) < -0.1 ? '★★★ 非常に有効' :
                           parseFloat(c.correlation) < -0.05 ? '★★ 有効' :
                           parseFloat(c.correlation) < 0 ? '★ やや有効' : '要検討';
      console.log(`${i + 1}. ${c.name}: 相関=${c.correlation} → ${effectiveness}`);
    }
    
    // 6. 結果をJSONで保存
    const outputPath = 'C:\\競馬データ\\racescore-web\\data\\score-correlation-analysis.json';
    const fs = require('fs');
    fs.writeFileSync(outputPath, JSON.stringify({
      analyzedAt: new Date().toISOString(),
      sampleSize: analysisData.length,
      correlations,
      rawData: analysisData.slice(0, 100), // サンプルのみ保存
    }, null, 2));
    
    console.log(`\n✅ 分析結果を保存: ${outputPath}`);
    
  } finally {
    await client.end();
  }
}

/**
 * 相関係数を計算
 */
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
