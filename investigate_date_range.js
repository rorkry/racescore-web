const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== 日付範囲とマッチング問題の詳細調査 ===\n');

try {
    // 1. wakujunテーブルの日付範囲
    console.log('【1. wakujunテーブルの日付範囲】');
    const wakujunDates = db.prepare(`
        SELECT date, COUNT(*) as count
        FROM wakujun
        GROUP BY date
        ORDER BY date
    `).all();
    console.log(`   日付数: ${wakujunDates.length}`);
    wakujunDates.forEach(row => {
        console.log(`   date="${row.date}": ${row.count}件`);
    });
    
    // 2. umadataテーブルの日付範囲
    console.log('\n【2. umadataテーブルの日付範囲】');
    const umadataDates = db.prepare(`
        SELECT date, COUNT(*) as count
        FROM umadata
        GROUP BY date
        ORDER BY date DESC
        LIMIT 10
    `).all();
    console.log(`   最新10日分:`);
    umadataDates.forEach(row => {
        console.log(`   date="${row.date}": ${row.count}件`);
    });
    
    // 3. wakujunの馬名でumadataを検索（部分一致も含む）
    console.log('\n【3. wakujunの馬名でumadataを検索（部分一致）】');
    const wakujunHorses = db.prepare(`
        SELECT DISTINCT umamei FROM wakujun 
        WHERE date='1227'
        LIMIT 10
    `).all();
    
    for (const wakujunRow of wakujunHorses) {
        const wakujunName = wakujunRow.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
        console.log(`\n   馬名: "${wakujunName}"`);
        
        // 完全一致
        const exactMatch = db.prepare(`
            SELECT COUNT(*) as count FROM umadata 
            WHERE TRIM(horse_name) = ?
        `).get(wakujunName);
        
        if (exactMatch.count > 0) {
            console.log(`     ✅ 完全一致: ${exactMatch.count}件`);
        } else {
            // 部分一致
            const partialMatch = db.prepare(`
                SELECT DISTINCT horse_name, COUNT(*) as count FROM umadata 
                WHERE horse_name LIKE ?
                GROUP BY horse_name
                LIMIT 3
            `).all(`%${wakujunName}%`);
            
            if (partialMatch.length > 0) {
                console.log(`     ⚠️ 完全一致なし、部分一致: ${partialMatch.length}件`);
                partialMatch.forEach(row => {
                    console.log(`        "${row.horse_name}" (${row.count}件)`);
                });
            } else {
                console.log(`     ❌ 見つかりませんでした`);
            }
        }
    }
    
    // 4. 逆方向の検索：umadataの馬名でwakujunを検索
    console.log('\n【4. 逆方向の検索：umadataの馬名でwakujunを検索】');
    const umadataSample = db.prepare(`
        SELECT DISTINCT horse_name FROM umadata 
        ORDER BY horse_name
        LIMIT 10
    `).all();
    
    for (const umadataRow of umadataSample) {
        const umadataName = umadataRow.horse_name.trim();
        const wakujunMatch = db.prepare(`
            SELECT COUNT(*) as count FROM wakujun 
            WHERE TRIM(umamei) = ? OR TRIM(umamei) = ? OR TRIM(umamei) = ?
        `).get(umadataName, `$${umadataName}`, `*${umadataName}`);
        
        if (wakujunMatch.count > 0) {
            console.log(`   ✅ "${umadataName}" → wakujunで ${wakujunMatch.count}件見つかりました`);
        }
    }
    
    // 5. 実際にマッチングできる馬を探す（より詳細に）
    console.log('\n【5. 実際にマッチングできる馬を探す（より詳細に）】');
    const allWakujunHorses = db.prepare(`
        SELECT DISTINCT umamei FROM wakujun 
        WHERE date='1227'
    `).all();
    
    let matchedCount = 0;
    let partialMatchedCount = 0;
    let unmatchedCount = 0;
    const matchedDetails = [];
    
    for (const wakujunRow of allWakujunHorses) {
        const originalName = wakujunRow.umamei;
        const normalizedName = originalName.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
        
        // 完全一致
        const exactMatch = db.prepare(`
            SELECT COUNT(*) as count FROM umadata 
            WHERE TRIM(horse_name) = ?
        `).get(normalizedName);
        
        if (exactMatch.count > 0) {
            matchedCount++;
            matchedDetails.push({ name: normalizedName, type: 'exact', count: exactMatch.count });
        } else {
            // 部分一致
            const partialMatch = db.prepare(`
                SELECT COUNT(*) as count FROM umadata 
                WHERE horse_name LIKE ?
            `).get(`%${normalizedName}%`);
            
            if (partialMatch.count > 0) {
                partialMatchedCount++;
                matchedDetails.push({ name: normalizedName, type: 'partial', count: partialMatch.count });
            } else {
                unmatchedCount++;
            }
        }
    }
    
    console.log(`   マッチング結果（全${allWakujunHorses.length}頭）:`);
    console.log(`   ✅ 完全一致: ${matchedCount}頭`);
    console.log(`   ⚠️ 部分一致: ${partialMatchedCount}頭`);
    console.log(`   ❌ マッチしない: ${unmatchedCount}頭`);
    
    if (matchedDetails.length > 0) {
        console.log(`\n   マッチした馬名（最初の10頭）:`);
        matchedDetails.slice(0, 10).forEach((detail, idx) => {
            console.log(`     ${idx + 1}. "${detail.name}" (${detail.type}, ${detail.count}件)`);
        });
    }

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 調査完了 ===');




















