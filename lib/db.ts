// /lib/db.ts - PostgreSQL版
import { Pool, QueryResult } from 'pg';

// PostgreSQL接続プール
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// SQLite の ? プレースホルダーを PostgreSQL の $1, $2, ... に変換
function convertPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// SQLite の datetime('now') を PostgreSQL の NOW() に変換
function convertDatetime(sql: string): string {
  return sql
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/datetime\('now', 'localtime'\)/gi, 'NOW()');
}

// SQL変換（SQLite → PostgreSQL）
function convertSql(sql: string): string {
  return convertDatetime(convertPlaceholders(sql));
}

/** SQLite互換のDBインターフェース（非同期） */
class DatabaseWrapper {
  /** 単一行を取得 */
  prepare(sql: string) {
    const convertedSql = convertSql(sql);

    return {
      /** 単一行取得（SQLiteのgetに相当） */
      get: async <T = Record<string, unknown>>(...params: unknown[]): Promise<T | undefined> => {
        try {
          const result: QueryResult = await pool.query(convertedSql, params);
          return result.rows[0] as T | undefined;
        } catch (error) {
          console.error('DB get error:', error, 'SQL:', convertedSql, 'Params:', params);
          throw error;
        }
      },

      /** 複数行取得（SQLiteのallに相当） */
      all: async <T = Record<string, unknown>>(...params: unknown[]): Promise<T[]> => {
        try {
          const result: QueryResult = await pool.query(convertedSql, params);
          return result.rows as T[];
        } catch (error) {
          console.error('DB all error:', error, 'SQL:', convertedSql, 'Params:', params);
          throw error;
        }
      },

      /** 実行（INSERT/UPDATE/DELETE）（SQLiteのrunに相当） */
      run: async (...params: unknown[]): Promise<{ changes: number; lastInsertRowid?: number }> => {
        try {
          const result: QueryResult = await pool.query(convertedSql, params);
          return { changes: result.rowCount ?? 0 };
        } catch (error) {
          console.error('DB run error:', error, 'SQL:', convertedSql, 'Params:', params);
          throw error;
        }
      },
    };
  }

  /** 生SQLを実行（マイグレーション用） */
  async exec(sql: string): Promise<void> {
    // 複数のステートメントを分割して実行
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      try {
        const converted = convertDatetime(statement);
        await pool.query(converted);
      } catch (error) {
        console.error('DB exec error:', error, 'Statement:', statement);
        // CREATE TABLE IF NOT EXISTS などは続行
        if (!(error instanceof Error && error.message.includes('already exists'))) {
          // テーブル/インデックスが既に存在する場合は無視
          const msg = (error as Error).message || '';
          if (!msg.includes('already exists') && !msg.includes('duplicate key')) {
            throw error;
          }
        }
      }
    }
  }

  /** 直接クエリ実行 */
  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await pool.query(convertSql(sql), params);
    return result.rows as T[];
  }

  /** プラグマ（PostgreSQLでは無視） */
  pragma(_statement: string): void {
    // SQLiteのpragmaはPostgreSQLでは不要
  }
}

let db: DatabaseWrapper | null = null;

/** テーブル初期化 */
async function initDb(database: DatabaseWrapper) {
  // races テーブル
  await database.exec(`
    CREATE TABLE IF NOT EXISTS races (
      "raceKey" TEXT PRIMARY KEY,
      date TEXT,
      place TEXT,
      "raceNo" INTEGER,
      data TEXT
    )
  `);

  // umaren テーブル
  await database.exec(`
    CREATE TABLE IF NOT EXISTS umaren (
      "raceKey" TEXT,
      comb TEXT,
      odds REAL,
      PRIMARY KEY ("raceKey", comb)
    )
  `);

  // wide テーブル
  await database.exec(`
    CREATE TABLE IF NOT EXISTS wide (
      "raceKey" TEXT,
      comb TEXT,
      odds REAL,
      PRIMARY KEY ("raceKey", comb)
    )
  `);

  // ========== ユーザー管理テーブル ==========

  // users テーブル
  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT,
      image TEXT,
      role TEXT DEFAULT 'user',
      email_verified INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // accounts テーブル（SNS認証用）
  await database.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (provider, provider_account_id)
    )
  `);

  // sessions テーブル
  await database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_token TEXT UNIQUE NOT NULL,
      expires TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // subscriptions テーブル（課金状況）
  await database.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT DEFAULT 'free',
      status TEXT DEFAULT 'active',
      current_period_start TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // user_points テーブル
  await database.exec(`
    CREATE TABLE IF NOT EXISTS user_points (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      balance INTEGER DEFAULT 0,
      total_earned INTEGER DEFAULT 0,
      total_spent INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // point_history テーブル
  await database.exec(`
    CREATE TABLE IF NOT EXISTS point_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // user_horse_marks テーブル（馬印）
  await database.exec(`
    CREATE TABLE IF NOT EXISTS user_horse_marks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      horse_id TEXT NOT NULL,
      mark TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, horse_id)
    )
  `);

  // ========== 新機能テーブル ==========

  // バッジシステム
  await database.exec(`
    CREATE TABLE IF NOT EXISTS user_badges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_type TEXT NOT NULL,
      badge_level TEXT NOT NULL,
      earned_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, badge_type)
    )
  `);

  // ログイン履歴（連続ログインボーナス用）
  await database.exec(`
    CREATE TABLE IF NOT EXISTS login_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      login_date TEXT NOT NULL,
      streak_count INTEGER DEFAULT 1,
      bonus_claimed INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, login_date)
    )
  `);

  // レースメモ
  await database.exec(`
    CREATE TABLE IF NOT EXISTS race_memos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      race_key TEXT NOT NULL,
      horse_number TEXT,
      memo TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 馬場メモ（プリセット式）
  await database.exec(`
    CREATE TABLE IF NOT EXISTS baba_memos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      track_type TEXT NOT NULL,
      place TEXT,
      course_type TEXT,
      course_condition TEXT,
      advantage_position TEXT,
      advantage_style TEXT,
      weather_note TEXT,
      free_memo TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, date, place, track_type)
    )
  `);

  // お気に入り馬
  await database.exec(`
    CREATE TABLE IF NOT EXISTS favorite_horses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      horse_name TEXT NOT NULL,
      horse_id TEXT,
      note TEXT,
      notify_on_race INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, horse_name)
    )
  `);

  // 今走メモ（馬×レース単位のメモ）
  await database.exec(`
    CREATE TABLE IF NOT EXISTS horse_race_memos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      horse_name TEXT NOT NULL,
      race_key TEXT NOT NULL,
      memo TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, horse_name, race_key)
    )
  `);

  // ユーザー格言（自由記述・FAB「競馬の脳みそ」と連携）
  await database.exec(`
    CREATE TABLE IF NOT EXISTS user_maxims (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 予想履歴（的中率計算用）
  await database.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      race_key TEXT NOT NULL,
      horse_number TEXT NOT NULL,
      mark TEXT NOT NULL,
      result_position INTEGER,
      is_hit INTEGER DEFAULT 0,
      tansho_payout INTEGER DEFAULT 0,
      fukusho_payout INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // predictions テーブルにカラムが存在しない場合は追加
  try {
    await database.exec(`ALTER TABLE predictions ADD COLUMN IF NOT EXISTS tansho_payout INTEGER DEFAULT 0`);
    await database.exec(`ALTER TABLE predictions ADD COLUMN IF NOT EXISTS fukusho_payout INTEGER DEFAULT 0`);
  } catch (e) {
    // カラムが既に存在する場合のエラーは無視
  }

  // 予想いいね
  await database.exec(`
    CREATE TABLE IF NOT EXISTS prediction_likes (
      id TEXT PRIMARY KEY,
      prediction_id TEXT NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (prediction_id, user_id)
    )
  `);

  // 通知
  await database.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // レースレベルキャッシュ
  await database.exec(`
    CREATE TABLE IF NOT EXISTS race_levels (
      race_id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      level_label TEXT NOT NULL,
      total_horses_run INTEGER DEFAULT 0,
      good_run_count INTEGER DEFAULT 0,
      first_run_good_count INTEGER DEFAULT 0,
      win_count INTEGER DEFAULT 0,
      good_run_rate REAL DEFAULT 0,
      first_run_good_rate REAL DEFAULT 0,
      has_plus INTEGER DEFAULT 0,
      ai_comment TEXT,
      display_comment TEXT,
      calculated_at TIMESTAMP DEFAULT NOW(),
      expires_at TEXT
    )
  `);

  // AI予想用テーブル（過去のDiscord予想を保存）
  await database.exec(`
    CREATE TABLE IF NOT EXISTS ai_predictions (
      id TEXT PRIMARY KEY,
      discord_message_id TEXT UNIQUE,
      timestamp TEXT NOT NULL,
      author TEXT,
      race_course TEXT,
      race_number INTEGER,
      race_name TEXT,
      distance INTEGER,
      surface TEXT,
      honmei TEXT,
      taikou TEXT,
      ana TEXT,
      bets_json TEXT,
      full_text TEXT NOT NULL,
      reaction_count INTEGER DEFAULT 0,
      hit INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      -- 構造化分析結果
      parsed_reasons TEXT,
      conditions_json TEXT
    )
  `);

  // 予想パターン集計テーブル
  await database.exec(`
    CREATE TABLE IF NOT EXISTS prediction_patterns (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      sentiment TEXT,
      examples TEXT,
      suggested_rule TEXT,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (category, subcategory)
    )
  `);

  // インデックス作成
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_point_history_user_id ON point_history(user_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_user_horse_marks_user_id ON user_horse_marks(user_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_user_horse_marks_horse_id ON user_horse_marks(horse_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_login_history_user_date ON login_history(user_id, login_date)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_race_memos_user ON race_memos(user_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_race_memos_race ON race_memos(race_key)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_baba_memos_user ON baba_memos(user_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_favorite_horses_user ON favorite_horses(user_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_horse_race_memos_user ON horse_race_memos(user_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_horse_race_memos_horse ON horse_race_memos(user_id, horse_name)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_horse_race_memos_race ON horse_race_memos(user_id, race_key)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_predictions_race ON predictions(race_key)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_race_levels_expires ON race_levels(expires_at)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_ai_predictions_course ON ai_predictions(race_course)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_ai_predictions_reaction ON ai_predictions(reaction_count DESC)`);

  // ========== 研究AI テーブル ==========
  
  // research_sessions テーブル
  await database.exec(`
    CREATE TABLE IF NOT EXISTS research_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      parent_session_id TEXT,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      initial_question TEXT NOT NULL,
      research_goal TEXT NOT NULL,
      model_used TEXT DEFAULT 'gpt-4o-mini',
      status TEXT DEFAULT 'running',
      total_steps INTEGER DEFAULT 0,
      started_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `);

  // research_steps テーブル
  await database.exec(`
    CREATE TABLE IF NOT EXISTS research_steps (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      tool_name TEXT NOT NULL,
      tool_version TEXT NOT NULL,
      tool_input TEXT NOT NULL,
      tool_output TEXT NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW(),
      execution_time_ms INTEGER
    )
  `);

  // 研究テーブルのインデックス
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_research_user ON research_sessions(user_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_research_target ON research_sessions(target_type, target_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_research_parent ON research_sessions(parent_session_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_research_status ON research_sessions(status)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_steps_session ON research_steps(session_id)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_steps_tool ON research_steps(tool_name)`);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_steps_replay ON research_steps(session_id, step_number)`);

  console.log('PostgreSQL database initialized');
}

let initialized = false;

/** DBインスタンスを取得（非同期） */
export async function getDbAsync(): Promise<DatabaseWrapper> {
  if (!db) {
    db = new DatabaseWrapper();

    if (!initialized) {
      await initDb(db);
      initialized = true;
    }
  }
  return db;
}

/** 
 * 同期的なgetDb（後方互換性のため）
 * 注意: 返されるオブジェクトのメソッドは全て非同期です
 */
export function getDb(): DatabaseWrapper {
  if (!db) {
    db = new DatabaseWrapper();

    // 初期化は非同期で行う（最初のクエリ時に自動的にテーブルが作成される）
    if (!initialized) {
      initDb(db).then(() => {
        initialized = true;
      }).catch(err => {
        console.error('DB init error:', err);
      });
    }
  }
  return db;
}

/** 接続プールをシャットダウン */
export async function closeDb(): Promise<void> {
  await pool.end();
  db = null;
  initialized = false;
}

/** 
 * getRawDb - db-new.tsとの互換性のためのエイリアス
 * getDb()と同じ動作
 */
export function getRawDb(): DatabaseWrapper {
  return getDb();
}
