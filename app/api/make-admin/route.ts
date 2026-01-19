import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// 管理者設定用の一時的なAPI
// 本番運用後は削除すること

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const email = searchParams.get('email');
  
  if (secret !== 'make-admin-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const client = await pool.connect();
    
    // ユーザーを検索
    const result = await client.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      client.release();
      await pool.end();
      return NextResponse.json({ 
        error: 'User not found',
        email: email 
      }, { status: 404 });
    }

    const user = result.rows[0];
    
    // roleをadminに更新
    await client.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE email = $2',
      ['admin', email]
    );
    
    client.release();
    await pool.end();

    return NextResponse.json({ 
      success: true, 
      message: `User ${email} is now admin!`,
      before: user.role,
      after: 'admin'
    });
  } catch (error: any) {
    console.error('Make admin error:', error);
    return NextResponse.json({ 
      error: 'Failed to update user', 
      details: error.message 
    }, { status: 500 });
  }
}
