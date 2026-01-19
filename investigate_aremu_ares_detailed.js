const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== アーレムアレスの過去走データ詳細調査 ===\n');

try {
    const horseName = 'アーレムアレス';
    
    // 1. 様々なパターンでumadataテーブルを検索
    console.log('【1. 様々なパターンでumadataテーブルを検索】');
    
    // パターン1: 完全一致
    console.log('\n   パターン1: 完全一致');
    const exactMatches = db.prepare(`
        SELECT * FROM umadata 
        WHERE TRIM(horse_name) = ?
        ORDER BY date DESC
    `).all(horseName);
    console.log(`   件数: ${exactMatches.length}`);
    exactMatches.forEach((r, idx) => {
        console.log(`     ${idx + 1}. date: "${r.date}", place: "${r.place}", distance: "${r.distance}"`);
    });
    
    // パターン2: 部分一致（前方一致）
    console.log('\n   パターン2: 部分一致（前方一致）');
    const prefixMatches = db.prepare(`
        SELECT * FROM umadata 
        WHERE horse_name LIKE ?
        ORDER BY date DESC
    `).all(`${horseName}%`);
    console.log(`   件数: ${prefixMatches.length}`);
    prefixMatches.forEach((r, idx) => {
        console.log(`     ${idx + 1}. horse_name: "${r.horse_name}", date: "${r.date}", place: "${r.place}"`);
    });
    
    // パターン3: 部分一致（含む）
    console.log('\n   パターン3: 部分一致（含む）');
    const containsMatches = db.prepare(`
        SELECT * FROM umadata 
        WHERE horse_name LIKE ?
        ORDER BY date DESC
    `).all(`%${horseName}%`);
    console.log(`   件数: ${containsMatches.length}`);
    containsMatches.forEach((r, idx) => {
        console.log(`     ${idx + 1}. horse_name: "${r.horse_name}", date: "${r.date}", place: "${r.place}"`);
    });
    
    // 2. 日付形式の違いを確認
    console.log('\n【2. 日付形式の違いを確認】');
    const targetDates = [
        '2025.09.06',
        '2025. 9. 6',
        '2025. 9.06',
        '2025.09. 6',
        '2025.11.16',
        '2025.11.16',
        '2025. 7.20',
        '2025.07.20',
    ];
    
    targetDates.forEach(targetDate => {
        const found = db.prepare(`
            SELECT * FROM umadata 
            WHERE horse_name = ? AND date = ?
        `).all(horseName, targetDate);
        
        if (found.length > 0) {
            console.log(`   ✅ "${targetDate}": ${found.length}件見つかりました`);
        } else {
            // 類似の日付を探す（スペースの有無を無視）
            const similar = db.prepare(`
                SELECT * FROM umadata 
                WHERE horse_name = ? AND REPLACE(REPLACE(date, ' ', ''), '.', '') LIKE ?
            `).all(horseName, `%${targetDate.replace(/\s+/g, '').replace(/\./g, '')}%`);
            
            if (similar.length > 0) {
                console.log(`   ⚠️ "${targetDate}": 完全一致なし、類似: ${similar.length}件`);
                similar.forEach(s => {
                    console.log(`      "${s.date}" (place: ${s.place}, distance: ${s.distance})`);
                });
            }
        }
    });
    
    // 3. 札幌と京都のレースを探す
    console.log('\n【3. 札幌と京都のレースを探す】');
    const sapporoRaces = db.prepare(`
        SELECT * FROM umadata 
        WHERE horse_name = ? AND place LIKE '%札幌%'
        ORDER BY date DESC
    `).all(horseName);
    
    console.log(`   札幌のレース: ${sapporoRaces.length}件`);
    sapporoRaces.forEach((r, idx) => {
        console.log(`     ${idx + 1}. date: "${r.date}", distance: "${r.distance}"`);
    });
    
    const kyotoRaces = db.prepare(`
        SELECT * FROM umadata 
        WHERE horse_name = ? AND place LIKE '%京都%'
        ORDER BY date DESC
    `).all(horseName);
    
    console.log(`   京都のレース: ${kyotoRaces.length}件`);
    kyotoRaces.forEach((r, idx) => {
        console.log(`     ${idx + 1}. date: "${r.date}", distance: "${r.distance}"`);
    });
    
    // 4. 全過去走データを取得（日付形式を正規化して比較）
    console.log('\n【4. 全過去走データを取得（日付形式を正規化して比較）】');
    const allRaces = db.prepare(`
        SELECT * FROM umadata 
        WHERE TRIM(horse_name) = ?
        ORDER BY date DESC
    `).all(horseName);
    
    console.log(`   全過去走: ${allRaces.length}件\n`);
    allRaces.forEach((r, idx) => {
        const normalizedDate = r.date.replace(/\s+/g, '');
        console.log(`   ${idx + 1}. date: "${r.date}" (正規化: "${normalizedDate}")`);
        console.log(`      place: "${r.place}", distance: "${r.distance}"`);
        console.log(`      race_id_new_no_horse_num: "${r.race_id_new_no_horse_num}"`);
        console.log(`      horse_number: "${r.horse_number}"`);
        
        // ユーザーが指定した日付と比較
        const userDates = ['2025.09.06', '2025.11.16', '2025.07.20'];
        userDates.forEach(userDate => {
            if (normalizedDate === userDate || normalizedDate.replace(/\./g, '') === userDate.replace(/\./g, '')) {
                console.log(`      ✅ ユーザー指定日付 "${userDate}" と一致`);
            }
        });
        console.log('');
    });
    
    // 5. 日付の正規化ロジックを確認
    console.log('【5. 日付の正規化ロジックを確認】');
    const testDates = [
        '2025. 7.20',
        '2025.07.20',
        '2025. 9. 6',
        '2025.09.06',
        '2025.11.16',
        '2025. 11. 16',
    ];
    
    console.log('   日付の正規化テスト:');
    testDates.forEach(testDate => {
        const normalized = testDate.replace(/\s+/g, '');
        console.log(`     "${testDate}" → "${normalized}"`);
    });

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 調査完了 ===');




















