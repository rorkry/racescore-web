// データベース初期化スクリプト
const Database = require('better-sqlite3');
const db = new Database('races.db');

console.log('=== データベース初期化 ===\n');

try {
  // users テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT,
      image TEXT,
      role TEXT DEFAULT 'user',
      email_verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('✅ users テーブル作成');

  // subscriptions テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT DEFAULT 'free',
      status TEXT DEFAULT 'active',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      current_period_start TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ subscriptions テーブル作成');

  // user_points テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_points (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      balance INTEGER DEFAULT 0,
      total_earned INTEGER DEFAULT 0,
      total_spent INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ user_points テーブル作成');

  // point_history テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS point_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ point_history テーブル作成');

  // horse_marks テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS horse_marks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      horse_name TEXT NOT NULL,
      race_date TEXT NOT NULL,
      race_place TEXT NOT NULL,
      mark TEXT NOT NULL,
      memo TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ horse_marks テーブル作成');

  // favorites テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      horse_name TEXT NOT NULL,
      memo TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, horse_name)
    )
  `);
  console.log('✅ favorites テーブル作成');

  // race_memos テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS race_memos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      race_key TEXT NOT NULL,
      memo TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, race_key)
    )
  `);
  console.log('✅ race_memos テーブル作成');

  // baba_memos テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS baba_memos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      track_type TEXT NOT NULL,
      place TEXT,
      course_type TEXT,
      course_condition TEXT,
      advantage_position TEXT,
      advantage_style TEXT,
      weather_note TEXT,
      free_memo TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, date, track_type)
    )
  `);
  console.log('✅ baba_memos テーブル作成');

  // predictions テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      race_key TEXT NOT NULL,
      horse_number TEXT NOT NULL,
      mark TEXT NOT NULL,
      result_position INTEGER,
      is_hit INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ predictions テーブル作成');

  // notifications テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ notifications テーブル作成');

  // badges テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS badges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      badge_type TEXT NOT NULL,
      badge_level TEXT NOT NULL,
      earned_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, badge_type, badge_level)
    )
  `);
  console.log('✅ badges テーブル作成');

  // login_bonus テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_bonus (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      login_date TEXT NOT NULL,
      consecutive_days INTEGER DEFAULT 1,
      points_earned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, login_date)
    )
  `);
  console.log('✅ login_bonus テーブル作成');

  // login_history テーブル（連続ログイン記録用）
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      login_date TEXT NOT NULL,
      streak_count INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, login_date)
    )
  `);
  console.log('✅ login_history テーブル作成');

  // user_badges テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_badges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      badge_type TEXT NOT NULL,
      badge_level TEXT NOT NULL,
      earned_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, badge_type, badge_level)
    )
  `);
  console.log('✅ user_badges テーブル作成');

  // prediction_likes テーブル（いいね機能用）
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_likes (
      id TEXT PRIMARY KEY,
      prediction_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (prediction_id, user_id)
    )
  `);
  console.log('✅ prediction_likes テーブル作成');

  console.log('\n🎉 全テーブルの初期化が完了しました！');
  
} catch (err) {
  console.error('❌ エラー:', err.message);
}

db.close();
