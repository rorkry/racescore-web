import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { isAdminRequest } from '@/lib/auth-check';

// umadataテーブルを新フォーマットで再作成するAPI
// 管理者のみアクセス可能

export async function GET(request: Request) {
  // 管理者認証チェック
  if (!(await isAdminRequest(request))) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const recreateSecret = process.env.RECREATE_SECRET || 'recreate-umadata-2026';
    
    if (secret !== recreateSecret) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const client = await pool.connect();
    
    // 既存テーブルを削除
    await client.query('DROP TABLE IF EXISTS umadata CASCADE');
    
    // 新フォーマットでテーブル作成（39列 - upload-csvと統一）
    await client.query(`
      CREATE TABLE umadata (
        id SERIAL PRIMARY KEY,
        race_id TEXT,              -- 0: レースID
        date TEXT,                 -- 1: 日付
        place TEXT,                -- 2: 場所
        course_type TEXT,          -- 3: 内/外回り
        distance TEXT,             -- 4: 距離(芝2200等)
        class_name TEXT,           -- 5: クラス
        race_name TEXT,            -- 6: レース名
        gender_limit TEXT,         -- 7: 牝馬限定フラグ
        age_limit TEXT,            -- 8: 2歳/3歳限定
        waku TEXT,                 -- 9: 枠
        umaban TEXT,               -- 10: 馬番
        horse_name TEXT,           -- 11: 馬名
        corner_4_position TEXT,    -- 12: 4角位置
        track_condition TEXT,      -- 13: 馬場状態
        field_size TEXT,           -- 14: 頭数
        popularity TEXT,           -- 15: 人気
        finish_position TEXT,      -- 16: 着順
        last_3f TEXT,              -- 17: 上がり3F
        weight_carried TEXT,       -- 18: 斤量
        horse_weight TEXT,         -- 19: 馬体重
        weight_change TEXT,        -- 20: 馬体重増減
        finish_time TEXT,          -- 21: 走破タイム
        race_count TEXT,           -- 22: 休み明けから何戦目
        margin TEXT,               -- 23: 着差
        win_odds TEXT,             -- 24: 単勝オッズ
        place_odds TEXT,           -- 25: 複勝オッズ
        win_payout TEXT,           -- 26: 単勝配当
        place_payout TEXT,         -- 27: 複勝配当
        rpci TEXT,                 -- 28: RPCI
        pci TEXT,                  -- 29: PCI
        pci3 TEXT,                 -- 30: PCI3
        horse_mark TEXT,           -- 31: 印
        passing_order TEXT,        -- 32: 通過順
        gender_age TEXT,           -- 33: 性齢(牡3等)
        jockey TEXT,               -- 34: 騎手
        trainer TEXT,              -- 35: 調教師
        sire TEXT,                 -- 36: 種牡馬
        dam TEXT,                  -- 37: 母馬名
        lap_time TEXT              -- 38: ラップタイム
      )
    `);

    // インデックス作成
    await client.query('CREATE INDEX IF NOT EXISTS idx_umadata_horse_name ON umadata(horse_name)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_umadata_race_id ON umadata(race_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_umadata_date ON umadata(date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_umadata_jockey ON umadata(jockey)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_umadata_sire ON umadata(sire)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_umadata_dam ON umadata(dam)');
    
    client.release();
    await pool.end();

    return NextResponse.json({ 
      success: true, 
      message: 'umadataテーブルを新フォーマット（47列）で再作成しました'
    });
  } catch (error: any) {
    console.error('Recreate umadata error:', error);
    return NextResponse.json({ 
      error: 'Failed to recreate table', 
      details: error.message 
    }, { status: 500 });
  }
}
