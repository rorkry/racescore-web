import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import { isPremiumUser, getUserLimits, PLAN_LIMITS } from '@/lib/premium';

interface DbUser { id: string; }
interface DbFavorite {
  id: string;
  horse_name: string;
  horse_id: string | null;
  note: string | null;
  notify_on_race: number;
  created_at: string;
}

// プラン別の制限（互換性のため残す）
const LIMITS = PLAN_LIMITS;

// お気に入り馬一覧取得
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = $1').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    const isPremium = await isPremiumUser(user.id);
    const limits = isPremium ? LIMITS.premium : LIMITS.free;

    const favorites = await db.prepare(
      'SELECT id, horse_name, horse_id, note, notify_on_race, created_at FROM favorite_horses WHERE user_id = $1 ORDER BY created_at DESC'
    ).all<DbFavorite>(user.id);

    // 通知ONの数をカウント
    const notifyCount = favorites.filter(f => f.notify_on_race === 1).length;

    console.log('[user/favorites] isPremium:', isPremium, 'userId:', user.id);

    return NextResponse.json({ 
      favorites, 
      limit: limits.favorites, 
      notifyLimit: limits.notifications,
      count: favorites.length,
      notifyCount,
      isPremium, // ← これが不足していた
    });
  } catch (error) {
    console.error('Favorites fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// お気に入り馬追加
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { horseName, horseId, note, notifyOnRace } = await request.json();
    if (!horseName) {
      return NextResponse.json({ error: '馬名は必須です' }, { status: 400 });
    }

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = $1').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    const limits = await getUserLimits(user.id);

    // お気に入り上限チェック
    const favoriteCount = await db.prepare(
      'SELECT COUNT(*) as cnt FROM favorite_horses WHERE user_id = $1'
    ).get<{ cnt: number }>(user.id);
    
    if (favoriteCount && favoriteCount.cnt >= limits.favorites) {
      return NextResponse.json({ 
        error: `お気に入りは${limits.favorites}頭までです${limits.favorites === LIMITS.free.favorites ? '（プレミアムで500頭まで解除）' : ''}`,
        needsUpgrade: limits.favorites === LIMITS.free.favorites
      }, { status: 400 });
    }

    // 通知ON上限チェック
    if (notifyOnRace) {
      const notifyCount = await db.prepare(
        'SELECT COUNT(*) as cnt FROM favorite_horses WHERE user_id = $1 AND notify_on_race = 1'
      ).get<{ cnt: number }>(user.id);
      
      if (notifyCount && notifyCount.cnt >= limits.notifications) {
        return NextResponse.json({ 
          error: `通知ONは${limits.notifications}頭までです${limits.notifications === LIMITS.free.notifications ? '（プレミアムで100頭まで解除）' : ''}`,
          needsUpgrade: limits.notifications === LIMITS.free.notifications
        }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    try {
      await db.prepare(`
        INSERT INTO favorite_horses (id, user_id, horse_name, horse_id, note, notify_on_race, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `).run(id, user.id, horseName, horseId || null, note || null, notifyOnRace ? 1 : 0, now);
    } catch {
      return NextResponse.json({ error: 'この馬は既にお気に入りに登録されています' }, { status: 409 });
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Favorite add error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// お気に入り馬のメモ・通知設定更新
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { horseName, note, notifyOnRace } = await request.json();
    if (!horseName) return NextResponse.json({ error: '馬名は必須です' }, { status: 400 });

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = $1').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    // 通知ONに変更する場合は上限チェック
    if (notifyOnRace !== undefined && notifyOnRace) {
      // 現在の設定を取得
      const current = await db.prepare(
        'SELECT notify_on_race FROM favorite_horses WHERE user_id = $1 AND horse_name = $2'
      ).get<{ notify_on_race: number }>(user.id, horseName);
      
      // 既にONでなければ、上限チェック
      if (!current?.notify_on_race) {
        const limits = await getUserLimits(user.id);
        const notifyCount = await db.prepare(
          'SELECT COUNT(*) as cnt FROM favorite_horses WHERE user_id = $1 AND notify_on_race = 1'
        ).get<{ cnt: number }>(user.id);
        
        if (notifyCount && notifyCount.cnt >= limits.notifications) {
          return NextResponse.json({ 
            error: `通知ONは${limits.notifications}頭までです${limits.notifications === LIMITS.free.notifications ? '（プレミアムで100頭まで解除）' : ''}`,
            needsUpgrade: limits.notifications === LIMITS.free.notifications
          }, { status: 400 });
        }
      }
    }

    // 更新クエリを構築
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    let paramIndex = 1;

    if (note !== undefined) {
      updates.push(`note = $${paramIndex++}`);
      params.push(note || null);
    }
    if (notifyOnRace !== undefined) {
      updates.push(`notify_on_race = $${paramIndex++}`);
      params.push(notifyOnRace ? 1 : 0);
    }

    if (updates.length > 0) {
      params.push(user.id, horseName);
      await db.prepare(
        `UPDATE favorite_horses SET ${updates.join(', ')} WHERE user_id = $${paramIndex++} AND horse_name = $${paramIndex}`
      ).run(...params);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Favorite update error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// お気に入り馬削除
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const { horseName } = await request.json();
    if (!horseName) return NextResponse.json({ error: '馬名は必須です' }, { status: 400 });

    const db = getDb();
    const user = await db.prepare('SELECT id FROM users WHERE email = $1').get<DbUser>(session.user.email);
    if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    await db.prepare('DELETE FROM favorite_horses WHERE user_id = $1 AND horse_name = $2').run(user.id, horseName);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Favorite delete error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
