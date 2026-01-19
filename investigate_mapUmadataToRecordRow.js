const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== mapUmadataToRecordRow関数の調査 ===\n');

try {
    // 過去走データが複数ある馬を探す
    console.log('【1. 過去走データが複数ある馬を探す】');
    const horseWithMultipleRaces = db.prepare(`
        SELECT 
            w.umamei,
            COUNT(u.id) as past_race_count
        FROM wakujun w
        INNER JOIN umadata u ON TRIM(u.horse_name) = TRIM(REPLACE(REPLACE(w.umamei, '$', ''), '*', ''))
        WHERE w.date='1227'
        GROUP BY w.umamei
        HAVING past_race_count >= 3
        ORDER BY past_race_count DESC
        LIMIT 1
    `).get();
    
    if (!horseWithMultipleRaces) {
        console.log('   ⚠️ 過去走データが3件以上ある馬が見つかりませんでした');
        process.exit(1);
    }
    
    const horseName = horseWithMultipleRaces.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
    console.log(`   調査対象馬: "${horseName}"`);
    console.log(`   過去走件数: ${horseWithMultipleRaces.past_race_count}件\n`);
    
    // umadataから過去走を取得（APIと同じロジック）
    const pastRacesRaw = db.prepare(`
        SELECT * FROM umadata
        WHERE TRIM(horse_name) = ?
        ORDER BY date DESC
        LIMIT 5
    `).all(horseName);
    
    console.log(`【2. umadataテーブルから取得した過去走データ】`);
    console.log(`   取得件数: ${pastRacesRaw.length}件\n`);
    
    pastRacesRaw.forEach((race, idx) => {
        console.log(`   ${idx + 1}. date: ${race.date}`);
        console.log(`      race_id_new_no_horse_num: "${race.race_id_new_no_horse_num}"`);
        console.log(`      horse_number: "${race.horse_number}"`);
        console.log(`      着順: ${race.finish_position || '(NULL)'}`);
        console.log(`      走破タイム: ${race.finish_time || '(NULL)'}`);
        console.log(`      indicesオブジェクト: ${race.indices ? 'あり' : 'なし'}`);
        console.log('');
    });
    
    // 3. indicesデータを紐づけ（APIと同じロジック）
    console.log(`【3. indicesデータを紐づけ（APIと同じロジック）】`);
    const pastRacesWithIndices = pastRacesRaw.map((race) => {
        const raceIdBase = race.race_id_new_no_horse_num || '';
        const horseNum = String(race.horse_number || '').padStart(2, '0');
        const fullRaceId = `${raceIdBase}${horseNum}`;
        
        let raceIndices = null;
        try {
            const indexData = db.prepare(`
                SELECT L4F, T2F, potential, revouma, makikaeshi, cushion
                FROM indices WHERE race_id = ?
            `).get(fullRaceId);
            if (indexData) raceIndices = indexData;
        } catch (err) {
            // 指数データがない場合は無視
        }
        
        return {
            ...race,
            indices: raceIndices,
            indexRaceId: fullRaceId
        };
    });
    
    console.log(`   紐づけ後の件数: ${pastRacesWithIndices.length}件\n`);
    pastRacesWithIndices.forEach((race, idx) => {
        console.log(`   ${idx + 1}. date: ${race.date}`);
        console.log(`      indices: ${race.indices ? 'あり' : 'なし'}`);
        if (race.indices) {
            console.log(`        makikaeshi: ${race.indices.makikaeshi}`);
            console.log(`        potential: ${race.indices.potential}`);
        }
        console.log('');
    });
    
    // 4. mapUmadataToRecordRow関数のシミュレーション
    console.log(`【4. mapUmadataToRecordRow関数のシミュレーション】`);
    const mappedRaces = pastRacesWithIndices.map((dbRow) => {
        const result = {};
        for (const key in dbRow) {
            result[key] = dbRow[key] !== null && dbRow[key] !== undefined ? String(dbRow[key]) : '';
        }
        result['指数'] = result['index_value'] || '';
        result['comeback'] = result['index_value'] || '';
        result['着順'] = result['finish_position'] || '';
        result['finish'] = result['finish_position'] || '';
        result['着差'] = result['margin'] || '';
        result['corner2'] = result['corner_2'] || '';
        result['corner3'] = result['corner_3'] || '';
        result['corner4'] = result['corner_4'] || '';
        result['頭数'] = result['number_of_horses'] || '';
        result['fieldSize'] = result['number_of_horses'] || '';
        result['距離'] = result['distance'] || '';
        result['surface'] = result['distance'] || '';
        result['PCI'] = result['pci'] || '';
        result['日付'] = result['date'] || '';
        result['日付(yyyy.mm.dd)'] = result['date'] || '';
        result['場所'] = result['place'] || '';
        result['場所_1'] = result['place'] || '';
        result['走破タイム'] = result['finish_time'] || '';
        result['time'] = result['finish_time'] || '';
        result['クラス名'] = result['class_name'] || '';
        result['レースID'] = result['race_id_new_no_horse_num'] || '';
        result['レースID(新/馬番無)'] = result['race_id_new_no_horse_num'] || '';
        result['raceId'] = result['race_id_new_no_horse_num'] || '';
        // indicesオブジェクトを保持（computeKisoScoreで使用）
        if (dbRow.indices) {
            result['indices'] = dbRow.indices;
        }
        return result;
    });
    
    console.log(`   マッピング後の件数: ${mappedRaces.length}件\n`);
    mappedRaces.forEach((race, idx) => {
        console.log(`   ${idx + 1}. date: ${race['日付']}`);
        console.log(`      着順: ${race['着順']}`);
        console.log(`      indices: ${race.indices ? 'あり' : 'なし'}`);
        if (race.indices) {
            console.log(`        makikaeshi: ${race.indices.makikaeshi}`);
        }
        console.log('');
    });
    
    // 5. APIレスポンスの構造を確認
    console.log(`【5. APIレスポンスの構造（シミュレート）】`);
    const apiResponse = {
        past_races: pastRacesWithIndices,
        past_races_count: mappedRaces.length,
        past: pastRacesWithIndices,
        hasData: mappedRaces.length > 0
    };
    
    console.log(`   past_races配列の長さ: ${apiResponse.past_races.length}`);
    console.log(`   past配列の長さ: ${apiResponse.past.length}`);
    console.log(`   past_races_count: ${apiResponse.past_races_count}`);
    console.log(`   hasData: ${apiResponse.hasData}`);

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 調査完了 ===');




















