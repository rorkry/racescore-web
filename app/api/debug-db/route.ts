import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { isAdminRequest } from '@/lib/auth-check';

// 許可されたテーブル名のホワイトリスト（SQLインジェクション対策）
const ALLOWED_TABLES = [
  'wakujun', 'umadata', 'indices', 'races', 'umaren', 'wide',
  'users', 'accounts', 'sessions', 'subscriptions', 'user_points',
  'point_history', 'user_horse_marks', 'user_badges', 'login_history',
  'race_memos', 'baba_memos', 'favorite_horses', 'predictions',
  'prediction_likes', 'notifications', 'race_levels',
  'saga_analysis_cache', 'race_pace_cache'
];

// デバッグ用 - 管理者のみアクセス可能

export async function GET(request: Request) {
  // 管理者認証チェック
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table') || 'wakujun';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '5'), 1), 100); // 1-100に制限

  // テーブル名のホワイトリスト検証（SQLインジェクション対策）
  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ 
      error: 'Invalid table name',
      allowed: ALLOWED_TABLES 
    }, { status: 400 });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const client = await pool.connect();
    
    // テーブルの行数を取得（テーブル名は検証済み）
    const countResult = await client.query(`SELECT COUNT(*) as count FROM "${table}"`);
    const count = countResult.rows[0].count;
    
    // サンプルデータを取得（テーブル名は検証済み、limitは数値検証済み）
    const sampleResult = await client.query(`SELECT * FROM "${table}" LIMIT ${limit}`);
    
    // カラム情報を取得
    const columnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 
      ORDER BY ordinal_position
    `, [table]);
    
    client.release();
    await pool.end();

    return NextResponse.json({
      table,
      count,
      columns: columnsResult.rows.map(r => r.column_name),
      sample: sampleResult.rows
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
