// scripts/import_tfjv.ts
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/* ---------- ① 環境変数 ---------- */
const TFJV_PATH = process.env.TFJV_PATH;
if (!TFJV_PATH) {
  console.error('❌  環境変数 TFJV_PATH が未設定です (.env.local)');
  process.exit(1);
}

/* ---------- ② SQLite 接続 ---------- */
const db = new Database('races.db');
db.pragma('journal_mode = WAL');        // 高速 & 安全

/* ---------- ③ テーブル確保 (存在しなければ作る) ---------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS races (
    raceId   TEXT PRIMARY KEY,
    ymd      TEXT,
    course   TEXT,
    raceNo   TEXT,
    grade    TEXT
  );

  CREATE TABLE IF NOT EXISTS race_results (
    raceId   TEXT,
    horseId  TEXT,
    frameNo  TEXT,
    horseNo  TEXT,
    position INTEGER,
    time     REAL,
    odds_win REAL,
    PRIMARY KEY (raceId, horseId)
  );

  CREATE TABLE IF NOT EXISTS horses (
    horseId   TEXT PRIMARY KEY,
    name      TEXT,
    sex       TEXT,
    birthYmd  TEXT,
    trainer   TEXT
  );

  CREATE TABLE IF NOT EXISTS entries (
    raceId  TEXT,
    horseNo TEXT,
    frameNo TEXT,
    name    TEXT,
    sex     TEXT,
    age     INTEGER,
    trainer TEXT,
    weight  REAL,
    PRIMARY KEY (raceId, horseNo)
  );
`);

/* ---------- ④ TFJV フォルダ走査 ---------- */
function walk(dir: string, list: string[] = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walk(p, list);
    else list.push(p);
  }
  return list;
}

/* ---------- ⑤ メイン ---------- */
function main() {
  console.log('📂 Scanning TFJV_PATH:', TFJV_PATH);
  const files = walk(TFJV_PATH!);
  console.log('🔍 見つかったファイル数:', files.length);

  // TODO: 拡張子やファイル名ルールでフィルタ → 各種パーサへ渡す
  // TODO: INSERT ... ON CONFLICT DO NOTHING で突っ込む
}

main();