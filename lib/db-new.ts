import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../drizzle/schema';

// Next.jsの開発モードではホットリロードで変数がリセットされるため、globalThisを使用
declare global {
  // eslint-disable-next-line no-var
  var _drizzleDb: ReturnType<typeof drizzle> | undefined;
  // eslint-disable-next-line no-var
  var _rawDb: Database.Database | undefined;
}

/** どの場所から呼んでも同じ DB インスタンスを返す */
export function getDb() {
  if (!globalThis._drizzleDb) {
    const path = process.env.DB_PATH ?? 'races.db';
    
    const sqlite = new Database(path);
    sqlite.pragma('journal_mode = WAL');
    
    globalThis._drizzleDb = drizzle(sqlite, { schema });
  }
  return globalThis._drizzleDb;
}

/** 旧バージョンとの互換性のため、生のSQLiteインスタンスも取得可能に */
/** シングルトンパターンで同じ接続を再利用（メモリリーク防止） */
export function getRawDb(): Database.Database {
  // 既存の接続が有効かチェック
  if (globalThis._rawDb) {
    try {
      // 接続が開いているかテスト
      globalThis._rawDb.pragma('journal_mode');
      return globalThis._rawDb;
    } catch {
      // 接続が閉じられている場合は再接続
      console.log('[db-new] 接続が閉じていたため再接続します');
      globalThis._rawDb = undefined;
    }
  }
  
  const path = process.env.DB_PATH ?? 'races.db';
  console.log('[db-new] 新しいDB接続を作成:', path);
  
  globalThis._rawDb = new Database(path);
  globalThis._rawDb.pragma('journal_mode = WAL');
  globalThis._rawDb.pragma('busy_timeout = 5000'); // ロック待機時間を5秒に設定
  
  // 既存のテーブルを作成（Drizzle移行前のコードとの互換性）
  globalThis._rawDb.exec(`
    CREATE TABLE IF NOT EXISTS races (
      raceKey TEXT PRIMARY KEY,
      date TEXT,
      place TEXT,
      raceNo INTEGER,
      data TEXT
    )
  `);

  globalThis._rawDb.exec(`
    CREATE TABLE IF NOT EXISTS umaren (
      raceKey TEXT,
      comb TEXT,
      odds REAL,
      PRIMARY KEY (raceKey, comb)
    )
  `);

  globalThis._rawDb.exec(`
    CREATE TABLE IF NOT EXISTS wide (
      raceKey TEXT,
      comb TEXT,
      odds REAL,
      PRIMARY KEY (raceKey, comb)
    )
  `);

  // umadataテーブル（過去走データ）
  globalThis._rawDb.exec(`
    CREATE TABLE IF NOT EXISTS umadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // indicesテーブル（各種指数データ）
  globalThis._rawDb.exec(`
    CREATE TABLE IF NOT EXISTS indices (
      race_id TEXT PRIMARY KEY,
      L4F REAL,
      T2F REAL,
      potential REAL,
      revouma REAL,
      makikaeshi REAL,
      cushion REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // wakujunテーブル（出走表）
  globalThis._rawDb.exec(`
    CREATE TABLE IF NOT EXISTS wakujun (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // saga_analysis_cacheテーブル（おれAI分析キャッシュ）
  globalThis._rawDb.exec(`
    CREATE TABLE IF NOT EXISTS saga_analysis_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year TEXT NOT NULL,
      date TEXT NOT NULL,
      place TEXT NOT NULL,
      race_number TEXT NOT NULL,
      horse_number INTEGER NOT NULL,
      horse_name TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, date, place, race_number, horse_number)
    )
  `);

  // インデックス作成（高速検索用）
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_saga_cache_race 
    ON saga_analysis_cache(year, date, place, race_number)
  `);

  // race_pace_cacheテーブル（展開予想キャッシュ）
  globalThis._rawDb.exec(`
    CREATE TABLE IF NOT EXISTS race_pace_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year TEXT NOT NULL,
      date TEXT NOT NULL,
      place TEXT NOT NULL,
      race_number TEXT NOT NULL,
      prediction_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, date, place, race_number)
    )
  `);

  // インデックス作成（高速検索用）
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_pace_cache_race 
    ON race_pace_cache(year, date, place, race_number)
  `);

  // ========================================
  // パフォーマンス向上用インデックス
  // ========================================
  
  // wakujun（出走表）- レース検索の高速化
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_wakujun_race_lookup 
    ON wakujun(date, place, race_number)
  `);
  
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_wakujun_umamei 
    ON wakujun(umamei)
  `);
  
  // wakujun - 年別検索用
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_wakujun_year 
    ON wakujun(year)
  `);
  
  // wakujun - 年+日付検索用（日付一覧取得で使用）
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_wakujun_year_date 
    ON wakujun(year, date)
  `);

  // umadata（過去走データ）- 馬名・日付検索の高速化
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_umadata_horse_name 
    ON umadata(horse_name)
  `);
  
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_umadata_date 
    ON umadata(date DESC)
  `);
  
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_umadata_horse_date 
    ON umadata(horse_name, date DESC)
  `);
  
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_umadata_race_id 
    ON umadata(race_id_new_no_horse_num)
  `);
  
  // umadata - タイム比較クエリ用（おれAI）
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_umadata_place_distance 
    ON umadata(place, distance)
  `);
  
  // umadata - 日付+場所+距離の複合検索用（おれAI）
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_umadata_date_place_distance 
    ON umadata(date, place, distance)
  `);

  // indices（指数データ）- race_id検索の高速化
  globalThis._rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_indices_race_id 
    ON indices(race_id)
  `);

  console.log('[db-new] インデックス作成完了');
  
  return globalThis._rawDb;
}
