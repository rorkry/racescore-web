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
  
  return sqlite;
}
