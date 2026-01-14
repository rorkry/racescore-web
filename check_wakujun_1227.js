const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== wakujunテーブル 12/27データ確認 ===\n');

try {
    // 1. 全データの件数確認
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM wakujun').get();
    console.log(`【全データ件数】: ${totalCount.count}件\n`);
    
    // 2. date列の形式を確認（1227形式と20251227形式の両方）
    console.log('【date列の形式確認】');
    const dateFormats = db.prepare(`
        SELECT 
            CASE 
                WHEN date GLOB '[0-9][0-9][0-9][0-9]' THEN '4桁形式'
                WHEN date GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN '8桁形式'
                WHEN LENGTH(date) = 18 THEN '18桁形式(レースID)'
                ELSE 'その他'
            END as format,
            COUNT(*) as count
        FROM wakujun
        GROUP BY format
        ORDER BY count DESC
    `).all();
    
    dateFormats.forEach(row => {
        console.log(`  ${row.format}: ${row.count}件`);
    });
    
    // 3. 1227形式のデータ確認
    console.log('\n【1227形式のデータ確認】');
    const date1227 = db.prepare(`
        SELECT COUNT(*) as count
        FROM wakujun
        WHERE date = '1227'
    `).get();
    console.log(`  date='1227'のデータ: ${date1227.count}件`);
    
    if (date1227.count > 0) {
        // 場所とレース数の確認
        const places = db.prepare(`
            SELECT place, COUNT(DISTINCT race_number) as race_count, COUNT(*) as horse_count
            FROM wakujun
            WHERE date = '1227'
            GROUP BY place
            ORDER BY place
        `).all();
        
        console.log('\n  【場所別データ】');
        places.forEach(p => {
            console.log(`    ${p.place}: ${p.race_count}レース, ${p.horse_count}頭`);
        });
        
        // サンプルデータ表示
        console.log('\n  【サンプルデータ（最初の5件）】');
        const samples = db.prepare(`
            SELECT date, place, race_number, waku, umaban, umamei
            FROM wakujun
            WHERE date = '1227'
            LIMIT 5
        `).all();
        samples.forEach((row, idx) => {
            console.log(`    ${idx + 1}. date="${row.date}", place="${row.place}", race_number="${row.race_number}", 枠${row.waku} 馬番${row.umaban} ${row.umamei}`);
        });
    }
    
    // 4. 20251227形式のデータ確認（もしあれば）
    console.log('\n【20251227形式のデータ確認】');
    const date20251227 = db.prepare(`
        SELECT COUNT(*) as count
        FROM wakujun
        WHERE date = '20251227'
    `).get();
    console.log(`  date='20251227'のデータ: ${date20251227.count}件`);
    
    // 5. 最近追加されたデータの確認（created_atで）
    console.log('\n【最近追加されたデータ（最新5件）】');
    const recent = db.prepare(`
        SELECT date, place, race_number, created_at
        FROM wakujun
        ORDER BY created_at DESC
        LIMIT 5
    `).all();
    recent.forEach((row, idx) => {
        console.log(`    ${idx + 1}. date="${row.date}", place="${row.place}", race_number="${row.race_number}", created_at="${row.created_at}"`);
    });
    
    // 6. APIで取得されるべきデータの確認
    console.log('\n【APIで取得されるべきデータ（date=1227）】');
    const apiData = db.prepare(`
        SELECT DISTINCT place
        FROM wakujun
        WHERE date = '1227'
        ORDER BY place
    `).all();
    
    if (apiData.length > 0) {
        console.log(`  見つかった場所数: ${apiData.length}`);
        apiData.forEach((p, idx) => {
            const races = db.prepare(`
                SELECT DISTINCT race_number, COUNT(*) as horse_count
                FROM wakujun
                WHERE date = '1227' AND place = ?
                GROUP BY race_number
                ORDER BY CAST(race_number AS INTEGER)
            `).all(p.place);
            console.log(`    ${idx + 1}. ${p.place}: ${races.length}レース`);
            races.forEach(r => {
                console.log(`       レース${r.race_number}: ${r.horse_count}頭`);
            });
        });
    } else {
        console.log('  ⚠️ date=1227のデータが見つかりませんでした');
    }
    
} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 診断終了 ===');


















