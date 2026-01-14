const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== 過去走データ取得問題の調査 ===\n');

try {
    // 1. 特定の馬（例: 1番の馬）についてumadataテーブルに過去走が複数あるか確認
    console.log('【1. 特定の馬の過去走データ確認】');
    const testHorse = db.prepare(`
        SELECT * FROM wakujun 
        WHERE date='1227' AND race_number='1' AND umaban='1'
    `).get();
    
    if (!testHorse) {
        console.log('   ⚠️ 該当する馬が見つかりませんでした');
        process.exit(1);
    }
    
    const horseName = testHorse.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
    console.log(`   調査対象馬: "${horseName}"`);
    console.log(`   date: ${testHorse.date}, place: ${testHorse.place}, race_number: ${testHorse.race_number}, umaban: ${testHorse.umaban}\n`);
    
    // umadataテーブルで過去走データを検索
    const pastRacesCount = db.prepare(`
        SELECT COUNT(*) as count FROM umadata 
        WHERE TRIM(horse_name) = ?
    `).get(horseName);
    
    console.log(`   umadataテーブルの過去走件数: ${pastRacesCount.count}件\n`);
    
    if (pastRacesCount.count > 0) {
        // 過去走データの詳細
        const pastRaces = db.prepare(`
            SELECT * FROM umadata 
            WHERE TRIM(horse_name) = ?
            ORDER BY date DESC
            LIMIT 10
        `).all(horseName);
        
        console.log(`   過去走データの詳細（最新10件）:`);
        pastRaces.forEach((race, idx) => {
            console.log(`\n   ${idx + 1}. date: ${race.date}`);
            console.log(`      race_id_new_no_horse_num: "${race.race_id_new_no_horse_num}"`);
            console.log(`      horse_number: "${race.horse_number}"`);
            console.log(`      着順: ${race.finish_position || '(NULL)'}`);
            console.log(`      走破タイム: ${race.finish_time || '(NULL)'}`);
        });
        
        // 2. APIと同じロジックで取得
        console.log('\n【2. APIと同じロジックで取得（LIMIT 5）】');
        const apiStyleRaces = db.prepare(`
            SELECT * FROM umadata
            WHERE TRIM(horse_name) = ?
            ORDER BY date DESC
            LIMIT 5
        `).all(horseName);
        
        console.log(`   取得件数: ${apiStyleRaces.length}件`);
        apiStyleRaces.forEach((race, idx) => {
            console.log(`   ${idx + 1}. date: ${race.date}, 着順: ${race.finish_position || '(NULL)'}`);
        });
        
        // 3. 各過去走のindicesデータを確認
        console.log('\n【3. 各過去走のindicesデータを確認】');
        apiStyleRaces.forEach((race, idx) => {
            const raceIdBase = race.race_id_new_no_horse_num || '';
            const horseNum = String(race.horse_number || '').padStart(2, '0');
            const fullRaceId = `${raceIdBase}${horseNum}`;
            
            const indexData = db.prepare(`
                SELECT * FROM indices 
                WHERE race_id = ?
            `).get(fullRaceId);
            
            if (indexData) {
                console.log(`   ${idx + 1}. race_id: "${fullRaceId}" → ✅ indicesデータあり (makikaeshi: ${indexData.makikaeshi})`);
            } else {
                console.log(`   ${idx + 1}. race_id: "${fullRaceId}" → ❌ indicesデータなし`);
            }
        });
    } else {
        console.log('   ⚠️ 過去走データが見つかりませんでした');
        
        // 別の馬を探す
        console.log('\n   別の馬を探します...');
        const alternativeHorse = db.prepare(`
            SELECT * FROM wakujun 
            WHERE date='1227' 
            AND EXISTS (
                SELECT 1 FROM umadata u 
                WHERE TRIM(u.horse_name) = TRIM(REPLACE(REPLACE(wakujun.umamei, '$', ''), '*', ''))
            )
            LIMIT 1
        `).get();
        
        if (alternativeHorse) {
            const altHorseName = alternativeHorse.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
            console.log(`   代替馬: "${altHorseName}"`);
            
            const altPastRacesCount = db.prepare(`
                SELECT COUNT(*) as count FROM umadata 
                WHERE TRIM(horse_name) = ?
            `).get(altHorseName);
            
            console.log(`   umadataテーブルの過去走件数: ${altPastRacesCount.count}件`);
            
            if (altPastRacesCount.count > 0) {
                const altPastRaces = db.prepare(`
                    SELECT * FROM umadata 
                    WHERE TRIM(horse_name) = ?
                    ORDER BY date DESC
                    LIMIT 5
                `).all(altHorseName);
                
                console.log(`   過去走データの詳細（最新5件）:`);
                altPastRaces.forEach((race, idx) => {
                    console.log(`   ${idx + 1}. date: ${race.date}, 着順: ${race.finish_position || '(NULL)'}`);
                });
            }
        }
    }
    
    // 4. 複数の馬で過去走件数を確認
    console.log('\n【4. 複数の馬で過去走件数を確認】');
    const horsesWithPastRaces = db.prepare(`
        SELECT 
            w.umamei,
            COUNT(u.id) as past_race_count
        FROM wakujun w
        LEFT JOIN umadata u ON TRIM(u.horse_name) = TRIM(REPLACE(REPLACE(w.umamei, '$', ''), '*', ''))
        WHERE w.date='1227'
        GROUP BY w.umamei
        HAVING past_race_count > 0
        ORDER BY past_race_count DESC
        LIMIT 10
    `).all();
    
    console.log(`   過去走データがある馬（上位10頭）:`);
    horsesWithPastRaces.forEach((row, idx) => {
        const normalizedName = row.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
        console.log(`   ${idx + 1}. "${normalizedName}": ${row.past_race_count}件`);
    });

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 調査完了 ===');



















