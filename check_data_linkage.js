const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== データ紐付け確認 ===\n');

try {
    // 1. umadataテーブルの状態
    console.log('【1. umadataテーブルの状態】');
    const umadataCount = db.prepare('SELECT COUNT(*) as count FROM umadata').get();
    console.log(`   総件数: ${umadataCount.count}件\n`);

    if (umadataCount.count > 0) {
        // サンプルデータ
        const umadataSample = db.prepare('SELECT * FROM umadata LIMIT 3').all();
        console.log('   サンプルデータ:');
        umadataSample.forEach((row, idx) => {
            console.log(`   ${idx + 1}. horse_name="${row.horse_name}", race_id_new_no_horse_num="${row.race_id_new_no_horse_num}", horse_number="${row.horse_number}"`);
        });
    }

    // 2. wakujunテーブルの状態
    console.log('\n【2. wakujunテーブルの状態】');
    const wakujunCount = db.prepare('SELECT COUNT(*) as count FROM wakujun').get();
    console.log(`   総件数: ${wakujunCount.count}件`);

    if (wakujunCount.count > 0) {
        // サンプルデータ（date=1227）
        const wakujunSample = db.prepare(`
            SELECT * FROM wakujun 
            WHERE date = '1227' 
            LIMIT 3
        `).all();
        console.log('\n   サンプルデータ（date=1227）:');
        wakujunSample.forEach((row, idx) => {
            console.log(`   ${idx + 1}. umamei="${row.umamei}", place="${row.place}", race_number="${row.race_number}", umaban="${row.umaban}"`);
        });
    }

    // 3. 紐付けテスト（wakujun → umadata）
    console.log('\n【3. 紐付けテスト（wakujun → umadata）】');
    const testHorse = db.prepare(`
        SELECT umamei FROM wakujun 
        WHERE date = '1227' 
        LIMIT 1
    `).get();

    if (testHorse) {
        const horseName = testHorse.umamei.trim();
        console.log(`   テスト馬名: "${horseName}"`);
        
        const pastRaces = db.prepare(`
            SELECT * FROM umadata
            WHERE TRIM(horse_name) = ?
            ORDER BY date DESC
            LIMIT 3
        `).all(horseName);

        console.log(`   見つかった過去走: ${pastRaces.length}件`);
        pastRaces.forEach((race, idx) => {
            const raceIdBase = race.race_id_new_no_horse_num || '';
            const horseNum = String(race.horse_number || '').padStart(2, '0');
            const fullRaceId = `${raceIdBase}${horseNum}`;
            console.log(`   ${idx + 1}. race_id_new_no_horse_num="${raceIdBase}", horse_number="${race.horse_number}"`);
            console.log(`      → 生成されたrace_id: "${fullRaceId}"`);
            
            // indicesテーブルで検索
            const indexData = db.prepare(`
                SELECT * FROM indices WHERE race_id = ?
            `).get(fullRaceId);
            
            if (indexData) {
                console.log(`      ✅ indicesデータが見つかりました: makikaeshi=${indexData.makikaeshi}`);
            } else {
                console.log(`      ❌ indicesデータが見つかりませんでした`);
            }
        });
    }

    // 4. indicesテーブルのrace_id形式確認
    console.log('\n【4. indicesテーブルのrace_id形式確認】');
    const indicesCount = db.prepare('SELECT COUNT(*) as count FROM indices').get();
    console.log(`   indicesテーブルの件数: ${indicesCount.count}件`);

    if (indicesCount.count > 0) {
        const indicesSample = db.prepare('SELECT * FROM indices LIMIT 3').all();
        console.log('\n   サンプルデータ:');
        indicesSample.forEach((row, idx) => {
            console.log(`   ${idx + 1}. race_id="${row.race_id}" (長さ: ${row.race_id?.length || 0})`);
            console.log(`      makikaeshi=${row.makikaeshi}, L4F=${row.L4F}, T2F=${row.T2F}`);
        });
    } else {
        console.log('   ⚠️ indicesテーブルにデータがありません');
    }

    // 5. 紐付けロジックの確認
    console.log('\n【5. 紐付けロジック確認】');
    console.log('   wakujun → umadata: 馬名（TRIM(horse_name) = TRIM(umamei)）');
    console.log('   umadata → indices: race_id = race_id_new_no_horse_num + 馬番(2桁ゼロ埋め)');
    console.log('   例: race_id_new_no_horse_num="2025121406050412", horse_number="1"');
    console.log('       → race_id="202512140605041201"');

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 確認完了 ===');



















