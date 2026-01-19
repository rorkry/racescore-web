import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// デバッグ用 - 本番運用後は削除すること

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table') || 'wakujun';
  const limit = parseInt(searchParams.get('limit') || '5');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const client = await pool.connect();
    
    // テーブルの行数を取得
    const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
    const count = countResult.rows[0].count;
    
    // サンプルデータを取得
    const sampleResult = await client.query(`SELECT * FROM ${table} LIMIT ${limit}`);
    
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
