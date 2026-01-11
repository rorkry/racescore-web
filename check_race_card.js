const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== レースカード表示の問題診断 ===\n');

try {
    // 正しい日付（1227）のデータを確認
    console.log('【date=1227のデータ確認】');
    const date1227 = db.prepare(`
        SELECT DISTINCT date, place, race_number, COUNT(*) as count
        FROM wakujun
        WHERE date = '1227'
        GROUP BY date, place, race_number
        ORDER BY place, CAST(race_number AS INTEGER)
        LIMIT 10
    `).all();
    
    if (date1227.length > 0) {
        console.log(`見つかったレース数: ${date1227.length}`);
        date1227.forEach((row, idx) => {
            console.log(`  ${idx + 1}. date="${row.date}", place="${row.place}", race_number="${row.race_number}", 件数=${row.count}`);
        });
    } else {
        console.log('  date=1227のデータが見つかりませんでした');
    }
    
    // 特定のレースのデータを確認（例: date=1227, place=中山, race_number=1）
    console.log('\n【特定レースのデータ確認（date=1227, place=中山, race_number=1）】');
    const raceData = db.prepare(`
        SELECT date, place, race_number, waku, umaban, umamei, kishu, kinryo
        FROM wakujun
        WHERE date = ? AND place = ? AND race_number = ?
        ORDER BY CAST(umaban AS INTEGER)
        LIMIT 5
    `).all('1227', '中山', '1');
    
    if (raceData.length > 0) {
        console.log(`見つかった馬数: ${raceData.length}`);
        raceData.forEach((row, idx) => {
            console.log(`  馬${idx + 1}: 枠${row.waku} 馬番${row.umaban} ${row.umamei} (騎手: ${row.kishu}, 斤量: ${row.kinryo})`);
        });
    } else {
        console.log('  データが見つかりませんでした');
        
        // placeの値を確認
        console.log('\n【date=1227のplace一覧】');
        const places = db.prepare(`
            SELECT DISTINCT place
            FROM wakujun
            WHERE date = '1227'
            ORDER BY place
        `).all();
        places.forEach((p, idx) => {
            console.log(`  ${idx + 1}. "${p.place}"`);
        });
        
        // race_numberの値を確認
        if (places.length > 0) {
            const firstPlace = places[0].place;
            console.log(`\n【date=1227, place="${firstPlace}"のrace_number一覧】`);
            const raceNumbers = db.prepare(`
                SELECT DISTINCT race_number
                FROM wakujun
                WHERE date = '1227' AND place = ?
                ORDER BY CAST(race_number AS INTEGER)
            `).all(firstPlace);
            raceNumbers.forEach((r, idx) => {
                console.log(`  ${idx + 1}. "${r.race_number}"`);
            });
        }
    }
    
    // データベースの実際のサンプルを確認
    console.log('\n【データベースのサンプル（最初の5件、date=1227のみ）】');
    const samples = db.prepare(`
        SELECT date, place, race_number, waku, umaban, umamei
        FROM wakujun
        WHERE date = '1227'
        LIMIT 5
    `).all();
    samples.forEach((row, idx) => {
        console.log(`  ${idx + 1}. date="${row.date}", place="${row.place}", race_number="${row.race_number}", 枠${row.waku} 馬番${row.umaban} ${row.umamei}`);
    });
    
} catch (err) {
    console.error('❌ エラー:', err.message);
}

db.close();
console.log('\n=== 診断終了 ===');












