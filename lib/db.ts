// /lib/db.ts
import Database from 'better-sqlite3';

let db: Database | null = null;

/** どの場所から呼んでも同じ DB インスタンスを返す */
export function getDb() {
  if (!db) {
    // .env.local に DB_PATH を置かなければ ./races.db を開く
    const path = process.env.DB_PATH ?? 'races.db';
    db = new Database(path, { readonly: true });
    db.pragma('journal_mode = WAL');  // 読み取り専用でも一応 WAL
  }
  return db;
}