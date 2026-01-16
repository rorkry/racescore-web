/**
 * 管理者セットアップスクリプト
 * 
 * 使い方:
 * npx tsx scripts/setup-admin.ts
 * 
 * または package.json に追加:
 * "setup-admin": "tsx scripts/setup-admin.ts"
 */

import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import * as readline from 'readline';

const ADMIN_EMAIL = 'emuniki01@gmail.com';
const DB_PATH = './keiba.db';

async function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log('=================================');
  console.log('  管理者アカウント セットアップ');
  console.log('=================================\n');

  const db = new Database(DB_PATH);

  // テーブルが存在するか確認、なければ作成
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER,
      image TEXT,
      password TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER,
      updated_at INTEGER
    )
  `);

  // 管理者が既に存在するか確認
  const existingAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get(ADMIN_EMAIL);

  if (existingAdmin) {
    console.log(`管理者アカウント (${ADMIN_EMAIL}) は既に存在します。\n`);
    const update = await askQuestion('パスワードを更新しますか？ (y/n): ');
    
    if (update.toLowerCase() !== 'y') {
      console.log('\nセットアップを終了します。');
      db.close();
      process.exit(0);
    }
  }

  // パスワード入力
  const password = await askQuestion('新しいパスワードを入力してください (8文字以上): ');

  if (password.length < 8) {
    console.error('\nエラー: パスワードは8文字以上で入力してください。');
    db.close();
    process.exit(1);
  }

  // 確認
  const confirmPassword = await askQuestion('パスワードを再入力してください: ');

  if (password !== confirmPassword) {
    console.error('\nエラー: パスワードが一致しません。');
    db.close();
    process.exit(1);
  }

  // パスワードをハッシュ化
  const hashedPassword = await bcrypt.hash(password, 12);
  const now = Date.now();

  if (existingAdmin) {
    // 既存アカウントを更新
    db.prepare(`
      UPDATE users 
      SET password = ?, updated_at = ? 
      WHERE email = ?
    `).run(hashedPassword, now, ADMIN_EMAIL);
    console.log('\n✅ 管理者パスワードを更新しました！');
  } else {
    // 新規作成
    const userId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, email, password, name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'admin', ?, ?)
    `).run(userId, ADMIN_EMAIL, hashedPassword, '管理者', now, now);
    console.log('\n✅ 管理者アカウントを作成しました！');
  }

  console.log(`\nメールアドレス: ${ADMIN_EMAIL}`);
  console.log('ログインしてください: http://localhost:3000\n');

  db.close();
}

main().catch(console.error);
