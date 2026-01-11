const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== indicesテーブル確認（インポート後） ===\n');

try {
    // 1. 総件数
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM indices').get();
    console.log(`【1. 総データ件数】`);
    console.log(`   ${totalCount.count}件\n`);

    if (totalCount.count > 0) {
        // 2. makikaeshi（巻き返し指数）があるデータの件数
        const makikaeshiCount = db.prepare(`
            SELECT COUNT(*) as count 
            FROM indices 
            WHERE makikaeshi IS NOT NULL AND makikaeshi != 0
        `).get();
        console.log(`【2. makikaeshi（巻き返し指数）があるデータの件数】`);
        console.log(`   ${makikaeshiCount.count}件\n`);

        // 3. 最初の3件を表示
        console.log(`【3. 最初の3件のデータ】`);
        const samples = db.prepare('SELECT * FROM indices LIMIT 3').all();
        samples.forEach((row, idx) => {
            console.log(`\n   レコード ${idx + 1}:`);
            console.log(`     race_id: "${row.race_id}"`);
            console.log(`     L4F: ${row.L4F !== null ? row.L4F : '(NULL)'}`);
            console.log(`     T2F: ${row.T2F !== null ? row.T2F : '(NULL)'}`);
            console.log(`     potential: ${row.potential !== null ? row.potential : '(NULL)'}`);
            console.log(`     revouma: ${row.revouma !== null ? row.revouma : '(NULL)'}`);
            console.log(`     makikaeshi: ${row.makikaeshi !== null ? row.makikaeshi : '(NULL)'}`);
            console.log(`     cushion: ${row.cushion !== null ? row.cushion : '(NULL)'}`);
            console.log(`     created_at: ${row.created_at || '(NULL)'}`);
            console.log(`     updated_at: ${row.updated_at || '(NULL)'}`);
        });

        // 追加情報: 各指数の有効データ件数
        console.log(`\n【4. 各指数の有効データ件数】`);
        const indexStats = db.prepare(`
            SELECT 
                COUNT(*) as total,
                COUNT(L4F) as l4f_count,
                COUNT(T2F) as t2f_count,
                COUNT(potential) as potential_count,
                COUNT(revouma) as revouma_count,
                COUNT(makikaeshi) as makikaeshi_count,
                COUNT(cushion) as cushion_count
            FROM indices
        `).get();
        console.log(`   総件数: ${indexStats.total}`);
        console.log(`   L4F: ${indexStats.l4f_count}件`);
        console.log(`   T2F: ${indexStats.t2f_count}件`);
        console.log(`   potential: ${indexStats.potential_count}件`);
        console.log(`   revouma: ${indexStats.revouma_count}件`);
        console.log(`   makikaeshi: ${indexStats.makikaeshi_count}件`);
        console.log(`   cushion: ${indexStats.cushion_count}件`);

        // 追加情報: makikaeshiの値の範囲
        console.log(`\n【5. makikaeshi（巻き返し指数）の値の範囲】`);
        const makikaeshiRange = db.prepare(`
            SELECT 
                MIN(makikaeshi) as min_value,
                MAX(makikaeshi) as max_value,
                AVG(makikaeshi) as avg_value
            FROM indices
            WHERE makikaeshi IS NOT NULL
        `).get();
        if (makikaeshiRange.min_value !== null) {
            console.log(`   最小値: ${makikaeshiRange.min_value}`);
            console.log(`   最大値: ${makikaeshiRange.max_value}`);
            console.log(`   平均値: ${makikaeshiRange.avg_value?.toFixed(2)}`);
        } else {
            console.log(`   ⚠️ makikaeshiのデータがありません`);
        }

    } else {
        console.log('   ⚠️ indicesテーブルにデータがありません');
    }

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 確認完了 ===');











