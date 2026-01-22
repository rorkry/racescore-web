import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// グローバル設定を取得（認証不要）
export async function GET() {
  try {
    const db = getDb();
    
    // premium_for_all 設定を取得
    let premiumForAll = false;
    try {
      const setting = await db.prepare(
        "SELECT value FROM app_settings WHERE key = 'premium_for_all'"
      ).get<{ value: string }>();
      premiumForAll = setting?.value === 'true';
    } catch {
      // テーブルがない場合は false
    }
    
    return NextResponse.json({
      premiumForAll,
    });
  } catch (error) {
    console.error('[global-settings] Error:', error);
    return NextResponse.json({ premiumForAll: false });
  }
}
