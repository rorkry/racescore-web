import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// umadataテーブルを新フォーマットで再作成するAPI
// 本番運用後は削除すること

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  if (secret !== 'recreate-umadata-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const client = await pool.connect();
    
    // 既存テーブルを削除
    await client.query('DROP TABLE IF EXISTS umadata CASCADE');
    
    // 新フォーマットでテーブル作成（39列）
    await client.query(`
      CREATE TABLE umadata (
        id SERIAL PRIMARY KEY,
        race_id TEXT,
        date TEXT,
        place TEXT,
        course_type TEXT,
        distance TEXT,
        class_name TEXT,
        race_name TEXT,
        gender_limit TEXT,
        age_limit TEXT,
        waku TEXT,
        umaban TEXT,
        horse_name TEXT,
        corner_4_position TEXT,
        track_condition TEXT,
        field_size TEXT,
        popularity TEXT,
        finish_position TEXT,
        last_3f TEXT,
        weight_carried TEXT,
        horse_weight TEXT,
        weight_change TEXT,
        finish_time TEXT,
        race_count TEXT,
        margin TEXT,
        win_odds TEXT,
        place_odds TEXT,
        win_payout TEXT,
        place_payout TEXT,
        rpci TEXT,
        pci TEXT,
        pci3 TEXT,
        horse_mark TEXT,
        passing_order TEXT,
        gender_age TEXT,
        jockey TEXT,
        trainer TEXT,
        sire TEXT,
        dam TEXT,
        lap_time TEXT
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
      message: 'umadataテーブルを新フォーマット（39列）で再作成しました'
    });
  } catch (error: any) {
    console.error('Recreate umadata error:', error);
    return NextResponse.json({ 
      error: 'Failed to recreate table', 
      details: error.message 
    }, { status: 500 });
  }
}
