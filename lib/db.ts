// /lib/db.ts
import Database from 'better-sqlite3';

let db: Database.Database | null = null;

/** データベースの初期化（テーブル作成） */
function initDb(database: Database.Database) {
  // races テーブル
  database.exec(`
    CREATE TABLE IF NOT EXISTS races (
      raceKey TEXT PRIMARY KEY,
      date TEXT,
      place TEXT,
      raceNo INTEGER,
      data TEXT
    )
  `);

  // umaren テーブル
  database.exec(`
    CREATE TABLE IF NOT EXISTS umaren (
      raceKey TEXT,
      comb TEXT,
      odds REAL,
      PRIMARY KEY (raceKey, comb)
    )
  `);

  // wide テーブル
  database.exec(`
    CREATE TABLE IF NOT EXISTS wide (
      raceKey TEXT,
      comb TEXT,
      odds REAL,
      PRIMARY KEY (raceKey, comb)
    )
  `);

  // ========== ユーザー管理テーブル ==========

  // users テーブル
  database.exec(`
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

  // accounts テーブル（SNS認証用）
  database.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (provider, provider_account_id)
    )
  `);

  // sessions テーブル
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token TEXT UNIQUE NOT NULL,
      expires TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // subscriptions テーブル（課金状況）
  database.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      plan TEXT DEFAULT 'free',
      status TEXT DEFAULT 'active',
      current_period_start TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // user_points テーブル
  database.exec(`
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

  // point_history テーブル
  database.exec(`
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

  // user_horse_marks テーブル（馬印）
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_horse_marks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      horse_id TEXT NOT NULL,
      mark TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, horse_id)
    )
  `);

  // ========== 新機能テーブル ==========

  // バッジシステム
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_badges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      badge_type TEXT NOT NULL,
      badge_level TEXT NOT NULL,
      earned_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, badge_type)
    )
  `);

  // ログイン履歴（連続ログインボーナス用）
  database.exec(`
    CREATE TABLE IF NOT EXISTS login_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      login_date TEXT NOT NULL,
      streak_count INTEGER DEFAULT 1,
      bonus_claimed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, login_date)
    )
  `);

  // レースメモ
  database.exec(`
    CREATE TABLE IF NOT EXISTS race_memos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      race_key TEXT NOT NULL,
      horse_number TEXT,
      memo TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 馬場メモ（プリセット式）- 日付×トラックタイプ（芝/ダート）で管理
  database.exec(`
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

  // お気に入り馬
  database.exec(`
    CREATE TABLE IF NOT EXISTS favorite_horses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      horse_name TEXT NOT NULL,
      horse_id TEXT,
      note TEXT,
      notify_on_race INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, horse_name)
    )
  `);

  // 予想履歴（的中率計算用）
  database.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      race_key TEXT NOT NULL,
      horse_number TEXT NOT NULL,
      mark TEXT NOT NULL,
      result_position INTEGER,
      is_hit INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 予想いいね
  database.exec(`
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

  // 通知
  database.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // インデックス作成
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
    CREATE INDEX IF NOT EXISTS idx_point_history_user_id ON point_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_horse_marks_user_id ON user_horse_marks(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_horse_marks_horse_id ON user_horse_marks(horse_id);
    CREATE INDEX IF NOT EXISTS idx_login_history_user_date ON login_history(user_id, login_date);
    CREATE INDEX IF NOT EXISTS idx_race_memos_user ON race_memos(user_id);
    CREATE INDEX IF NOT EXISTS idx_race_memos_race ON race_memos(race_key);
    CREATE INDEX IF NOT EXISTS idx_baba_memos_user ON baba_memos(user_id);
    CREATE INDEX IF NOT EXISTS idx_favorite_horses_user ON favorite_horses(user_id);
    CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
    CREATE INDEX IF NOT EXISTS idx_predictions_race ON predictions(race_key);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
  `);
}

/** どの場所から呼んでも同じ DB インスタンスを返す */
export function getDb() {
  if (!db) {
    // .env.local に DB_PATH を置かなければ ./races.db を開く
    const path = process.env.DB_PATH ?? 'races.db';
    
    // readonly: true を削除して、ファイルがない場合は自動作成
    db = new Database(path);
    db.pragma('journal_mode = WAL');
    
    // 初期化処理（テーブル作成）
    initDb(db);
  }
  return db;
}
