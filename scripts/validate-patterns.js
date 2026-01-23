/**
 * 競馬教師パターン検証スクリプト
 * 
 * keiba-teacher-patterns.jsonに記載されたロジックが
 * 実際に好走に結びついているかをデータで検証する
 * 
 * 使い方:
 * set DATABASE_URL=postgresql://...
 * node scripts/validate-patterns.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL環境変数を設定してください');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'pattern-validation');

// ===== パターン定義 =====

const PATTERNS = {
  // 1. 位置取り改善パターン（後方→前方）
  positionImprovement: {
    name: '位置取り改善',
    description: '前走後方から今走前方に位置取りが改善した馬',
    detect: (current, prev) => {
      const prevCorner = parseCorner(prev.corner_4);
      const prevFieldSize = parseNumber(prev.field_size) || 16;
      const currCorner = parseCorner(current.corner_4);
      const currFieldSize = parseNumber(current.field_size) || 16;
      
      // 前走: 後方6割以上 → 今走: 前方4割以内
      const wasBehind = prevCorner && prevCorner > prevFieldSize * 0.6;
      const isNowFront = currCorner && currCorner <= currFieldSize * 0.4;
      
      return wasBehind && isNowFront;
    }
  },
  
  // 2. 上がり4位パターン
  agari4th: {
    name: '上がり4位',
    description: '上がり3位と変わらない脚を使っていた上がり4位の馬',
    detect: (current, prev, raceHorses) => {
      if (!raceHorses || raceHorses.length < 5) return false;
      
      const prevLast3f = parseNumber(prev.last_3f);
      if (!prevLast3f) return false;
      
      // 前走レースの上がり順位を計算
      const prevRaceHorses = raceHorses.filter(h => h.race_id === prev.race_id);
      const sorted = prevRaceHorses
        .filter(h => parseNumber(h.last_3f))
        .sort((a, b) => parseNumber(a.last_3f) - parseNumber(b.last_3f));
      
      const rank = sorted.findIndex(h => h.horse_name === prev.horse_name) + 1;
      return rank === 4;
    }
  },
  
  // 3. 4着馬パターン
  finish4th: {
    name: '前走4着',
    description: '前走4着だった馬（3着より過小評価されやすい）',
    detect: (current, prev) => {
      const prevFinish = parseFinishPosition(prev.finish_position);
      return prevFinish === 4;
    }
  },
  
  // 4. 下級条件連続2着（マイナスパターン）
  lowerClass2nd: {
    name: '下級条件連続2着',
    description: '下級条件で連続2着の馬（期待値が取りにくい）',
    detect: (current, prev, raceHorses, allPastRaces) => {
      // 下級条件かどうか
      const isLower = isLowerClass(prev.class_name);
      if (!isLower) return false;
      
      // 前走2着
      const prevFinish = parseFinishPosition(prev.finish_position);
      if (prevFinish !== 2) return false;
      
      // 前々走も2着かどうか
      if (!allPastRaces || allPastRaces.length < 2) return false;
      const prev2 = allPastRaces[1];
      const prev2Finish = parseFinishPosition(prev2.finish_position);
      
      return prev2Finish === 2;
    },
    isNegative: true  // マイナスパターン
  },
  
  // 5. 先行馬率30%未満（スロー濃厚）
  lowForwardRate: {
    name: '先行馬率30%未満',
    description: '先行馬が少ないレースで先行できた馬',
    detect: (current, prev, raceHorses) => {
      if (!raceHorses) return false;
      
      // 今走レースの先行馬率を計算
      const currRaceHorses = raceHorses.filter(h => h.race_id === current.race_id);
      if (currRaceHorses.length < 6) return false;
      
      let forwardCount = 0;
      for (const h of currRaceHorses) {
        const corner = parseCorner(h.corner_4);
        if (corner && corner <= 3) forwardCount++;
      }
      
      const forwardRate = forwardCount / currRaceHorses.length;
      
      // 自分が先行できた（3番手以内）かつ先行馬率30%未満
      const myCorner = parseCorner(current.corner_4);
      return forwardRate < 0.3 && myCorner && myCorner <= 3;
    }
  },
  
  // 6. 距離短縮で先行
  distanceShortening: {
    name: '距離短縮先行',
    description: '距離短縮で前走より前の位置取りができた馬',
    detect: (current, prev) => {
      const currDist = parseDistance(current.distance);
      const prevDist = parseDistance(prev.distance);
      
      if (!currDist || !prevDist) return false;
      
      // 距離短縮
      const isShortening = currDist < prevDist;
      if (!isShortening) return false;
      
      // 今走で先行できた（3番手以内）
      const currCorner = parseCorner(current.corner_4);
      const currFieldSize = parseNumber(current.field_size) || 16;
      
      // 前走で中団以降だった
      const prevCorner = parseCorner(prev.corner_4);
      const prevFieldSize = parseNumber(prev.field_size) || 16;
      
      const wasMiddleOrBack = prevCorner && prevCorner > prevFieldSize * 0.4;
      const isNowFront = currCorner && currCorner <= 3;
      
      return wasMiddleOrBack && isNowFront;
    }
  },
  
  // 7. 控え→先行（最も期待値が取れるパターン）
  holdToForward: {
    name: '控え→先行',
    description: '普段は前に行っていない馬が前に行けた',
    detect: (current, prev, raceHorses, allPastRaces) => {
      // 過去5走の平均通過順位を計算
      if (!allPastRaces || allPastRaces.length < 3) return false;
      
      let totalCorner = 0;
      let count = 0;
      for (const race of allPastRaces.slice(0, 5)) {
        const corner = parseCorner(race.corner_4);
        const fieldSize = parseNumber(race.field_size) || 16;
        if (corner) {
          totalCorner += corner / fieldSize;  // 相対位置
          count++;
        }
      }
      
      if (count < 3) return false;
      const avgPosition = totalCorner / count;  // 0=最前、1=最後方
      
      // 普段は中団以降（相対位置0.5以上）
      const usuallyMiddleOrBack = avgPosition >= 0.5;
      
      // 今走で先行できた（3番手以内）
      const currCorner = parseCorner(current.corner_4);
      const isNowFront = currCorner && currCorner <= 3;
      
      return usuallyMiddleOrBack && isNowFront;
    },
    importance: '最重要'
  },
  
  // 8. 巻き返し候補（大敗→位置取り改善）
  comebackCandidate: {
    name: '大敗からの巻き返し',
    description: '前走大敗だが位置取りは改善傾向にある馬',
    detect: (current, prev, raceHorses, allPastRaces) => {
      // 前走が大敗（着差2秒以上）
      const prevMargin = parseMargin(prev.margin);
      if (prevMargin < 2.0) return false;
      
      // 過去3走の通過順位の推移を見る
      if (!allPastRaces || allPastRaces.length < 3) return false;
      
      const corners = [];
      for (const race of allPastRaces.slice(0, 3)) {
        const corner = parseCorner(race.corner_4);
        const fieldSize = parseNumber(race.field_size) || 16;
        if (corner) {
          corners.push(corner / fieldSize);  // 相対位置
        }
      }
      
      if (corners.length < 3) return false;
      
      // 位置取りが改善傾向（最新が最も前）
      return corners[0] < corners[1] && corners[1] < corners[2];
    }
  }
};

// ===== メイン処理 =====

async function main() {
  console.log('=== 競馬教師パターン検証 ===\n');
  
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  try {
    // 1. データ取得
    console.log('1. データを取得中...');
    
    // カラム確認
    const columns = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'umadata'
    `);
    const umadataColumns = columns.rows.map(r => r.column_name);
    
    // 配当カラムの確認
    const hasTansho = umadataColumns.includes('tansho_payout');
    const hasWinOdds = umadataColumns.includes('win_odds');
    const payoutCol = hasTansho ? 'tansho_payout' : hasWinOdds ? 'win_odds' : 'NULL';
    console.log(`   配当カラム: ${payoutCol === 'NULL' ? 'なし' : payoutCol}`);
    
    // corner_4カラムの確認
    const corner4Col = umadataColumns.includes('corner_4_position') ? 'corner_4_position' :
                       umadataColumns.includes('corner_4') ? 'corner_4' : 'NULL';
    const fieldSizeCol = umadataColumns.includes('field_size') ? 'field_size' :
                         umadataColumns.includes('tosu') ? 'tosu' : 'NULL';
    const last3fCol = umadataColumns.includes('last_3f') ? 'last_3f' : 'NULL';
    
    console.log(`   4角位置: ${corner4Col}, 頭数: ${fieldSizeCol}, 上がり3F: ${last3fCol}`);
    
    const corner4Select = corner4Col === 'NULL' ? 'NULL as corner_4' : `${corner4Col} as corner_4`;
    const fieldSizeSelect = fieldSizeCol === 'NULL' ? 'NULL as field_size' : `${fieldSizeCol} as field_size`;
    const last3fSelect = last3fCol === 'NULL' ? 'NULL as last_3f' : `${last3fCol} as last_3f`;
    const payoutSelect = payoutCol === 'NULL' ? 'NULL as payout' : `${payoutCol} as payout`;
    
    const horsesQuery = `
      SELECT 
        race_id, horse_name, umaban, finish_position, margin,
        popularity, ${corner4Select}, ${fieldSizeSelect}, finish_time, ${last3fSelect},
        distance, class_name, place, track_condition, 
        win_odds, ${payoutSelect}
      FROM umadata
      WHERE race_id IS NOT NULL
        AND LENGTH(race_id) >= 8
      ORDER BY race_id, umaban::INTEGER
    `;
    
    const { rows: horses } = await client.query(horsesQuery);
    console.log(`   取得データ数: ${horses.length}`);
    
    // 2. 馬ごとにレースをグループ化
    console.log('\n2. 馬ごとにデータを整理中...');
    
    const horseRaces = new Map();
    const raceHorsesMap = new Map();
    
    for (const row of horses) {
      const name = (row.horse_name || '').trim().replace(/^[\$\*]+/, '');
      if (!name) continue;
      
      // 馬ごと
      if (!horseRaces.has(name)) {
        horseRaces.set(name, []);
      }
      horseRaces.get(name).push(row);
      
      // レースごと
      if (!raceHorsesMap.has(row.race_id)) {
        raceHorsesMap.set(row.race_id, []);
      }
      raceHorsesMap.get(row.race_id).push(row);
    }
    
    // 日付順にソート
    for (const [name, races] of horseRaces) {
      races.sort((a, b) => {
        const dateA = parseInt(a.race_id.substring(0, 8));
        const dateB = parseInt(b.race_id.substring(0, 8));
        return dateA - dateB;
      });
    }
    
    console.log(`   馬数: ${horseRaces.size}`);
    console.log(`   レース数: ${raceHorsesMap.size}`);
    
    // 3. パターン検証
    console.log('\n3. パターンを検証中...\n');
    
    const results = {};
    
    for (const [patternId, pattern] of Object.entries(PATTERNS)) {
      const detected = [];
      
      for (const [name, races] of horseRaces) {
        // 今走→次走のペアを作成
        for (let i = 0; i < races.length - 1; i++) {
          const current = races[i];
          const next = races[i + 1];
          const prev = i > 0 ? races[i - 1] : null;
          
          // パターン検出には「前走」が必要
          if (!prev) continue;
          
          const raceHorses = raceHorsesMap.get(current.race_id);
          const allPastRaces = races.slice(0, i + 1).reverse();  // 今走から過去へ
          
          try {
            if (pattern.detect(current, prev, raceHorses, allPastRaces)) {
              const nextFinish = parseFinishPosition(next.finish_position);
              const nextPop = parseNumber(next.popularity);
              // 次走で1着の場合の配当を計算
              // win_oddsを使用（オッズ × 100 = 配当）
              let nextPayout = 0;
              if (nextFinish === 1) {
                const odds = parseNumber(next.win_odds);
                if (odds && odds > 0) {
                  nextPayout = Math.round(odds * 100);  // 2.5倍 → 250円
                }
              }
              
              detected.push({
                horse_name: name,
                race_id: current.race_id,
                race_date: current.race_id.substring(0, 8),
                current_finish: parseFinishPosition(current.finish_position),
                next_race_id: next.race_id,
                next_finish: nextFinish,
                next_popularity: nextPop,
                next_payout: nextPayout,
                next_is_top3: nextFinish <= 3,
                next_is_win: nextFinish === 1,
              });
            }
          } catch (e) {
            // 検出エラーはスキップ
          }
        }
      }
      
      // 統計計算
      const validData = detected.filter(d => d.next_finish < 99);
      let top3Count = 0;
      let winCount = 0;
      let winPayout = 0;
      
      for (const d of validData) {
        if (d.next_is_top3) top3Count++;
        if (d.next_is_win) {
          winCount++;
          winPayout += d.next_payout || 0;
        }
      }
      
      const stats = {
        count: validData.length,
        top3Rate: validData.length > 0 ? (top3Count / validData.length) * 100 : 0,
        winRate: validData.length > 0 ? (winCount / validData.length) * 100 : 0,
        roi: validData.length > 0 ? (winPayout / (validData.length * 100)) * 100 : 0,
      };
      
      results[patternId] = {
        pattern: pattern.name,
        description: pattern.description,
        importance: pattern.importance || '',
        isNegative: pattern.isNegative || false,
        stats,
        samples: detected.slice(0, 20),  // サンプル20件
      };
      
      // 結果表示
      const mark = stats.roi >= 100 ? ' ★★★' : 
                   stats.roi >= 80 ? ' ★★' : 
                   stats.roi >= 60 ? ' ★' : '';
      const negMark = pattern.isNegative ? ' [マイナス]' : '';
      
      console.log(`【${pattern.name}】${negMark}${mark}`);
      console.log(`   ${pattern.description}`);
      console.log(`   検出数: ${stats.count}件 | 1着率: ${stats.winRate.toFixed(1)}% | 3着内率: ${stats.top3Rate.toFixed(1)}% | 単勝回収率: ${stats.roi.toFixed(1)}%`);
      console.log('');
    }
    
    // 4. 結果を保存
    console.log('\n4. 結果を保存中...');
    
    // JSON
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'pattern-validation-results.json'),
      JSON.stringify(results, null, 2)
    );
    console.log('   ✅ pattern-validation-results.json');
    
    // サマリーCSV
    let csvContent = 'pattern_id,pattern_name,description,is_negative,count,first_rate,top3_rate,roi\n';
    for (const [patternId, result] of Object.entries(results)) {
      csvContent += `${patternId},"${result.pattern}","${result.description}",${result.isNegative},`;
      csvContent += `${result.stats.count},${result.stats.winRate.toFixed(1)},`;
      csvContent += `${result.stats.top3Rate.toFixed(1)},${result.stats.roi.toFixed(1)}\n`;
    }
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'pattern-summary.csv'),
      csvContent
    );
    console.log('   ✅ pattern-summary.csv');
    
    // ファインチューニング用JSONL
    let jsonlContent = '';
    for (const [patternId, result] of Object.entries(results)) {
      for (const sample of result.samples) {
        const entry = {
          pattern: patternId,
          pattern_name: result.pattern,
          is_negative: result.isNegative,
          horse_name: sample.horse_name,
          race_date: sample.race_date,
          current_finish: sample.current_finish,
          next_finish: sample.next_finish,
          next_popularity: sample.next_popularity,
          next_is_top3: sample.next_is_top3,
          label: sample.next_is_top3 ? 'good' : 'bad',
        };
        jsonlContent += JSON.stringify(entry) + '\n';
      }
    }
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'pattern-training.jsonl'),
      jsonlContent
    );
    console.log('   ✅ pattern-training.jsonl');
    
    // 5. 有効パターンのランキング
    console.log('\n=== 有効パターンランキング ===');
    console.log('（回収率順）\n');
    
    const sorted = Object.entries(results)
      .filter(([_, r]) => !r.isNegative && r.stats.count >= 100)
      .sort((a, b) => b[1].stats.roi - a[1].stats.roi);
    
    for (let i = 0; i < sorted.length; i++) {
      const [_, result] = sorted[i];
      const roiMark = result.stats.roi >= 100 ? '🔥' : result.stats.roi >= 80 ? '✅' : '';
      console.log(`${i + 1}. ${result.pattern} ${roiMark}`);
      console.log(`   検出数: ${result.stats.count} | 1着率: ${result.stats.winRate.toFixed(1)}% | 3着内率: ${result.stats.top3Rate.toFixed(1)}% | 単勝回収率: ${result.stats.roi.toFixed(1)}%`);
    }
    
    console.log(`\n=== 完了 ===`);
    console.log(`出力先: ${OUTPUT_DIR}`);
    
  } finally {
    await client.end();
  }
}

// ===== ユーティリティ関数 =====

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(String(val).replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
  return isNaN(num) ? null : num;
}

function parseFinishPosition(val) {
  if (!val) return 99;
  const str = String(val).replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).trim();
  if (/除|中止|失格|取消/.test(str)) return 99;
  const num = parseInt(str, 10);
  return isNaN(num) ? 99 : num;
}

function parseCorner(val) {
  if (!val) return null;
  const str = String(val).replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).trim();
  // "12-10-8-5" のような形式の場合、最後の値（4角）を取得
  const parts = str.split(/[-,]/);
  const last = parts[parts.length - 1];
  const num = parseInt(last, 10);
  return isNaN(num) ? null : num;
}

function parseDistance(val) {
  if (!val) return null;
  const str = String(val);
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function parseMargin(val) {
  if (!val) return 0;
  const str = String(val).trim();
  if (str === '' || str === '0') return 0;
  if (str === 'ハナ' || str === 'アタマ') return 0.1;
  if (str === 'クビ') return 0.2;
  if (str.includes('/')) {
    const [num, den] = str.split('/').map(Number);
    return (num / den) * 0.2;  // 1/2馬身 = 0.1秒
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num * 0.2;  // 馬身→秒に変換
}

function isLowerClass(className) {
  if (!className) return false;
  const lower = className.toLowerCase();
  return lower.includes('未勝利') || 
         lower.includes('新馬') || 
         lower.includes('1勝') ||
         lower.includes('500万') ||
         lower.includes('2勝') ||
         lower.includes('1000万');
}

main().catch(console.error);
