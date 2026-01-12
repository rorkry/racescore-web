const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== 日付データの問題診断 ===\n');

try {
    // dateカラムの値の種類を確認
    const dateValues = db.prepare(`
        SELECT DISTINCT date, COUNT(*) as count
        FROM wakujun
        GROUP BY date
        ORDER BY count DESC
        LIMIT 20
    `).all();
    
    console.log('【dateカラムの値（上位20件）】');
    dateValues.forEach((row, idx) => {
        const dateStr = row.date;
        const length = dateStr ? dateStr.length : 0;
        const is4Digit = /^\d{4}$/.test(dateStr);
        const is18Digit = /^\d{18}$/.test(dateStr);
        console.log(`${idx + 1}. date="${dateStr}" (長さ: ${length}, 4桁: ${is4Digit}, 18桁: ${is18Digit}, 件数: ${row.count})`);
    });
    
    // 4桁の日付のみをカウント
    const validDates = db.prepare(`
        SELECT DISTINCT date
        FROM wakujun
        WHERE date GLOB '[0-9][0-9][0-9][0-9]'
    `).all();
    
    console.log(`\n【4桁の日付のみ】】`);
    console.log(`有効な日付数: ${validDates.length}`);
    validDates.forEach((row, idx) => {
        console.log(`  ${idx + 1}. ${row.date}`);
    });
    
    // 18桁のレースIDのような値のサンプル
    const raceIdLike = db.prepare(`
        SELECT DISTINCT date
        FROM wakujun
        WHERE LENGTH(date) = 18
        LIMIT 5
    `).all();
    
    console.log(`\n【18桁の値（レースID？）のサンプル】`);
    raceIdLike.forEach((row, idx) => {
        const id = row.date;
        // 18桁のレースIDを解析: 202512270605070101
        // 20251227 (8桁: 年月日) + 06 (場所?) + 05 (?) + 07 (?) + 01 (レース番号?) + 01 (馬番?)
        if (id && id.length === 18) {
            const year = id.substring(0, 4);
            const month = id.substring(4, 6);
            const day = id.substring(6, 8);
            const place = id.substring(8, 10);
            const rest = id.substring(10);
            console.log(`  ${idx + 1}. ${id} → ${year}-${month}-${day} (場所: ${place}, 残り: ${rest})`);
        }
    });
    
    // 実際のCSVの最初の列（row[0]）がどこに入っているか確認
    console.log(`\n【サンプルデータの詳細】`);
    const sample = db.prepare('SELECT * FROM wakujun LIMIT 1').get();
    if (sample) {
        console.log(`date: "${sample.date}" (長さ: ${sample.date?.length || 0})`);
        console.log(`place: "${sample.place}"`);
        console.log(`race_number: "${sample.race_number}"`);
        console.log(`class_name_1: "${sample.class_name_1}"`);
        console.log(`waku: "${sample.waku}"`);
        console.log(`umaban: "${sample.umaban}"`);
    }
    
} catch (err) {
    console.error('❌ エラー:', err.message);
}

db.close();
console.log('\n=== 診断終了 ===');
















