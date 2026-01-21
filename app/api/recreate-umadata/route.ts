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
    
    // 新フォーマットでテーブル作成（47列）
    await client.query(`
      CREATE TABLE umadata (
        id SERIAL PRIMARY KEY,
        race_id TEXT,              -- 0: レースID(新/馬番無)
        date TEXT,                 -- 1: 日付(yyyy.mm.dd)
        place TEXT,                -- 2: 場所
        course_type TEXT,          -- 3: 芝(内・外)
        distance TEXT,             -- 4: 距離
        class_name TEXT,           -- 5: クラス名
        race_name TEXT,            -- 6: レース名
        gender_limit TEXT,         -- 7: 性別限定
        age_limit TEXT,            -- 8: 年齢限定
        waku TEXT,                 -- 9: 枠番
        umaban TEXT,               -- 10: 馬番
        horse_name TEXT,           -- 11: 馬名S
        index_value TEXT,          -- 12: 指数（4角位置）
        track_condition TEXT,      -- 13: 馬場状態
        field_size TEXT,           -- 14: 頭数
        popularity TEXT,           -- 15: 人気
        finish_position TEXT,      -- 16: 着順
        last_3f TEXT,              -- 17: 上り3F
        weight_carried TEXT,       -- 18: 斤量
        horse_weight TEXT,         -- 19: 馬体重
        weight_change TEXT,        -- 20: 馬体重増減
        finish_time TEXT,          -- 21: 走破タイム
        race_count TEXT,           -- 22: 休み明け～戦目
        margin TEXT,               -- 23: 着差
        win_odds TEXT,             -- 24: 単勝オッズ
        place_odds_low TEXT,       -- 25: 複勝オッズ下限
        place_odds_high TEXT,      -- 26: 複勝オッズ上限
        win_payout TEXT,           -- 27: 単勝配当
        place_payout TEXT,         -- 28: 複勝配当
        rpci TEXT,                 -- 29: RPCI
        pci TEXT,                  -- 30: PCI
        good_run TEXT,             -- 31: 好走
        pci3 TEXT,                 -- 32: PCI3
        horse_mark TEXT,           -- 33: 馬印
        corner_1 TEXT,             -- 34: 1角
        corner_2 TEXT,             -- 35: 2角
        corner_3 TEXT,             -- 36: 3角
        corner_4 TEXT,             -- 37: 4角
        gender TEXT,               -- 38: 性別
        age TEXT,                  -- 39: 年齢
        jockey TEXT,               -- 40: 騎手
        multi_entry TEXT,          -- 41: 多頭出し
        affiliation TEXT,          -- 42: 所属
        trainer TEXT,              -- 43: 調教師
        sire TEXT,                 -- 44: 種牡馬
        dam TEXT,                  -- 45: 母馬
        lap_time TEXT,             -- 46: ワーク1（ラップタイム）
        work_2 TEXT                -- 47: ワーク2
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
