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
