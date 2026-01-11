const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== 指定日付のレースデータ存在確認 ===\n');

try {
    // 1. 2025.09.06の札幌芝1800mのレースデータを確認
    console.log('【1. 2025.09.06の札幌芝1800mのレースデータを確認】');
    const sapporoRaces = db.prepare(`
        SELECT * FROM umadata 
        WHERE date LIKE '%2025%9%6%' AND place LIKE '%札幌%' AND distance LIKE '%1800%'
        ORDER BY date DESC
        LIMIT 10
    `).all();
    
    console.log(`   見つかったレース数: ${sapporoRaces.length}件\n`);
    if (sapporoRaces.length > 0) {
        console.log(`   サンプルデータ:`);
        sapporoRaces.slice(0, 5).forEach((r, idx) => {
            console.log(`     ${idx + 1}. date: "${r.date}", horse_name: "${r.horse_name}", distance: "${r.distance}"`);
        });
        
        // アーレムアレスが含まれているか確認
        const aremuInSapporo = sapporoRaces.find(r => r.horse_name && r.horse_name.includes('アーレム'));
        if (aremuInSapporo) {
            console.log(`\n   ✅ アーレムアレス関連のデータが見つかりました:`);
            console.log(`      horse_name: "${aremuInSapporo.horse_name}"`);
            console.log(`      date: "${aremuInSapporo.date}"`);
        } else {
            console.log(`\n   ❌ アーレムアレス関連のデータが見つかりませんでした`);
        }
    }
    
    // 2. 2025.11.16の京都芝2000mのレースデータを確認
    console.log('\n【2. 2025.11.16の京都芝2000mのレースデータを確認】');
    const kyotoRaces = db.prepare(`
        SELECT * FROM umadata 
        WHERE date LIKE '%2025%11%16%' AND place LIKE '%京都%' AND distance LIKE '%2000%'
        ORDER BY date DESC
        LIMIT 10
    `).all();
    
    console.log(`   見つかったレース数: ${kyotoRaces.length}件\n`);
    if (kyotoRaces.length > 0) {
        console.log(`   サンプルデータ:`);
        kyotoRaces.slice(0, 5).forEach((r, idx) => {
            console.log(`     ${idx + 1}. date: "${r.date}", horse_name: "${r.horse_name}", distance: "${r.distance}"`);
        });
        
        // アーレムアレスが含まれているか確認
        const aremuInKyoto = kyotoRaces.find(r => r.horse_name && r.horse_name.includes('アーレム'));
        if (aremuInKyoto) {
            console.log(`\n   ✅ アーレムアレス関連のデータが見つかりました:`);
            console.log(`      horse_name: "${aremuInKyoto.horse_name}"`);
            console.log(`      date: "${aremuInKyoto.date}"`);
        } else {
            console.log(`\n   ❌ アーレムアレス関連のデータが見つかりませんでした`);
        }
    }
    
    // 3. 日付形式のバリエーションを確認
    console.log('\n【3. 日付形式のバリエーションを確認】');
    const datePatterns = [
        '2025.09.06',
        '2025. 9. 6',
        '2025. 9.06',
        '2025.09. 6',
        '2025.11.16',
        '2025. 11. 16',
        '2025. 11.16',
        '2025.11. 16',
    ];
    
    datePatterns.forEach(pattern => {
        const count = db.prepare(`
            SELECT COUNT(*) as count FROM umadata 
            WHERE date = ?
        `).get(pattern);
        
        if (count.count > 0) {
            console.log(`   ✅ "${pattern}": ${count.count}件`);
        }
    });
    
    // 4. umadataテーブルの日付形式の分布を確認
    console.log('\n【4. umadataテーブルの日付形式の分布を確認】');
    const dateFormats = db.prepare(`
        SELECT 
            CASE 
                WHEN date LIKE '2025. %' THEN '2025. 月.日 (スペースあり)'
                WHEN date LIKE '2025.%' THEN '2025.月.日 (スペースなし)'
                ELSE 'その他'
            END as format,
            COUNT(*) as count
        FROM umadata
        GROUP BY format
        ORDER BY count DESC
    `).all();
    
    dateFormats.forEach(row => {
        console.log(`   ${row.format}: ${row.count}件`);
    });
    
    // 5. アーレムアレスという名前の類似馬名を探す
    console.log('\n【5. アーレムアレスという名前の類似馬名を探す】');
    const similarNames = db.prepare(`
        SELECT DISTINCT horse_name FROM umadata 
        WHERE horse_name LIKE '%アーレム%' OR horse_name LIKE '%アレス%'
        ORDER BY horse_name
    `).all();
    
    console.log(`   類似馬名: ${similarNames.length}件`);
    similarNames.forEach((row, idx) => {
        console.log(`     ${idx + 1}. "${row.horse_name}"`);
    });

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 調査完了 ===');












