/**
 * umadataを直接PostgreSQLにアップロードするスクリプト
 * 
 * 使い方:
 *   npx ts-node scripts/upload-umadata-direct.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import Papa from 'papaparse';
import iconv from 'iconv-lite';

// Railway PostgreSQL接続URL
// 環境変数から取得、または直接指定
const DATABASE_URL = process.env.DATABASE_URL || '';

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL環境変数を設定してください');
  console.log('');
  console.log('方法1: 環境変数で設定');
  console.log('  set DATABASE_URL=postgresql://...');
  console.log('');
  console.log('方法2: このファイルの DATABASE_URL を直接編集');
  process.exit(1);
}

// CSVファイルパス
const CSV_PATH = 'C:\\競馬データ\\umadataall.csv';

async function main() {
  console.log('============================================================');
  console.log('umadata Direct Upload Tool');
  console.log('============================================================');
  console.log('');
  
  // ファイル存在確認
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`ERROR: ファイルが見つかりません: ${CSV_PATH}`);
    process.exit(1);
  }

  const stats = fs.statSync(CSV_PATH);
  console.log(`ファイル: ${CSV_PATH}`);
  console.log(`サイズ: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log('');

  // CSV読み込み
  console.log('CSVファイルを読み込み中...');
  const buffer = fs.readFileSync(CSV_PATH);
  const text = iconv.decode(buffer, 'Shift_JIS');
  
  const { data } = Papa.parse(text, {
    header: false,
    skipEmptyLines: true,
  });

  // ヘッダー行をスキップ
  const rows = data.slice(1) as string[][];
  console.log(`データ行数: ${rows.length}`);
  console.log('');

  // PostgreSQL接続
  console.log('PostgreSQLに接続中...');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 60000,
  });

  const client = await pool.connect();
  console.log('接続成功!');
  console.log('');

  try {
    // テーブル確認
    const tableCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'umadata' 
      ORDER BY ordinal_position
    `);
    
    if (tableCheck.rows.length === 0) {
      console.error('ERROR: umadataテーブルが存在しません');
      console.log('先に /api/recreate-umadata を実行してください');
      process.exit(1);
    }
    
    console.log(`umadataテーブルのカラム数: ${tableCheck.rows.length}`);
    console.log('');

    // 既存データを削除
    console.log('既存データを削除中...');
    await client.query('TRUNCATE TABLE umadata RESTART IDENTITY');
    console.log('削除完了');
    console.log('');

    // アップロード開始（バッチINSERTで高速化）
    console.log('データをアップロード中（高速バッチモード）...');
    const startTime = Date.now();
    
    let inserted = 0;
    let errors = 0;
    const batchSize = 100; // 100行ずつバッチINSERT

    await client.query('BEGIN');

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).filter(row => row.length >= 39);
      
      if (batch.length === 0) continue;

      try {
        // バッチINSERT用のVALUES句を構築
        const values: any[] = [];
        const placeholders: string[] = [];
        
        batch.forEach((row, idx) => {
          const offset = idx * 39;
          const rowPlaceholders = [];
          for (let j = 1; j <= 39; j++) {
            rowPlaceholders.push(`$${offset + j}`);
            values.push((row[j - 1] || '').trim());
          }
          placeholders.push(`(${rowPlaceholders.join(', ')})`);
        });

        await client.query(`
          INSERT INTO umadata (
            race_id, date, place, course_type, distance, class_name, race_name,
            gender_limit, age_limit, waku, umaban, horse_name,
            corner_4_position, track_condition, field_size, popularity,
            finish_position, last_3f, weight_carried, horse_weight, weight_change,
            finish_time, race_count, margin, win_odds, place_odds,
            win_payout, place_payout, rpci, pci, pci3, horse_mark,
            passing_order, gender_age, jockey, trainer, sire, dam, lap_time
          ) VALUES ${placeholders.join(', ')}
        `, values);
        
        inserted += batch.length;
      } catch (e: any) {
        errors += batch.length;
        if (errors <= 500) {
          console.error(`Batch error at ${i}: ${e.message}`);
        }
      }

      // 進捗表示（1000行ごと）
      if ((i + batchSize) % 1000 === 0 || i + batchSize >= rows.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const speed = Math.round(inserted / (Date.now() - startTime) * 1000);
        const percent = ((i + batchSize) / rows.length * 100).toFixed(1);
        console.log(`  ${percent}% - ${inserted.toLocaleString()} 件 (${elapsed}秒, ${speed}件/秒)`);
      }

      // 定期的にコミット（10000行ごと）
      if (inserted > 0 && inserted % 10000 === 0) {
        await client.query('COMMIT');
        await client.query('BEGIN');
      }
    }

    await client.query('COMMIT');
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('');
    console.log('============================================================');
    console.log(`完了!`);
    console.log(`  挿入: ${inserted.toLocaleString()} 件`);
    console.log(`  エラー: ${errors} 件`);
    console.log(`  処理時間: ${totalTime} 秒`);
    console.log('============================================================');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
