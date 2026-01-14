const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== 馬名マッチング問題の詳細調査 ===\n');

try {
    // 1. wakujunテーブルの馬名サンプル（date='1227'）
    console.log('【1. wakujunテーブルの馬名サンプル（date=1227）】');
    const wakujunHorses = db.prepare(`
        SELECT DISTINCT umamei FROM wakujun 
        WHERE date='1227'
        ORDER BY umamei
        LIMIT 10
    `).all();
    
    wakujunHorses.forEach((row, idx) => {
        const name = row.umamei;
        const normalized = name.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
        console.log(`   ${idx + 1}. 元: "${name}" (長さ: ${name.length})`);
        console.log(`      正規化後: "${normalized}" (長さ: ${normalized.length})`);
        console.log(`      文字コード: ${Array.from(name).map(c => c.charCodeAt(0)).join(', ')}`);
    });
    
    // 2. umadataテーブルの馬名サンプル
    console.log('\n【2. umadataテーブルの馬名サンプル】');
    const umadataHorses = db.prepare(`
        SELECT DISTINCT horse_name FROM umadata 
        ORDER BY horse_name
        LIMIT 20
    `).all();
    
    umadataHorses.forEach((row, idx) => {
        const name = row.horse_name;
        const normalized = name.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
        console.log(`   ${idx + 1}. 元: "${name}" (長さ: ${name.length})`);
        console.log(`      正規化後: "${normalized}" (長さ: ${normalized.length})`);
    });
    
    // 3. 特定の馬名で詳細調査
    console.log('\n【3. 特定の馬名で詳細調査】');
    const testHorseName = 'チュラヴェール';
    console.log(`   調査対象: "${testHorseName}"`);
    
    // wakujunで検索
    const wakujunMatch = db.prepare(`
        SELECT * FROM wakujun 
        WHERE umamei LIKE ?
        LIMIT 1
    `).get(`%${testHorseName}%`);
    
    if (wakujunMatch) {
        console.log(`   ✅ wakujunで見つかりました: "${wakujunMatch.umamei}"`);
    }
    
    // umadataで検索（部分一致）
    const umadataMatches = db.prepare(`
        SELECT DISTINCT horse_name FROM umadata 
        WHERE horse_name LIKE ?
        LIMIT 10
    `).all(`%${testHorseName}%`);
    
    if (umadataMatches.length > 0) {
        console.log(`   ✅ umadataで ${umadataMatches.length}件見つかりました:`);
        umadataMatches.forEach((row, idx) => {
            console.log(`      ${idx + 1}. "${row.horse_name}"`);
        });
    } else {
        console.log(`   ❌ umadataで見つかりませんでした`);
        
        // 類似の馬名を探す（文字列の一部が一致するもの）
        console.log(`\n   類似の馬名を探します...`);
        const similarNames = db.prepare(`
            SELECT DISTINCT horse_name FROM umadata 
            WHERE horse_name LIKE '%チュラ%' OR horse_name LIKE '%ヴェール%'
            LIMIT 10
        `).all();
        
        if (similarNames.length > 0) {
            console.log(`   類似の馬名が見つかりました:`);
            similarNames.forEach((row, idx) => {
                console.log(`      ${idx + 1}. "${row.horse_name}"`);
            });
        }
    }
    
    // 4. 馬名の文字コード比較
    console.log('\n【4. 馬名の文字コード比較】');
    if (wakujunMatch && umadataMatches.length > 0) {
        const wakujunName = wakujunMatch.umamei;
        const umadataName = umadataMatches[0].horse_name;
        
        console.log(`   wakujun: "${wakujunName}"`);
        console.log(`   文字コード: ${Array.from(wakujunName).map(c => `${c}(${c.charCodeAt(0)})`).join(' ')}`);
        console.log(`\n   umadata: "${umadataName}"`);
        console.log(`   文字コード: ${Array.from(umadataName).map(c => `${c}(${c.charCodeAt(0)})`).join(' ')}`);
        
        // 比較
        if (wakujunName === umadataName) {
            console.log(`\n   ✅ 完全一致`);
        } else {
            console.log(`\n   ❌ 不一致`);
            console.log(`   差分: ${wakujunName !== umadataName ? '文字列が異なる' : '同じ'}`);
        }
    }
    
    // 5. 実際にマッチングできる馬を探す
    console.log('\n【5. 実際にマッチングできる馬を探す】');
    const wakujunAll = db.prepare(`
        SELECT DISTINCT umamei FROM wakujun 
        WHERE date='1227'
    `).all();
    
    let matchedCount = 0;
    let unmatchedCount = 0;
    const matchedHorses = [];
    const unmatchedHorses = [];
    
    for (const wakujunRow of wakujunAll.slice(0, 20)) { // 最初の20頭をテスト
        const wakujunName = wakujunRow.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
        const umadataMatch = db.prepare(`
            SELECT COUNT(*) as count FROM umadata 
            WHERE TRIM(horse_name) = ?
        `).get(wakujunName);
        
        if (umadataMatch.count > 0) {
            matchedCount++;
            matchedHorses.push(wakujunName);
        } else {
            unmatchedCount++;
            unmatchedHorses.push(wakujunName);
        }
    }
    
    console.log(`   マッチング結果（最初の20頭）:`);
    console.log(`   ✅ マッチ: ${matchedCount}頭`);
    console.log(`   ❌ マッチしない: ${unmatchedCount}頭`);
    
    if (matchedHorses.length > 0) {
        console.log(`\n   マッチした馬名:`);
        matchedHorses.slice(0, 5).forEach((name, idx) => {
            console.log(`     ${idx + 1}. "${name}"`);
        });
    }
    
    if (unmatchedHorses.length > 0) {
        console.log(`\n   マッチしない馬名:`);
        unmatchedHorses.slice(0, 5).forEach((name, idx) => {
            console.log(`     ${idx + 1}. "${name}"`);
            
            // 部分一致で探す
            const partialMatch = db.prepare(`
                SELECT DISTINCT horse_name FROM umadata 
                WHERE horse_name LIKE ?
                LIMIT 3
            `).all(`%${name}%`);
            
            if (partialMatch.length > 0) {
                console.log(`       部分一致で見つかった: ${partialMatch.map(r => `"${r.horse_name}"`).join(', ')}`);
            }
        });
    }

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 調査完了 ===');



















