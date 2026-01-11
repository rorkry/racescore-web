const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== wakujunテーブル 確認クエリ ===\n');

try {
    // 1. 総データ件数
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM wakujun').get();
    console.log(`【1. 総データ件数】`);
    console.log(`   ${totalCount.count}件\n`);

    // 2. 日付別のデータ件数
    console.log(`【2. 日付別データ件数】`);
    const dateCounts = db.prepare(`
        SELECT date, COUNT(*) as count
        FROM wakujun
        GROUP BY date
        ORDER BY date DESC
    `).all();
    dateCounts.forEach(row => {
        const format = row.date.length === 4 ? '4桁形式' : `${row.date.length}桁形式`;
        console.log(`   date="${row.date}" (${format}): ${row.count}件`);
    });

    // 3. 場所別のレース数と頭数
    console.log(`\n【3. 場所別データ（date='1227'）】`);
    const placeData = db.prepare(`
        SELECT place, COUNT(DISTINCT race_number) as race_count, COUNT(*) as horse_count
        FROM wakujun
        WHERE date = '1227'
        GROUP BY place
        ORDER BY place
    `).all();
    placeData.forEach(row => {
        console.log(`   ${row.place}: ${row.race_count}レース, ${row.horse_count}頭`);
    });

    // 4. 特定のレースのデータ確認（date=1227, place=中山, race_number=1）
    console.log(`\n【4. 特定レースのデータ確認（date=1227, place=中山, race_number=1）】`);
    const raceData = db.prepare(`
        SELECT date, place, race_number, waku, umaban, umamei, kishu, kinryo
        FROM wakujun
        WHERE date = '1227' AND place = '中山' AND race_number = '1'
        ORDER BY CAST(umaban AS INTEGER)
        LIMIT 5
    `).all();
    
    if (raceData.length > 0) {
        console.log(`   見つかった馬数: ${raceData.length}頭`);
        raceData.forEach((row, idx) => {
            console.log(`   ${idx + 1}. 枠${row.waku} 馬番${row.umaban} ${row.umamei} (騎手: ${row.kishu}, 斤量: ${row.kinryo})`);
        });
    } else {
        console.log(`   ⚠️ データが見つかりませんでした`);
    }

    // 5. 列マッピングの確認（最初の1件の全カラム）
    console.log(`\n【5. 列マッピング確認（最初の1件）】`);
    const firstRow = db.prepare("SELECT * FROM wakujun WHERE date = '1227' LIMIT 1").get();
    if (firstRow) {
        console.log(`   date: "${firstRow.date}" (長さ: ${firstRow.date?.length || 0})`);
        console.log(`   place: "${firstRow.place}"`);
        console.log(`   race_number: "${firstRow.race_number}"`);
        console.log(`   class_name_1: "${firstRow.class_name_1}"`);
        console.log(`   waku: "${firstRow.waku}"`);
        console.log(`   umaban: "${firstRow.umaban}"`);
        console.log(`   umamei: "${firstRow.umamei}"`);
        console.log(`   kishu: "${firstRow.kishu}"`);
        console.log(`   kinryo: "${firstRow.kinryo}"`);
        console.log(`   track_type: "${firstRow.track_type}"`);
        console.log(`   distance: "${firstRow.distance}"`);
    }

    // 6. APIで取得されるべきデータの確認
    console.log(`\n【6. APIで取得されるべきデータ（date=1227）】`);
    const apiData = db.prepare(`
        SELECT DISTINCT place
        FROM wakujun
        WHERE date = '1227'
        ORDER BY place
    `).all();
    
    console.log(`   見つかった場所数: ${apiData.length}`);
    apiData.forEach((p, idx) => {
        const races = db.prepare(`
            SELECT DISTINCT race_number, COUNT(*) as horse_count
            FROM wakujun
            WHERE date = '1227' AND place = ?
            GROUP BY race_number
            ORDER BY CAST(race_number AS INTEGER)
        `).all(p.place);
        console.log(`   ${idx + 1}. ${p.place}: ${races.length}レース`);
        races.slice(0, 3).forEach(r => {
            console.log(`       レース${r.race_number}: ${r.horse_count}頭`);
        });
        if (races.length > 3) {
            console.log(`       ... (他${races.length - 3}レース)`);
        }
    });

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 確認完了 ===');

