/**
 * レースレベルとおれAIの問題を調査するスクリプト
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// .envを直接読み込む（.env.localより優先）
let envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  envPath = path.join(__dirname, '.env.local');
}
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

async function investigate() {
  // Railway Public Network URL を直接使用
  const dbUrl = 'postgresql://postgres:PozRoKGJcaJPKVXWwMYfXFIlhZsVdWfO@turntable.proxy.rlwy.net:50897/railway';
  
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('===========================================');
    console.log('レースレベル・おれAI 問題調査');
    console.log('===========================================\n');

    // 1. 2026年1月のumadataを確認
    console.log('[1] 2026年1月のumadataレコード数');
    const umadata2026 = await pool.query(`
      SELECT COUNT(*) as count FROM umadata 
      WHERE date LIKE '2026%' OR date LIKE '2026.%'
    `);
    console.log(`   2026年のumadataレコード: ${umadata2026.rows[0].count}件\n`);

    // 2. 最新のumadataの日付を確認
    console.log('[2] umadataの日付範囲');
    const dateRange = await pool.query(`
      SELECT MIN(date) as min_date, MAX(date) as max_date FROM umadata
    `);
    console.log(`   最古: ${dateRange.rows[0].min_date}`);
    console.log(`   最新: ${dateRange.rows[0].max_date}\n`);

    // 3. race_levelsテーブルの状態確認
    console.log('[3] race_levelsテーブルの状態');
    const raceLevelStats = await pool.query(`
      SELECT level, COUNT(*) as count FROM race_levels GROUP BY level ORDER BY count DESC
    `);
    console.log('   レースレベル分布:');
    for (const row of raceLevelStats.rows) {
      console.log(`     ${row.level}: ${row.count}件`);
    }

    // UNKNOWN判定の詳細
    const unknownSample = await pool.query(`
      SELECT race_id, level_label, total_horses_run, good_run_count, first_run_good_count, expires_at
      FROM race_levels 
      WHERE level = 'UNKNOWN' 
      ORDER BY calculated_at DESC LIMIT 5
    `);
    console.log('\n   UNKNOWN判定のサンプル:');
    for (const row of unknownSample.rows) {
      console.log(`     race_id: ${row.race_id}, 出走: ${row.total_horses_run}頭, 好走: ${row.good_run_count || row.first_run_good_count || 0}頭`);
    }

    // 4. 特定のレース（2026年1月24日中山1R）の馬を確認
    console.log('\n[4] 2026年1月24日中山1Rの馬情報');
    const wakujunHorses = await pool.query(`
      SELECT umaban, umamei FROM wakujun 
      WHERE year = '2026' AND date = '0124' AND place = '中山' AND race_number = '1'
      ORDER BY umaban::INTEGER
    `);
    console.log(`   出走馬数: ${wakujunHorses.rows.length}頭`);
    
    if (wakujunHorses.rows.length > 0) {
      console.log('   馬名サンプル:');
      for (const h of wakujunHorses.rows.slice(0, 5)) {
        console.log(`     ${h.umaban}番: ${h.umamei}`);
      }
    }

    // 5. 各馬の過去走データを確認
    console.log('\n[5] 各馬の過去走データ確認');
    for (const horse of wakujunHorses.rows.slice(0, 3)) {
      const horseName = (horse.umamei || '').replace(/^[\$\*＄＊\s　]+/, '').trim();
      
      const pastRaces = await pool.query(`
        SELECT race_id, date, place, distance, finish_position, lap_time
        FROM umadata 
        WHERE TRIM(horse_name) = $1
        ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
        LIMIT 5
      `, [horseName]);
      
      console.log(`\n   ${horseName}:`);
      console.log(`     過去走数: ${pastRaces.rows.length}件`);
      
      if (pastRaces.rows.length > 0) {
        for (const r of pastRaces.rows) {
          const hasLap = r.lap_time && r.lap_time.length > 0;
          console.log(`       ${r.date} ${r.place} ${r.distance} ${r.finish_position}着 ${hasLap ? 'ラップあり' : 'ラップなし'}`);
        }
      } else {
        console.log('     ※過去走データなし！');
      }
    }

    // 6. 過去走のレースレベルをチェック
    console.log('\n[6] 過去走のレースレベル状態');
    const firstHorse = wakujunHorses.rows[0];
    if (firstHorse) {
      const horseName = (firstHorse.umamei || '').replace(/^[\$\*＄＊\s　]+/, '').trim();
      const pastRaces = await pool.query(`
        SELECT race_id, date, place, distance, finish_position
        FROM umadata 
        WHERE TRIM(horse_name) = $1
        ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
        LIMIT 5
      `, [horseName]);

      for (const race of pastRaces.rows) {
        const raceLevel = await pool.query(`
          SELECT level, level_label, total_horses_run, good_run_count, first_run_good_count
          FROM race_levels WHERE race_id = $1
        `, [race.race_id]);

        if (raceLevel.rows.length > 0) {
          const rl = raceLevel.rows[0];
          console.log(`   ${race.date} ${race.place}: レベル=${rl.level_label}, ${rl.total_horses_run}頭中${rl.first_run_good_count || rl.good_run_count || 0}頭好走`);
        } else {
          console.log(`   ${race.date} ${race.place}: レースレベル未計算`);
        }
      }
    }

    // 7. 特定レースの次走データを確認（レースレベル計算の元データ）
    console.log('\n[7] 特定レースの次走データ確認（レースレベル計算用）');
    // 最近のレースを1つ取得
    if (wakujunHorses.rows.length > 0) {
      const testHorse = wakujunHorses.rows[0];
      const horseName = (testHorse.umamei || '').replace(/^[\$\*＄＊\s　]+/, '').trim();
      
      const pastRace = await pool.query(`
        SELECT race_id, date FROM umadata 
        WHERE TRIM(horse_name) = $1
        ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
        LIMIT 1
      `, [horseName]);

      if (pastRace.rows.length > 0) {
        const raceId = pastRace.rows[0].race_id;
        const raceDate = pastRace.rows[0].date;
        console.log(`   対象レース: ${raceId} (${raceDate})`);

        // そのレースの出走馬を取得
        const raceHorses = await pool.query(`
          SELECT horse_name, finish_position FROM umadata 
          WHERE race_id = $1
        `, [raceId]);
        console.log(`   出走馬数: ${raceHorses.rows.length}頭`);

        // 各馬の次走成績を確認
        const raceDateNum = parseInt(raceId.substring(0, 8), 10);
        let nextRaceCount = 0;
        let goodRunCount = 0;

        for (const h of raceHorses.rows) {
          const nextRace = await pool.query(`
            SELECT finish_position FROM umadata
            WHERE horse_name = $1
              AND SUBSTRING(race_id, 1, 8)::INTEGER > $2
            ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER ASC
            LIMIT 1
          `, [h.horse_name, raceDateNum]);

          if (nextRace.rows.length > 0) {
            nextRaceCount++;
            const fp = nextRace.rows[0].finish_position;
            const fpNum = parseInt(fp.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)), 10);
            if (!isNaN(fpNum) && fpNum <= 5) {
              goodRunCount++;
            }
          }
        }

        console.log(`   次走あり: ${nextRaceCount}頭`);
        console.log(`   次走好走（5着以内）: ${goodRunCount}頭`);
        
        if (nextRaceCount < 3) {
          console.log('   ⚠️ 次走データが少なすぎてレースレベルがUNKNOWNになる可能性大');
        }
      }
    }

    // 8. indicesテーブルの状態
    console.log('\n[8] indicesテーブルの状態');
    const indicesStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT("L4F") as l4f_count,
        COUNT(potential) as potential_count,
        COUNT(makikaeshi) as makikaeshi_count
      FROM indices
    `);
    console.log(`   総レコード: ${indicesStats.rows[0].total}件`);
    console.log(`   L4Fあり: ${indicesStats.rows[0].l4f_count}件`);
    console.log(`   potentialあり: ${indicesStats.rows[0].potential_count}件`);
    console.log(`   makikaeshiあり: ${indicesStats.rows[0].makikaeshi_count}件`);

    // [9] 2025年12月のレースの次走データを詳しく確認
    console.log('\n[9] 2025年12月のレースの次走データ詳細確認');
    
    // 2025年12月27日のアドミのレースを確認
    const decRace = await pool.query(`
      SELECT race_id, horse_name, date, place, distance, finish_position
      FROM umadata 
      WHERE date LIKE '2025.12%' 
      AND horse_name LIKE '%アドミ%'
      ORDER BY date DESC
    `);
    console.log('   アドミの2025年12月レース:');
    for (const r of decRace.rows) {
      console.log(`     race_id: ${r.race_id}, ${r.date} ${r.place} ${r.distance} ${r.finish_position}着`);
    }
    
    // そのrace_idでrace_levelsを確認
    if (decRace.rows.length > 0) {
      const raceId = decRace.rows[0].race_id;
      console.log(`\n   race_id ${raceId} のレースレベル:`);
      
      const levelCheck = await pool.query(`
        SELECT * FROM race_levels WHERE race_id = $1
      `, [raceId]);
      
      if (levelCheck.rows.length > 0) {
        const lv = levelCheck.rows[0];
        console.log(`     level: ${lv.level}`);
        console.log(`     first_run_count: ${lv.first_run_count}`);
        console.log(`     first_run_good_count: ${lv.first_run_good_count}`);
        console.log(`     total_runs: ${lv.total_runs}`);
        console.log(`     good_run_count: ${lv.good_run_count}`);
      } else {
        console.log('     ※レースレベルがキャッシュされていない');
      }
      
      // このレースに出走した全馬の次走を確認
      console.log(`\n   このレースの出走馬と次走:`);
      const raceHorses = await pool.query(`
        SELECT horse_name, umaban, finish_position FROM umadata 
        WHERE race_id = $1
        ORDER BY CAST(umaban AS INTEGER)
      `, [raceId]);
      
      for (const h of raceHorses.rows.slice(0, 5)) {
        // この馬の次走を探す
        const nextRace = await pool.query(`
          SELECT date, place, distance, finish_position 
          FROM umadata 
          WHERE horse_name = $1 
          AND date > $2
          ORDER BY date ASC
          LIMIT 1
        `, [h.horse_name, decRace.rows[0].date]);
        
        if (nextRace.rows.length > 0) {
          const nr = nextRace.rows[0];
          console.log(`     ${h.umaban}番 ${h.horse_name}: ${h.finish_position}着 → 次走 ${nr.date} ${nr.finish_position}着`);
        } else {
          console.log(`     ${h.umaban}番 ${h.horse_name}: ${h.finish_position}着 → 次走なし`);
        }
      }
    }
    
    // [10] race_levelsテーブルのカラム確認
    console.log('\n[10] race_levelsテーブルのカラム構造');
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'race_levels'
      ORDER BY ordinal_position
    `);
    for (const col of columns.rows) {
      console.log(`   ${col.column_name}: ${col.data_type}`);
    }
    
    // [11] race_levelsの実際のデータを確認
    console.log('\n[11] race_levelsの実際のデータサンプル');
    const sampleLevels = await pool.query(`
      SELECT * FROM race_levels 
      WHERE race_id LIKE '2025%'
      ORDER BY race_id DESC
      LIMIT 3
    `);
    for (const lv of sampleLevels.rows) {
      console.log('   レコード:', JSON.stringify(lv, null, 2));
    }
    
    // [12] 日付比較の問題を調査
    console.log('\n[12] 日付形式の問題調査');
    const dateFormats = await pool.query(`
      SELECT DISTINCT date FROM umadata 
      WHERE date LIKE '2025.12%' OR date LIKE '2025. 8%' OR date LIKE '2025.08%'
      ORDER BY date
      LIMIT 10
    `);
    console.log('   日付フォーマットサンプル:');
    for (const d of dateFormats.rows) {
      console.log(`     "${d.date}"`);
    }
    
    // [13] 重複データの確認
    console.log('\n[13] 重複データの確認');
    const duplicates = await pool.query(`
      SELECT race_id, horse_name, COUNT(*) as cnt
      FROM umadata
      GROUP BY race_id, horse_name
      HAVING COUNT(*) > 1
      LIMIT 10
    `);
    console.log(`   重複レコード数: ${duplicates.rows.length}件以上`);
    for (const d of duplicates.rows.slice(0, 3)) {
      console.log(`     ${d.race_id} ${d.horse_name}: ${d.cnt}件`);
    }
    
    const oldLevels = { rows: [] };
    
    for (const lv of oldLevels.rows) {
      console.log(`   ${lv.race_id}: ${lv.level} (出走${lv.first_run_count}→好走${lv.first_run_good_count}, 延べ${lv.total_runs}→${lv.good_run_count})`);
    }

    // [14] アドミの前走(2025.12.27)のrace_levelsを詳細確認
    console.log('\n[14] アドミの前走のrace_levels詳細');
    const adomiRaceLevel = await pool.query(`
      SELECT * FROM race_levels 
      WHERE race_id = '2025122706050701'
    `);
    if (adomiRaceLevel.rows.length > 0) {
      const lv = adomiRaceLevel.rows[0];
      console.log(`   race_id: ${lv.race_id}`);
      console.log(`   level: ${lv.level}`);
      console.log(`   total_horses_run: ${lv.total_horses_run}`);
      console.log(`   first_run_good_count: ${lv.first_run_good_count}`);
      console.log(`   good_run_count: ${lv.good_run_count}`);
      console.log(`   ai_comment: ${lv.ai_comment}`);
      console.log(`   calculated_at: ${lv.calculated_at}`);
      console.log(`   expires_at: ${lv.expires_at}`);
    } else {
      console.log('   ※キャッシュなし');
    }

    // [15] このレースの実際の出走頭数と次走データを確認
    console.log('\n[15] 2025122706050701の出走頭数と次走状況');
    const raceHorseCount = await pool.query(`
      SELECT COUNT(DISTINCT horse_name) as horse_count
      FROM umadata 
      WHERE race_id = '2025122706050701'
    `);
    console.log(`   元レースの出走頭数: ${raceHorseCount.rows[0].horse_count}頭`);
    
    // 次走データがある馬を確認（race_idの数値比較）
    const nextRaceCheck = await pool.query(`
      WITH race_horses AS (
        SELECT DISTINCT horse_name 
        FROM umadata 
        WHERE race_id = '2025122706050701'
      )
      SELECT rh.horse_name, 
             (SELECT COUNT(*) FROM umadata u2 
              WHERE u2.horse_name = rh.horse_name 
              AND SUBSTRING(u2.race_id, 1, 8)::INTEGER > 20251227) as next_race_count
      FROM race_horses rh
      ORDER BY next_race_count DESC
      LIMIT 10
    `);
    console.log('   各馬の次走数:');
    let hasNextRace = 0;
    for (const h of nextRaceCheck.rows) {
      if (h.next_race_count > 0) hasNextRace++;
      console.log(`     ${h.horse_name}: ${h.next_race_count}走`);
    }
    console.log(`   → 次走データがある馬: ${hasNextRace}頭`);

    // [16] レースレベルBなのに0頭好走の矛盾を調査
    console.log('\n[16] レースレベル矛盾調査（B以上なのに0頭好走）');
    const contradictions = await pool.query(`
      SELECT race_id, level, total_horses_run, first_run_good_count, good_run_count, ai_comment
      FROM race_levels
      WHERE level IN ('S', 'A', 'B') AND first_run_good_count = 0
      LIMIT 10
    `);
    console.log(`   矛盾レコード数: ${contradictions.rows.length}件`);
    for (const r of contradictions.rows) {
      console.log(`   ${r.race_id}: ${r.level} (${r.total_horses_run}頭中${r.first_run_good_count}頭)`);
      console.log(`     ai_comment: ${r.ai_comment?.substring(0, 50)}...`);
    }

    // [17] レベル判定の正確性を確認
    console.log('\n[17] 各レベルの平均好走率');
    const levelStats = await pool.query(`
      SELECT level, 
             COUNT(*) as cnt,
             AVG(first_run_good_rate) as avg_rate,
             AVG(total_horses_run) as avg_horses
      FROM race_levels
      WHERE total_horses_run > 0
      GROUP BY level
      ORDER BY avg_rate DESC
    `);
    for (const s of levelStats.rows) {
      console.log(`   ${s.level}: ${s.cnt}件, 平均好走率${Math.round(s.avg_rate || 0)}%, 平均${Math.round(s.avg_horses || 0)}頭`);
    }

    // [18] 問題のレース（C+なのに0頭好走）を調査
    console.log('\n[18] 問題のレースレベル調査（レベルC+以上なのに0頭好走）');
    const problematicRaces = await pool.query(`
      SELECT race_id, level, level_label, total_horses_run, first_run_good_count, good_run_count, ai_comment
      FROM race_levels
      WHERE (level IN ('S', 'A', 'B', 'C') OR level_label LIKE '%+%')
        AND first_run_good_count = 0
        AND total_horses_run > 2
      ORDER BY calculated_at DESC
      LIMIT 10
    `);
    console.log(`   問題レコード数: ${problematicRaces.rows.length}件`);
    for (const r of problematicRaces.rows) {
      console.log(`   ${r.race_id}: ${r.level_label} (${r.total_horses_run}頭中${r.first_run_good_count}頭)`);
      console.log(`     ai_comment: ${r.ai_comment?.substring(0, 80)}...`);
    }

    // [19] 特定のレース（15頭中0頭好走のC+）を詳細調査
    // タイキラフターの前走race_idを探す
    console.log('\n[19] タイキラフターの前走調査');
    const taikiPastRaces = await pool.query(`
      SELECT race_id, date, place, distance, finish_position, class_name
      FROM umadata 
      WHERE horse_name = 'タイキラフター'
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
      LIMIT 5
    `);
    if (taikiPastRaces.rows.length > 0) {
      for (const r of taikiPastRaces.rows) {
        console.log(`   ${r.date} ${r.place} ${r.distance} ${r.finish_position}着 race_id=${r.race_id}`);
        
        // このレースのrace_levelsを確認
        const levelData = await pool.query(`
          SELECT level, level_label, total_horses_run, first_run_good_count, ai_comment
          FROM race_levels WHERE race_id = $1
        `, [r.race_id]);
        if (levelData.rows.length > 0) {
          const lv = levelData.rows[0];
          console.log(`     → ${lv.level_label} (${lv.total_horses_run}頭中${lv.first_run_good_count}頭好走)`);
        } else {
          console.log('     → race_levelsにデータなし');
        }
      }
    }

    console.log('\n===========================================');
    console.log('調査完了');
    console.log('===========================================');

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await pool.end();
  }
}

investigate();
