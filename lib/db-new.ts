// /lib/db-new.ts - PostgreSQL版
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
    .replace(/datetime\('now', 'localtime'\)/gi, 'NOW()')
    .replace(/CURRENT_TIMESTAMP/gi, 'NOW()');
}

// SQL変換（SQLite → PostgreSQL）
function convertSql(sql: string): string {
  return convertDatetime(convertPlaceholders(sql));
}

/** SQLite互換のDBインターフェース（同期的なAPIを非同期で実装） */
class RawDatabaseWrapper {
  /** 単一行を取得 */
  prepare(sql: string) {
    const convertedSql = convertSql(sql);
    
    return {
      /** 単一行取得 */
      get: async <T = Record<string, unknown>>(...params: unknown[]): Promise<T | undefined> => {
        try {
          const result: QueryResult = await pool.query(convertedSql, params);
          return result.rows[0] as T | undefined;
        } catch (error) {
          console.error('DB get error:', error, 'SQL:', convertedSql);
          throw error;
        }
      },
      
      /** 複数行取得 */
      all: async <T = Record<string, unknown>>(...params: unknown[]): Promise<T[]> => {
        try {
          const result: QueryResult = await pool.query(convertedSql, params);
          return result.rows as T[];
        } catch (error) {
          console.error('DB all error:', error, 'SQL:', convertedSql);
          throw error;
        }
      },
      
      /** 実行（INSERT/UPDATE/DELETE） */
      run: async (...params: unknown[]): Promise<{ changes: number }> => {
        try {
          const result: QueryResult = await pool.query(convertedSql, params);
          return { changes: result.rowCount ?? 0 };
        } catch (error) {
          console.error('DB run error:', error, 'SQL:', convertedSql);
          throw error;
        }
      },
    };
  }

  /** 生SQLを実行 */
  async exec(sql: string): Promise<void> {
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      try {
        const converted = convertDatetime(statement);
        await pool.query(converted);
      } catch (error) {
        const msg = (error as Error).message || '';
        if (!msg.includes('already exists') && !msg.includes('duplicate key')) {
          console.error('DB exec error:', error, 'Statement:', statement);
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

let rawDb: RawDatabaseWrapper | null = null;
let initialized = false;

/** テーブル初期化 */
async function initTables(db: RawDatabaseWrapper) {
  // races テーブル
  await db.exec(`
    CREATE TABLE IF NOT EXISTS races (
      "raceKey" TEXT PRIMARY KEY,
      date TEXT,
      place TEXT,
      "raceNo" INTEGER,
      data TEXT
    )
  `);

  // umaren テーブル
  await db.exec(`
    CREATE TABLE IF NOT EXISTS umaren (
      "raceKey" TEXT,
      comb TEXT,
      odds REAL,
      PRIMARY KEY ("raceKey", comb)
    )
  `);

  // wide テーブル
  await db.exec(`
    CREATE TABLE IF NOT EXISTS wide (
      "raceKey" TEXT,
      comb TEXT,
      odds REAL,
      PRIMARY KEY ("raceKey", comb)
    )
  `);

  // umadataテーブル（過去走データ）
  await db.exec(`
    CREATE TABLE IF NOT EXISTS umadata (
      id SERIAL PRIMARY KEY,
      race_id_new_no_horse_num TEXT,
      date TEXT,
      distance TEXT,
      horse_number TEXT,
      horse_name TEXT,
      index_value TEXT,
      class_name TEXT,
      track_condition TEXT,
      finish_position TEXT,
      last_3f TEXT,
      finish_time TEXT,
      standard_time TEXT,
      rpci TEXT,
      pci TEXT,
      good_run TEXT,
      pci3 TEXT,
      horse_mark TEXT,
      corner_2 TEXT,
      corner_3 TEXT,
      corner_4 TEXT,
      gender TEXT,
      age TEXT,
      horse_weight TEXT,
      weight_change TEXT,
      jockey_weight TEXT,
      jockey TEXT,
      multiple_entries TEXT,
      affiliation TEXT,
      trainer TEXT,
      place TEXT,
      number_of_horses TEXT,
      popularity TEXT,
      sire TEXT,
      dam TEXT,
      track_condition_2 TEXT,
      place_2 TEXT,
      margin TEXT,
      corner_1 TEXT,
      corner_2_2 TEXT,
      corner_3_2 TEXT,
      corner_4_2 TEXT,
      work_1s TEXT,
      horse_mark_2 TEXT,
      horse_mark_3 TEXT,
      horse_mark_4 TEXT,
      horse_mark_5 TEXT,
      horse_mark_6 TEXT,
      horse_mark_7 TEXT,
      horse_mark_7_2 TEXT,
      horse_mark_8 TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // indicesテーブル（各種指数データ）
  await db.exec(`
    CREATE TABLE IF NOT EXISTS indices (
      race_id TEXT PRIMARY KEY,
      "L4F" REAL,
      "T2F" REAL,
      potential REAL,
      revouma REAL,
      makikaeshi REAL,
      cushion REAL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // wakujunテーブル（出走表）
  await db.exec(`
    CREATE TABLE IF NOT EXISTS wakujun (
      id SERIAL PRIMARY KEY,
      year TEXT,
      date TEXT,
      place TEXT,
      race_number TEXT,
      class_name_1 TEXT,
      class_name_2 TEXT,
      waku TEXT,
      umaban TEXT,
      kinryo TEXT,
      umamei TEXT,
      seibetsu TEXT,
      nenrei TEXT,
      nenrei_display TEXT,
      kishu TEXT,
      blank_field TEXT,
      track_type TEXT,
      distance TEXT,
      tosu TEXT,
      shozoku TEXT,
      chokyoshi TEXT,
      shozoku_chi TEXT,
      umajirushi TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // saga_analysis_cacheテーブル（おれAI分析キャッシュ）
  await db.exec(`
    CREATE TABLE IF NOT EXISTS saga_analysis_cache (
      id SERIAL PRIMARY KEY,
      year TEXT NOT NULL,
      date TEXT NOT NULL,
      place TEXT NOT NULL,
      race_number TEXT NOT NULL,
      horse_number INTEGER NOT NULL,
      horse_name TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(year, date, place, race_number, horse_number)
    )
  `);

  // race_pace_cacheテーブル（展開予想キャッシュ）
  await db.exec(`
    CREATE TABLE IF NOT EXISTS race_pace_cache (
      id SERIAL PRIMARY KEY,
      year TEXT NOT NULL,
      date TEXT NOT NULL,
      place TEXT NOT NULL,
      race_number TEXT NOT NULL,
      prediction_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(year, date, place, race_number)
    )
  `);

  // インデックス作成
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_saga_cache_race ON saga_analysis_cache(year, date, place, race_number)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_pace_cache_race ON race_pace_cache(year, date, place, race_number)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_wakujun_race_lookup ON wakujun(date, place, race_number)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_wakujun_umamei ON wakujun(umamei)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_wakujun_year ON wakujun(year)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_wakujun_year_date ON wakujun(year, date)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_umadata_horse_name ON umadata(horse_name)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_umadata_date ON umadata(date DESC)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_umadata_horse_date ON umadata(horse_name, date DESC)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_umadata_race_id ON umadata(race_id_new_no_horse_num)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_umadata_place_distance ON umadata(place, distance)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_umadata_date_place_distance ON umadata(date, place, distance)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_indices_race_id ON indices(race_id)`);

  console.log('[db-new] PostgreSQL tables and indexes initialized');
}

/** 
 * 生のDBインスタンスを取得（非同期）
 * 注意: 返されるオブジェクトのメソッドは全て非同期です
 */
export function getRawDb(): RawDatabaseWrapper {
  if (!rawDb) {
    rawDb = new RawDatabaseWrapper();
    
    if (!initialized) {
      initTables(rawDb).then(() => {
        initialized = true;
      }).catch(err => {
        console.error('DB init error:', err);
      });
    }
  }
  return rawDb;
}

/** Drizzle互換のgetDb（後方互換性のため） */
export function getDb(): RawDatabaseWrapper {
  return getRawDb();
}

/** 接続プールをシャットダウン */
export async function closeDb(): Promise<void> {
  await pool.end();
  rawDb = null;
  initialized = false;
}
