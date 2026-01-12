const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== アーレムアレスの過去走表示問題の調査 ===\n');

try {
    // 1. wakujunテーブルから該当馬を取得
    console.log('【1. wakujunテーブルから該当馬を取得】');
    const horse = db.prepare(`
        SELECT * FROM wakujun 
        WHERE date='1227' AND place='中山' AND race_number='11' AND umaban='2'
    `).get();
    
    if (!horse) {
        console.log('   ⚠️ 該当する馬が見つかりませんでした');
        process.exit(1);
    }
    
    console.log(`   馬名: "${horse.umamei}"`);
    console.log(`   date: ${horse.date}, place: ${horse.place}, race_number: ${horse.race_number}, umaban: ${horse.umaban}\n`);
    
    // 2. 馬名の正規化
    const horseName = horse.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
    console.log(`【2. 馬名の正規化】`);
    console.log(`   元の馬名: "${horse.umamei}"`);
    console.log(`   正規化後の馬名: "${horseName}"\n`);
    
    // 3. umadataテーブルで過去走データを検索
    console.log(`【3. umadataテーブルで過去走データを検索】`);
    
    // 完全一致
    const exactMatch = db.prepare(`
        SELECT COUNT(*) as count FROM umadata 
        WHERE TRIM(horse_name) = ?
    `).get(horseName);
    
    console.log(`   完全一致: ${exactMatch.count}件`);
    
    // 部分一致
    const partialMatch = db.prepare(`
        SELECT COUNT(*) as count FROM umadata 
        WHERE horse_name LIKE ?
    `).get(`%${horseName}%`);
    
    console.log(`   部分一致: ${partialMatch.count}件\n`);
    
    // 4. umadataテーブルから過去走データを取得（APIと同じロジック）
    console.log(`【4. umadataテーブルから過去走データを取得（APIと同じロジック）】`);
    const pastRacesRaw = db.prepare(`
        SELECT * FROM umadata
        WHERE TRIM(horse_name) = ?
        ORDER BY date DESC
        LIMIT 5
    `).all(horseName);
    
    console.log(`   取得件数: ${pastRacesRaw.length}件\n`);
    
    if (pastRacesRaw.length > 0) {
        console.log(`   過去走データの詳細:`);
        pastRacesRaw.forEach((race, idx) => {
            console.log(`\n   ${idx + 1}. date: "${race.date}"`);
            console.log(`      place: "${race.place}"`);
            console.log(`      distance: "${race.distance}"`);
            console.log(`      race_id_new_no_horse_num: "${race.race_id_new_no_horse_num}"`);
            console.log(`      horse_number: "${race.horse_number}"`);
            console.log(`      着順: ${race.finish_position || '(NULL)'}`);
            console.log(`      走破タイム: ${race.finish_time || '(NULL)'}`);
            
            // レースIDを生成
            const raceIdBase = race.race_id_new_no_horse_num || '';
            const horseNum = String(race.horse_number || '').padStart(2, '0');
            const fullRaceId = `${raceIdBase}${horseNum}`;
            console.log(`      生成されたrace_id: "${fullRaceId}"`);
            
            // indicesデータを取得
            const indexData = db.prepare(`
                SELECT L4F, T2F, potential, revouma, makikaeshi, cushion
                FROM indices WHERE race_id = ?
            `).get(fullRaceId);
            
            if (indexData) {
                console.log(`      ✅ indicesデータあり`);
                console.log(`         makikaeshi: ${indexData.makikaeshi}`);
                console.log(`         potential: ${indexData.potential}`);
            } else {
                console.log(`      ❌ indicesデータなし`);
            }
        });
        
        // 5. ユーザーが指定した日付の過去走を確認
        console.log(`\n【5. ユーザーが指定した日付の過去走を確認】`);
        const targetDates = ['2025.09.06', '2025.11.16', '2025.07.20'];
        
        targetDates.forEach(targetDate => {
            const found = pastRacesRaw.find(r => r.date === targetDate);
            if (found) {
                console.log(`   ✅ ${targetDate}: 見つかりました`);
                console.log(`      place: ${found.place}, distance: ${found.distance}`);
            } else {
                console.log(`   ❌ ${targetDate}: 見つかりませんでした`);
                
                // 類似の日付を探す
                const similar = pastRacesRaw.filter(r => {
                    const rDate = r.date.replace(/\s+/g, '');
                    const tDate = targetDate.replace(/\s+/g, '');
                    return rDate.includes(tDate) || tDate.includes(rDate);
                });
                
                if (similar.length > 0) {
                    console.log(`      類似の日付が見つかりました:`);
                    similar.forEach(s => {
                        console.log(`        "${s.date}" (place: ${s.place}, distance: ${s.distance})`);
                    });
                }
            }
        });
        
        // 6. 日付形式の違いを確認
        console.log(`\n【6. 日付形式の違いを確認】`);
        console.log(`   umadataテーブルの日付形式サンプル:`);
        const dateSamples = db.prepare(`
            SELECT DISTINCT date FROM umadata 
            WHERE horse_name LIKE ?
            ORDER BY date DESC
            LIMIT 10
        `).all(`%${horseName}%`);
        
        dateSamples.forEach((row, idx) => {
            console.log(`     ${idx + 1}. "${row.date}"`);
        });
        
    } else {
        console.log(`   ⚠️ 過去走データが見つかりませんでした\n`);
        
        // 7. 別の馬名パターンで検索
        console.log(`【7. 別の馬名パターンで検索】`);
        const patterns = [
            horse.umamei.trim(),
            horse.umamei.replace(/\s+/g, ''),
            horse.umamei.replace(/　/g, ''),
            'アーレムアレス',
            'アーレム アレス',
            'アーレム　アレス',
        ];
        
        for (const pattern of patterns) {
            const found = db.prepare(`
                SELECT COUNT(*) as count FROM umadata 
                WHERE horse_name LIKE ?
            `).get(`%${pattern}%`);
            
            if (found.count > 0) {
                console.log(`   ✅ パターン "${pattern}": ${found.count}件見つかりました`);
                
                const sample = db.prepare(`
                    SELECT DISTINCT horse_name FROM umadata 
                    WHERE horse_name LIKE ?
                    LIMIT 3
                `).all(`%${pattern}%`);
                
                sample.forEach(row => {
                    console.log(`      "${row.horse_name}"`);
                });
            } else {
                console.log(`   ❌ パターン "${pattern}": 見つかりませんでした`);
            }
        }
    }
    
    // 8. APIレスポンスの構造をシミュレート
    console.log(`\n【8. APIレスポンスの構造をシミュレート】`);
    if (pastRacesRaw.length > 0) {
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
            } catch {
                // 指数データがない場合は無視
            }
            
            return {
                ...race,
                indices: raceIndices,
                indexRaceId: fullRaceId
            };
        });
        
        console.log(`   past_races配列の長さ: ${pastRacesWithIndices.length}`);
        console.log(`   各過去走の日付:`);
        pastRacesWithIndices.forEach((race, idx) => {
            console.log(`     ${idx + 1}. "${race.date}" (place: ${race.place}, distance: ${race.distance})`);
        });
    }

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 調査完了 ===');
















