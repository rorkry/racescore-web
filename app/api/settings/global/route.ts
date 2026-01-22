import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// グローバル設定を取得（認証不要）
export async function GET() {
  try {
    const db = getDb();
    
    // premium_for_all 設定を取得
    let premiumForAll = false;
    try {
      // テーブルが存在するか確認
      const tableExists = await db.prepare(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'app_settings'
        ) as exists
      `).get<{ exists: boolean }>();
      
      console.log('[global-settings] Table exists:', tableExists?.exists);
      
      if (tableExists?.exists) {
        const setting = await db.prepare(
          "SELECT value FROM app_settings WHERE key = 'premium_for_all'"
        ).get<{ value: string }>();
        premiumForAll = setting?.value === 'true';
        console.log('[global-settings] Setting value:', setting?.value, 'parsed:', premiumForAll);
      }
    } catch (e) {
      console.log('[global-settings] app_settings check failed:', e);
      // テーブルがない場合は false
    }
    
    console.log('[global-settings] Returning premiumForAll:', premiumForAll);
    
    return NextResponse.json({
      premiumForAll,
    });
  } catch (error) {
    console.error('[global-settings] Error:', error);
    return NextResponse.json({ premiumForAll: false });
  }
}
