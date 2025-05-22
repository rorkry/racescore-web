#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/consistent-type-imports */

import fs from 'fs';
import Papa from 'papaparse';
import Database from 'better-sqlite3';

/* ─────────────── 設定だけここで ─────────────── */
const DB_PATH     = process.env.DB_PATH ?? 'races.db';
const ENTRIES_SRC = 'csv/umadata.csv';          // ← 置いた CSV
/* ──────────────────────────────────────────── */

type Row = Record<string, string>;

/* ヘッダ行を UTF-8 で読み込んで JS 配列に変換 */
function readCsv(file: string): Row[] {
  const txt = fs.readFileSync(file, 'utf8');
  const { data } = Papa.parse<Row>(txt, {
    header: true,
    skipEmptyLines: true,
    delimiter: ',',           // ここを '\t' にすれば TSV も読めます
    transformHeader: h => h.trim(), // 「場所 」のような余白除去
  });
  return data;
}

/* DB 接続（WAL = 同時アクセス耐性↑） */
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');          // ★ ここで FK 無効化

/* ─────────────── 取込みトランザクション ─────────────── */
const tx = db.transaction(() => {
  /* horses */
  const horseStmt = db.prepare(`
    INSERT OR IGNORE INTO horses
      (horseId, name, sex, trainer) VALUES
      (@horseId, @name, @sex, @trainer)
  `);

  /* races（最低限 raceId だけ突っ込む） */
  const raceStmt = db.prepare(`
    INSERT OR IGNORE INTO races (raceId) VALUES (@raceId)
  `);

  /* race_results */
  const resultStmt = db.prepare(`
    INSERT OR REPLACE INTO race_results
      (raceId, horseId, frameNo, horseNo, position, time)
    VALUES
      (@raceId, @horseId, @frameNo, @horseNo, @position, @time)
  `);

  /* -------------- CSV 読み込み -------------- */
  const rows = readCsv(ENTRIES_SRC);

  rows.forEach(r => {
    /* ▼ CSV 実ヘッダ → DB 列 のマッピング（要確認） */
    const raceId  = r['レースID(新/馬番無)'];
    const horseId = r['馬名'];             // 馬名で暫定 PK
    const frameNo = r['枠番'] ?? null;
    const horseNo = r['馬番'] ?? null;

    /* horses */
    horseStmt.run({
      horseId,
      name   : r['馬名'],
      sex    : r['性別'],
      trainer: r['調教師'],
    });

    /* races */
    raceStmt.run({ raceId });

    /* race_results */
    resultStmt.run({
      raceId,
      horseId,
      frameNo,
      horseNo,
      position: Number(r['着順']) || null,
      time    : Number(r['走破タイム']) || null,
    });
  });
});

/* 実行 */
try {
  tx();
  console.log('✅ race_results まで流し込み完了！');
} catch (err) {
  console.error('❌ インポート失敗:', err);
  process.exit(1);
}