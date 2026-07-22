import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    
    const columns = await db.prepare(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'indices'
      ORDER BY ordinal_position
    `).all();
    
    return NextResponse.json({
      success: true,
      columns,
      count: columns.length
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
