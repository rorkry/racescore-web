const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== 競うスコア問題の詳細調査 ===\n');

try {
    // 1. wakujunテーブルから1頭の馬を選ぶ（date='1227', race_number='3', umaban='1'）
    console.log('【1. wakujunテーブルから馬を取得】');
    const horse = db.prepare(`
        SELECT * FROM wakujun 
        WHERE date='1227' AND race_number='3' AND umaban='1'
    `).get();

    if (!horse) {
        console.log('   ⚠️ 該当する馬が見つかりませんでした');
        console.log('   別の馬を探します...\n');
        
        // 別の馬を探す
        const alternativeHorse = db.prepare(`
            SELECT * FROM wakujun 
            WHERE date='1227' AND race_number='1' AND umaban='1'
            LIMIT 1
        `).get();
        
        if (alternativeHorse) {
            console.log('   代替馬を見つけました:');
            console.log(`   date: ${alternativeHorse.date}, place: ${alternativeHorse.place}, race_number: ${alternativeHorse.race_number}, umaban: ${alternativeHorse.umaban}`);
            console.log(`   umamei: "${alternativeHorse.umamei}"\n`);
            
            // この馬で調査を続ける
            const horseName = alternativeHorse.umamei;
            const normalizedName = horseName.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
            
            console.log('【2. umadataテーブルで過去走データを検索】');
            console.log(`   元の馬名: "${horseName}"`);
            console.log(`   正規化後の馬名: "${normalizedName}"`);
            
            // 複数のパターンで検索
            const patterns = [
                normalizedName,
                horseName.trim(),
                horseName.replace(/\s+/g, ''),
                horseName.replace(/　/g, ''),
            ];
            
            let pastRaces = [];
            for (const pattern of patterns) {
                const found = db.prepare(`
                    SELECT * FROM umadata 
                    WHERE TRIM(horse_name) = ?
                    ORDER BY date DESC
                    LIMIT 5
                `).all(pattern);
                
                if (found.length > 0) {
                    console.log(`\n   ✅ パターン "${pattern}" で ${found.length}件見つかりました`);
                    pastRaces = found;
                    break;
                } else {
                    console.log(`   ❌ パターン "${pattern}" では見つかりませんでした`);
                }
            }
            
            if (pastRaces.length === 0) {
                // 部分一致も試す
                console.log('\n   部分一致で検索します...');
                const partialMatch = db.prepare(`
                    SELECT * FROM umadata 
                    WHERE horse_name LIKE ?
                    ORDER BY date DESC
                    LIMIT 5
                `).all(`%${normalizedName}%`);
                
                if (partialMatch.length > 0) {
                    console.log(`   ✅ 部分一致で ${partialMatch.length}件見つかりました`);
                    pastRaces = partialMatch;
                }
            }
            
            if (pastRaces.length > 0) {
                console.log('\n【3. 過去走データの詳細】');
                pastRaces.forEach((race, idx) => {
                    console.log(`\n   過去走 ${idx + 1}:`);
                    console.log(`     horse_name: "${race.horse_name}"`);
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
                    } else {
                        console.log(`     ❌ indicesデータが見つかりませんでした`);
                        
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
            } else {
                console.log('\n   ⚠️ 過去走データが見つかりませんでした');
                
                // umadataテーブルの馬名のサンプルを表示
                console.log('\n   umadataテーブルの馬名サンプル:');
                const sampleNames = db.prepare(`
                    SELECT DISTINCT horse_name FROM umadata 
                    LIMIT 10
                `).all();
                sampleNames.forEach((row, idx) => {
                    console.log(`     ${idx + 1}. "${row.horse_name}"`);
                });
            }
        }
    } else {
        console.log('   馬が見つかりました:');
        console.log(`   date: ${horse.date}, place: ${horse.place}, race_number: ${horse.race_number}, umaban: ${horse.umaban}`);
        console.log(`   umamei: "${horse.umamei}"\n`);
        
        const horseName = horse.umamei;
        const normalizedName = horseName.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
        
        console.log('【2. umadataテーブルで過去走データを検索】');
        console.log(`   元の馬名: "${horseName}"`);
        console.log(`   正規化後の馬名: "${normalizedName}"`);
        
        // 複数のパターンで検索
        const patterns = [
            normalizedName,
            horseName.trim(),
            horseName.replace(/\s+/g, ''),
            horseName.replace(/　/g, ''),
        ];
        
        let pastRaces = [];
        for (const pattern of patterns) {
            const found = db.prepare(`
                SELECT * FROM umadata 
                WHERE TRIM(horse_name) = ?
                ORDER BY date DESC
                LIMIT 5
            `).all(pattern);
            
            if (found.length > 0) {
                console.log(`\n   ✅ パターン "${pattern}" で ${found.length}件見つかりました`);
                pastRaces = found;
                break;
            } else {
                console.log(`   ❌ パターン "${pattern}" では見つかりませんでした`);
            }
        }
        
        if (pastRaces.length > 0) {
            console.log('\n【3. 過去走データの詳細】');
            pastRaces.forEach((race, idx) => {
                console.log(`\n   過去走 ${idx + 1}:`);
                console.log(`     horse_name: "${race.horse_name}"`);
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
                } else {
                    console.log(`     ❌ indicesデータが見つかりませんでした`);
                    
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
        } else {
            console.log('\n   ⚠️ 過去走データが見つかりませんでした');
        }
    }
    
    // 4. normalizeHorseName関数の確認
    console.log('\n【4. normalizeHorseName関数の確認】');
    console.log('   現在の実装（pages/api/race-card-with-score.ts）:');
    console.log('   function normalizeHorseName(name: string): string {');
    console.log('     return name');
    console.log('       .replace(/^[\\$\\*\\s]+/, "")');
    console.log('       .replace(/[\\s]+$/, "")');
    console.log('       .trim();');
    console.log('   }');
    console.log('\n   問題点:');
    console.log('   - 全角スペース（　）を処理していない');
    console.log('   - 全角・半角の統一をしていない');
    
    // 5. getIndexValue関数の確認
    console.log('\n【5. getIndexValue関数の確認】');
    console.log('   現在の実装（utils/getClusterData.ts）:');
    console.log('   function getIndexValue(race: any, key: string): number {');
    console.log('     if (race && race.indices && race.indices[key] !== null && race.indices[key] !== undefined) {');
    console.log('       return parseFloat(race.indices[key]) || 0;');
    console.log('     }');
    console.log('     return 0;');
    console.log('   }');
    console.log('\n   問題点:');
    console.log('   - race.indicesがnullの場合、0を返す（これは正しい）');
    console.log('   - しかし、indicesデータが紐付けられていない場合、常に0になる');

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 調査完了 ===');












