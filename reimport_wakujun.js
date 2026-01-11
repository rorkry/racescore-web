const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const dbPath = path.join(__dirname, 'races.db');
const csvPath = path.join(__dirname, '..', 'wakujun1227.csv');

console.log('=== wakujunデータ再インポート ===\n');
console.log(`データベース: ${dbPath}`);
console.log(`CSVファイル: ${csvPath}\n`);

const db = new Database(dbPath);

try {
    // 1. wakujunテーブルの全データを削除
    console.log('【1. 既存データの削除】');
    const deleteResult = db.prepare('DELETE FROM wakujun').run();
    console.log(`   ${deleteResult.changes}件のデータを削除しました\n`);

    // 2. CSVファイルの読み込み（Shift-JIS → UTF-8変換）
    console.log('【2. CSVファイルの読み込み】');
    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSVファイルが見つかりません: ${csvPath}`);
    }
    
    let csvContent;
    try {
        // ファイルをBufferとして読み込み
        const buffer = fs.readFileSync(csvPath);
        // Shift_JIS (CP932) からUTF-8に変換
        csvContent = iconv.decode(buffer, 'Shift_JIS');
        console.log('   Shift-JISからUTF-8に変換しました');
    } catch (err) {
        console.error('   Shift-JIS変換エラー:', err.message);
        // 失敗した場合はUTF-8として読み込む
        csvContent = fs.readFileSync(csvPath, 'utf-8');
        console.log('   UTF-8として読み込みました');
    }
    
    const lines = csvContent.trim().split('\n').filter(line => line.trim());
    console.log(`   読み込んだ行数: ${lines.length}行\n`);

    // 3. INSERT文の準備
    console.log('【3. データのインポート】');
    const insertStmt = db.prepare(`
        INSERT INTO wakujun (
            date, place, race_number, class_name_1, class_name_2,
            waku, umaban, kinryo, umamei, seibetsu,
            nenrei, nenrei_display, kishu, blank_field, track_type,
            distance, tosu, shozoku, chokyoshi, shozoku_chi, umajirushi,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    // トランザクションで一括挿入
    const insertMany = db.transaction((rows) => {
        for (const row of rows) {
            insertStmt.run(...row);
        }
    });

    // CSVデータをパース（正しい列マッピング）
    const rows = lines.map((line, lineIndex) => {
        const columns = line.split(',');
        
        if (columns.length < 23) {
            console.warn(`  警告: 行${lineIndex + 1}の列数が不足しています (${columns.length}列)`);
            return null;
        }
        
        // 実際のCSV列順序（wakujun1227.csvより）:
        // 0: 1227 (日付短縮形)
        // 1: 202512270605070101 (レースID)
        // 2: 2025.12.27 (日付)
        // 3: 中山 (場所)
        // 4: 1 (レース番号)
        // 5: 未勝利 (クラス名1)
        // 6: 未勝利・牝* (クラス名2)
        // 7: 1 (枠番)
        // 8: 1 (馬番)
        // 9:  55  (斤量)
        // 10:  ドレドレ (馬名)
        // 11: 牝 (性別)
        // 12: 2 (年齢)
        // 13: 二歳 (年齢表示)
        // 14: 津村明秀 (騎手)
        // 15: (空欄)
        // 16: 芝 (トラック種別)
        // 17: 1200 (距離)
        // 18: 15 (頭数)
        // 19: (美) (所属)
        // 20: 矢嶋大樹 (調教師)
        // 21: 美浦 (所属地)
        // 22: (空欄) (馬印)
        
        return [
            (columns[0] || '').trim(),  // date: 1227
            (columns[3] || '').trim(),  // place: 中山
            (columns[4] || '').trim(),  // race_number: 1
            (columns[5] || '').trim(),  // class_name_1: 未勝利
            (columns[6] || '').trim(),  // class_name_2: 未勝利・牝*
            (columns[7] || '').trim(),  // waku: 1
            (columns[8] || '').trim(),  // umaban: 1
            (columns[9] || '').trim(),  // kinryo:  55 
            (columns[10] || '').trim(), // umamei:  ドレドレ
            (columns[11] || '').trim(), // seibetsu: 牝
            (columns[12] || '').trim(), // nenrei: 2
            (columns[13] || '').trim(), // nenrei_display: 二歳
            (columns[14] || '').trim(), // kishu: 津村明秀
            (columns[15] || '').trim(), // blank_field: (空欄)
            (columns[16] || '').trim(), // track_type: 芝
            (columns[17] || '').trim(), // distance: 1200
            (columns[18] || '').trim(), // tosu: 15
            (columns[19] || '').trim(), // shozoku: (美)
            (columns[20] || '').trim(), // chokyoshi: 矢嶋大樹
            (columns[21] || '').trim(), // shozoku_chi: 美浦
            (columns[22] || '').trim(), // umajirushi: (空欄)
        ];
    }).filter(row => row !== null);

    // 一括挿入を実行
    insertMany(rows);
    console.log(`   ✅ ${rows.length}件のデータをインポートしました\n`);

    // 4. 確認クエリ
    console.log('【4. インポート結果の確認】');
    const count = db.prepare('SELECT COUNT(*) as count FROM wakujun').get();
    console.log(`   総データ件数: ${count.count}件`);

    // 日付別の件数
    const dateCounts = db.prepare(`
        SELECT date, COUNT(*) as count
        FROM wakujun
        GROUP BY date
        ORDER BY date DESC
    `).all();
    console.log(`\n   日付別データ件数:`);
    dateCounts.forEach(row => {
        const format = row.date.length === 4 ? '4桁形式' : `${row.date.length}桁形式`;
        console.log(`     date="${row.date}" (${format}): ${row.count}件`);
    });

    // 場所別の件数
    const placeCounts = db.prepare(`
        SELECT date, place, COUNT(DISTINCT race_number) as race_count, COUNT(*) as horse_count
        FROM wakujun
        WHERE date = '1227'
        GROUP BY date, place
        ORDER BY place
    `).all();
    console.log(`\n   date='1227'の場所別データ:`);
    placeCounts.forEach(row => {
        console.log(`     ${row.place}: ${row.race_count}レース, ${row.horse_count}頭`);
    });

    // サンプルデータの表示
    console.log(`\n   サンプルデータ（最初の3件）:`);
    const samples = db.prepare(`
        SELECT date, place, race_number, waku, umaban, umamei, kishu, kinryo
        FROM wakujun
        WHERE date = '1227'
        LIMIT 3
    `).all();
    samples.forEach((row, idx) => {
        console.log(`     ${idx + 1}. date="${row.date}", place="${row.place}", race_number="${row.race_number}", 枠${row.waku} 馬番${row.umaban} ${row.umamei} (騎手: ${row.kishu}, 斤量: ${row.kinryo})`);
    });

    console.log('\n✅ 再インポート完了！');

} catch (err) {
    console.error('\n❌ エラーが発生しました:', err.message);
    console.error(err.stack);
    process.exit(1);
} finally {
    db.close();
}

