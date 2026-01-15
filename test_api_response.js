const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== APIレスポンスの確認 ===\n');

try {
    // APIと同じロジックでデータを取得
    const date = '1227';
    const place = '中山';
    const raceNumber = '7';
    
    console.log(`【APIパラメータ】`);
    console.log(`   date: ${date}, place: ${place}, raceNumber: ${raceNumber}\n`);
    
    // wakujunから馬を取得
    const horses = db.prepare(`
        SELECT * FROM wakujun
        WHERE date = ? AND place = ? AND race_number = ?
        ORDER BY CAST(umaban AS INTEGER)
    `).all(date, place, raceNumber);
    
    console.log(`【wakujunテーブル】`);
    console.log(`   取得件数: ${horses.length}件\n`);
    
    // 1頭の馬について詳細に調査
    if (horses.length > 0) {
        const testHorse = horses[0];
        const horseName = testHorse.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
        
        console.log(`【調査対象馬】`);
        console.log(`   馬名: "${horseName}"`);
        console.log(`   umaban: ${testHorse.umaban}\n`);
        
        // umadataから過去走を取得（APIと同じロジック）
        const pastRacesRaw = db.prepare(`
            SELECT * FROM umadata
            WHERE TRIM(horse_name) = ?
            ORDER BY date DESC
            LIMIT 5
        `).all(horseName);
        
        console.log(`【umadataテーブル（APIと同じロジック）】`);
        console.log(`   取得件数: ${pastRacesRaw.length}件\n`);
        
        if (pastRacesRaw.length > 0) {
            console.log(`   過去走データの詳細:`);
            pastRacesRaw.forEach((race, idx) => {
                console.log(`   ${idx + 1}. date: ${race.date}`);
                console.log(`      race_id_new_no_horse_num: "${race.race_id_new_no_horse_num}"`);
                console.log(`      horse_number: "${race.horse_number}"`);
                console.log(`      着順: ${race.finish_position || '(NULL)'}`);
                
                // レースIDを生成
                const raceIdBase = race.race_id_new_no_horse_num || '';
                const horseNum = String(race.horse_number || '').padStart(2, '0');
                const fullRaceId = `${raceIdBase}${horseNum}`;
                
                // indicesデータを取得
                const indexData = db.prepare(`
                    SELECT L4F, T2F, potential, revouma, makikaeshi, cushion
                    FROM indices WHERE race_id = ?
                `).get(fullRaceId);
                
                if (indexData) {
                    console.log(`      ✅ indicesデータあり (makikaeshi: ${indexData.makikaeshi})`);
                } else {
                    console.log(`      ❌ indicesデータなし`);
                }
                console.log('');
            });
            
            // APIレスポンスの構造をシミュレート
            console.log(`【APIレスポンス構造（シミュレート）】`);
            const pastRacesWithIndices = pastRacesRaw.map((race) => {
                const raceIdBase = race.race_id_new_no_horse_num || '';
                const horseNum = String(race.horse_number || '').padStart(2, '0');
                const fullRaceId = `${raceIdBase}${horseNum}`;
                
                let raceIndices = null;
                const indexData = db.prepare(`
                    SELECT L4F, T2F, potential, revouma, makikaeshi, cushion
                    FROM indices WHERE race_id = ?
                `).get(fullRaceId);
                if (indexData) raceIndices = indexData;
                
                return {
                    ...race,
                    indices: raceIndices,
                    indexRaceId: fullRaceId
                };
            });
            
            console.log(`   past_races配列の長さ: ${pastRacesWithIndices.length}`);
            console.log(`   past配列の長さ: ${pastRacesWithIndices.length}`);
            console.log(`   past_races_count: ${pastRacesWithIndices.length}`);
            console.log(`\n   各過去走のindicesデータ:`);
            pastRacesWithIndices.forEach((race, idx) => {
                if (race.indices) {
                    console.log(`   ${idx + 1}. makikaeshi: ${race.indices.makikaeshi}, potential: ${race.indices.potential}`);
                } else {
                    console.log(`   ${idx + 1}. indices: null`);
                }
            });
        } else {
            console.log(`   ⚠️ 過去走データが見つかりませんでした`);
        }
    }

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 確認完了 ===');




















