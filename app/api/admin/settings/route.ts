import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { clearPremiumCache } from '@/lib/premium';

// app_settingsテーブルを作成（存在しない場合）
async function ensureSettingsTable(db: ReturnType<typeof getDb>) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (e) {
    console.log('[settings] Table creation skipped:', e);
  }
}

// 設定を取得
export async function GET() {
  try {
    const session = await auth();
    
    // 管理者のみアクセス可能
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const db = getDb();
    
    // ユーザーのロールを確認
    const user = await db.prepare(
      'SELECT role FROM users WHERE id = $1'
    ).get<{ role: string }>(session.user.id);
    
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    
    await ensureSettingsTable(db);
    
    // 全設定を取得
    const settings = await db.prepare(
      'SELECT key, value FROM app_settings'
    ).all<{ key: string; value: string }>();
    
    const result: Record<string, string> = {};
    for (const s of settings || []) {
      result[s.key] = s.value;
    }
    
    return NextResponse.json({ settings: result });
  } catch (error) {
    console.error('[settings] GET error:', error);
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

// 設定を保存
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const db = getDb();
    
    // ユーザーのロールを確認
    const user = await db.prepare(
      'SELECT role FROM users WHERE id = $1'
    ).get<{ role: string }>(session.user.id);
    
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    
    const body = await request.json();
    const { key, value } = body;
    
    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }
    
    await ensureSettingsTable(db);
    
    // UPSERT（存在すれば更新、なければ挿入）
    await db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
    `).run(key, value || '');
    
    // プレミアム関連の設定が変更されたらキャッシュをクリア
    if (key === 'premium_for_all') {
      clearPremiumCache();
      console.log(`[settings] Premium cache cleared`);
    }
    
    console.log(`[settings] Updated: ${key} = ${value}`);
    
    return NextResponse.json({ success: true, key, value });
  } catch (error) {
    console.error('[settings] POST error:', error);
    return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 });
  }
}
