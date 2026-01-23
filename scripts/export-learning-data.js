/**
 * 機械学習用データエクスポートスクリプト
 * 
 * 出力:
 * - レースごとのラップ、時計、メンバーレベル
 * - 各馬の指数と次走成績
 * - 好走率、回収率の計算に必要なすべてのデータ
 * 
 * 使い方:
 * set DATABASE_URL=postgresql://...
 * node scripts/export-learning-data.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL環境変数を設定してください');
  console.error('例: set DATABASE_URL=postgresql://postgres:password@host:5432/railway');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'learning-data');

async function main() {
  console.log('=== 機械学習用データエクスポート ===\n');
  
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  // 出力ディレクトリ作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  try {
    // 1. DBスキーマ確認
    console.log('1. DBスキーマを確認中...');
    
    const columns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'umadata'
    `);
    const umadataColumns = columns.rows.map(r => r.column_name);
    console.log(`   umadataカラム数: ${umadataColumns.length}`);
    
    // 実際に存在するカラムを確認（check-columns.jsの結果に基づく）
    // umadata: race_id, date, place, distance, class_name, umaban, horse_name,
    //          finish_position, margin, popularity, win_odds, corner_1-4,
    //          field_size, finish_time, last_3f, jockey, trainer, sire, dam,
    //          lap_time, pci, rpci, pci3, track_condition
    // indices: L4F, T2F, potential, makikaeshi, revouma, cushion
    
    console.log(`   カラム確認完了`);
    
    // 2. 全レースデータを取得
    console.log('\n2. レースデータを取得中...');
    
    // レース単位のデータを取得（馬ごとのデータは含めない）
    const racesQuery = `
      SELECT DISTINCT ON (race_id)
        race_id,
        date,
        place,
        distance,
        track_condition,
        lap_time
      FROM umadata
      WHERE race_id IS NOT NULL
        AND LENGTH(race_id) >= 8
        AND lap_time IS NOT NULL
        AND lap_time != ''
      ORDER BY race_id
    `;
    
    const races = await client.query(racesQuery);
    console.log(`   取得レース数: ${races.rows.length}`);
    
    // 3. 各馬のデータを取得（指数含む）
    console.log('\n3. 各馬のデータを取得中...');
    
    const horsesQuery = `
      SELECT 
        u.race_id,
        u.horse_name,
        u.umaban,
        u.finish_position,
        u.margin,
        u.popularity,
        u.corner_1,
        u.corner_2,
        u.corner_3,
        u.corner_4,
        u.field_size,
        u.finish_time,
        u.last_3f,
        u.win_odds,
        u.jockey,
        u.trainer,
        u.sire,
        u.class_name,
        u.pci,
        i.makikaeshi,
        i.potential,
        i."L4F",
        i."T2F"
      FROM umadata u
      LEFT JOIN indices i ON (u.race_id || LPAD(u.umaban::text, 2, '0')) = i.race_id
      WHERE u.race_id IS NOT NULL
        AND LENGTH(u.race_id) >= 8
      ORDER BY u.race_id, u.umaban::INTEGER
    `;
    
    const horses = await client.query(horsesQuery);
    console.log(`   取得馬データ数: ${horses.rows.length}`);
    
    // 4. 次走データを追加
    console.log('\n4. 次走データを計算中...');
    
    // 馬名ごとにレースをソート
    const horseRaces = new Map();
    for (const row of horses.rows) {
      const name = (row.horse_name || '').trim().replace(/^[\$\*]+/, '');
      if (!name) continue;
      
      if (!horseRaces.has(name)) {
        horseRaces.set(name, []);
      }
      horseRaces.get(name).push(row);
    }
    
    // 各馬のレースを日付順にソート
    for (const [name, races] of horseRaces) {
      races.sort((a, b) => {
        const dateA = parseInt(a.race_id.substring(0, 8));
        const dateB = parseInt(b.race_id.substring(0, 8));
        return dateA - dateB;
      });
    }
    
    // 次走データを付加
    const learningData = [];
    let processedCount = 0;
    
    for (const [name, races] of horseRaces) {
      for (let i = 0; i < races.length - 1; i++) {
        const current = races[i];
        const next = races[i + 1];
        
        const currentFinish = parseFinishPosition(current.finish_position);
        const nextFinish = parseFinishPosition(next.finish_position);
        const nextPop = parseNumber(next.popularity);
        
        // 日付を抽出（race_idの最初の8桁）
        const raceDate = current.race_id.substring(0, 8);
        
        // オッズから配当を計算（次走1着時）
        let nextPayout = 0;
        if (nextFinish === 1) {
          const nextOdds = parseNumber(next.win_odds);
          if (nextOdds && nextOdds > 0) {
            nextPayout = Math.round(nextOdds * 100);  // 2.5倍 → 250円
          }
        }
        
        learningData.push({
          // レース情報
          race_id: current.race_id,
          race_date: raceDate,                              // 日付 YYYYMMDD
          horse_name: name,
          umaban: current.umaban,
          
          // 基本成績
          finish_position: currentFinish,                   // 着順
          margin: current.margin,                           // 着差
          popularity: parseNumber(current.popularity),      // 人気
          corner_4: parseNumber(current.corner_4),          // 4角位置
          field_size: parseNumber(current.field_size),      // 頭数
          finish_time: current.finish_time,                 // 走破タイム
          last_3f: current.last_3f,                         // 上がり3F
          
          // 追加データ
          jockey: current.jockey,                           // 騎手
          trainer: current.trainer,                         // 調教師
          sire: current.sire,                               // 種牡馬
          class_name: current.class_name,                   // クラス
          win_odds: parseNumber(current.win_odds),          // 単勝オッズ
          pci: parseNumber(current.pci),                    // PCI（ペース指数）
          
          // 指数（indicesテーブル）
          makikaeshi: parseNumber(current.makikaeshi),      // 巻き返し指数
          potential: parseNumber(current.potential),        // ポテンシャル指数
          L4F: parseNumber(current.L4F),                    // L4F
          T2F: parseNumber(current.T2F),                    // T2F
          
          // 次走情報（学習対象）
          next_race_id: next.race_id,
          next_finish: nextFinish,                          // 次走着順
          next_popularity: nextPop,                         // 次走人気
          next_payout: nextPayout,                          // 次走単勝配当（1着時）
          next_win_odds: parseNumber(next.win_odds),        // 次走オッズ
        });
        
        processedCount++;
      }
    }
    
    console.log(`   学習データ数: ${learningData.length}`);
    
    // 5. レースレベルを計算して追加
    console.log('\n5. レースレベルを計算中...');
    
    const raceDataMap = new Map();
    for (const race of races.rows) {
      raceDataMap.set(race.race_id, race);
    }
    
    // 各レースのメンバーレベルを計算
    const raceHorsesMap = new Map();
    for (const data of learningData) {
      if (!raceHorsesMap.has(data.race_id)) {
        raceHorsesMap.set(data.race_id, []);
      }
      raceHorsesMap.get(data.race_id).push(data);
    }
    
    // レースレベル（前走成績の平均から算出）
    for (const [raceId, horses] of raceHorsesMap) {
      const validHorses = horses.filter(h => h.finish_position < 99);
      if (validHorses.length === 0) continue;
      
      // 前走成績をスコア化
      let totalScore = 0;
      for (const h of validHorses) {
        if (h.finish_position === 1) totalScore += 10;
        else if (h.finish_position === 2) totalScore += 7;
        else if (h.finish_position === 3) totalScore += 5;
        else if (h.finish_position <= 5) totalScore += 3;
        else totalScore += 1;
      }
      const avgScore = totalScore / validHorses.length;
      
      let memberLevel;
      if (avgScore >= 6) memberLevel = 'S';
      else if (avgScore >= 4.5) memberLevel = 'A';
      else if (avgScore >= 3) memberLevel = 'B';
      else if (avgScore >= 1.5) memberLevel = 'C';
      else memberLevel = 'D';
      
      // レースデータにレベルを追加
      for (const h of horses) {
        h.member_level = memberLevel;
        h.member_score = avgScore;
      }
    }
    
    // 6. ラップ情報を追加＋ラップパターン分析
    console.log('\n6. ラップ情報・ラップパターンを追加中...');
    
    // 同条件のレース時計を集計（時計評価用）
    const finishTimesByCondition = new Map();  // 条件 → [finish_time, ...]
    
    for (const data of learningData) {
      const race = raceDataMap.get(data.race_id);
      if (race) {
        data.lap_time = race.lap_time;                      // レースラップ
        
        // distanceから芝/ダートと距離を抽出（"芝1800" → "芝", 1800）
        const distanceStr = race.distance || '';
        data.surface = distanceStr.includes('芝') ? '芝' : distanceStr.includes('ダ') ? 'ダ' : '';
        const distMatch = distanceStr.match(/\d+/);
        data.distance = distMatch ? parseInt(distMatch[0], 10) : null;
        
        data.track_condition = race.track_condition;        // 馬場状態
        data.place = race.place;                            // 開催場
        
        // ===== ラップパターン分析 =====
        const lapAnalysis = analyzeLapPattern(race.lap_time);
        data.lap_pattern = lapAnalysis.pattern;             // 加速/非減速/減速/不明
        data.is_acceleration = lapAnalysis.isAcceleration;  // 加速ラップフラグ
        data.is_non_decel = lapAnalysis.isNonDecel;         // 非減速ラップフラグ
        data.is_reverse = lapAnalysis.isReverse;            // 逆行（ハイペース＋非減速）
        data.last_3f_lap = lapAnalysis.last3f;              // ラップ後半3F
        data.first_3f_lap = lapAnalysis.first3f;            // ラップ前半3F
        data.pace_type = lapAnalysis.paceType;              // ハイ/ミドル/スロー
        
        // 時計評価用に集計（1着馬のみ）
        if (data.finish_position === 1 && data.finish_time && data.distance) {
          const condKey = `${data.place}_${data.surface}_${data.distance}_${data.track_condition || '良'}`;
          if (!finishTimesByCondition.has(condKey)) {
            finishTimesByCondition.set(condKey, []);
          }
          const timeSeconds = parseTimeToSeconds(data.finish_time);
          if (timeSeconds) {
            finishTimesByCondition.get(condKey).push({
              time: timeSeconds,
              raceId: data.race_id,
            });
          }
        }
      }
    }
    
    // ===== 時計評価（同条件での出現率） =====
    console.log('   時計評価を計算中...');
    
    // 各条件の時計をソート
    for (const [condKey, times] of finishTimesByCondition) {
      times.sort((a, b) => a.time - b.time);  // 速い順
    }
    
    // 各馬の時計評価を付与
    let highLevelTimeCount = 0;
    for (const data of learningData) {
      if (!data.finish_position || !data.finish_time || !data.distance) continue;
      
      const condKey = `${data.place}_${data.surface}_${data.distance}_${data.track_condition || '良'}`;
      const condTimes = finishTimesByCondition.get(condKey);
      
      if (condTimes && condTimes.length >= 10) {
        const timeSeconds = parseTimeToSeconds(data.finish_time);
        if (timeSeconds) {
          // 同条件での順位を計算
          const rank = condTimes.filter(t => t.time < timeSeconds).length + 1;
          const percentile = rank / condTimes.length;
          
          data.time_rank = rank;                             // 時計順位
          data.time_percentile = percentile;                 // 時計パーセンタイル
          data.is_high_level_time = percentile <= 0.2;       // 上位20%
          data.is_top_time = percentile <= 0.1;              // 上位10%
          
          if (data.is_high_level_time) highLevelTimeCount++;
        }
      }
    }
    console.log(`   ハイレベル時計レース: ${highLevelTimeCount}件`);
    
    // ===== 不利馬判定 =====
    console.log('   不利馬を判定中...');
    
    // レースごとにグループ化して判定
    let disadvantagedCount = 0;
    for (const [raceId, raceHorses] of raceHorsesMap) {
      const raceData = raceDataMap.get(raceId);
      if (!raceData) continue;
      
      const lapAnalysis = analyzeLapPattern(raceData.lap_time);
      
      for (const horse of raceHorses) {
        const disadvantage = judgeDisadvantage(horse, raceHorses, lapAnalysis);
        horse.is_disadvantaged = disadvantage.isDisadvantaged;
        horse.disadvantage_type = disadvantage.type;
        horse.disadvantage_reason = disadvantage.reason;
        
        if (disadvantage.isDisadvantaged) disadvantagedCount++;
      }
    }
    console.log(`   不利馬: ${disadvantagedCount}件`)
    
    // 7. 上がり順位・先行率・位置取り改善を計算
    console.log('\n7. 上がり順位・先行率を計算中...');
    
    // レースごとにグループ化（horses.rowsを使用）
    const raceHorsesForCalc = new Map();
    for (const row of horses.rows) {
      if (!raceHorsesForCalc.has(row.race_id)) {
        raceHorsesForCalc.set(row.race_id, []);
      }
      raceHorsesForCalc.get(row.race_id).push(row);
    }
    
    // レース内の上がり順位を計算
    const last3fRankMap = new Map();  // race_id + umaban → rank
    for (const [raceId, raceHorses] of raceHorsesForCalc) {
      // 上がり3Fでソート（小さい方が速い）
      const sorted = raceHorses
        .filter(h => parseNumber(h.last_3f) > 0)
        .sort((a, b) => parseNumber(a.last_3f) - parseNumber(b.last_3f));
      
      for (let i = 0; i < sorted.length; i++) {
        const key = `${sorted[i].race_id}_${sorted[i].umaban}`;
        last3fRankMap.set(key, i + 1);  // 1位から
      }
      
      // 先行馬率を計算（3番手以内の馬の割合）
      let forwardCount = 0;
      for (const h of raceHorses) {
        const corner4 = parseNumber(h.corner_4);
        if (corner4 && corner4 <= 3) forwardCount++;
      }
      const forwardRate = raceHorses.length > 0 ? forwardCount / raceHorses.length : 0;
      
      // レース内の全馬に先行率を設定
      for (const h of raceHorses) {
        const key = `${h.race_id}_${h.umaban}`;
        last3fRankMap.set(`${key}_fwdRate`, forwardRate);
      }
    }
    
    // learningDataに上がり順位・先行率を追加
    for (const data of learningData) {
      const key = `${data.race_id}_${data.umaban}`;
      data.last_3f_rank = last3fRankMap.get(key) || null;  // 上がり順位
      data.forward_rate = last3fRankMap.get(`${key}_fwdRate`) || null;  // 先行率
      
      // 上がり4位フラグ
      data.is_agari_4th = data.last_3f_rank === 4;
    }
    
    // 位置取り改善の計算（最適化版: Mapでインデックス化）
    console.log('   位置取り改善を計算中...');
    
    // 事前にMapを作成（O(n) → O(1)の検索に最適化）
    const learningDataMap = new Map();
    for (const data of learningData) {
      const key = `${data.horse_name}_${data.race_id}`;
      learningDataMap.set(key, data);
    }
    console.log(`   インデックス作成完了: ${learningDataMap.size}件`);
    
    let improvedCount = 0;
    for (const [name, races] of horseRaces) {
      for (let i = 1; i < races.length; i++) {
        const prev = races[i - 1];
        const current = races[i];
        
        const prevCorner = parseNumber(prev.corner_4);
        const prevFieldSize = parseNumber(prev.field_size) || 16;
        const currCorner = parseNumber(current.corner_4);
        const currFieldSize = parseNumber(current.field_size) || 16;
        
        // 位置取り改善: 前走後方6割 → 今走前方4割
        const wasBehind = prevCorner && prevCorner > prevFieldSize * 0.6;
        const isNowFront = currCorner && currCorner <= currFieldSize * 0.4;
        
        // Mapで高速検索
        const key = `${name}_${current.race_id}`;
        const targetData = learningDataMap.get(key);
        if (targetData) {
          targetData.position_improved = wasBehind && isNowFront;
          targetData.prev_corner_4 = prevCorner;
          targetData.prev_field_size = prevFieldSize;
          if (wasBehind && isNowFront) improvedCount++;
        }
      }
    }
    console.log(`   位置取り改善馬: ${improvedCount}件`);
    
    // 8. 結果を保存
    console.log('\n8. 結果を保存中...');
    
    // 全データ（JSON）
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'learning-data-full.json'),
      JSON.stringify(learningData, null, 2)
    );
    console.log(`   ✅ learning-data-full.json (${learningData.length}件)`);
    
    // CSV形式（全データ）
    const csvHeaders = [
      // レース情報
      'race_id', 'race_date', 'place', 'surface', 'distance', 'track_condition',
      'lap_time', 'member_level', 'forward_rate',
      // ラップ分析
      'lap_pattern', 'pace_type', 'is_acceleration', 'is_non_decel', 'is_reverse',
      'first_3f_lap', 'last_3f_lap',
      // 時計評価
      'time_rank', 'time_percentile', 'is_high_level_time', 'is_top_time',
      // 馬情報
      'horse_name', 'umaban', 'finish_position', 'margin', 'popularity', 'win_odds',
      'corner_4', 'field_size', 'finish_time', 'last_3f', 'last_3f_rank', 'is_agari_4th',
      'jockey', 'trainer', 'sire', 'class_name', 'pci',
      // 位置取り関連
      'prev_corner_4', 'prev_field_size', 'position_improved',
      // 不利馬判定
      'is_disadvantaged', 'disadvantage_type', 'disadvantage_reason',
      // 指数
      'makikaeshi', 'potential', 'L4F', 'T2F',
      // 次走情報
      'next_race_id', 'next_finish', 'next_popularity', 'next_payout', 'next_win_odds'
    ];
    
    let csvContent = csvHeaders.join(',') + '\n';
    for (const data of learningData) {
      const row = csvHeaders.map(h => {
        const val = data[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return val;
      });
      csvContent += row.join(',') + '\n';
    }
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'learning-data.csv'),
      csvContent
    );
    console.log(`   ✅ learning-data.csv`);
    
    // 8. 統計サマリー
    console.log('\n=== 統計サマリー ===');
    
    // 指数ごとの統計
    const stats = calculateStats(learningData);
    
    console.log('\n【指数別 次走成績】');
    console.log('指数名         | データ数 | 次走3着内率 | 単勝回収率');
    console.log('-'.repeat(55));
    
    for (const [name, s] of Object.entries(stats.indexStats)) {
      const roiMark = s.roi >= 100 ? ' ★' : s.roi >= 80 ? ' ○' : '';
      console.log(
        `${name.padEnd(14)} | ${String(s.count).padStart(8)} | ` +
        `${s.top3Rate.toFixed(1).padStart(10)}% | ` +
        `${s.roi.toFixed(1).padStart(9)}%${roiMark}`
      );
    }
    
    console.log('\n【メンバーレベル別 次走成績】');
    console.log('レベル | データ数 | 次走3着内率 | 単勝回収率');
    console.log('-'.repeat(50));
    
    for (const [level, s] of Object.entries(stats.memberLevelStats)) {
      const roiMark = s.roi >= 100 ? ' ★' : s.roi >= 80 ? ' ○' : '';
      console.log(
        `${level.padEnd(6)} | ${String(s.count).padStart(8)} | ` +
        `${s.top3Rate.toFixed(1).padStart(10)}% | ` +
        `${s.roi.toFixed(1).padStart(9)}%${roiMark}`
      );
    }
    
    // ===== ラップパターン別成績 =====
    console.log('\n【ラップパターン別 次走成績】');
    console.log('パターン   | データ数 | 次走3着内率 | 単勝回収率');
    console.log('-'.repeat(50));
    
    for (const [pattern, s] of Object.entries(stats.lapPatternStats)) {
      const roiMark = s.roi >= 100 ? ' ★' : s.roi >= 80 ? ' ○' : '';
      console.log(
        `${pattern.padEnd(10)} | ${String(s.count).padStart(8)} | ` +
        `${s.top3Rate.toFixed(1).padStart(10)}% | ` +
        `${s.roi.toFixed(1).padStart(9)}%${roiMark}`
      );
    }
    
    // ===== 時計レベル別成績 =====
    console.log('\n【時計レベル別 次走成績】');
    console.log('レベル         | データ数 | 次走3着内率 | 単勝回収率');
    console.log('-'.repeat(55));
    
    for (const [level, s] of Object.entries(stats.timeLevelStats)) {
      const roiMark = s.roi >= 100 ? ' ★' : s.roi >= 80 ? ' ○' : '';
      console.log(
        `${level.padEnd(14)} | ${String(s.count).padStart(8)} | ` +
        `${s.top3Rate.toFixed(1).padStart(10)}% | ` +
        `${s.roi.toFixed(1).padStart(9)}%${roiMark}`
      );
    }
    
    // ===== 不利馬の次走成績 =====
    console.log('\n【不利馬 次走成績】');
    console.log('不利タイプ   | データ数 | 次走3着内率 | 単勝回収率');
    console.log('-'.repeat(55));
    
    for (const [type, s] of Object.entries(stats.disadvantageStats)) {
      const roiMark = s.roi >= 100 ? ' ★' : s.roi >= 80 ? ' ○' : '';
      console.log(
        `${type.padEnd(12)} | ${String(s.count).padStart(8)} | ` +
        `${s.top3Rate.toFixed(1).padStart(10)}% | ` +
        `${s.roi.toFixed(1).padStart(9)}%${roiMark}`
      );
    }
    
    // 閾値別分析の表示
    console.log('\n【ポテンシャル指数 閾値別成績】');
    console.log('範囲     | データ数 | 1着率 | 3着内率 | 単勝回収率');
    console.log('-'.repeat(55));
    for (const t of stats.thresholdStats.potential) {
      if (t.count < 50) continue;
      const roiMark = t.roi >= 100 ? ' ★' : t.roi >= 80 ? ' ○' : '';
      console.log(
        `${t.range.padEnd(8)} | ${String(t.count).padStart(8)} | ` +
        `${t.winRate.toFixed(1).padStart(5)}% | ${t.top3Rate.toFixed(1).padStart(6)}% | ` +
        `${t.roi.toFixed(1).padStart(9)}%${roiMark}`
      );
    }
    
    console.log('\n【巻き返し指数 閾値別成績】');
    console.log('範囲     | データ数 | 1着率 | 3着内率 | 単勝回収率');
    console.log('-'.repeat(55));
    for (const t of stats.thresholdStats.makikaeshi) {
      if (t.count < 50) continue;
      const roiMark = t.roi >= 100 ? ' ★' : t.roi >= 80 ? ' ○' : '';
      console.log(
        `${t.range.padEnd(8)} | ${String(t.count).padStart(8)} | ` +
        `${t.winRate.toFixed(1).padStart(5)}% | ${t.top3Rate.toFixed(1).padStart(6)}% | ` +
        `${t.roi.toFixed(1).padStart(9)}%${roiMark}`
      );
    }
    
    console.log('\n【データ概要】');
    console.log(`総レコード数: ${learningData.length}`);
    console.log(`期間: ${learningData[0]?.race_date || 'N/A'} 〜 ${learningData[learningData.length - 1]?.race_date || 'N/A'}`);
    
    // 統計サマリーを保存
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'stats-summary.json'),
      JSON.stringify(stats, null, 2)
    );
    console.log(`\n   ✅ stats-summary.json`);
    
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

/**
 * 走破タイムを秒に変換 (1:34.5 → 94.5)
 */
function parseTimeToSeconds(timeStr) {
  if (!timeStr) return null;
  const str = String(timeStr).trim();
  
  // "1:34.5" または "1.34.5" 形式
  const match = str.match(/(\d+)[:\.](\d+)\.(\d+)/);
  if (match) {
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + parseInt(match[3], 10) / 10;
  }
  
  // "94.5" 形式（1分未満）
  const match2 = str.match(/^(\d+)\.(\d+)$/);
  if (match2) {
    return parseInt(match2[1], 10) + parseInt(match2[2], 10) / 10;
  }
  
  return null;
}

/**
 * ラップパターン分析
 * @param {string} lapString - "12.3-11.2-12.0-11.8-11.5-12.2" 形式
 * @returns {object} 分析結果
 */
function analyzeLapPattern(lapString) {
  const result = {
    pattern: '不明',
    isAcceleration: false,
    isNonDecel: false,
    isReverse: false,
    last3f: null,
    first3f: null,
    paceType: '不明',
    laps: [],
  };
  
  if (!lapString) return result;
  
  // ラップを配列に変換
  const laps = lapString.split(/[-−ー]/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  if (laps.length < 4) return result;
  
  result.laps = laps;
  
  // 前半・後半を分割
  const halfIndex = Math.floor(laps.length / 2);
  const firstHalf = laps.slice(0, halfIndex);
  const secondHalf = laps.slice(halfIndex);
  
  // 前半3F・後半3F（ラップ3つ分）
  if (laps.length >= 6) {
    result.first3f = laps.slice(0, 3).reduce((a, b) => a + b, 0);
    result.last3f = laps.slice(-3).reduce((a, b) => a + b, 0);
  }
  
  // 平均ラップ
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  // ペースタイプ判定
  // 1Fあたり12.0秒 = 1000m/分 → 基準
  const avgLap = laps.reduce((a, b) => a + b, 0) / laps.length;
  if (avgLap < 11.8) {
    result.paceType = 'ハイ';
  } else if (avgLap < 12.2) {
    result.paceType = 'ミドル';
  } else {
    result.paceType = 'スロー';
  }
  
  // ラップパターン判定
  const diff = secondAvg - firstAvg;
  
  if (diff < -0.3) {
    // 後半が前半より0.3秒以上速い
    result.pattern = '加速';
    result.isAcceleration = true;
  } else if (diff < 0.2) {
    // ほぼ同じか軽い減速
    result.pattern = '非減速';
    result.isNonDecel = true;
  } else {
    // 後半大きく減速
    result.pattern = '減速';
  }
  
  // 逆行判定（ハイペース＋非減速/加速）
  if (result.paceType === 'ハイ' && (result.isAcceleration || result.isNonDecel)) {
    result.isReverse = true;
  }
  
  return result;
}

/**
 * 不利馬判定
 * @param {object} horse - 馬データ
 * @param {array} raceHorses - 同レースの全馬
 * @param {object} lapAnalysis - ラップ分析結果
 * @returns {object} 不利判定結果
 */
function judgeDisadvantage(horse, raceHorses, lapAnalysis) {
  const result = {
    isDisadvantaged: false,
    type: null,
    reason: null,
  };
  
  const corner4 = parseNumber(horse.corner_4);
  const finish = parseNumber(horse.finish_position);
  const fieldSize = parseNumber(horse.field_size) || 16;
  const last3f = parseNumber(horse.last_3f);
  const popularity = parseNumber(horse.popularity);
  
  if (!corner4 || finish === 99) return result;
  
  // 上がり順位を取得
  const horsesWithLast3f = raceHorses
    .filter(h => parseNumber(h.last_3f) > 0)
    .sort((a, b) => parseNumber(a.last_3f) - parseNumber(b.last_3f));
  const last3fRank = horsesWithLast3f.findIndex(h => h.umaban === horse.umaban) + 1;
  
  // === パターン1: 差し損ね ===
  // 後方にいて上がり上位だが着順が振るわない
  const isFromBehind = corner4 > fieldSize * 0.6;
  const hasGoodLast3f = last3fRank > 0 && last3fRank <= 3;
  const poorFinish = finish > Math.min(5, fieldSize * 0.3);
  
  if (isFromBehind && hasGoodLast3f && poorFinish) {
    result.isDisadvantaged = true;
    result.type = '差し損ね';
    result.reason = `4角${corner4}番手から上がり${last3fRank}位も${finish}着`;
    return result;
  }
  
  // === パターン2: 前潰れ（ハイペース先行）===
  // ハイペースで先行して着順が振るわない
  const wasLeading = corner4 <= 3;
  const isHighPace = lapAnalysis.paceType === 'ハイ';
  
  if (wasLeading && isHighPace && poorFinish) {
    result.isDisadvantaged = true;
    result.type = '前潰れ';
    result.reason = `ハイペースで4角${corner4}番手から${finish}着`;
    return result;
  }
  
  // === パターン3: 展開不利（スローの差し馬）===
  // スローで後方にいた差し馬
  const isSlowPace = lapAnalysis.paceType === 'スロー';
  
  if (isFromBehind && isSlowPace && poorFinish && (popularity && popularity <= 5)) {
    result.isDisadvantaged = true;
    result.type = 'スロー不利';
    result.reason = `スローで4角${corner4}番手、${popularity}人気${finish}着`;
    return result;
  }
  
  // === パターン4: 人気を裏切った（期待との乖離）===
  // 上位人気だが着順が大きく下回る
  if (popularity && popularity <= 3 && finish > popularity * 3) {
    result.isDisadvantaged = true;
    result.type = '人気裏切り';
    result.reason = `${popularity}人気${finish}着`;
    return result;
  }
  
  return result;
}

function calculateStats(learningData) {
  // 指数別統計
  const indexStats = {};
  const indexNames = ['makikaeshi', 'potential', 'L4F', 'T2F'];
  
  for (const name of indexNames) {
    const isLowerBetter = name === 'L4F' || name === 'T2F';
    const validData = learningData.filter(d => d[name] !== null && d.next_finish < 99);
    
    if (validData.length < 100) {
      indexStats[name] = { count: 0, top3Rate: 0, roi: 0 };
      continue;
    }
    
    // 上位20%を抽出
    const sorted = [...validData].sort((a, b) => 
      isLowerBetter ? a[name] - b[name] : b[name] - a[name]
    );
    const top20 = sorted.slice(0, Math.floor(sorted.length * 0.2));
    
    let top3Count = 0;
    let winPayout = 0;
    
    for (const d of top20) {
      if (d.next_finish <= 3) top3Count++;
      if (d.next_finish === 1) winPayout += d.next_payout || 0;
    }
    
    indexStats[name] = {
      count: top20.length,
      top3Rate: (top3Count / top20.length) * 100,
      roi: (winPayout / (top20.length * 100)) * 100,
    };
  }
  
  // メンバーレベル別統計
  const memberLevelStats = {};
  const levels = ['S', 'A', 'B', 'C', 'D'];
  
  for (const level of levels) {
    const levelData = learningData.filter(d => d.member_level === level && d.next_finish < 99);
    
    if (levelData.length < 100) {
      memberLevelStats[level] = { count: 0, top3Rate: 0, roi: 0 };
      continue;
    }
    
    let top3Count = 0;
    let winPayout = 0;
    
    for (const d of levelData) {
      if (d.next_finish <= 3) top3Count++;
      if (d.next_finish === 1) winPayout += d.next_payout || 0;
    }
    
    memberLevelStats[level] = {
      count: levelData.length,
      top3Rate: (top3Count / levelData.length) * 100,
      roi: (winPayout / (levelData.length * 100)) * 100,
    };
  }
  
  // 閾値別分析（potential, makikaeshi）
  const thresholdStats = {
    potential: analyzeByThreshold(learningData, 'potential', [0, 2, 4, 5, 6, 7, 8, 10]),
    makikaeshi: analyzeByThreshold(learningData, 'makikaeshi', [0, 1, 2, 3, 4, 5, 6, 8, 10]),
  };
  
  // ===== ラップパターン別統計 =====
  const lapPatternStats = {};
  const patterns = ['加速', '非減速', '減速', '不明'];
  
  for (const pattern of patterns) {
    const patternData = learningData.filter(d => d.lap_pattern === pattern && d.next_finish < 99);
    
    if (patternData.length < 100) {
      lapPatternStats[pattern] = { count: patternData.length, top3Rate: 0, roi: 0 };
      continue;
    }
    
    let top3Count = 0;
    let winPayout = 0;
    
    for (const d of patternData) {
      if (d.next_finish <= 3) top3Count++;
      if (d.next_finish === 1) winPayout += d.next_payout || 0;
    }
    
    lapPatternStats[pattern] = {
      count: patternData.length,
      top3Rate: (top3Count / patternData.length) * 100,
      roi: (winPayout / (patternData.length * 100)) * 100,
    };
  }
  
  // ===== 時計レベル別統計 =====
  const timeLevelStats = {};
  const timeLevels = [
    { key: 'ハイレベル時計', filter: d => d.is_high_level_time === true },
    { key: 'トップ時計', filter: d => d.is_top_time === true },
    { key: '通常時計', filter: d => d.is_high_level_time === false },
  ];
  
  for (const { key, filter } of timeLevels) {
    const levelData = learningData.filter(d => filter(d) && d.next_finish < 99);
    
    if (levelData.length < 100) {
      timeLevelStats[key] = { count: levelData.length, top3Rate: 0, roi: 0 };
      continue;
    }
    
    let top3Count = 0;
    let winPayout = 0;
    
    for (const d of levelData) {
      if (d.next_finish <= 3) top3Count++;
      if (d.next_finish === 1) winPayout += d.next_payout || 0;
    }
    
    timeLevelStats[key] = {
      count: levelData.length,
      top3Rate: (top3Count / levelData.length) * 100,
      roi: (winPayout / (levelData.length * 100)) * 100,
    };
  }
  
  // ===== 不利馬統計 =====
  const disadvantageStats = {};
  const disTypes = ['差し損ね', '前潰れ', 'スロー不利', '人気裏切り', '不利なし'];
  
  for (const type of disTypes) {
    let typeData;
    if (type === '不利なし') {
      typeData = learningData.filter(d => !d.is_disadvantaged && d.next_finish < 99);
    } else {
      typeData = learningData.filter(d => d.disadvantage_type === type && d.next_finish < 99);
    }
    
    if (typeData.length < 50) {
      disadvantageStats[type] = { count: typeData.length, top3Rate: 0, roi: 0 };
      continue;
    }
    
    let top3Count = 0;
    let winPayout = 0;
    
    for (const d of typeData) {
      if (d.next_finish <= 3) top3Count++;
      if (d.next_finish === 1) winPayout += d.next_payout || 0;
    }
    
    disadvantageStats[type] = {
      count: typeData.length,
      top3Rate: (top3Count / typeData.length) * 100,
      roi: (winPayout / (typeData.length * 100)) * 100,
    };
  }
  
  return { indexStats, memberLevelStats, thresholdStats, lapPatternStats, timeLevelStats, disadvantageStats };
}

/**
 * 閾値別の成績分析
 */
function analyzeByThreshold(data, fieldName, thresholds) {
  const results = [];
  
  for (let i = 0; i < thresholds.length - 1; i++) {
    const lower = thresholds[i];
    const upper = thresholds[i + 1];
    
    const filtered = data.filter(d => {
      const val = d[fieldName];
      return val !== null && val >= lower && val < upper && d.next_finish < 99;
    });
    
    if (filtered.length < 50) {
      results.push({
        range: `${lower}〜${upper}`,
        count: filtered.length,
        top3Rate: 0,
        winRate: 0,
        roi: 0,
      });
      continue;
    }
    
    let top3Count = 0;
    let winCount = 0;
    let winPayout = 0;
    
    for (const d of filtered) {
      if (d.next_finish <= 3) top3Count++;
      if (d.next_finish === 1) {
        winCount++;
        winPayout += d.next_payout || 0;
      }
    }
    
    results.push({
      range: `${lower}〜${upper}`,
      count: filtered.length,
      top3Rate: (top3Count / filtered.length) * 100,
      winRate: (winCount / filtered.length) * 100,
      roi: (winPayout / (filtered.length * 100)) * 100,
    });
  }
  
  return results;
}

main().catch(console.error);
