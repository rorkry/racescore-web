import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../drizzle/schema';

let db: ReturnType<typeof drizzle> | null = null;

/** どの場所から呼んでも同じ DB インスタンスを返す */
export function getDb() {
  if (!db) {
    // .env.local に DB_PATH を置かなければ ./races.db を開く
    const path = process.env.DB_PATH ?? 'races.db';
    
    const sqlite = new Database(path);
    sqlite.pragma('journal_mode = WAL');
    
    db = drizzle(sqlite, { schema });
  }
  return db;
}

/** 旧バージョンとの互換性のため、生のSQLiteインスタンスも取得可能に */
export function getRawDb(): Database.Database {
  const path = process.env.DB_PATH ?? 'races.db';
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  
  // 既存のテーブルを作成（Drizzle移行前のコードとの互換性）
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS races (
      raceKey TEXT PRIMARY KEY,
      date TEXT,
      place TEXT,
      raceNo INTEGER,
      data TEXT
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS umaren (
      raceKey TEXT,
      comb TEXT,
      odds REAL,
      PRIMARY KEY (raceKey, comb)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS wide (
      raceKey TEXT,
      comb TEXT,
      odds REAL,
      PRIMARY KEY (raceKey, comb)
    )
  `);

  // umadataテーブル（過去走データ）
  sqlite.exec(`
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
  sqlite.exec(`
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
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS wakujun (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  
  return sqlite;
}
