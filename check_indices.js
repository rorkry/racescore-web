const Database = require('better-sqlite3');
const db = new Database('races.db', { readonly: true });

console.log('=== indicesテーブル確認 ===\n');

try {
    // 1. 総データ件数
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM indices').get();
    console.log(`【1. 総データ件数】`);
    console.log(`   ${totalCount.count}件\n`);

    if (totalCount.count > 0) {
        // 2. サンプルデータの表示
        console.log(`【2. サンプルデータ（最初の5件）】`);
        const samples = db.prepare('SELECT * FROM indices LIMIT 5').all();
        samples.forEach((row, idx) => {
            console.log(`\n   レコード ${idx + 1}:`);
            Object.keys(row).forEach(key => {
                const value = row[key];
                const displayValue = value !== null && value !== undefined ? String(value) : '(NULL)';
                console.log(`     ${key}: ${displayValue}`);
            });
        });

        // 3. 指数の種類別件数
        console.log(`\n【3. 指数の種類別件数】`);
        const indexTypes = db.prepare(`
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
        console.log(`   総件数: ${indexTypes.total}`);
        console.log(`   L4F: ${indexTypes.l4f_count}件`);
        console.log(`   T2F: ${indexTypes.t2f_count}件`);
        console.log(`   potential: ${indexTypes.potential_count}件`);
        console.log(`   revouma: ${indexTypes.revouma_count}件`);
        console.log(`   makikaeshi: ${indexTypes.makikaeshi_count}件`);
        console.log(`   cushion: ${indexTypes.cushion_count}件`);

        // 4. 最新のデータ
        console.log(`\n【4. 最新のデータ（最新5件）】`);
        const recent = db.prepare(`
            SELECT * FROM indices 
            ORDER BY created_at DESC 
            LIMIT 5
        `).all();
        recent.forEach((row, idx) => {
            console.log(`   ${idx + 1}. race_id="${row.race_id}", horse_name="${row.horse_name}", makikaeshi=${row.makikaeshi}`);
        });
    } else {
        console.log('   ⚠️ indicesテーブルにデータがありません');
    }

} catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
}

db.close();
console.log('\n=== 確認完了 ===');












