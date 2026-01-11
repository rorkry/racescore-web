const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== umadataテーブルのデータ量確認 ===\n');

try {
    // 1. 総件数
    console.log('【1. umadataテーブルの総件数】');
    const totalCount = db.prepare(`
        SELECT COUNT(*) as count FROM umadata
    `).get();
    console.log(`   総件数: ${totalCount.count}件\n`);
    
    // 2. 馬名ごとの件数（上位20頭）
    console.log('【2. 馬名ごとの過去走件数（上位20頭）】');
    const horseCountsTop = db.prepare(`
        SELECT horse_name, COUNT(*) as count
        FROM umadata
        GROUP BY horse_name
        ORDER BY count DESC
        LIMIT 20
    `).all();
    
    horseCountsTop.forEach((row, idx) => {
        console.log(`   ${idx + 1}. "${row.horse_name}": ${row.count}件`);
    });
    
    // 3. 過去走件数の分布
    console.log('\n【3. 過去走件数の分布】');
    const distribution = db.prepare(`
        SELECT 
            CASE 
                WHEN count = 1 THEN '1件'
                WHEN count = 2 THEN '2件'
                WHEN count = 3 THEN '3件'
                WHEN count = 4 THEN '4件'
                WHEN count = 5 THEN '5件'
                WHEN count >= 6 AND count <= 10 THEN '6-10件'
                WHEN count >= 11 THEN '11件以上'
            END as range,
            COUNT(*) as horse_count
        FROM (
            SELECT horse_name, COUNT(*) as count
            FROM umadata
            GROUP BY horse_name
        )
        GROUP BY range
        ORDER BY MIN(count)
    `).all();
    
    distribution.forEach(row => {
        console.log(`   ${row.range}: ${row.horse_count}頭`);
    });
    
    // 4. 12/27のwakujunに登録されている馬の過去走件数を確認
    console.log('\n【4. 12/27のwakujunに登録されている馬の過去走件数】');
    
    // 中山11Rの馬を取得
    const nakayama11Horses = db.prepare(`
        SELECT umaban, umamei FROM wakujun
        WHERE date='1227' AND place='中山' AND race_number='11'
        ORDER BY umaban
    `).all();
    
    console.log(`   中山11R（${nakayama11Horses.length}頭）:\n`);
    
    nakayama11Horses.forEach(horse => {
        const horseName = horse.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
        const pastCount = db.prepare(`
            SELECT COUNT(*) as count FROM umadata
            WHERE TRIM(horse_name) = ?
        `).get(horseName);
        
        console.log(`     ${horse.umaban}番 "${horseName}": ${pastCount.count}件`);
    });
    
    // 5. 中山3Rの馬も確認（比較用）
    const nakayama3Horses = db.prepare(`
        SELECT umaban, umamei FROM wakujun
        WHERE date='1227' AND place='中山' AND race_number='3'
        ORDER BY umaban
    `).all();
    
    console.log(`\n   中山3R（${nakayama3Horses.length}頭）:\n`);
    
    nakayama3Horses.forEach(horse => {
        const horseName = horse.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
        const pastCount = db.prepare(`
            SELECT COUNT(*) as count FROM umadata
            WHERE TRIM(horse_name) = ?
        `).get(horseName);
        
        console.log(`     ${horse.umaban}番 "${horseName}": ${pastCount.count}件`);
    });
    
    // 6. 阪神11Rの馬も確認
    const hanshin11Horses = db.prepare(`
        SELECT umaban, umamei FROM wakujun
        WHERE date='1227' AND place='阪神' AND race_number='11'
        ORDER BY umaban
    `).all();
    
    if (hanshin11Horses.length > 0) {
        console.log(`\n   阪神11R（${hanshin11Horses.length}頭）:\n`);
        
        hanshin11Horses.forEach(horse => {
            const horseName = horse.umamei.trim().replace(/^[\$\*\s]+/, '').replace(/[\s]+$/, '').trim();
            const pastCount = db.prepare(`
                SELECT COUNT(*) as count FROM umadata
                WHERE TRIM(horse_name) = ?
            `).get(horseName);
            
            console.log(`     ${horse.umaban}番 "${horseName}": ${pastCount.count}件`);
        });
    }
    
    // 7. 過去走が5件以上ある馬の割合
    console.log('\n【5. データの充実度】');
    const totalHorses = db.prepare(`
        SELECT COUNT(DISTINCT horse_name) as count FROM umadata
    `).get();
    
    const horsesWithEnoughData = db.prepare(`
        SELECT COUNT(*) as count
        FROM (
            SELECT horse_name, COUNT(*) as past_count
            FROM umadata
            GROUP BY horse_name
            HAVING past_count >= 5
        )
    `).get();
    
    const percentage = (horsesWithEnoughData.count / totalHorses.count * 100).toFixed(1);
    
    console.log(`   総馬数: ${totalHorses.count}頭`);
    console.log(`   過去走5件以上の馬: ${horsesWithEnoughData.count}頭 (${percentage}%)`);
    console.log(`   過去走5件未満の馬: ${totalHorses.count - horsesWithEnoughData.count}頭 (${(100 - percentage).toFixed(1)}%)`);

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 調査完了 ===');












