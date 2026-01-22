// 予想データ（predictions）テーブルの確認スクリプト
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// .envファイルを読み込む
const envPath = path.join(__dirname, '.env');
console.log('Looking for .env at:', envPath);

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  console.log('.env content length:', envContent.length, 'bytes');
  
  envContent.split('\n').forEach(line => {
    // 空行やコメント行をスキップ
    if (!line.trim() || line.trim().startsWith('#')) return;
    
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.substring(0, eqIndex).trim();
      const value = line.substring(eqIndex + 1).trim();
      process.env[key] = value;
      console.log(`Set ${key}: ${value.substring(0, 30)}...`);
    }
  });
  console.log('.envファイルを読み込みました\n');
} else {
  console.log('⚠️ .envファイルが見つかりません');
  console.log('プロジェクトルートに.envファイルを作成し、DATABASE_URLを設定してください\n');
}

// DATABASE_URL確認
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URLが設定されていません');
  console.log('\n.envファイルに以下の形式で設定してください:');
  console.log('DATABASE_URL=postgresql://username:password@host:port/database');
  process.exit(1);
}

console.log('DATABASE_URL:', process.env.DATABASE_URL.substring(0, 50) + '...\n');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkPredictions() {
  const client = await pool.connect();
  
  try {
    console.log('=== predictions テーブル確認 ===\n');
    
    // 1. テーブルが存在するか確認
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'predictions'
      ) as exists
    `);
    console.log('テーブル存在:', tableCheck.rows[0].exists ? 'あり' : 'なし');
    
    if (!tableCheck.rows[0].exists) {
      console.log('\n⚠️ predictionsテーブルが存在しません');
      return;
    }
    
    // 2. 全体の件数
    const countResult = await client.query('SELECT COUNT(*) as total FROM predictions');
    console.log('総レコード数:', countResult.rows[0].total);
    
    // 3. ユーザー別の件数
    console.log('\n--- ユーザー別予想数 ---');
    const userStats = await client.query(`
      SELECT 
        p.user_id,
        u.email,
        u.name,
        COUNT(*) as prediction_count,
        SUM(CASE WHEN is_hit = 1 THEN 1 ELSE 0 END) as hit_count,
        MIN(p.created_at) as first_prediction,
        MAX(p.created_at) as last_prediction
      FROM predictions p
      LEFT JOIN users u ON p.user_id = u.id
      GROUP BY p.user_id, u.email, u.name
      ORDER BY prediction_count DESC
    `);
    
    if (userStats.rows.length === 0) {
      console.log('予想データがありません');
    } else {
      for (const row of userStats.rows) {
        console.log(`\nユーザー: ${row.name || row.email || row.user_id}`);
        console.log(`  予想数: ${row.prediction_count}`);
        console.log(`  的中数: ${row.hit_count || 0}`);
        console.log(`  最初の予想: ${row.first_prediction || 'N/A'}`);
        console.log(`  最後の予想: ${row.last_prediction || 'N/A'}`);
      }
    }
    
    // 4. 最近の予想データ（直近10件）
    console.log('\n--- 直近10件の予想 ---');
    const recentPredictions = await client.query(`
      SELECT 
        p.race_key,
        p.horse_number,
        p.mark,
        p.result_position,
        p.is_hit,
        p.created_at,
        u.name as user_name
      FROM predictions p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 10
    `);
    
    if (recentPredictions.rows.length === 0) {
      console.log('予想データがありません');
    } else {
      for (const row of recentPredictions.rows) {
        console.log(`${row.created_at} | ${row.user_name || 'Unknown'} | ${row.race_key} | 馬番${row.horse_number} | ${row.mark} | 結果:${row.result_position || '-'} | 的中:${row.is_hit ? '○' : '-'}`);
      }
    }
    
    // 5. 月別の予想数
    console.log('\n--- 月別予想数 ---');
    const monthlyStats = await client.query(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as count
      FROM predictions
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `);
    
    for (const row of monthlyStats.rows) {
      console.log(`${row.month}: ${row.count}件`);
    }
    
    // 6. 関連テーブルも確認
    console.log('\n=== 関連テーブル確認 ===');
    
    // users
    const userCount = await client.query('SELECT COUNT(*) as total FROM users');
    console.log('usersテーブル:', userCount.rows[0].total, '件');
    
    // favorite_horses
    const favCount = await client.query('SELECT COUNT(*) as total FROM favorite_horses');
    console.log('favorite_horsesテーブル:', favCount.rows[0].total, '件');
    
    // race_memos
    const memoCount = await client.query('SELECT COUNT(*) as total FROM race_memos');
    console.log('race_memosテーブル:', memoCount.rows[0].total, '件');
    
  } catch (err) {
    console.error('エラー:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkPredictions();
