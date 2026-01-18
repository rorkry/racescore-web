import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// このAPIは一度だけ実行する初期化用
// 本番では削除するか、認証を追加すること

export async function GET(request: Request) {
  // シークレットキーでアクセス制限
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  if (secret !== 'init-stride-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const client = await pool.connect();
    
    // テーブル作成SQL
    await client.query(`
      -- ユーザーテーブル
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        name TEXT,
        role TEXT DEFAULT 'user',
        image TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- お気に入り馬テーブル
      CREATE TABLE IF NOT EXISTS favorite_horses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        horse_name TEXT NOT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- 予想テーブル
      CREATE TABLE IF NOT EXISTS predictions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        race_id TEXT NOT NULL,
        horse_name TEXT NOT NULL,
        mark TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- ポイントテーブル
      CREATE TABLE IF NOT EXISTS user_points (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        balance INTEGER DEFAULT 0,
        total_earned INTEGER DEFAULT 0,
        total_spent INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- ポイント履歴
      CREATE TABLE IF NOT EXISTS point_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- サブスクリプション
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        plan TEXT DEFAULT 'free',
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- wakujun（出走表）
      CREATE TABLE IF NOT EXISTS wakujun (
        id SERIAL PRIMARY KEY,
        year TEXT,
        date TEXT,
        place TEXT,
        race_number TEXT,
        waku TEXT,
        umaban TEXT,
        umamei TEXT,
        kishu TEXT,
        kinryo TEXT,
        track_type TEXT,
        distance TEXT,
        class_name_1 TEXT,
        class_name_2 TEXT,
        tosu TEXT,
        shozoku TEXT,
        chokyoshi TEXT,
        shozoku_chi TEXT,
        umajirushi TEXT,
        seibetsu TEXT,
        nenrei TEXT,
        nenrei_display TEXT
      );

      -- umadata（過去走データ）
      CREATE TABLE IF NOT EXISTS umadata (
        id SERIAL PRIMARY KEY,
        horse_name TEXT,
        date TEXT,
        place TEXT,
        race_name TEXT,
        distance TEXT,
        track_condition TEXT,
        finish_position TEXT,
        finish_time TEXT,
        margin TEXT,
        corner_1 TEXT,
        corner_2 TEXT,
        corner_3 TEXT,
        corner_4 TEXT,
        number_of_horses TEXT,
        class_name TEXT,
        horse_number TEXT,
        race_id_new_no_horse_num TEXT,
        pci TEXT,
        work_1s TEXT
      );

      -- 指数テーブル
      CREATE TABLE IF NOT EXISTS indices (
        race_id TEXT PRIMARY KEY,
        L4F REAL,
        T2F REAL,
        potential REAL,
        revouma REAL,
        makikaeshi REAL,
        cushion REAL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- 馬印テーブル
      CREATE TABLE IF NOT EXISTS horse_marks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        race_id TEXT NOT NULL,
        horse_name TEXT NOT NULL,
        mark TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- レースメモテーブル
      CREATE TABLE IF NOT EXISTS race_memos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        race_id TEXT NOT NULL,
        memo TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- 馬場メモテーブル
      CREATE TABLE IF NOT EXISTS baba_memos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        place TEXT NOT NULL,
        memo TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- バッジテーブル
      CREATE TABLE IF NOT EXISTS user_badges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        badge_type TEXT NOT NULL,
        badge_level TEXT DEFAULT 'bronze',
        progress INTEGER DEFAULT 0,
        earned_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- ログインボーナステーブル
      CREATE TABLE IF NOT EXISTS login_bonus (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        login_date DATE NOT NULL,
        streak_days INTEGER DEFAULT 1,
        bonus_points INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- 通知テーブル
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- saga_ai_cacheテーブル
      CREATE TABLE IF NOT EXISTS saga_ai_cache (
        id TEXT PRIMARY KEY,
        race_id TEXT NOT NULL,
        horse_name TEXT NOT NULL,
        analysis_json TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- race_levelsテーブル
      CREATE TABLE IF NOT EXISTS race_levels (
        race_id TEXT PRIMARY KEY,
        level TEXT NOT NULL,
        next_race_count INTEGER DEFAULT 0,
        good_run_count INTEGER DEFAULT 0,
        win_count INTEGER DEFAULT 0,
        good_run_rate REAL DEFAULT 0,
        calculated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    client.release();
    await pool.end();

    return NextResponse.json({ 
      success: true, 
      message: 'All tables created successfully!' 
    });
  } catch (error: any) {
    console.error('Init DB error:', error);
    return NextResponse.json({ 
      error: 'Failed to create tables', 
      details: error.message 
    }, { status: 500 });
  }
}
