const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== /api/races APIのテスト ===\n');

try {
    const date = '1227';
    
    console.log(`【date=${date}でのvenues取得テスト】\n`);
    
    // APIと同じロジックで実行
    const places = db.prepare(`
        SELECT DISTINCT place
        FROM wakujun
        WHERE date = ?
        ORDER BY place
    `).all(date);
    
    console.log(`見つかった場所数: ${places.length}`);
    places.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.place}`);
    });
    
    const result = places.map((p) => {
        const races = db.prepare(`
            SELECT DISTINCT 
                date, 
                place, 
                race_number, 
                class_name_1 as class_name,
                track_type,
                distance,
                COUNT(*) as field_size
            FROM wakujun
            WHERE date = ? AND place = ?
            GROUP BY date, place, race_number
            ORDER BY CAST(race_number AS INTEGER)
        `).all(date, p.place);
        
        return {
            place: p.place,
            races
        };
    });
    
    console.log('\n【APIレスポンス構造】');
    console.log(JSON.stringify({
        date: date,
        venues: result
    }, null, 2));
    
    console.log('\n【venues配列の長さ】');
    console.log(`venues.length: ${result.length}`);
    
    if (result.length > 0) {
        console.log('\n【最初のvenueの詳細】');
        const firstVenue = result[0];
        console.log(`  place: "${firstVenue.place}"`);
        console.log(`  races.length: ${firstVenue.races.length}`);
        if (firstVenue.races.length > 0) {
            console.log(`  最初のレース:`, firstVenue.races[0]);
        }
    }
    
} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();


















