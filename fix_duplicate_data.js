/**
 * 重複データ削除 + race_levelsキャッシュクリア スクリプト
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// .envを読み込む
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

async function fixData() {
  // Railway Public Network URL
  const dbUrl = 'postgresql://postgres:PozRoKGJcaJPKVXWwMYfXFIlhZsVdWfO@turntable.proxy.rlwy.net:50897/railway';
  
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('===========================================');
    console.log('重複データ修正 + キャッシュクリア');
    console.log('===========================================\n');

    // [1] 重複データの件数確認
    console.log('[1] 重複データの確認');
    const duplicateCount = await pool.query(`
      SELECT COUNT(*) as total FROM (
        SELECT race_id, horse_name, COUNT(*) as cnt
        FROM umadata
        GROUP BY race_id, horse_name
        HAVING COUNT(*) > 1
      ) dup
    `);
    console.log(`   重複している馬・レース組み合わせ: ${duplicateCount.rows[0].total}件\n`);

    // [2] 重複データ削除（ラップありを優先して残す）
    console.log('[2] 重複データの削除（ラップありを優先）');
    
    // まず重複のうち削除対象を特定
    // ctid（行の物理的位置）を使って、同じrace_id+horse_nameで
    // lap_timeがないものを削除
    const deleteResult = await pool.query(`
      DELETE FROM umadata
      WHERE ctid IN (
        SELECT ctid FROM (
          SELECT ctid,
                 ROW_NUMBER() OVER (
                   PARTITION BY race_id, horse_name
                   ORDER BY 
                     CASE WHEN lap_time IS NOT NULL AND lap_time != '' THEN 0 ELSE 1 END,
                     ctid
                 ) as rn
          FROM umadata
        ) ranked
        WHERE rn > 1
      )
    `);
    console.log(`   削除したレコード数: ${deleteResult.rowCount}件\n`);

    // [3] 削除後の重複確認
    console.log('[3] 削除後の重複確認');
    const afterCount = await pool.query(`
      SELECT COUNT(*) as total FROM (
        SELECT race_id, horse_name, COUNT(*) as cnt
        FROM umadata
        GROUP BY race_id, horse_name
        HAVING COUNT(*) > 1
      ) dup
    `);
    console.log(`   残りの重複: ${afterCount.rows[0].total}件\n`);

    // [4] race_levelsキャッシュをクリア（期限切れにする）
    console.log('[4] race_levelsキャッシュの期限切れ処理');
    const expireResult = await pool.query(`
      UPDATE race_levels
      SET expires_at = NOW() - INTERVAL '1 day'
      WHERE expires_at IS NULL OR expires_at::timestamp > NOW()
    `);
    console.log(`   期限切れにしたレコード数: ${expireResult.rowCount}件\n`);

    // [5] アドミの過去走を再確認
    console.log('[5] アドミの過去走データ（修正後）');
    const adomiPastRaces = await pool.query(`
      SELECT date, place, distance, finish_position, 
             CASE WHEN lap_time IS NOT NULL AND lap_time != '' THEN 'あり' ELSE 'なし' END as lap_status
      FROM umadata 
      WHERE horse_name = 'アドミ'
      ORDER BY SUBSTRING(race_id, 1, 8)::INTEGER DESC
      LIMIT 5
    `);
    for (const r of adomiPastRaces.rows) {
      console.log(`   ${r.date} ${r.place} ${r.distance} ${r.finish_position}着 ラップ${r.lap_status}`);
    }

    // [6] umadataの総レコード数
    console.log('\n[6] umadataの総レコード数');
    const totalCount = await pool.query('SELECT COUNT(*) as cnt FROM umadata');
    console.log(`   総レコード数: ${totalCount.rows[0].cnt}件`);

    console.log('\n===========================================');
    console.log('修正完了！');
    console.log('サイトを再読み込みすると、レースレベルが再計算されます。');
    console.log('===========================================');

  } catch (err) {
    console.error('エラー:', err);
  } finally {
    await pool.end();
  }
}

fixData();
