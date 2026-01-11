const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== マッチした馬のindicesデータ確認 ===\n');

try {
    // 1. マッチした馬を1頭選ぶ
    console.log('【1. マッチした馬を1頭選ぶ】');
    const matchedHorse = db.prepare(`
        SELECT w.umamei, w.date, w.place, w.race_number, w.umaban
        FROM wakujun w
        WHERE w.date='1227'
        AND EXISTS (
            SELECT 1 FROM umadata u 
            WHERE TRIM(u.horse_name) = TRIM(REPLACE(REPLACE(w.umamei, '$', ''), '*', ''))
        )
        LIMIT 1
    `).get();
    
    if (!matchedHorse) {
        console.log('   ⚠️ マッチした馬が見つかりませんでした');
        process.exit(1);
    }
    
    const horseName = matchedHorse.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
    console.log(`   選んだ馬: "${horseName}"`);
    console.log(`   date: ${matchedHorse.date}, place: ${matchedHorse.place}, race_number: ${matchedHorse.race_number}, umaban: ${matchedHorse.umaban}\n`);
    
    // 2. umadataテーブルで過去走データを取得
    console.log('【2. umadataテーブルで過去走データを取得】');
    const pastRaces = db.prepare(`
        SELECT * FROM umadata 
        WHERE TRIM(horse_name) = ?
        ORDER BY date DESC
        LIMIT 5
    `).all(horseName);
    
    console.log(`   見つかった過去走: ${pastRaces.length}件\n`);
    
    if (pastRaces.length === 0) {
        console.log('   ⚠️ 過去走データが見つかりませんでした');
        process.exit(1);
    }
    
    // 3. 各過去走のindicesデータを確認
    console.log('【3. 各過去走のindicesデータを確認】');
    pastRaces.forEach((race, idx) => {
        console.log(`\n   過去走 ${idx + 1}:`);
        console.log(`     date: ${race.date}`);
        console.log(`     race_id_new_no_horse_num: "${race.race_id_new_no_horse_num}"`);
        console.log(`     horse_number: "${race.horse_number}"`);
        
        // レースIDを生成
        const raceIdBase = race.race_id_new_no_horse_num || '';
        const horseNum = String(race.horse_number || '').padStart(2, '0');
        const fullRaceId = `${raceIdBase}${horseNum}`;
        console.log(`     生成されたrace_id: "${fullRaceId}"`);
        
        // indicesテーブルで検索
        const indexData = db.prepare(`
            SELECT * FROM indices 
            WHERE race_id = ?
        `).get(fullRaceId);
        
        if (indexData) {
            console.log(`     ✅ indicesデータが見つかりました:`);
            console.log(`        makikaeshi: ${indexData.makikaeshi}`);
            console.log(`        potential: ${indexData.potential}`);
            console.log(`        L4F: ${indexData.L4F}`);
            console.log(`        T2F: ${indexData.T2F}`);
            console.log(`        revouma: ${indexData.revouma}`);
            console.log(`        cushion: ${indexData.cushion}`);
        } else {
            console.log(`     ❌ indicesデータが見つかりませんでした`);
            
            // race_idの形式を確認
            console.log(`     race_idの形式確認:`);
            console.log(`       race_id_new_no_horse_numの長さ: ${raceIdBase.length}`);
            console.log(`       horse_number: "${race.horse_number}"`);
            console.log(`       生成されたrace_idの長さ: ${fullRaceId.length}`);
            
            // 類似のrace_idを探す
            const similarRaceIds = db.prepare(`
                SELECT race_id FROM indices 
                WHERE race_id LIKE ?
                LIMIT 5
            `).all(`${raceIdBase}%`);
            
            if (similarRaceIds.length > 0) {
                console.log(`     類似のrace_idが見つかりました:`);
                similarRaceIds.forEach(r => {
                    console.log(`       ${r.race_id}`);
                });
            }
        }
    });
    
    // 4. スコア計算のシミュレーション
    console.log('\n【4. スコア計算のシミュレーション】');
    const validIndices = pastRaces.filter(race => {
        const raceIdBase = race.race_id_new_no_horse_num || '';
        const horseNum = String(race.horse_number || '').padStart(2, '0');
        const fullRaceId = `${raceIdBase}${horseNum}`;
        const indexData = db.prepare(`SELECT * FROM indices WHERE race_id = ?`).get(fullRaceId);
        return indexData !== undefined;
    });
    
    console.log(`   indicesデータがある過去走: ${validIndices.length}件 / ${pastRaces.length}件`);
    
    if (validIndices.length > 0) {
        const firstRace = validIndices[0];
        const raceIdBase = firstRace.race_id_new_no_horse_num || '';
        const horseNum = String(firstRace.horse_number || '').padStart(2, '0');
        const fullRaceId = `${raceIdBase}${horseNum}`;
        const indexData = db.prepare(`SELECT * FROM indices WHERE race_id = ?`).get(fullRaceId);
        
        if (indexData) {
            console.log(`\n   前走の指数:`);
            console.log(`     makikaeshi: ${indexData.makikaeshi}`);
            console.log(`     potential: ${indexData.potential}`);
            
            // 簡易スコア計算（巻き返し指数のみ）
            const comebackScore = (indexData.makikaeshi / 10) * 35;
            console.log(`\n   簡易スコア（巻き返し指数のみ）: ${comebackScore.toFixed(1)}点`);
        }
    } else {
        console.log(`   ⚠️ indicesデータがないため、スコアは0点になります`);
    }

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 調査完了 ===');











